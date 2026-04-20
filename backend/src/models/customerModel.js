'use strict';

const pool = require('../db/pool');

async function nextCustomerNo(conn, year) {
  const prefix = `CUS-${year}-`;
  const [rows] = await conn.execute(
    'SELECT customer_no FROM customers WHERE customer_no LIKE :p ORDER BY id DESC LIMIT 1 FOR UPDATE',
    { p: `${prefix}%` }
  );
  let seq = 1;
  if (rows.length > 0) {
    const tail = String(rows[0].customer_no).slice(prefix.length);
    const n = Number(tail);
    if (Number.isInteger(n) && n > 0) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

async function create({ name, phone_number, address, city, state, pincode, userId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const year = new Date().getUTCFullYear();
    const customer_no = await nextCustomerNo(conn, year);

    const [r] = await conn.execute(
      `INSERT INTO customers (customer_no, name, phone_number, address, city, state, pincode, created_by)
       VALUES (:customer_no, :name, :phone_number, :address, :city, :state, :pincode, :created_by)`,
      {
        customer_no,
        name: name.trim(),
        phone_number: phone_number ?? null,
        address: address ?? null,
        city: city ?? null,
        state: state ?? null,
        pincode: pincode ?? null,
        created_by: userId ?? null,
      }
    );

    await conn.commit();
    return { id: r.insertId, customer_no };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function findAll() {
  const [rows] = await pool.execute(
    `SELECT id, customer_no, name, phone_number, address, city, state, pincode
       FROM customers ORDER BY name ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT id, customer_no, name, phone_number, address, city, state, pincode, created_at
       FROM customers WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

// Fuzzy name search for autocomplete — returns lightweight rows.
async function search(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT id, customer_no, name, city
       FROM customers
      WHERE name LIKE :like
      ORDER BY name ASC
      LIMIT 20`,
    { like }
  );
  return rows;
}

module.exports = { create, findAll, findById, search };
