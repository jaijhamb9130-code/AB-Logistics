'use strict';

const pool = require('../db/pool');
const biltyModel = require('../models/biltyModel');
const userModel = require('../models/userModel');

function normalizePerms(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.length > 0) {
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  }
  return [];
}

function hasPerm(user, perm) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = normalizePerms(user.permissions);
  return perms.includes('*') || perms.includes(perm);
}

async function countTable(table) {
  const [rows] = await pool.execute(`SELECT COUNT(*) AS c FROM ${table}`);
  return Number(rows[0]?.c ?? 0);
}

async function countActiveUsers() {
  const [rows] = await pool.execute('SELECT COUNT(*) AS c FROM users WHERE is_active = 1');
  return Number(rows[0]?.c ?? 0);
}

async function countBilties() {
  const vchTypeId = await biltyModel.getBiltyTypeId();
  const [rows] = await pool.execute('SELECT COUNT(*) AS c FROM vch_details WHERE vch_type_id = ?', [vchTypeId]);
  return Number(rows[0]?.c ?? 0);
}

// GET /api/reports/summary
exports.getSummary = async (req, res, next) => {
  try {
    const user = req.user;
    const canBilty = hasPerm(user, 'bilty.view');
    const canDaybook = hasPerm(user, 'daybook.view');
    const canLedgerGroup = hasPerm(user, 'ledgergroup.view');
    const canUsers = hasPerm(user, 'user.view');
    return res.status(200).json({
      bilties: canBilty ? await countBilties() : 0,
      ledger_groups: canLedgerGroup ? await countTable('ledger_group') : 0,
      active_users: canUsers ? await countActiveUsers() : 0,
      permissions: { bilty: canBilty, daybook: canDaybook, ledgergroup: canLedgerGroup, user: canUsers },
    });
  } catch (err) { return next(err); }
};

// GET /api/reports/bilty-register?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=&truck=&consignor=
exports.getBiltyRegister = async (req, res, next) => {
  try {
    const { from, to, branch, truck, consignor } = req.query;
    const fromDate = from || new Date().toISOString().slice(0, 10);
    const toDate   = to   || new Date().toISOString().slice(0, 10);

    const vchTypeId = await biltyModel.getBiltyTypeId();
    let sql = `
      SELECT v.id, v.vch_no AS bilty_no, v.vch_date AS bilty_date,
             v.amount AS freight_total,
             cons.name AS consignor,
             vm.vehicle_no AS truck_no,
             br.name AS branch,
             lm_owner.name AS owner_name,
             COUNT(b.id) AS item_count,
             SUM(b.qty) AS total_qty,
             v.owner_name AS owner_raw
      FROM vch_details v
      LEFT JOIN ledger_master cons ON cons.id = v.ledger_master_id
      LEFT JOIN vehicle_master vm ON vm.id = v.vehicle_id
      LEFT JOIN branch_master br ON br.id = v.branch_id
      LEFT JOIN ledger_master lm_owner ON lm_owner.id = vm.ledger_master_id
      LEFT JOIN batch b ON b.vch_id = v.id
      WHERE v.vch_type_id = :vchTypeId
        AND DATE(v.vch_date) >= :fromDate AND DATE(v.vch_date) <= :toDate
    `;
    const params = { vchTypeId, fromDate, toDate };

    if (branch) { sql += ' AND br.name LIKE :branch'; params.branch = `%${branch}%`; }
    if (truck)  { sql += ' AND vm.vehicle_no LIKE :truck'; params.truck = `%${truck}%`; }
    if (consignor) { sql += ' AND cons.name LIKE :consignor'; params.consignor = `%${consignor}%`; }

    sql += ' GROUP BY v.id ORDER BY v.vch_date DESC, v.id DESC';

    const [rows] = await pool.execute(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) { return next(err); }
};

// GET /api/reports/voucher-register?from=&to=&vch_type_id=&search=
exports.getVoucherRegister = async (req, res, next) => {
  try {
    const { from, to, vch_type_id, search } = req.query;
    const fromDate = from || new Date().toISOString().slice(0, 10);
    const toDate   = to   || new Date().toISOString().slice(0, 10);

    let sql = `
      SELECT v.id, v.vch_no, v.vch_date, v.remark, v.amount,
             pl.name AS party_name,
             vt.name AS vch_type_name,
             CASE WHEN ple.amount > 0 THEN ABS(ple.amount) ELSE 0 END AS dr_amount,
             CASE WHEN ple.amount < 0 THEN ABS(ple.amount) ELSE 0 END AS cr_amount
      FROM vch_details v
      LEFT JOIN ledger_master pl ON pl.id = v.ledger_master_id
      LEFT JOIN vchtype vt ON vt.id = v.vch_type_id
      LEFT JOIN (
        SELECT vch_id, ledger_id, SUM(amount) AS amount
        FROM ledger_entries GROUP BY vch_id, ledger_id
      ) ple ON ple.vch_id = v.id AND ple.ledger_id = v.ledger_master_id
      WHERE DATE(v.vch_date) >= :fromDate AND DATE(v.vch_date) <= :toDate
        AND v.parent_vch_id IS NULL
    `;
    const params = { fromDate, toDate };

    if (vch_type_id) { sql += ' AND v.vch_type_id = :vch_type_id'; params.vch_type_id = vch_type_id; }
    if (search) {
      sql += ' AND (pl.name LIKE :search OR v.vch_no LIKE :search)';
      params.search = `%${search}%`;
    }
    sql += ' ORDER BY v.vch_date DESC, v.id DESC';

    const [rows] = await pool.execute(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) { return next(err); }
};

// GET /api/reports/ledger-statement?ledger_id=&from=&to=
exports.getLedgerStatement = async (req, res, next) => {
  try {
    const { ledger_id, from, to } = req.query;
    if (!ledger_id) return res.status(400).json({ success: false, error: { message: 'ledger_id is required' } });

    const fromDate = from || '2000-01-01';
    const toDate   = to   || new Date().toISOString().slice(0, 10);

    // Opening balance: sum of all ledger_entries BEFORE fromDate
    const [openRows] = await pool.execute(
      `SELECT COALESCE(SUM(le.amount), 0) AS opening
       FROM ledger_entries le
       JOIN vch_details v ON v.id = le.vch_id
       WHERE le.ledger_id = :ledger_id AND DATE(v.vch_date) < :fromDate`,
      { ledger_id, fromDate }
    );
    const opening = Number(openRows[0]?.opening ?? 0);

    // Transactions in range
    const [txRows] = await pool.execute(
      `SELECT v.id AS vch_id, v.vch_no, v.vch_date, v.remark,
              vt.name AS vch_type_name,
              le.amount,
              GROUP_CONCAT(DISTINCT opp.name ORDER BY opp.name SEPARATOR ', ') AS particulars
       FROM ledger_entries le
       JOIN vch_details v ON v.id = le.vch_id
       LEFT JOIN vchtype vt ON vt.id = v.vch_type_id
       LEFT JOIN ledger_entries le2 ON le2.vch_id = v.id AND le2.ledger_id != :ledger_id
       LEFT JOIN ledger_master opp ON opp.id = le2.ledger_id
       WHERE le.ledger_id = :ledger_id
         AND DATE(v.vch_date) >= :fromDate AND DATE(v.vch_date) <= :toDate
       GROUP BY v.id, le.amount
       ORDER BY v.vch_date ASC, v.id ASC`,
      { ledger_id, fromDate, toDate }
    );

    // Ledger name
    const [lmRows] = await pool.execute('SELECT name FROM ledger_master WHERE id = :id LIMIT 1', { id: ledger_id });
    const ledgerName = lmRows[0]?.name ?? '';

    // Build running balance
    let balance = opening;
    const entries = txRows.map((r) => {
      balance += Number(r.amount);
      return { ...r, amount: Number(r.amount), running_balance: balance };
    });

    const debitTotal  = entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const creditTotal = entries.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);
    const closing = opening + debitTotal - creditTotal;

    return res.json({
      success: true,
      data: {
        ledger_name: ledgerName,
        opening,
        entries,
        debit_total: debitTotal,
        credit_total: creditTotal,
        closing,
      },
    });
  } catch (err) { return next(err); }
};

// GET /api/reports/group-summary?from=&to=
exports.getGroupSummary = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || '2000-01-01';
    const toDate   = to   || new Date().toISOString().slice(0, 10);

    const [rows] = await pool.execute(
      `SELECT lg.id AS group_id, lg.group_name,
              COUNT(DISTINCT lm.id) AS ledger_count,
              COALESCE(SUM(CASE WHEN le.amount > 0 THEN le.amount ELSE 0 END), 0) AS debit_total,
              COALESCE(SUM(CASE WHEN le.amount < 0 THEN ABS(le.amount) ELSE 0 END), 0) AS credit_total,
              COALESCE(SUM(le.amount), 0) AS net_balance
       FROM ledger_group lg
       LEFT JOIN ledger_master lm ON lm.ledger_group_id = lg.id
       LEFT JOIN ledger_entries le ON le.ledger_id = lm.id
       LEFT JOIN vch_details v ON v.id = le.vch_id AND DATE(v.vch_date) >= :fromDate AND DATE(v.vch_date) <= :toDate
       GROUP BY lg.id
       ORDER BY lg.group_name ASC`,
      { fromDate, toDate }
    );

    return res.json({ success: true, data: rows });
  } catch (err) { return next(err); }
};

