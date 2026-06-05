'use strict';

/**
 * Bilty model — backed by `vch_details` (vch_type_id = Bilty system row).
 *
 * Bilty line items now flow into the generic `batch` table via an
 * `inventory_entries` rollup, anchored to a single `ledger_entries`
 * posting for the consignor:
 *
 *   vch_details (header)
 *     └─ ledger_entries (1 row, ledger_id = consignor's ledger_master_id)
 *           └─ inventory_entries (1 row, item_id = goods_type_id, qty/amount = SUMs)
 *                 └─ batch (N rows, one per bilty line)
 *
 * Field mapping for header (legacy → new):
 *   bilty.bilty_no    → vch_details.vch_no            (numeric digits, unique per type)
 *   bilty.bilty_date  → vch_details.vch_date
 *   bilty.consignor   → vch_details.ledger_master_id  (FK; required, looked up by name)
 *   bilty.bill_to     → vch_details.bill_to_id        (FK; optional, looked up by name)
 *   bilty.agent_name  → vch_details.agent_id          (FK; optional, looked up by name)
 *   bilty.owner_name  → vch_details.owner_name        (text; future owner_id)
 *   bilty.branch      → vch_details.branch
 *   bilty.truck_no    → vch_details.vehicle_id        (FK ledger_master in Vehicles group)
 *   bilty.goods_type  → vch_details.goods_type_id     (FK item_master; looked up by name)
 *   (new)             → vch_details.gst_no
 *
 * Line item mapping (legacy bilty_items → batch):
 *   bilty_items.consignee  → batch.consignee_id (FK ledger_master, looked up by name)
 *   bilty_items.qty        → batch.qty
 *   bilty_items.rate       → batch.rate
 *   bilty_items.inc/l/e_rate → batch.inc_rate / l_rate / e_rate
 *   bilty_items.challan_no, lr_no, from_loc, to_loc → batch.challan_no, lr_no, from_loc, to_loc
 *   (computed)             → batch.amount (= qty × rate)
 *
 * Controller / service / API contract is preserved — this model still
 * accepts and returns objects shaped like a legacy bilty (consignor/consignee/
 * goods_type as name strings).
 */

const pool = require('../db/pool');
const env = require('../config/env');

const ER_DUP_ENTRY = 1062;

// Cached id of the system ledger used by the (legacy) Bilty revenue posting.
const SYSTEM_LEDGER_NAMES = {
  freightIncome: 'Sales',
};
// Name of the dedicated child group that holds every vehicle's payable ledger.
const VEHICLES_GROUP = 'Vehicles';
const _systemLedgerIds = {};
async function getSystemLedgerId(conn, key) {
  if (_systemLedgerIds[key]) return _systemLedgerIds[key];
  const name = SYSTEM_LEDGER_NAMES[key];
  const [rows] = await conn.execute(
    'SELECT id FROM ledger_master WHERE name = :name LIMIT 1',
    { name }
  );
  if (!rows.length) {
    const e = new Error(`system_ledger_missing_${key}`);
    e.code = `system_ledger_missing_${key}`;
    throw e;
  }
  _systemLedgerIds[key] = rows[0].id;
  return _systemLedgerIds[key];
}

let _biltyTypeId = null;
async function getBiltyTypeId(conn = pool) {
  if (_biltyTypeId !== null) return _biltyTypeId;
  const [rows] = await conn.execute(
    "SELECT id FROM vchtype WHERE name = 'Bilty' AND is_system = 1 LIMIT 1"
  );
  if (!rows.length) {
    const e = new Error('bilty_vchtype_missing');
    e.code = 'bilty_vchtype_missing';
    throw e;
  }
  _biltyTypeId = rows[0].id;
  return _biltyTypeId;
}

