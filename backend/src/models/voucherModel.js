'use strict';

const pool = require('../db/pool');

// ============================================================================
// Tally-style double-entry voucher model.
// Sign convention is data-driven via vchtype.deemed_positive:
//   YES (Sales/Debit Note)     → Party Dr (+grandTotal), Goods Cr (-subtotal),
//                                inventory qty/amount NEGATIVE (stock out).
//   NO  (Purchase/Credit Note) → Party Cr (-grandTotal), Goods Dr (+subtotal),
//                                inventory qty/amount POSITIVE (stock in).
//   NULL (Receipt/Payment/Journal/Contra) → journal mode, no items.
// All voucher mutations run inside a transaction via pool.withTransaction().
// ============================================================================

// Normalise the advance/fuel sub-mode to its stored code: 1 = advance,
// 2 = fuel, NULL = normal. Anything else collapses to NULL.
function _normBiltyMode(v) {
  const n = Number(v);
  return n === 1 || n === 2 ? n : null;
}

function _round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Compute a bilty's Advance/Fuel budget. transport_total = Σ(qty × l_rate) over
// the bilty's batch (line item) rows; used = Σ(Dr) of existing Advance+Fuel
// journals tied to the bilty (a single shared pool across both modes); remaining
// is what a new/edited Advance/Fuel journal's Dr total may not exceed.
// `excludeId` drops one voucher from `used` (the voucher being edited).
async function _computeBiltyBudget(conn, biltyId, excludeId) {
  const [ttRows] = await conn.execute(
    'SELECT COALESCE(SUM(qty * l_rate), 0) AS t FROM batch WHERE vch_id = :id',
    { id: biltyId }
  );
  const transportTotal = _round2(ttRows[0] ? ttRows[0].t : 0);

  let usedSql = `SELECT COALESCE(SUM(amount), 0) AS u FROM vch_details
                  WHERE bilty_id = :id AND bilty_mode IN (1, 2)`;
  const params = { id: biltyId };
  if (excludeId !== null && excludeId !== undefined) {
    usedSql += ' AND id != :ex';
    params.ex = excludeId;
  }
  const [usedRows] = await conn.execute(usedSql, params);
  const used = _round2(usedRows[0] ? usedRows[0].u : 0);

  return { transport_total: transportTotal, used, remaining: _round2(transportTotal - used) };
}

// Reject a save whose Dr total would push the bilty's Advance/Fuel spend past
// its Transport Total. No-op for non-bilty (Normal) vouchers.
async function _assertBiltyBudget(conn, data, excludeId) {
  const mode = _normBiltyMode(data.bilty_mode);
  const biltyId = data.bilty_id || null;
  if (!mode || !biltyId) return;
  const attempted = _round2(_computeGrandTotal(data.items, data.ledgers)); // Dr total (journal mode)
  const { transport_total, used, remaining } = await _computeBiltyBudget(conn, biltyId, excludeId);
  if (attempted > remaining + 0.01) {
    const e = new Error(
      `Debit ${attempted} exceeds the bilty's remaining transport budget ` +
      `(transport ${transport_total}, already used ${used}, remaining ${remaining}).`
    );
    e.code = 'bilty_budget_exceeded';
    e.details = { transport_total, used, remaining, attempted };
    throw e;
  }
}

async function _lookupLedgerIdByName(conn, name) {
  const [rows] = await conn.execute(
    'SELECT id FROM ledger_master WHERE name = :name LIMIT 1',
    { name }
  );
  return rows[0] ? rows[0].id : null;
}

async function _getVchTypeMeta(conn, vchTypeId) {
  if (!vchTypeId) return { deemedPositive: null, parentName: '' };
  const [rows] = await conn.execute(
    `SELECT v.name, v.deemed_positive,
            p.name AS parent_name, p.deemed_positive AS parent_deemed
     FROM vchtype v
     LEFT JOIN vchtype p ON v.parent_id = p.id AND v.parent_id != v.id
     WHERE v.id = :id LIMIT 1`,
    { id: vchTypeId }
  );
  const r = rows[0];
  if (!r) return { deemedPositive: null, parentName: '' };
  const dp = r.deemed_positive || r.parent_deemed;
  return {
    deemedPositive: dp === 'YES' ? true : dp === 'NO' ? false : null,
    parentName: String(r.parent_name || r.name || '').toLowerCase(),
  };
}

