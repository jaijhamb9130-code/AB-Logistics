'use strict';

const pool = require('../db/pool');

// Joins parent group name in one query so the table can show both the
// child name and the parent name without N+1 lookups on the frontend.
// Note: the Docker-managed `ledger_group` table only has `created_at`
// (no `updated_at`) — query reflects that.
const SELECT_WITH_PARENT = `
  SELECT lg.id, lg.group_name, lg.parent_id,
         p.group_name AS parent_name,
         lg.created_at
    FROM ledger_group lg
    LEFT JOIN ledger_group p ON p.id = lg.parent_id
`;

async function findAll() {
  const [rows] = await pool.execute(`${SELECT_WITH_PARENT} ORDER BY lg.group_name ASC`);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT id, group_name, parent_id, created_at
       FROM ledger_group WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function search(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `${SELECT_WITH_PARENT}
      WHERE lg.group_name LIKE :like
      ORDER BY lg.group_name ASC LIMIT 50`,
    { like }
  );
  return rows;
}

async function findByName(group_name) {
  // Case-insensitive match by virtue of utf8mb4's default ai_ci collation —
  // returns the existing canonical row even if the input differs in case.
  // Returns id + group_name so callers can show "Group 'Owner' already
  // exists" with the stored capitalisation.
  if (group_name == null) return null;
  const [rows] = await pool.execute(
    `SELECT id, group_name FROM ledger_group WHERE group_name = :group_name LIMIT 1`,
    { group_name: String(group_name).trim() }
  );
  return rows[0] || null;
}

async function create({ group_name, parent_id }) {
  const [r] = await pool.execute(
    `INSERT INTO ledger_group (group_name, parent_id) VALUES (:group_name, :parent_id)`,
    {
      group_name: String(group_name).trim(),
      parent_id: parent_id ?? null,
    }
  );
  return { id: r.insertId };
}

async function update(id, { group_name, parent_id }) {
  await pool.execute(
    `UPDATE ledger_group
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
  await pool.execute(`DELETE FROM ledger_group WHERE id = :id`, { id });
}

// Used by the controller to block deletion of groups that are still in use.
async function countChildren(id) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM ledger_group WHERE parent_id = :id`,
    { id }
  );
  return rows[0].c;
}

async function countReferences(id) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM ledger_master WHERE ledger_group_id = :id`,
    { id }
  );
  return rows[0].c;
}

module.exports = {
  findAll, findById, search, findByName,
  create, update, remove,
  countChildren, countReferences,
};
