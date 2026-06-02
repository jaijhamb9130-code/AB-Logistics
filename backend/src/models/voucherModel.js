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
    const headerAmount = _computeGrandTotal(data.items, data.ledgers);
    const [r] = await conn.execute(
      `INSERT INTO vch_details (vch_type_id, vch_no, vch_date, ledger_master_id, amount, remark, created_by)
       VALUES (:vchTypeId, :vchNo, :vchDate, :ledgerMasterId, :amount, :remark, :userId)`,
      {
        vchTypeId: data.vch_type_id || null,
        vchNo: data.vch_no || null,
        vchDate: data.vch_date || null,
        ledgerMasterId: data.ledger_master_id,
        amount: headerAmount,
        remark: data.remark || null,
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
             ledger_master_id = :ledgerMasterId, amount = :amount, remark = :remark
       WHERE id = :id`,
      {
        id,
        vchTypeId: data.vch_type_id || null,
        vchNo: data.vch_no || null,
        vchDate: data.vch_date || null,
        ledgerMasterId: data.ledger_master_id,
        amount: headerAmount,
        remark: data.remark || null,
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
            COALESCE(p.name, vt.name) AS vch_type_name,
            vt.name AS vch_subtype_name,
            COALESCE(p.deemed_positive, vt.deemed_positive) AS deemed_positive
     FROM vch_details v
     LEFT JOIN ledger_master pl ON v.ledger_master_id = pl.id
     LEFT JOIN vchtype vt ON v.vch_type_id = vt.id
     LEFT JOIN vchtype p ON vt.parent_id = p.id AND vt.parent_id != vt.id
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
     LEFT JOIN vchtype par ON vt.parent_id = par.id AND vt.parent_id != vt.id
     ${where}`,
    params
  );

  // LIMIT/OFFSET inlined after numeric sanitization to avoid mysql2 prepared-statement quirks.
  const [rows] = await pool.execute(
    `SELECT v.id, v.vch_no, v.vch_date, v.amount, v.remark, v.created_at,
            pl.name AS party_name,
            COALESCE(par.name, vt.name) AS vch_type_name,
            vt.name AS vch_subtype_name
     FROM vch_details v
     LEFT JOIN ledger_master pl ON v.ledger_master_id = pl.id
     LEFT JOIN vchtype vt ON v.vch_type_id = vt.id
     LEFT JOIN vchtype par ON vt.parent_id = par.id AND vt.parent_id != vt.id
     ${where}
     ORDER BY v.created_at DESC
     LIMIT ${lim} OFFSET ${offset}`,
    params
  );

  return { data: rows, total: Number(countRows[0] ? countRows[0].total : 0), page: p, limit: lim };
}

async function getDaybook(fromDate, toDate) {
  const [rows] = await pool.execute(
    `SELECT v.id, v.vch_no, v.vch_date, v.remark, v.amount,
            pl.name AS party_name,
            COALESCE(par.name, vt.name) AS vch_type_name,
            vt.name AS vch_subtype_name,
            CASE WHEN ple.amount > 0 THEN ABS(ple.amount) ELSE 0 END AS dr_amount,
            CASE WHEN ple.amount < 0 THEN ABS(ple.amount) ELSE 0 END AS cr_amount,
            v.created_at
     FROM vch_details v
     LEFT JOIN ledger_master pl ON v.ledger_master_id = pl.id
     LEFT JOIN vchtype vt ON v.vch_type_id = vt.id
     LEFT JOIN vchtype par ON vt.parent_id = par.id AND vt.parent_id != vt.id
     LEFT JOIN ledger_entries ple ON ple.vch_id = v.id AND ple.ledger_id = v.ledger_master_id
     WHERE DATE(v.vch_date) >= :fromDate AND DATE(v.vch_date) <= :toDate
     ORDER BY v.vch_date DESC, v.created_at DESC`,
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

// All-ledger search across every group (used by Journal/Receipt/Payment Dr/Cr picker).
async function searchAllLedgers(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT pl.id, pl.name, pl.ledger_group_id, pl.billbybill,
            lg.group_name AS ledger_group_name
     FROM ledger_master pl
     LEFT JOIN ledger_group lg ON pl.ledger_group_id = lg.id
     WHERE pl.name LIKE :like
     ORDER BY pl.name ASC LIMIT 50`,
    { like }
  );
  return rows;
}

module.exports = {
  create, update, remove, findById, findAll,
  getDaybook, getNextVoucherNo, getPendingRefs,
  findOtherLedgers, searchAllLedgers,
};