async function _checkDuplicateVchNo(conn, vchTypeId, vchNo, excludeId) {
  if (!vchNo) return false;
  const sql = excludeId !== null && excludeId !== undefined
    ? `SELECT COUNT(*) AS cnt FROM vch_details
        WHERE vch_no = :vchNo AND vch_type_id = :vchTypeId AND id != :excludeId`
    : `SELECT COUNT(*) AS cnt FROM vch_details
        WHERE vch_no = :vchNo AND vch_type_id = :vchTypeId`;
  const params = { vchNo, vchTypeId: vchTypeId || null };
  if (excludeId !== null && excludeId !== undefined) params.excludeId = excludeId;
  const [rows] = await conn.execute(sql, params);
  return Number(rows[0] ? rows[0].cnt : 0) > 0;
}

function _computeGrandTotal(items, ledgers) {
  // Inventory mode: subtotal (items) + sum(|tax/charge ledgers|)
  // Journal mode: sum of positive amounts in ledgers (Dr side)
  if (!items || items.length === 0) {
    return +(ledgers || [])
      .filter(l => Number(l.amount || 0) > 0)
      .reduce((s, l) => s + Number(l.amount || 0), 0).toFixed(2);
  }
  const subtotal   = +(items || []).reduce((s, i) => s + Number(i.amount || 0), 0).toFixed(2);
  const ledgersSum = +(ledgers || []).reduce((s, l) => s + Math.abs(Number(l.amount || 0)), 0).toFixed(2);
  return +(subtotal + ledgersSum).toFixed(2);
}

