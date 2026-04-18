'use strict';

/**
 * Phase 5 — Vehicle model (VEHICLE-01..03).
 *
 * CRUD over the `vehicles` table. Dynamic PATCH whitelists allowed columns
 * (same pattern as userModel.update). `setActive` only flips `is_active`
 * (soft-deactivate) — deleting a vehicle would cascade-nullify orders.vehicle_id,
 * which we avoid by preferring deactivate.
 *
 * Numeric-free table; mysql2 returns everything as strings/numbers natively.
 */

const pool = require('../db/pool');

async function findAll() {
  const [rows] = await pool.execute(
    `SELECT id, vehicle_no, vehicle_type, owner_name, is_active,
            created_at, updated_at
       FROM vehicles
       ORDER BY id DESC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT id, vehicle_no, vehicle_type, owner_name, is_active,
            created_at, updated_at
       FROM vehicles WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function findByVehicleNo(vehicle_no) {
  const [rows] = await pool.execute(
    'SELECT id FROM vehicles WHERE vehicle_no = :v LIMIT 1',
    { v: vehicle_no }
  );
  return rows[0] || null;
}

async function create({ vehicle_no, vehicle_type, owner_name }) {
  const [r] = await pool.execute(
    `INSERT INTO vehicles (vehicle_no, vehicle_type, owner_name)
     VALUES (:vehicle_no, :vehicle_type, :owner_name)`,
    {
      vehicle_no,
      vehicle_type: vehicle_type ?? null,
      owner_name: owner_name ?? null,
    }
  );
  return r.insertId;
}

// Dynamic PATCH — only columns supplied (!== undefined) are updated.
// Whitelisted to prevent SQL injection via keys.
async function update(id, patch) {
  if (!patch || typeof patch !== 'object') return false;

  const ALLOWED = ['vehicle_no', 'vehicle_type', 'owner_name'];
  const sets = [];
  const params = { id };

  for (const key of ALLOWED) {
    if (patch[key] === undefined) continue;
    sets.push(`${key} = :${key}`);
    params[key] = patch[key];
  }

  if (sets.length === 0) return false;

  const sql = `UPDATE vehicles SET ${sets.join(', ')} WHERE id = :id`;
  const [r] = await pool.execute(sql, params);
  return r.affectedRows > 0;
}

async function setActive(id, active) {
  const a = active ? 1 : 0;
  const [r] = await pool.execute(
    'UPDATE vehicles SET is_active = :a WHERE id = :id',
    { a, id }
  );
  return r.affectedRows > 0;
}

module.exports = {
  findAll,
  findById,
  findByVehicleNo,
  create,
  update,
  setActive,
};
