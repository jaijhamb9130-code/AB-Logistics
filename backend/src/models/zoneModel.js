'use strict';

const pool = require('../db/pool');

const COLS = `id, name, description, created_at, updated_at`;

async function findAll() {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM zone_master ORDER BY name ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM zone_master WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM zone_master WHERE name = :name LIMIT 1`,
    { name }
  );
  return rows[0] || null;
}

async function search(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM zone_master
      WHERE name LIKE :like
      ORDER BY name ASC LIMIT 50`,
    { like }
  );
  return rows;
}

async function create({ name, description, userId }) {
  const [r] = await pool.execute(
    `INSERT INTO zone_master (name, description, created_by)
     VALUES (:name, :description, :userId)`,
    {
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      userId: userId ?? null,
    }
  );
  return { id: r.insertId };
}

async function update(id, { name, description }) {
  await pool.execute(
    `UPDATE zone_master
        SET name = :name,
            description = :description
      WHERE id = :id`,
    {
      id,
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
    }
  );
}

async function deleteById(id) {
  try {
    const [r] = await pool.execute(
      `DELETE FROM zone_master WHERE id = :id`,
      { id }
    );
    return { affected: r.affectedRows };
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
      return { in_use: true };
    }
    throw err;
  }
}

module.exports = {
  findAll, findById, findByName, search,
  create, update, deleteById,
};