// NOTE: The companion "Freight Journal" feature was removed — bilties no longer
// auto-post a Dr Freight Expense / Cr Vehicle voucher. The helpers
// getFreightJournalTypeId() and createFreightJournal() were deleted with it.

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function toDateOrNull(v) {
  if (!v) return null;
  return String(v).slice(0, 10);
}

function emptyToNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

async function resolveLedgerId(conn, name, { required = false, label = 'ledger' } = {}) {
  const trimmed = emptyToNull(name);
  if (trimmed === null) {
    if (required) {
      const e = new Error(`${label}_required`);
      e.code = `${label}_required`;
      throw e;
    }
    return null;
  }
  const [rows] = await conn.execute(
    'SELECT id FROM ledger_master WHERE name = :name LIMIT 1',
    { name: trimmed }
  );
  if (!rows.length) {
    if (required) {
      const e = new Error(`${label}_not_found`);
      e.code = `${label}_not_found`;
      throw e;
    }
    return null;
  }
  return rows[0].id;
}

async function resolveItemId(conn, name, { required = false, label = 'goods_type' } = {}) {
  const trimmed = emptyToNull(name);
  if (trimmed === null) {
    if (required) {
      const e = new Error(`${label}_required`);
      e.code = `${label}_required`;
      throw e;
    }
    return null;
  }
  const [rows] = await conn.execute(
    'SELECT id FROM item_master WHERE name = :name LIMIT 1',
    { name: trimmed }
  );
  if (!rows.length) {
    if (required) {
      const e = new Error(`${label}_not_found`);
      e.code = `${label}_not_found`;
      throw e;
    }
    return null;
  }
  return rows[0].id;
}

// Agents are ledgers in the 'agent' ledger group. Auto-creates on first use.
async function resolveAgentId(conn, name, { required = false, label = 'agent', userId = null } = {}) {
  const trimmed = emptyToNull(name);
  if (trimmed === null) {
    if (required) {
      const e = new Error(`${label}_required`);
      e.code = `${label}_required`;
      throw e;
    }
    return null;
  }
  const [rows] = await conn.execute(
    `SELECT lm.id FROM ledger_master lm
       JOIN ledger_group lg ON lg.id = lm.ledger_group_id
      WHERE lm.name = :name AND lg.group_name = 'agent' LIMIT 1`,
    { name: trimmed }
  );
  if (rows.length) return rows[0].id;
  const [r] = await conn.execute(
    `INSERT INTO ledger_master (ledger_group_id, name, created_by, billbybill)
     VALUES ((SELECT id FROM ledger_group WHERE group_name='agent' LIMIT 1), :name, :uid, 'No')`,
    { name: trimmed, uid: userId ?? null }
  );
  return r.insertId;
}

async function resolveVehicleId(conn, name, { required = false, label = 'truck' } = {}) {
  const trimmed = emptyToNull(name);
  if (trimmed === null) {
    if (required) {
      const e = new Error(`${label}_required`);
      e.code = `${label}_required`;
      throw e;
    }
    return null;
  }
  // Vehicles live in vehicle_master now; their accounting ledger can be filed
  // under ANY ledger group (it follows the vehicle's picked owner group), so
  // resolve the truck's ledger through vehicle_master, falling back to a plain
  // name match for safety.
  const [vm] = await conn.execute(
    `SELECT ledger_master_id FROM vehicle_master
      WHERE vehicle_no = :name AND is_current = 1 AND ledger_master_id IS NOT NULL LIMIT 1`,
    { name: trimmed }
  );
  let ledgerId = vm.length ? vm[0].ledger_master_id : null;
  if (!ledgerId) {
    const [lm] = await conn.execute(
      'SELECT id FROM ledger_master WHERE name = :name LIMIT 1',
      { name: trimmed }
    );
    ledgerId = lm.length ? lm[0].id : null;
  }
  if (!ledgerId) {
    if (required) {
      const e = new Error(`${label}_not_found`);
      e.code = `${label}_not_found`;
      throw e;
    }
    return null;
  }
  return ledgerId;
}