// Insert all child rows for a voucher header. Used by both create() and update().
async function _insertChildEntries(conn, vchId, data) {
  const items     = data.items || [];
  const ledgers   = data.ledgers || [];
  const billAlloc = data.bill_allocation || [];
  const partyId   = data.ledger_master_id;
  const vchTypeId = data.vch_type_id || null;

  // ===== JOURNAL MODE — no items, user supplies signed amounts =====
  if (items.length === 0) {
    let partyLedEntryId = null;
    for (const led of ledgers) {
      if (!led.ledger_id || !Number(led.amount)) continue;
      const [r] = await conn.execute(
        'INSERT INTO ledger_entries (vch_id, ledger_id, amount) VALUES (:vchId, :ledgerId, :amount)',
        { vchId, ledgerId: led.ledger_id, amount: Number(led.amount) }
      );
      if (Number(led.ledger_id) === Number(partyId) && partyLedEntryId === null) {
        partyLedEntryId = r.insertId;
      }
    }
    for (const ba of billAlloc) {
      if (!Number(ba.amount)) continue;
      const signedAmt = ba.direction === 'Cr' ? -Math.abs(Number(ba.amount))
                      : ba.direction === 'Dr' ? +Math.abs(Number(ba.amount))
                      : ba.type === 'Agr.'    ? -Math.abs(Number(ba.amount))
                      :                          +Math.abs(Number(ba.amount));
      await conn.execute(
        `INSERT INTO bill_allocation (vchid, ledentry_id, ledger, billname, amount)
         VALUES (:vchId, :ledEntryId, :ledger, :billname, :amount)`,
        { vchId, ledEntryId: partyLedEntryId, ledger: partyId, billname: ba.refno || null, amount: signedAmt }
      );
    }
    return;
  }

  // ===== INVENTORY MODE — Sales / Purchase / Debit Note / Credit Note =====
  const subtotal = +items.reduce((s, i) => s + Number(i.amount || 0), 0).toFixed(2);
  const grandTotal = _computeGrandTotal(items, ledgers);

  const meta = await _getVchTypeMeta(conn, vchTypeId);
  const effectivePositive = meta.deemedPositive === null ? true : meta.deemedPositive;
  const goodsLedgerName = meta.parentName.includes('purchase') || meta.parentName.includes('debit')
    ? 'Purchase' : 'Sales';
  const goodsLedgerId = await _lookupLedgerIdByName(conn, goodsLedgerName);

  // Party row + Goods row (always exactly 2 system entries, opposite signs)
  let partyLedEntryId, goodsLedId;
  if (effectivePositive) {
    const [pr] = await conn.execute(
      'INSERT INTO ledger_entries (vch_id, ledger_id, amount) VALUES (:vchId, :ledgerId, :amount)',
      { vchId, ledgerId: partyId, amount: +grandTotal }
    );
    partyLedEntryId = pr.insertId;
    const [gr] = await conn.execute(
      'INSERT INTO ledger_entries (vch_id, ledger_id, amount) VALUES (:vchId, :ledgerId, :amount)',
      { vchId, ledgerId: goodsLedgerId, amount: -subtotal }
    );
    goodsLedId = gr.insertId;
  } else {
    const [pr] = await conn.execute(
      'INSERT INTO ledger_entries (vch_id, ledger_id, amount) VALUES (:vchId, :ledgerId, :amount)',
      { vchId, ledgerId: partyId, amount: -grandTotal }
    );
    partyLedEntryId = pr.insertId;
    const [gr] = await conn.execute(
      'INSERT INTO ledger_entries (vch_id, ledger_id, amount) VALUES (:vchId, :ledgerId, :amount)',
      { vchId, ledgerId: goodsLedgerId, amount: +subtotal }
    );
    goodsLedId = gr.insertId;
  }

  // Inventory + batch (sign mirrors Goods row)
  const sign = effectivePositive ? -1 : 1;
  for (const item of items) {
    const [ir] = await conn.execute(
      `INSERT INTO inventory_entries (led_id, item_id, qty, rate, amount, gst_rate)
       VALUES (:ledId, :itemId, :qty, :rate, :amount, :gstRate)`,
      {
        ledId: goodsLedId,
        itemId: item.item_id,
        qty: Number(item.qty) * sign,
        rate: Number(item.rate),
        amount: Number(item.amount) * sign,
        gstRate: Number(item.gst_rate || 0),
      }
    );
    const invId = ir.insertId;
    if (item.batch_rows && item.batch_rows.length > 0) {
      for (const b of item.batch_rows) {
        await conn.execute(
          `INSERT INTO batch (vch_id, inventory_id, item_id, batch_no, qty, rate, amount)
           VALUES (:vchId, :invId, :itemId, :batchNo, :qty, :rate, :amount)`,
          {
            vchId, invId, itemId: item.item_id,
            batchNo: b.batch_no || b.batch_name || null,
            qty: Number(b.qty) * sign,
            rate: Number(b.rate),
            amount: Number(b.amount) * sign,
          }
        );
      }
    } else {
      await conn.execute(
        `INSERT INTO batch (vch_id, inventory_id, item_id, batch_no, qty, rate, amount)
         VALUES (:vchId, :invId, :itemId, NULL, :qty, :rate, :amount)`,
        {
          vchId, invId, itemId: item.item_id,
          qty: Number(item.qty) * sign,
          rate: Number(item.rate),
          amount: Number(item.amount) * sign,
        }
      );
    }
  }

  // Tax/charge ledger rows — frontend sends positive amounts, we apply sign
  for (const led of ledgers) {
    if (!led.ledger_id || !Number(led.amount)) continue;
    await conn.execute(
      'INSERT INTO ledger_entries (vch_id, ledger_id, amount) VALUES (:vchId, :ledgerId, :amount)',
      { vchId, ledgerId: led.ledger_id, amount: Number(led.amount) * sign }
    );
  }

  // Bill allocation hangs off party row. baseSign mirrors party Dr/Cr sign.
  const baseSign = effectivePositive ? 1 : -1;
  for (const ba of billAlloc) {
    if (!Number(ba.amount)) continue;
    let signedAmt;
    if (ba.direction === 'Cr')      signedAmt = -Math.abs(Number(ba.amount));
    else if (ba.direction === 'Dr') signedAmt = +Math.abs(Number(ba.amount));
    else if (ba.type === 'Agr.')    signedAmt = -Math.abs(Number(ba.amount)) * baseSign;
    else                            signedAmt = +Math.abs(Number(ba.amount)) * baseSign;
    await conn.execute(
      `INSERT INTO bill_allocation (vchid, ledentry_id, ledger, billname, amount)
       VALUES (:vchId, :ledEntryId, :ledger, :billname, :amount)`,
      { vchId, ledEntryId: partyLedEntryId, ledger: partyId, billname: ba.refno || null, amount: signedAmt }
    );
  }
}