// GET /api/reports/group-ledgers?group_id=&from=&to=
exports.getGroupLedgers = async (req, res, next) => {
  try {
    const { group_id, from, to } = req.query;
    if (!group_id) return res.status(400).json({ success: false, error: { message: 'group_id is required' } });

    const fromDate = from || '2000-01-01';
    const toDate   = to   || new Date().toISOString().slice(0, 10);

    const [rows] = await pool.execute(
      `SELECT lm.id AS ledger_id, lm.name AS ledger_name,
              COALESCE(SUM(CASE WHEN DATE(v.vch_date) < :fromDate THEN le.amount ELSE 0 END), 0) AS opening,
              COALESCE(SUM(CASE WHEN DATE(v.vch_date) >= :fromDate AND DATE(v.vch_date) <= :toDate AND le.amount > 0 THEN le.amount ELSE 0 END), 0) AS debit_total,
              COALESCE(SUM(CASE WHEN DATE(v.vch_date) >= :fromDate AND DATE(v.vch_date) <= :toDate AND le.amount < 0 THEN ABS(le.amount) ELSE 0 END), 0) AS credit_total,
              COALESCE(SUM(le.amount), 0) AS closing
       FROM ledger_master lm
       LEFT JOIN ledger_entries le ON le.ledger_id = lm.id
       LEFT JOIN vch_details v ON v.id = le.vch_id AND DATE(v.vch_date) <= :toDate
       WHERE lm.ledger_group_id = :group_id
       GROUP BY lm.id
       ORDER BY lm.name ASC`,
      { group_id, fromDate, toDate }
    );

    const [grpRows] = await pool.execute('SELECT group_name FROM ledger_group WHERE id = :id LIMIT 1', { id: group_id });
    return res.json({ success: true, data: rows, group_name: grpRows[0]?.group_name ?? '' });
  } catch (err) { return next(err); }
};

exports._internals = { hasPerm, normalizePerms };
exports._models = { biltyModel, userModel };