async function resolveBranchId(conn, name, { required = false, label = 'branch' } = {}) {
  const trimmed = emptyToNull(name);
  if (trimmed === null) {
    if (required) {
      const e = new Error(`${label}_required`);
      e.code = `${label}_required`;
      throw e;
    }
    return null;
  }
  const [rows] = await conn.execute(
    'SELECT id FROM branch_master WHERE name = :name LIMIT 1',
    { name: trimmed }
  );
  if (!rows.length) {
    if (required) {
      const e = new Error(`${label}_not_found`);
      e.code = `${label}_not_found`;
      throw e;
    }
    return null;
  }
  return rows[0].id;
}

async function resolveDestinationId(conn, name, { required = false, label = 'destination' } = {}) {
  const trimmed = emptyToNull(name);
  if (trimmed === null) {
    if (required) {
      const e = new Error(`${label}_required`);
      e.code = `${label}_required`;
      throw e;
    }
    return null;
  }
  const [rows] = await conn.execute(
    'SELECT id FROM destination_master WHERE name = :name LIMIT 1',
    { name: trimmed }
  );
  if (!rows.length) {
    if (required) {
      const e = new Error(`${label}_not_found`);
      e.code = `${label}_not_found`;
      throw e;
    }
    return null;
  }
  return rows[0].id;
}

function validateBiltyNo(raw) {
  const s = (raw || '').trim();
  if (!s) {
    const e = new Error('bilty_no_required');
    e.code = 'bilty_no_required';
    throw e;
  }
  // Allow an optional "<prefix>-" lead (from the Bilty voucher type) followed by
  // a numeric tail — e.g. '8400153862' or 'BLT-001'. Must end in digits.
  if (!/^([A-Za-z0-9._/]+-)?\d+$/.test(s)) {
    const e = new Error('bilty_no_must_be_numeric');
    e.code = 'bilty_no_must_be_numeric';
    throw e;
  }
  return s;
}

// ----------------------------------------------------------------------------
// Header column list — kept centralised so SELECTs/INSERT/UPDATE stay aligned.
// ----------------------------------------------------------------------------
const HEADER_SELECT = `
  v.id,
  v.vch_no   AS bilty_no,
  v.vch_date AS bilty_date,
  v.branch_id,
  br.name    AS branch,
  v.amount   AS total_with_tax,
  gt.gst_rate AS gst_rate,
  v.ledger_master_id,
  cons.name  AS consignor,
  cons.gst_no AS gst_no,
  v.agent_id,
  agent.name AS agent_name,
  v.bill_to_id,
  bt.name    AS bill_to,
  v.owner_name,
  v.vehicle_id,
  veh.name   AS truck_no,
  v.goods_type_id,
  gt.name    AS goods_type,
  v.created_by,
  v.created_at,
  v.updated_at
`;
const HEADER_FROM = `
  vch_details v
  LEFT JOIN ledger_master      cons  ON cons.id  = v.ledger_master_id
  LEFT JOIN ledger_master      agent ON agent.id = v.agent_id
  LEFT JOIN ledger_master      bt    ON bt.id    = v.bill_to_id
  LEFT JOIN ledger_master      veh   ON veh.id   = v.vehicle_id
  LEFT JOIN item_master        gt    ON gt.id    = v.goods_type_id
  LEFT JOIN branch_master      br    ON br.id    = v.branch_id
`;

