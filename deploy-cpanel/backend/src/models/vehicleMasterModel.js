'use strict';

const pool = require('../db/pool');

// Vehicles are ledger_master rows in the dedicated "Vehicles" sub-group of
// Sundry Creditors. Vehicle-only metadata (vehicle_type, owner_id) sits as
// nullable columns on ledger_master itself — no side table.
const VEHICLES_GROUP = 'Vehicles';

async function getVehiclesGroupId(conn = pool) {
  const [rows] = await conn.execute(
    'SELECT id FROM ledger_group WHERE group_name = :name LIMIT 1',
    { name: VEHICLES_GROUP }
  );
  if (!rows.length) {
    const e = new Error('vehicles_group_missing');
    e.code = 'vehicles_group_missing';
    throw e;
  }
  return rows[0].id;
}

const SELECT_COLS = `
  SELECT lm.id, lm.name,
         lm.vehicle_type,
         lm.owner_id,
         ow.name AS owner_name,
         lm.id AS ledger_id,
         NULL AS tally_master_id,
         lm.created_at, lm.updated_at
    FROM ledger_master lm
    LEFT JOIN owner_master ow ON ow.id = lm.owner_id
   WHERE lm.ledger_group_id = :gid
`;

async function findAll() {
  const gid = await getVehiclesGroupId();
  const [rows] = await pool.execute(`${SELECT_COLS} ORDER BY lm.name ASC`, { gid });
  return rows;
}

async function findById(id) {
  const gid = await getVehiclesGroupId();
  const [rows] = await pool.execute(
    `${SELECT_COLS} AND lm.id = :id LIMIT 1`,
    { gid, id }
  );
  return rows[0] || null;
}

async function search(q) {
  const gid = await getVehiclesGroupId();
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `${SELECT_COLS} AND lm.name LIKE :like ORDER BY lm.name ASC LIMIT 50`,
    { gid, like }
  );
  return rows;
}

async function findByName(name) {
  const gid = await getVehiclesGroupId();
  const [rows] = await pool.execute(
    `SELECT id FROM ledger_master WHERE name = :name AND ledger_group_id = :gid LIMIT 1`,
    { name, gid }
  );
  return rows[0] || null;
}

// Resolve an owner name → owner_master.id, auto-creating the row if missing.
// Mirrors the bilty form's resolver so typing a new owner here doesn't lose
// the value silently.
async function resolveOwnerId(conn, ownerName, userId) {
  const trimmed = (ownerName || '').toString().trim();
  if (!trimmed) return null;
  const [existing] = await conn.execute(
    'SELECT id FROM owner_master WHERE name = :name LIMIT 1',
    { name: trimmed }
  );
  if (existing.length) return existing[0].id;
  const [r] = await conn.execute(
    'INSERT INTO owner_master (name, created_by) VALUES (:name, :uid)',
    { name: trimmed, uid: userId ?? null }
  );
  return r.insertId;
}

async function create({ name, vehicle_type, owner_name, userId }) {
  const gid = await getVehiclesGroupId();
  const cleanName = String(name).trim().toUpperCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Reuse an existing ledger row in the same group; otherwise insert.
    // Vehicles outside this group are never adopted (strict isolation).
    const [existing] = await conn.execute(
      'SELECT id FROM ledger_master WHERE name = :name AND ledger_group_id = :gid LIMIT 1',
      { name: cleanName, gid }
    );
    const ownerId = await resolveOwnerId(conn, owner_name, userId);
    let ledgerId;
    if (existing.length) {
      ledgerId = existing[0].id;
      await conn.execute(
        'UPDATE ledger_master SET vehicle_type = :vt, owner_id = :oid WHERE id = :id',
        { vt: vehicle_type || null, oid: ownerId, id: ledgerId }
      );
    } else {
      const [r] = await conn.execute(
        `INSERT INTO ledger_master (ledger_group_id, name, vehicle_type, owner_id)
         VALUES (:gid, :name, :vt, :oid)`,
        { gid, name: cleanName, vt: vehicle_type || null, oid: ownerId }
      );
      ledgerId = r.insertId;
    }
    await conn.commit();
    return { id: ledgerId };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function update(id, { name, vehicle_type, owner_name, userId }) {
  const gid = await getVehiclesGroupId();
  const cleanName = String(name).trim().toUpperCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ownerId = await resolveOwnerId(conn, owner_name, userId);
    await conn.execute(
      `UPDATE ledger_master
          SET name = :name, vehicle_type = :vt, owner_id = :oid
        WHERE id = :id AND ledger_group_id = :gid`,
      { id, name: cleanName, vt: vehicle_type || null, oid: ownerId, gid }
    );
    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function deleteById(id) {
  const gid = await getVehiclesGroupId();
  try {
    const [r] = await pool.execute(
      `DELETE FROM ledger_master WHERE id = :id AND ledger_group_id = :gid`,
      { id, gid }
    );
    return { affected: r.affectedRows };
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') return { in_use: true };
    throw err;
  }
}

module.exports = { findAll, findById, findByName, search, create, update, deleteById };