// ============================================================================
// Public API
// ============================================================================

async function create(data, userId) {
  return pool.withTransaction(async (conn) => {
    if (await _checkDuplicateVchNo(conn, data.vch_type_id, data.vch_no)) {
      const err = new Error(`Voucher number "${data.vch_no}" already exists for this voucher type`);
      err.code = 'duplicate_vch_no';
      throw err;
    }
    await _assertBiltyBudget(conn, data, null);
    const headerAmount = _computeGrandTotal(data.items, data.ledgers);
    const [r] = await conn.execute(
      `INSERT INTO vch_details (vch_type_id, vch_no, vch_date, ledger_master_id, amount, remark, bilty_mode, bilty_id, created_by)
       VALUES (:vchTypeId, :vchNo, :vchDate, :ledgerMasterId, :amount, :remark, :biltyMode, :biltyId, :userId)`,
      {
        vchTypeId: data.vch_type_id || null,
        vchNo: data.vch_no || null,
        vchDate: data.vch_date || null,
        ledgerMasterId: data.ledger_master_id,
        amount: headerAmount,
        remark: data.remark || null,
        biltyMode: _normBiltyMode(data.bilty_mode),
        biltyId: data.bilty_id || null,
        userId: userId == null ? null : userId,
      }
    );
    const vchId = r.insertId;
    await _insertChildEntries(conn, vchId, data);
    return { id: vchId };
  });
}

async function update(id, data) {
  return pool.withTransaction(async (conn) => {
    if (await _checkDuplicateVchNo(conn, data.vch_type_id, data.vch_no, id)) {
      const err = new Error(`Voucher number "${data.vch_no}" already exists for this voucher type`);
      err.code = 'duplicate_vch_no';
      throw err;
    }
    await _assertBiltyBudget(conn, data, id);
    // Delete children in FK-safe order.
    await conn.execute('DELETE FROM bill_allocation WHERE vchid = :id', { id });
    await conn.execute('DELETE FROM batch WHERE vch_id = :id', { id });
    await conn.execute(
      'DELETE FROM inventory_entries WHERE led_id IN (SELECT id FROM ledger_entries WHERE vch_id = :id)',
      { id }
    );
    await conn.execute('DELETE FROM ledger_entries WHERE vch_id = :id', { id });

    const headerAmount = _computeGrandTotal(data.items, data.ledgers);
    await conn.execute(
      `UPDATE vch_details
         SET vch_type_id = :vchTypeId, vch_no = :vchNo, vch_date = :vchDate,
             ledger_master_id = :ledgerMasterId, amount = :amount, remark = :remark,
             bilty_mode = :biltyMode, bilty_id = :biltyId
       WHERE id = :id`,
      {
        id,
        vchTypeId: data.vch_type_id || null,
        vchNo: data.vch_no || null,
        vchDate: data.vch_date || null,
        ledgerMasterId: data.ledger_master_id,
        amount: headerAmount,
        remark: data.remark || null,
        biltyMode: _normBiltyMode(data.bilty_mode),
        biltyId: data.bilty_id || null,
      }
    );
    await _insertChildEntries(conn, id, data);
    return { id };
  });
}

