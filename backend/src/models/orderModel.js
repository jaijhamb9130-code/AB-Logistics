'use strict';

/**
 * Phase 5 — Order model (ORDER-01..04).
 *
 * Responsibilities:
 *  - create: wraps insert + order_no generation in a transaction. Format
 *    'OR-YYYY-NNNNNN' using per-year FOR UPDATE sequence (same pattern as
 *    biltyModel.nextBiltyNo / freightModel).
 *  - findAll / findById: LEFT JOIN vehicles so callers see vehicle_no without
 *    a second round-trip.
 *  - updateStatus: enforces the pending → in_progress → completed pipeline;
 *    any other transition throws invalid_status_transition (→ HTTP 400).
 *  - assignVehicle: validates the vehicle exists (throws vehicle_not_found
 *    → HTTP 404) before setting orders.vehicle_id.
 */

const pool = require('../db/pool');

// ---- order_no generator ---------------------------------------------------
// Format: OR-YYYY-NNNNNN. Runs INSIDE the transaction so racing creates get
// distinct numbers.
async function nextOrderNo(conn, year) {
  const prefix = `OR-${year}-`;
  const [rows] = await conn.execute(
    'SELECT order_no FROM orders WHERE order_no LIKE :p ORDER BY id DESC LIMIT 1 FOR UPDATE',
    { p: `${prefix}%` }
  );
  let seq = 1;
  if (rows.length > 0) {
    const tail = String(rows[0].order_no).slice(prefix.length);
    const n = Number(tail);
    if (Number.isInteger(n) && n > 0) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

function toDateOrNull(v) {
  if (!v) return null;
  return String(v).slice(0, 10);
}

// ---- Status pipeline ------------------------------------------------------
// Canonical forward-only transitions. Any other target throws.
const VALID_STATUSES = ['pending', 'in_progress', 'completed'];
const TRANSITIONS = {
  pending: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
};

function isValidTransition(from, to) {
  if (!VALID_STATUSES.includes(to)) return false;
  const allowed = TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// ---- CRUD -----------------------------------------------------------------

async function create({ order_date, customer_name, from_loc, to_loc, goods_desc, vehicle_id, userId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const year = new Date().getUTCFullYear();
    const order_no = await nextOrderNo(conn, year);

    const [r] = await conn.execute(
      `INSERT INTO orders
         (order_no, order_date, customer_name, from_loc, to_loc, goods_desc,
          status, vehicle_id, created_by)
       VALUES
         (:order_no, :order_date, :customer_name, :from_loc, :to_loc, :goods_desc,
          'pending', :vehicle_id, :created_by)`,
      {
        order_no,
        order_date: toDateOrNull(order_date),
        customer_name,
        from_loc: from_loc ?? null,
        to_loc: to_loc ?? null,
        goods_desc: goods_desc ?? null,
        vehicle_id: vehicle_id ?? null,
        created_by: userId ?? null,
      }
    );

    await conn.commit();
    return { id: r.insertId, order_no };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function findAll() {
  const [rows] = await pool.execute(
    `SELECT o.id, o.order_no, o.order_date, o.customer_name, o.from_loc,
            o.to_loc, o.goods_desc, o.status, o.vehicle_id, o.created_by,
            o.created_at, o.updated_at,
            v.vehicle_no AS vehicle_no
       FROM orders o
       LEFT JOIN vehicles v ON v.id = o.vehicle_id
       ORDER BY o.id DESC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT o.id, o.order_no, o.order_date, o.customer_name, o.from_loc,
            o.to_loc, o.goods_desc, o.status, o.vehicle_id, o.created_by,
            o.created_at, o.updated_at,
            v.vehicle_no AS vehicle_no,
            v.vehicle_type AS vehicle_type,
            v.owner_name AS vehicle_owner_name
       FROM orders o
       LEFT JOIN vehicles v ON v.id = o.vehicle_id
       WHERE o.id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

// Enforce pending → in_progress → completed.
async function updateStatus(id, newStatus) {
  const current = await findById(id);
  if (!current) {
    const e = new Error('order_not_found');
    e.code = 'order_not_found';
    throw e;
  }
  if (!isValidTransition(current.status, newStatus)) {
    const e = new Error('invalid_status_transition');
    e.code = 'invalid_status_transition';
    throw e;
  }
  const [r] = await pool.execute(
    'UPDATE orders SET status = :s WHERE id = :id',
    { s: newStatus, id }
  );
  return r.affectedRows > 0;
}

// Attach a vehicle to an order. Vehicle must exist — controller surfaces 404.
async function assignVehicle(id, vehicleId) {
  const [vRows] = await pool.execute(
    'SELECT id FROM vehicles WHERE id = :v LIMIT 1',
    { v: vehicleId }
  );
  if (vRows.length === 0) {
    const e = new Error('vehicle_not_found');
    e.code = 'vehicle_not_found';
    throw e;
  }
  const [r] = await pool.execute(
    'UPDATE orders SET vehicle_id = :v WHERE id = :id',
    { v: vehicleId, id }
  );
  if (r.affectedRows === 0) {
    const e = new Error('order_not_found');
    e.code = 'order_not_found';
    throw e;
  }
  return true;
}

module.exports = {
  create,
  findAll,
  findById,
  updateStatus,
  assignVehicle,
  // exported for tests
  isValidTransition,
  VALID_STATUSES,
};
