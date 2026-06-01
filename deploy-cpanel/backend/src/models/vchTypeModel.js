'use strict';

const pool = require('../db/pool');

async function findAll() {
  const [rows] = await pool.execute(
    `SELECT v.id, v.name, v.parent_id, v.deemed_positive, v.is_system,
            p.name AS parent_name
     FROM vchtype v
     LEFT JOIN vchtype p ON v.parent_id = p.id AND v.parent_id != v.id
     ORDER BY v.name ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT id, name, parent_id, deemed_positive, is_system FROM vchtype WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function create({ name, parent_id, deemed_positive }) {
  const [r] = await pool.execute(
    `INSERT INTO vchtype (name, parent_id, deemed_positive, is_system)
     VALUES (:name, :parentId, :deemedPositive, 0)`,
    {
      name: String(name).trim(),
      parentId: parent_id || null,
      deemedPositive: deemed_positive || null,
    }
  );
  return { id: r.insertId };
}

async function update(id, { name, parent_id, deemed_positive }) {
  const fields = [];
  const params = { id };
  if (name !== undefined)            { fields.push('name = :name');                       params.name = String(name).trim(); }
  if (parent_id !== undefined)       { fields.push('parent_id = :parentId');              params.parentId = parent_id || null; }
  if (deemed_positive !== undefined) { fields.push('deemed_positive = :deemedPositive');  params.deemedPositive = deemed_positive || null; }
  if (fields.length === 0) return;
  await pool.execute(`UPDATE vchtype SET ${fields.join(', ')} WHERE id = :id`, params);
}

async function remove(id) {
  await pool.execute('DELETE FROM vchtype WHERE id = :id', { id });
}

module.exports = { findAll, findById, create, update, remove };