async function remove(id) {
  return pool.withTransaction(async (conn) => {
    await conn.execute('DELETE FROM bill_allocation WHERE vchid = :id', { id });
    await conn.execute('DELETE FROM batch WHERE vch_id = :id', { id });
    await conn.execute(
      'DELETE FROM inventory_entries WHERE led_id IN (SELECT id FROM ledger_entries WHERE vch_id = :id)',
      { id }
    );
    await conn.execute('DELETE FROM ledger_entries WHERE vch_id = :id', { id });
    await conn.execute('DELETE FROM vch_details WHERE id = :id', { id });
  });
}

async function findById(id) {
  const [headerRows] = await pool.execute(
    `SELECT v.*, pl.name AS party_name,
            vt.name AS vch_type_name,
            vt.name AS vch_subtype_name,
            COALESCE(p.deemed_positive, vt.deemed_positive) AS deemed_positive,
            pv.vch_no AS parent_bilty_no
     FROM vch_details v
     LEFT JOIN ledger_master pl ON v.ledger_master_id = pl.id
     LEFT JOIN vchtype vt ON v.vch_type_id = vt.id
     LEFT JOIN vchtype p ON vt.parent_id = p.id AND vt.parent_id != vt.id
     LEFT JOIN vch_details pv ON pv.id = v.parent_vch_id
     WHERE v.id = :id LIMIT 1`,
    { id }
  );
  const header = headerRows[0];
  if (!header) return null;

  const [ledgerEntries] = await pool.execute(
    `SELECT le.id, le.vch_id, le.ledger_id, le.amount, le.created_at,
            pl.name AS ledger_name
     FROM ledger_entries le
     LEFT JOIN ledger_master pl ON le.ledger_id = pl.id
     WHERE le.vch_id = :id ORDER BY le.id`,
    { id }
  );

  for (const le of ledgerEntries) {
    const [invs] = await pool.execute(
      `SELECT ie.id, ie.led_id, ie.item_id, ie.qty, ie.rate, ie.amount, ie.gst_rate,
              im.name AS item_name, im.batch AS item_batch
       FROM inventory_entries ie
       LEFT JOIN item_master im ON ie.item_id = im.id
       WHERE ie.led_id = :ledId ORDER BY ie.id`,
      { ledId: le.id }
    );
    for (const ie of invs) {
      const [batches] = await pool.execute(
        'SELECT id, batch_no, qty, rate, amount FROM batch WHERE inventory_id = :invId ORDER BY id',
        { invId: ie.id }
      );
      ie.batchRows = batches;
    }
    le.inventoryEntries = invs;
  }

  const [billAllocations] = await pool.execute(
    'SELECT id, billname, amount, ledger FROM bill_allocation WHERE vchid = :id ORDER BY id',
    { id }
  );

  return Object.assign({}, header, { ledgerEntries, billAllocations });
}