// ----------------------------------------------------------------------------
// Children write — line items go to ledger_entries → inventory_entries → batch.
// Caller is responsible for cleaning prior children before calling on update.
//
// IMPORTANT: this writer assumes the receivable ledger_entries row has already
// been inserted by the caller (createWithChildren / updateWithChildren), so
// `receivableLedEntryId` is passed in to anchor the inventory rollup.
// ----------------------------------------------------------------------------
async function insertLineItems(conn, vchId, goodsTypeId, resolvedLines, receivableLedEntryId) {
  if (!resolvedLines || resolvedLines.length === 0) return { total_qty: 0, total_amount: 0 };

  const total_qty = round2(resolvedLines.reduce((s, l) => s + l._qty, 0));
  const total_amount = round2(resolvedLines.reduce((s, l) => s + l._amount, 0));
  const avg_rate = total_qty > 0 ? round2(total_amount / total_qty) : 0;

  // inventory_entries rollup — one row per (voucher, item), anchored to the
  // receivable ledger_entries row created by the caller.
  const [ie] = await conn.execute(
    `INSERT INTO inventory_entries
       (led_id, item_id, qty, rate, amount)
     VALUES
       (:led_id, :item_id, :qty, :rate, :amount)`,
    {
      led_id: receivableLedEntryId,
      item_id: goodsTypeId,
      qty: total_qty,
      rate: avg_rate,
      amount: total_amount,
    }
  );
  const inventoryId = ie.insertId;

  // 3) batch rows — one per line, all linked to the same inventory_entries.
  //    From / To stored as FKs to destination_master (from_id / to_id);
  //    legacy from_loc / to_loc text columns are no longer written.
  for (const l of resolvedLines) {
    await conn.execute(
      `INSERT INTO batch
         (vch_id, inventory_id, item_id, consignee_id, batch_no,
          challan_no, lr_no, from_id, to_id,
          qty, rate, amount, inc_rate, l_rate, e_rate, shipment_no)
       VALUES
         (:vch_id, :inventory_id, :item_id, :consignee_id, NULL,
          :challan_no, :lr_no, :from_id, :to_id,
          :qty, :rate, :amount, :inc_rate, :l_rate, :e_rate, :shipment_no)`,
      {
        vch_id: vchId,
        inventory_id: inventoryId,
        item_id: goodsTypeId,
        consignee_id: l._consignee_id,
        challan_no: emptyToNull(l.challan_no),
        lr_no: emptyToNull(l.lr_no),
        from_id: l._from_id,
        to_id: l._to_id,
        qty: l._qty,
        rate: l._rate,
        amount: l._amount,
        inc_rate: toNum(l.inc_rate),
        l_rate: toNum(l.l_rate),
        e_rate: toNum(l.e_rate),
        shipment_no: emptyToNull(l.shipment_no),
      }
    );
  }
  return { total_qty, total_amount };
}

// ----------------------------------------------------------------------------
// Write the balanced double-entry posting for a Bilty voucher.
//
//   Dr. Customer (Bill-To if set, else Consignor)  +freight_total
//        Cr. Freight Income (Sales)                 -freight_total
//
// No GST rows — bilties under this firm's books are forward-charge-exempt
// from voucher-level tax (any GST handling lives on the downstream invoice
// flow, not on the bilty itself).
//
// Returns the receivable row's id so inventory_entries can anchor to it.
// ----------------------------------------------------------------------------
async function postBalancedEntries(conn, vchId, customerLedgerId, freightTotal) {
  const amount = round2(freightTotal);

  const [le] = await conn.execute(
    `INSERT INTO ledger_entries (vch_id, ledger_id, amount)
     VALUES (:vch_id, :ledger_id, :amount)`,
    { vch_id: vchId, ledger_id: customerLedgerId, amount }
  );
  const receivableLedEntryId = le.insertId;

  if (amount > 0) {
    const incomeId = await getSystemLedgerId(conn, 'freightIncome');
    await conn.execute(
      `INSERT INTO ledger_entries (vch_id, ledger_id, amount)
       VALUES (:vch_id, :ledger_id, :amount)`,
      { vch_id: vchId, ledger_id: incomeId, amount: -amount }
    );
  }
  return receivableLedEntryId;
}

