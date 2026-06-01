'use strict';

const pool = require('../db/pool');

const COLS = `id, ledger_group_id, name, gst_no, pan_no, address, city, state, country, pincode, billbybill, opening_balance, opening_balance_type, created_at, updated_at`;

function normYesNo(v) {
  // Default to 'Yes' — billbybill is the common case for ledgers in this app.
  if (v === undefined || v === null || v === '') return 'Yes';
  const s = String(v).trim().toLowerCase();
  return (s === 'no' || s === 'n' || s === '0' || s === 'false') ? 'No' : 'Yes';
}

function normDrCr(v) {
  if (v === undefined || v === null || v === '') return 'Dr';
  const s = String(v).trim().toLowerCase();
  return s === 'cr' ? 'Cr' : 'Dr';
}

function toAmount(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function findAll(ledger_group_id, opts = {}) {
  const excludeIds = Array.isArray(opts.excludeIds)
    ? opts.excludeIds.filter((n) => Number.isInteger(n) && n > 0)
    : [];
  if (ledger_group_id == null) {
    if (excludeIds.length > 0) {
      // Build a positional NOT IN clause — mysql2 prepared statements don't
      // expand array params for IN lists.
      const placeholders = excludeIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT ${COLS} FROM ledger_master
          WHERE ledger_group_id NOT IN (${placeholders})
          ORDER BY name ASC`,
        excludeIds
      );
      return rows;
    }
    const [rows] = await pool.execute(
      `SELECT ${COLS} FROM ledger_master ORDER BY name ASC`
    );
    return rows;
  }
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM ledger_master WHERE ledger_group_id = :ledger_group_id ORDER BY name ASC`,
    { ledger_group_id }
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM ledger_master WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

// Autocomplete search — returns lightweight rows for dropdowns.
// ledger_group_id === null → cross-group search (used by the Voucher form so
// ledgers added under any group appear in the autocomplete).
async function search(ledger_group_id, q) {
  const like = `%${q}%`;
  if (ledger_group_id == null) {
    const [rows] = await pool.execute(
      `SELECT id, ledger_group_id, name, city, gst_no
         FROM ledger_master
        WHERE name LIKE :like
        ORDER BY name ASC LIMIT 50`,
      { like }
    );
    return rows;
  }
  const [rows] = await pool.execute(
    `SELECT id, ledger_group_id, name, city, gst_no
       FROM ledger_master
      WHERE ledger_group_id = :ledger_group_id AND name LIKE :like
      ORDER BY name ASC LIMIT 50`,
    { ledger_group_id, like }
  );
  return rows;
}

async function create({ ledger_group_id, name, gst_no, pan_no, address, city, state, country, pincode, billbybill, opening_balance, opening_balance_type, userId }) {
  const [r] = await pool.execute(
    `INSERT INTO ledger_master
       (ledger_group_id, name, gst_no, pan_no, address, city, state, country, pincode,
        billbybill, opening_balance, opening_balance_type, created_by)
     VALUES
       (:ledger_group_id, :name, :gst_no, :pan_no, :address, :city, :state, :country, :pincode,
        :billbybill, :opening_balance, :opening_balance_type, :userId)`,
    {
      ledger_group_id,
      name: String(name).trim(),
      gst_no: gst_no ? String(gst_no).trim().toUpperCase() : null,
      pan_no: pan_no ? String(pan_no).trim().toUpperCase() : null,
      address: address || null,
      city: city || null,
      state: state || null,
      country: country || null,
      pincode: pincode || null,
      billbybill: normYesNo(billbybill),
      opening_balance: toAmount(opening_balance),
      opening_balance_type: normDrCr(opening_balance_type),
      userId: userId ?? null,
    }
  );
  return { id: r.insertId };
}

async function update(id, { name, gst_no, pan_no, address, city, state, country, pincode, billbybill, opening_balance, opening_balance_type, ledger_group_id }) {
  await pool.execute(
    `UPDATE ledger_master SET
       name = :name,
       gst_no = :gst_no,
       pan_no = :pan_no,
       address = :address,
       city = :city,
       state = :state,
       country = :country,
       pincode = :pincode,
       billbybill = :billbybill,
       opening_balance = :opening_balance,
       opening_balance_type = :opening_balance_type,
       ledger_group_id = COALESCE(:ledger_group_id, ledger_group_id)
     WHERE id = :id`,
    {
      id,
      name: String(name).trim(),
      gst_no: gst_no ? String(gst_no).trim().toUpperCase() : null,
      pan_no: pan_no ? String(pan_no).trim().toUpperCase() : null,
      address: address || null,
      city: city || null,
      state: state || null,
      country: country || null,
      pincode: pincode || null,
      billbybill: normYesNo(billbybill),
      opening_balance: toAmount(opening_balance),
      opening_balance_type: normDrCr(opening_balance_type),
      ledger_group_id: ledger_group_id == null || ledger_group_id === '' ? null : Number(ledger_group_id),
    }
  );
}

async function deleteById(id) {
  const [r] = await pool.execute(
    `DELETE FROM ledger_master WHERE id = :id`,
    { id }
  );
  return { affected: r.affectedRows };
}

module.exports = { findAll, findById, search, create, update, deleteById };