async function findAll({ page, limit, vchType, search, dateFrom, dateTo } = {}) {
  const p = Math.max(1, parseInt(page || 1, 10) || 1);
  const lim = Math.min(200, Math.max(1, parseInt(limit || 20, 10) || 20));
  const offset = (p - 1) * lim;

  const conditions = [];
  const params = {};
  if (vchType)  { conditions.push('COALESCE(par.name, vt.name) = :vchType'); params.vchType = vchType; }
  if (search)   { conditions.push('(v.vch_no LIKE :search OR pl.name LIKE :search)'); params.search = `%${search}%`; }
  if (dateFrom) { conditions.push('v.vch_date >= :dateFrom'); params.dateFrom = dateFrom; }
  if (dateTo)   { conditions.push('v.vch_date <= :dateTo');   params.dateTo = dateTo; }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM vch_details v
     LEFT JOIN ledger_master pl ON v.ledger_master_id = pl.id
     LEFT JOIN vchtype vt ON v.vch_type_id = vt.id

     ${where}`,
    params
  );

  // LIMIT/OFFSET inlined after numeric sanitization to avoid mysql2 prepared-statement quirks.
  const [rows] = await pool.execute(
    `SELECT v.id, v.vch_no, v.vch_date, v.amount, v.remark, v.created_at,
            pl.name AS party_name,
            vt.name AS vch_type_name,
            vt.name AS vch_subtype_name
     FROM vch_details v
     LEFT JOIN ledger_master pl ON v.ledger_master_id = pl.id
     LEFT JOIN vchtype vt ON v.vch_type_id = vt.id

     ${where}
     ORDER BY v.created_at DESC
     LIMIT ${lim} OFFSET ${offset}`,
    params
  );

  return { data: rows, total: Number(countRows[0] ? countRows[0].total : 0), page: p, limit: lim };
}

// NOTE: keep this SQL free of `--` line comments — mysql2's named-placeholder
// tokenizer doesn't skip them, so an apostrophe inside a comment (e.g. "ledger's")
// is read as a string delimiter and breaks :fromDate/:toDate substitution.
//
// The aggregated `ple` subquery nets the anchor (party) ledger's lines into ONE
// amount per voucher: a voucher can post the anchor ledger on several rows
// (e.g. an Advance with two Dr truck lines), and without this the join fans out
// and the voucher shows as multiple Daybook rows. GROUP BY collapses them to one.
//
// ORDER BY: within a day the most recently touched voucher floats to the top —
// create OR edit bumps updated_at (ON UPDATE CURRENT_TIMESTAMP). Across days,
// vch_date drives the order (normal date sequence).
async function getDaybook(fromDate, toDate) {
  const [rows] = await pool.execute(
    `SELECT v.id, v.vch_no, v.vch_date, v.remark, v.amount, v.parent_vch_id,
            pl.name AS party_name,
            vt.name AS vch_type_name,
            vt.name AS vch_subtype_name,
            CASE WHEN ple.amount > 0 THEN ABS(ple.amount) ELSE 0 END AS dr_amount,
            CASE WHEN ple.amount < 0 THEN ABS(ple.amount) ELSE 0 END AS cr_amount,
            v.created_at, v.updated_at
     FROM vch_details v
     LEFT JOIN ledger_master pl ON v.ledger_master_id = pl.id
     LEFT JOIN vchtype vt ON v.vch_type_id = vt.id
     LEFT JOIN (
       SELECT vch_id, ledger_id, SUM(amount) AS amount
       FROM ledger_entries
       GROUP BY vch_id, ledger_id
     ) ple ON ple.vch_id = v.id AND ple.ledger_id = v.ledger_master_id
     WHERE DATE(v.vch_date) >= :fromDate AND DATE(v.vch_date) <= :toDate
     ORDER BY v.vch_date DESC, GREATEST(v.created_at, v.updated_at) DESC, v.id DESC`,
    { fromDate, toDate }
  );
  return rows;
}

async function getNextVoucherNo(vchTypeId) {
  // Each type uses its OWN configured prefix (no parent fallback). When a
  // prefix is set → `<prefix>-<number>` (e.g. SAL-001); when none → plain
  // zero-padded number (e.g. 001).
  const [vtRows] = await pool.execute(
    `SELECT prefix FROM vchtype WHERE id = :id LIMIT 1`,
    { id: vchTypeId }
  );
  const prefix = String((vtRows[0] && vtRows[0].prefix) || '').trim();

  const [lastRows] = await pool.execute(
    `SELECT vch_no FROM vch_details
      WHERE vch_type_id = :id AND vch_no IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
    { id: vchTypeId }
  );

  let nextNum = 1;
  const lastVchNo = lastRows[0] && lastRows[0].vch_no;
  if (lastVchNo) {
    const m = String(lastVchNo).match(/(\d+)$/);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }
  const num = String(nextNum).padStart(3, '0');
  return prefix ? `${prefix}-${num}` : num;
}

