'use strict';

const pool = require('../db/pool');

// Agents are ordinary ledgers living in the 'agent' ledger group (the standalone
// agent_master table was folded into ledger_master). Every query is scoped to
// that group so the Agent Master page keeps behaving like a dedicated master.
const COLS = `lm.id, lm.name, lm.mobile, lm.gst_no, lm.pan_no, lm.address, lm.city,
              lm.state, lm.pincode, lm.commission_pct, lm.created_at, lm.updated_at`;
const GROUP = `(SELECT id FROM ledger_group WHERE group_name = 'agent' LIMIT 1)`;
const FROM_AGENT = `FROM ledger_master lm WHERE lm.ledger_group_id = ${GROUP}`;

async function findAll() {
  const [rows] = await pool.execute(`SELECT ${COLS} ${FROM_AGENT} ORDER BY lm.name ASC`);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(`SELECT ${COLS} ${FROM_AGENT} AND lm.id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.execute(`SELECT ${COLS} ${FROM_AGENT} AND lm.name = :name LIMIT 1`, { name });
  return rows[0] || null;
}

async function search(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT ${COLS} ${FROM_AGENT} AND (lm.name LIKE :like OR lm.mobile LIKE :like)
      ORDER BY lm.name ASC LIMIT 50`,
    { like }
  );
  return rows;
}

async function create({ name, mobile, gst_no, pan_no, address, city, state, pincode, commission_pct, userId }) {
  const [r] = await pool.execute(
    `INSERT INTO ledger_master
       (ledger_group_id, name, mobile, gst_no, pan_no, address, city, state, pincode, commission_pct, created_by, billbybill)
     VALUES (${GROUP}, :name, :mobile, :gst_no, :pan_no, :address, :city, :state, :pincode, :commission_pct, :userId, 'No')`,
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
    `UPDATE ledger_master SET
       name = :name, mobile = :mobile, gst_no = :gst_no, pan_no = :pan_no,
       address = :address, city = :city, state = :state, pincode = :pincode,
       commission_pct = :commission_pct
     WHERE id = :id AND ledger_group_id = ${GROUP}`,
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
    const [r] = await pool.execute(
      `DELETE FROM ledger_master WHERE id = :id AND ledger_group_id = ${GROUP}`,
      { id }
    );
    return { affected: r.affectedRows };
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') return { in_use: true };
    throw err;
  }
}

module.exports = { findAll, findById, findByName, search, create, update, deleteById };
