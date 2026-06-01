'use strict';

const pool = require('../db/pool');

const COLS = `id, name, created_at, updated_at`;

async function findAll() {
  const [rows] = await pool.execute(`SELECT ${COLS} FROM branch_master ORDER BY name ASC`);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(`SELECT ${COLS} FROM branch_master WHERE id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.execute(`SELECT ${COLS} FROM branch_master WHERE name = :name LIMIT 1`, { name });
  return rows[0] || null;
}

async function search(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM branch_master WHERE name LIKE :like ORDER BY name ASC LIMIT 50`,
    { like }
  );
  return rows;
}

async function create({ name, userId }) {
  const [r] = await pool.execute(
    `INSERT INTO branch_master (name, created_by) VALUES (:name, :userId)`,
    { name: String(name).trim(), userId: userId ?? null }
  );
  return { id: r.insertId };
}

async function update(id, { name }) {
  await pool.execute(
    `UPDATE branch_master SET name = :name WHERE id = :id`,
    { id, name: String(name).trim() }
  );
}

async function deleteById(id) {
  try {
    const [r] = await pool.execute(`DELETE FROM branch_master WHERE id = :id`, { id });
    return { affected: r.affectedRows };
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') return { in_use: true };
    throw err;
  }
}

module.exports = { findAll, findById, findByName, search, create, update, deleteById };