// Pending bill refs for a party. Both Dr and Cr balances are returned —
// caller decides how to filter/render. Open balance per (ledger, billname)
// is SUM(amount); abs > 0.01 means "still open".
async function getPendingRefs(customerId) {
  const [rows] = await pool.execute(
    `SELECT billname, ABS(net_amount) AS amount, vch_date, vch_no,
            CASE WHEN net_amount > 0 THEN 'Dr' ELSE 'Cr' END AS direction
     FROM (
       SELECT ba.billname, SUM(ba.amount) AS net_amount,
              MIN(v.vch_date) AS vch_date, MIN(v.vch_no) AS vch_no
       FROM bill_allocation ba
       JOIN vch_details v ON ba.vchid = v.id
       WHERE ba.ledger = :customerId
         AND ba.billname IS NOT NULL AND ba.billname != ''
       GROUP BY ba.billname
       HAVING ABS(SUM(ba.amount)) > 0.01
       UNION ALL
       SELECT CONCAT('On Acct (', COALESCE(v.vch_no, v.id), ')') AS billname,
              SUM(ba.amount) AS net_amount, v.vch_date, v.vch_no
       FROM bill_allocation ba
       JOIN vch_details v ON ba.vchid = v.id
       WHERE ba.ledger = :customerId
         AND (ba.billname IS NULL OR ba.billname = '')
       GROUP BY ba.vchid, v.vch_no, v.vch_date
       HAVING ABS(SUM(ba.amount)) > 0.01
     ) AS combined
     ORDER BY vch_date DESC LIMIT 50`,
    { customerId }
  );
  return rows;
}

// "Other ledgers" = non-party (CGST/SGST/IGST/Bank/Cash/Roundoff/expenses).
async function findOtherLedgers() {
  const [rows] = await pool.execute(
    `SELECT pl.id, pl.name, pl.ledger_group_id, pl.billbybill,
            lg.group_name AS ledger_group_name
     FROM ledger_master pl
     LEFT JOIN ledger_group lg ON pl.ledger_group_id = lg.id
     WHERE pl.ledger_group_id != 1
     ORDER BY pl.name ASC`
  );
  return rows;
}

// All-ledger search across every group (used by Journal/Receipt/Payment Dr/Cr
// picker). When `group` is given, results are restricted to ledgers in that
// ledger group (used by the Fuel voucher mode's first row).
async function searchAllLedgers(q, group) {
  const like = `%${q || ''}%`;
  const params = { like };
  let groupCond = '';
  if (group) { groupCond = 'AND lg.group_name = :group'; params.group = group; }
  const [rows] = await pool.execute(
    `SELECT pl.id, pl.name, pl.ledger_group_id, pl.billbybill,
            lg.group_name AS ledger_group_name
     FROM ledger_master pl
     LEFT JOIN ledger_group lg ON pl.ledger_group_id = lg.id
     WHERE pl.name LIKE :like ${groupCond}
     ORDER BY pl.name ASC LIMIT 50`,
    params
  );
  return rows;
}

// Resolve the bilty's vehicle (truck) ledger to lock into row 1 of an ADVANCE
// voucher. The truck already lives in ledger_master (Vehicles group) and is
// referenced directly by vch_details.vehicle_id, so no creation is needed.
// Returns { ledger_id, ledger_name, truck_no } (ledger_id null if the bilty has
// no vehicle), or null when the bilty id doesn't exist.
async function resolveBiltyVehicleLedger(biltyId) {
  const [rows] = await pool.execute(
    `SELECT v.vehicle_id AS ledger_id, veh.name AS ledger_name
       FROM vch_details v
       LEFT JOIN ledger_master veh ON veh.id = v.vehicle_id
      WHERE v.id = :id LIMIT 1`,
    { id: biltyId }
  );
  const r = rows[0];
  if (!r) return null;
  return { ledger_id: r.ledger_id || null, ledger_name: r.ledger_name || null, truck_no: r.ledger_name || null };
}

// Public read-only budget lookup for the Advance/Fuel form. Returns
// { transport_total, used, remaining } for a bilty; `excludeId` (optional)
// drops the voucher being edited from `used`.
async function getBiltyBudget(biltyId, excludeId) {
  return _computeBiltyBudget(pool, biltyId, excludeId);
}

module.exports = {
  create, update, remove, findById, findAll,
  getDaybook, getNextVoucherNo, getPendingRefs,
  findOtherLedgers, searchAllLedgers, resolveBiltyVehicleLedger,
  getBiltyBudget,
};
