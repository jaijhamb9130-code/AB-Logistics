'use strict';

const pool = require('../db/pool');

const COLS = `id, ledger_group_id, name, gst_no, pan_no, address, city, state, country, pincode, tally_master_id, created_at, updated_at`;

async function findAll(ledger_group_id) {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM party_ledger WHERE ledger_group_id = :ledger_group_id ORDER BY name ASC`,
    { ledger_group_id }
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM party_ledger WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

// Autocomplete search — returns lightweight rows for dropdowns.
async function search(ledger_group_id, q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT id, ledger_group_id, name, city, gst_no
       FROM party_ledger
      WHERE ledger_group_id = :ledger_group_id AND name LIKE :like
      ORDER BY name ASC LIMIT 50`,
    { ledger_group_id, like }
  );
  return rows;
}

async function create({ ledger_group_id, name, gst_no, pan_no, address, city, state, country, pincode, tally_master_id, userId }) {
  const [r] = await pool.execute(
    `INSERT INTO party_ledger
       (ledger_group_id, name, gst_no, pan_no, address, city, state, country, pincode, tally_master_id, created_by)
     VALUES
       (:ledger_group_id, :name, :gst_no, :pan_no, :address, :city, :state, :country, :pincode, :tally_master_id, :userId)`,
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
      tally_master_id: tally_master_id || null,
      userId: userId ?? null,
    }
  );
  return { id: r.insertId };
}

async function update(id, { name, gst_no, pan_no, address, city, state, country, pincode }) {
  await pool.execute(
    `UPDATE party_ledger SET
       name = :name,
       gst_no = :gst_no,
       pan_no = :pan_no,
       address = :address,
       city = :city,
       state = :state,
       country = :country,
       pincode = :pincode
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
    }
  );
}

module.exports = { findAll, findById, search, create, update };

