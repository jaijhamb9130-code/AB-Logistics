'use strict';

const pool = require('../db/pool');

const COLS = `id, name, mobile, gst_no, pan_no, address, city, state, pincode, commission_pct, created_at, updated_at`;

async function findAll() {
  const [rows] = await pool.execute(`SELECT ${COLS} FROM agent_master ORDER BY name ASC`);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(`SELECT ${COLS} FROM agent_master WHERE id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.execute(`SELECT ${COLS} FROM agent_master WHERE name = :name LIMIT 1`, { name });
  return rows[0] || null;
}

async function search(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM agent_master
      WHERE name LIKE :like OR mobile LIKE :like
      ORDER BY name ASC LIMIT 50`,
    { like }
  );
  return rows;
}

async function create({ name, mobile, gst_no, pan_no, address, city, state, pincode, commission_pct, userId }) {
  const [r] = await pool.execute(
    `INSERT INTO agent_master (name, mobile, gst_no, pan_no, address, city, state, pincode, commission_pct, created_by)
     VALUES (:name, :mobile, :gst_no, :pan_no, :address, :city, :state, :pincode, :commission_pct, :userId)`,
    {
      name: String(name).trim(),
      mobile: mobile ? String(mobile).trim() : null,
      gst_no: gst_no ? String(gst_no).trim().toUpperCase() : null,
      pan_no: pan_no ? String(pan_no).trim().toUpperCase() : null,
      address: address || null,
      city: city || null,
      state: state || null,
      pincode: pincode || null,
      commission_pct: commission_pct == null || commission_pct === '' ? 0 : Number(commission_pct),
      userId: userId ?? null,
    }
  );
  return { id: r.insertId };
}

async function update(id, { name, mobile, gst_no, pan_no, address, city, state, pincode, commission_pct }) {
  await pool.execute(
    `UPDATE agent_master SET
       name = :name, mobile = :mobile, gst_no = :gst_no, pan_no = :pan_no,
       address = :address, city = :city, state = :state, pincode = :pincode,
       commission_pct = :commission_pct
     WHERE id = :id`,
    {
      id,
      name: String(name).trim(),
      mobile: mobile ? String(mobile).trim() : null,
      gst_no: gst_no ? String(gst_no).trim().toUpperCase() : null,
      pan_no: pan_no ? String(pan_no).trim().toUpperCase() : null,
      address: address || null,
      city: city || null,
      state: state || null,
      pincode: pincode || null,
      commission_pct: commission_pct == null || commission_pct === '' ? 0 : Number(commission_pct),
    }
  );
}

async function deleteById(id) {
  try {
    const [r] = await pool.execute(`DELETE FROM agent_master WHERE id = :id`, { id });
    return { affected: r.affectedRows };
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') return { in_use: true };
    throw err;
  }
}

module.exports = { findAll, findById, findByName, search, create, update, deleteById };
