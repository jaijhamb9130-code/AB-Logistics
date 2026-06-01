'use strict';

const pool = require('../db/pool');

// Mirrors ledgerGroupModel — joins parent group name in one query so the
// frontend table can show both child and parent without N+1 lookups.
const SELECT_WITH_PARENT = `
  SELECT ig.id, ig.group_name, ig.parent_id,
         p.group_name AS parent_name,
         ig.created_at
    FROM item_group ig
    LEFT JOIN item_group p ON p.id = ig.parent_id
`;

async function findAll() {
  const [rows] = await pool.execute(`${SELECT_WITH_PARENT} ORDER BY ig.group_name ASC`);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT id, group_name, parent_id, created_at
       FROM item_group WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function search(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `${SELECT_WITH_PARENT}
      WHERE ig.group_name LIKE :like
      ORDER BY ig.group_name ASC LIMIT 50`,
    { like }
  );
  return rows;
}

async function findByName(group_name) {
  const [rows] = await pool.execute(
    `SELECT id FROM item_group WHERE group_name = :group_name LIMIT 1`,
    { group_name }
  );
  return rows[0] || null;
}

async function create({ group_name, parent_id }) {
  const [r] = await pool.execute(
    `INSERT INTO item_group (group_name, parent_id) VALUES (:group_name, :parent_id)`,
    {
      group_name: String(group_name).trim(),
      parent_id: parent_id ?? null,
    }
  );
  return { id: r.insertId };
}

async function update(id, { group_name, parent_id }) {
  await pool.execute(
    `UPDATE item_group
        SET group_name = :group_name,
            parent_id = :parent_id
      WHERE id = :id`,
    {
      id,
      group_name: String(group_name).trim(),
      parent_id: parent_id ?? null,
    }
  );
}

async function remove(id) {
  await pool.execute(`DELETE FROM item_group WHERE id = :id`, { id });
}

async function countChildren(id) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM item_group WHERE parent_id = :id`,
    { id }
  );
  return rows[0].c;
}

module.exports = {
  findAll, findById, search, findByName,
  create, update, remove,
  countChildren,
};
