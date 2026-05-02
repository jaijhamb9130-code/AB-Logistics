'use strict';

const pool = require('../db/pool');

const COLS = `id, name, hsn_code, gst_rate, tally_master_id, created_at, updated_at`;

async function findAll() {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM item_master ORDER BY name ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM item_master WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function search(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT id, name, hsn_code, gst_rate
       FROM item_master
      WHERE name LIKE :like OR hsn_code LIKE :like
      ORDER BY name ASC LIMIT 50`,
    { like }
  );
  return rows;
}

async function create({ name, hsn_code, gst_rate, tally_master_id, userId }) {
  const [r] = await pool.execute(
    `INSERT INTO item_master (name, hsn_code, gst_rate, tally_master_id, created_by)
     VALUES (:name, :hsn_code, :gst_rate, :tally_master_id, :userId)`,
    {
      name: String(name).trim(),
      hsn_code: hsn_code ? String(hsn_code).trim().toUpperCase() : null,
      gst_rate: gst_rate == null || gst_rate === '' ? null : Number(gst_rate),
      tally_master_id: tally_master_id || null,
      userId: userId ?? null,
    }
  );
  return { id: r.insertId };
}

async function update(id, { name, hsn_code, gst_rate }) {
  await pool.execute(
    `UPDATE item_master SET name = :name, hsn_code = :hsn_code, gst_rate = :gst_rate WHERE id = :id`,
    {
      id,
      name: String(name).trim(),
      hsn_code: hsn_code ? String(hsn_code).trim().toUpperCase() : null,
      gst_rate: gst_rate == null || gst_rate === '' ? null : Number(gst_rate),
    }
  );
}

module.exports = { findAll, findById, search, create, update };