// ----------------------------------------------------------------------------
// CREATE
// ----------------------------------------------------------------------------
async function createWithChildren({ header, items, userId }, externalConn) {
  const ownConn = !externalConn;
  const conn = externalConn || (await pool.getConnection());
  try {
    if (ownConn) await conn.beginTransaction();

    const bilty_no = validateBiltyNo(header.bilty_no);
    const vchTypeId = await getBiltyTypeId(conn);

    const consignorId = await resolveLedgerId(conn, header.consignor, {
      required: true,
      label: 'consignor',
    });
    const agentId = await resolveAgentId(conn, header.agent_name, { label: 'agent', userId });
    const billToId = await resolveLedgerId(conn, header.bill_to, { label: 'bill_to' });
    const vehicleId = await resolveVehicleId(conn, header.truck_no, { label: 'truck' });
    const branchId = await resolveBranchId(conn, header.branch, { label: 'branch' });
    // goods_type required when there are line items (we need item_id to write
    // batch rows). With zero items it's still valid to omit.
    const goodsTypeId = await resolveItemId(conn, header.goods_type, {
      required: Array.isArray(items) && items.length > 0,
      label: 'goods_type',
    });

    // Per-line consignee (multi-drop bilties) and from/to.
    const resolvedItems = [];
    let freightSubtotal = 0;
    for (const it of (items || [])) {
      const lineConsigneeId = await resolveLedgerId(conn, it.consignee, { label: 'consignee' });
      const lineFromId = await resolveDestinationId(conn, it.from_loc, { label: 'from' });
      const lineToId   = await resolveDestinationId(conn, it.to_loc,   { label: 'to' });
      const qty = toNum(it.qty);
      const rate = toNum(it.rate);
      const amount = round2(qty * rate); // per-line freight (batch.amount)
      // Freight Expense = Σ(qty × l_rate). This is what posts to the companion
      // Freight Journal (Dr Freight Expense / Cr Vehicle) and is stored as the
      // bilty's amount — i.e. it replaces the old qty×rate "freight total".
      freightSubtotal += round2(qty * toNum(it.l_rate));
      resolvedItems.push({ ...it, _consignee_id: lineConsigneeId, _from_id: lineFromId, _to_id: lineToId, _qty: qty, _rate: rate, _amount: amount });
    }
    freightSubtotal = round2(freightSubtotal);

    // GST decision — Bill-To takes priority over Consignor as the customer
    // (because that's whose books carry the receivable).
    const customerLedgerId = billToId || consignorId;

    let h;
    try {
      [h] = await conn.execute(
        `INSERT INTO vch_details
           (vch_type_id, vch_no, vch_date, branch_id,
            ledger_master_id, agent_id, bill_to_id, owner_name,
            vehicle_id, goods_type_id,
            amount, created_by)
         VALUES
           (:vch_type_id, :vch_no, :vch_date, :branch_id,
            :ledger_master_id, :agent_id, :bill_to_id, :owner_name,
            :vehicle_id, :goods_type_id,
            :amount, :created_by)`,
        {
          vch_type_id: vchTypeId,
          vch_no: bilty_no,
          vch_date: toDateOrNull(header.bilty_date),
          branch_id: branchId,
          ledger_master_id: consignorId,
          agent_id: agentId,
          bill_to_id: billToId,
          owner_name: emptyToNull(header.owner_name),
          vehicle_id: vehicleId,
          goods_type_id: goodsTypeId,
          amount: freightSubtotal,
          created_by: userId ?? null,
        }
      );
    } catch (err) {
      if (err && err.errno === ER_DUP_ENTRY) {
        const e = new Error('bilty_no_conflict');
        e.code = 'bilty_no_conflict';
        throw e;
      }
      throw err;
    }
    const vchId = h.insertId;

    // Bilty voucher itself does NOT post to ledger_entries — only its
    // companion Freight Journal does. Inventory rollup anchored to NULL
    // ledger entry (matches the opening-stock pattern, allowed by schema).
    await insertLineItems(conn, vchId, goodsTypeId, resolvedItems, null);

    // NOTE: Bilties intentionally do NOT post a companion Freight Journal.
    // The freight-expense figure (Σ qty × l_rate) is stored on the bilty's
    // amount; the Advance/Fuel budget reads it from the line items directly.

    if (ownConn) await conn.commit();
    return { id: vchId, bilty_no };
  } catch (err) {
    if (ownConn) {
      try { await conn.rollback(); } catch { /* ignore */ }
    }
    throw err;
  } finally {
    if (ownConn) conn.release();
  }
}

