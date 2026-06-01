'use strict';

const pool = require('../db/pool');

// Mirrors ledgerGroupModel — joins parent category name in one query so the
// frontend table can show both child and parent without N+1 lookups.
const SELECT_WITH_PARENT = `
  SELECT ic.id, ic.category_name, ic.parent_id,
         p.category_name AS parent_name,
         ic.created_at
    FROM item_category ic
    LEFT JOIN item_category p ON p.id = ic.parent_id
`;

async function findAll() {
  const [rows] = await pool.execute(`${SELECT_WITH_PARENT} ORDER BY ic.category_name ASC`);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT id, category_name, parent_id, created_at
       FROM item_category WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function search(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `${SELECT_WITH_PARENT}
      WHERE ic.category_name LIKE :like
      ORDER BY ic.category_name ASC LIMIT 50`,
    { like }
  );
  return rows;
}

async function findByName(category_name) {
  const [rows] = await pool.execute(
    `SELECT id FROM item_category WHERE category_name = :category_name LIMIT 1`,
    { category_name }
  );
  return rows[0] || null;
}

async function create({ category_name, parent_id }) {
  const [r] = await pool.execute(
    `INSERT INTO item_category (category_name, parent_id) VALUES (:category_name, :parent_id)`,
    {
      category_name: String(category_name).trim(),
      parent_id: parent_id ?? null,
    }
  );
  return { id: r.insertId };
}

async function update(id, { category_name, parent_id }) {
  await pool.execute(
    `UPDATE item_category
        SET category_name = :category_name,
            parent_id = :parent_id
      WHERE id = :id`,
    {
      id,
      category_name: String(category_name).trim(),
      parent_id: parent_id ?? null,
    }
  );
}

async function remove(id) {
  await pool.execute(`DELETE FROM item_category WHERE id = :id`, { id });
}

async function countChildren(id) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM item_category WHERE parent_id = :id`,
    { id }
  );
  return rows[0].c;
}

module.exports = {
  findAll, findById, search, findByName,
  create, update, remove,
  countChildren,
};