// ----------------------------------------------------------------------------
// READ
// ----------------------------------------------------------------------------
async function findAll() {
  const vchTypeId = await getBiltyTypeId();
  const [rows] = await pool.execute(
    `SELECT v.id, v.vch_no AS bilty_no, v.vch_date AS bilty_date,
            cons.name AS consignor, veh.name AS truck_no, v.created_at,
            u.username AS created_by_username,
            (SELECT COUNT(*) FROM batch bi WHERE bi.vch_id = v.id) AS item_count
       FROM vch_details v
       LEFT JOIN ledger_master cons ON cons.id = v.ledger_master_id
       LEFT JOIN ledger_master veh  ON veh.id  = v.vehicle_id
       LEFT JOIN users u            ON u.id    = v.created_by
      WHERE v.vch_type_id = :vch_type_id
      ORDER BY v.id DESC`,
    { vch_type_id: vchTypeId }
  );
  return rows;
}

// Light lookup — id by bilty_no (vch_no). Used by the URL router so a path
// like /edit/bilty/18520 can resolve to the bilty's primary key.
async function findIdByBiltyNo(bilty_no) {
  const vchTypeId = await getBiltyTypeId();
  const [rows] = await pool.execute(
    `SELECT id FROM vch_details
      WHERE vch_no = :no AND vch_type_id = :vch_type_id LIMIT 1`,
    { no: String(bilty_no), vch_type_id: vchTypeId }
  );
  return rows.length ? rows[0].id : null;
}

async function findById(id) {
  const vchTypeId = await getBiltyTypeId();
  const [hdrs] = await pool.execute(
    `SELECT ${HEADER_SELECT} FROM ${HEADER_FROM}
      WHERE v.id = :id AND v.vch_type_id = :vch_type_id LIMIT 1`,
    { id, vch_type_id: vchTypeId }
  );
  const header = hdrs[0];
  if (!header) return null;

  // Reconstruct the bilty_items shape from `batch` (joining consignee + from/to names).
  const [items] = await pool.execute(
    `SELECT b.id, b.vch_id AS bilty_id,
            b.challan_no, b.lr_no,
            b.from_id, fr.name AS from_loc,
            b.to_id,   tt.name AS to_loc,
            b.consignee_id, cnsee.name AS consignee,
            b.qty, b.rate, b.inc_rate, b.l_rate, b.e_rate,
            b.shipment_no
       FROM batch b
       LEFT JOIN ledger_master      cnsee ON cnsee.id = b.consignee_id
       LEFT JOIN destination_master fr    ON fr.id    = b.from_id
       LEFT JOIN destination_master tt    ON tt.id    = b.to_id
      WHERE b.vch_id = :id ORDER BY b.id ASC`,
    { id }
  );
  return { ...header, items };
}

// ----------------------------------------------------------------------------
// UPDATE — full replace of header + children. bilty_no may be re-supplied.
// Deleting `ledger_entries` cascades to inventory_entries → batch.
// ----------------------------------------------------------------------------
async function updateWithChildren(id, { header, items, userId = null }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const vchTypeId = await getBiltyTypeId(conn);

    const [chk] = await conn.execute(
      `SELECT id, vch_no FROM vch_details
        WHERE id = :id AND vch_type_id = :vch_type_id LIMIT 1 FOR UPDATE`,
      { id, vch_type_id: vchTypeId }
    );
    if (chk.length === 0) {
      await conn.rollback();
      return false;
    }

    const supplied = (header.bilty_no || '').trim();
    const nextBiltyNo = supplied ? validateBiltyNo(supplied) : chk[0].vch_no;

    const consignorId = await resolveLedgerId(conn, header.consignor, {
      required: true,
      label: 'consignor',
    });
    const agentId = await resolveAgentId(conn, header.agent_name, { label: 'agent', userId });
    const billToId = await resolveLedgerId(conn, header.bill_to, { label: 'bill_to' });
    const vehicleId = await resolveVehicleId(conn, header.truck_no, { label: 'truck' });
    const branchId = await resolveBranchId(conn, header.branch, { label: 'branch' });
    const goodsTypeId = await resolveItemId(conn, header.goods_type, {
      required: Array.isArray(items) && items.length > 0,
      label: 'goods_type',
    });

    // Per-line consignee (multi-drop) and from/to.
    const resolvedItems = [];
    let freightSubtotal = 0;
    for (const it of (items || [])) {
      const lineConsigneeId = await resolveLedgerId(conn, it.consignee, { label: 'consignee' });
      const lineFromId = await resolveDestinationId(conn, it.from_loc, { label: 'from' });
      const lineToId   = await resolveDestinationId(conn, it.to_loc,   { label: 'to' });
      const qty = toNum(it.qty);
      const rate = toNum(it.rate);
      const amount = round2(qty * rate); // per-line freight (batch.amount)
      // Freight Expense = Σ(qty × l_rate). This is what posts to the companion
      // Freight Journal (Dr Freight Expense / Cr Vehicle) and is stored as the
      // bilty's amount — i.e. it replaces the old qty×rate "freight total".
      freightSubtotal += round2(qty * toNum(it.l_rate));
      resolvedItems.push({ ...it, _consignee_id: lineConsigneeId, _from_id: lineFromId, _to_id: lineToId, _qty: qty, _rate: rate, _amount: amount });
    }
    freightSubtotal = round2(freightSubtotal);

    const customerLedgerId = billToId || consignorId;

    try {
      await conn.execute(
        `UPDATE vch_details SET
           vch_no            = :vch_no,
           vch_date          = :vch_date,
           branch_id         = :branch_id,
           ledger_master_id  = :ledger_master_id,
           agent_id          = :agent_id,
           bill_to_id        = :bill_to_id,
           owner_name        = :owner_name,
           vehicle_id        = :vehicle_id,
           goods_type_id     = :goods_type_id,
           amount            = :amount
         WHERE id = :id AND vch_type_id = :vch_type_id`,
        {
          id,
          vch_type_id: vchTypeId,
          vch_no: nextBiltyNo,
          vch_date: toDateOrNull(header.bilty_date),
          branch_id: branchId,
          ledger_master_id: consignorId,
          agent_id: agentId,
          bill_to_id: billToId,
          owner_name: emptyToNull(header.owner_name),
          vehicle_id: vehicleId,
          goods_type_id: goodsTypeId,
          amount: freightSubtotal,
        }
      );
    } catch (err) {
      if (err && err.errno === ER_DUP_ENTRY) {
        const e = new Error('bilty_no_conflict');
        e.code = 'bilty_no_conflict';
        throw e;
      }
      throw err;
    }

    // Wipe inventory_entries / batch for this bilty so we can re-insert.
    // (No ledger_entries on the bilty voucher itself — it doesn't post.)
    // We delete inventory_entries explicitly because they're not cascaded
    // from vch_details (their parent is ledger_entries which is now empty).
    await conn.execute('DELETE FROM batch WHERE vch_id = :id', { id });
    await conn.execute(
      `DELETE ie FROM inventory_entries ie
         LEFT JOIN ledger_entries le ON le.id = ie.led_id
        WHERE ie.led_id IS NULL AND ie.id IN (
          SELECT * FROM (SELECT inventory_id FROM batch WHERE vch_id = :id) AS x
        )`,
      { id }
    ).catch(() => { /* batch already deleted; rollup may already be orphaned */ });

    // Bilties no longer post a companion Freight Journal. Still clear any
    // legacy journal left over from before this change (cascade removes its
    // ledger_entries via FK ON DELETE CASCADE) so editing an old bilty cleans up.
    await conn.execute('DELETE FROM vch_details WHERE parent_vch_id = :id', { id });

    await insertLineItems(conn, id, goodsTypeId, resolvedItems, null);

    await conn.commit();
    return true;
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

// ----------------------------------------------------------------------------
// DELETE — hard delete header. Cascades remove ledger_entries → inventory_entries
// → batch. If a freight memo (or any downstream voucher row) references this
// bilty via FK, MySQL raises ER_ROW_IS_REFERENCED_2; we surface that as
// { in_use: true } so the controller can return 409 instead of crashing.
// ----------------------------------------------------------------------------
async function deleteById(id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const vchTypeId = await getBiltyTypeId(conn);

    const [chk] = await conn.execute(
      `SELECT id FROM vch_details
        WHERE id = :id AND vch_type_id = :vch_type_id LIMIT 1 FOR UPDATE`,
      { id, vch_type_id: vchTypeId }
    );
    if (chk.length === 0) {
      await conn.rollback();
      return { affected: 0 };
    }

    // Manual cleanup of children we own outright. ledger_entries cascades
    // into inventory_entries → batch via existing FKs.
    await conn.execute('DELETE FROM ledger_entries  WHERE vch_id = :id', { id });

    try {
      const [r] = await conn.execute(
        `DELETE FROM vch_details WHERE id = :id AND vch_type_id = :vch_type_id`,
        { id, vch_type_id: vchTypeId }
      );
      await conn.commit();
      return { affected: r.affectedRows };
    } catch (err) {
      await conn.rollback();
      if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
        return { in_use: true };
      }
      throw err;
    }
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
      return { in_use: true };
    }
    throw err;
  } finally {
    conn.release();
  }
}

// Suggest the next bilty number for the given branch (or global when branch
// is null). Numbering is per-branch when a branch is supplied — `JPR/0042`
// and `BOM/0017` can coexist as distinct sequences.
async function nextBiltyNo(branch) {
  const vchTypeId = await getBiltyTypeId();
  // The Bilty type's own configured prefix (e.g. 'BLT'); blank → plain numbering.
  const [ptRows] = await pool.execute(
    'SELECT prefix FROM vchtype WHERE id = :id LIMIT 1', { id: vchTypeId }
  );
  const prefix = String((ptRows[0] && ptRows[0].prefix) || '').trim();
  // Take the MAX of the TRAILING numeric portion of existing bilty numbers, so
  // both plain '123' and prefixed 'BLT-123' continue the same sequence.
  let sql = `SELECT COALESCE(MAX(CAST(REGEXP_SUBSTR(v.vch_no, '[0-9]+$') AS UNSIGNED)), 0) AS m
               FROM vch_details v
               LEFT JOIN branch_master b ON b.id = v.branch_id
              WHERE v.vch_type_id = :vch_type_id
                AND v.vch_no REGEXP '[0-9]+$'`;
  const params = { vch_type_id: vchTypeId };
  if (branch) {
    sql += ' AND b.name = :branch';
    params.branch = branch;
  }
  const [rows] = await pool.execute(sql, params);
  const num = (Number(rows[0]?.m) || 0) + 1;
  return prefix ? `${prefix}-${num}` : String(num);
}

module.exports = {
  createWithChildren,
  updateWithChildren,
  findAll,
  findById,
  findIdByBiltyNo,
  deleteById,
  getBiltyTypeId,
  nextBiltyNo,
};
