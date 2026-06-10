'use strict';

const pool = require('../db/pool');

async function findAll() {
  const [rows] = await pool.execute(
    `SELECT v.id, v.name, v.parent_id, v.deemed_positive, v.is_system, v.prefix, v.branch, v.affects_ledger,
            p.name AS parent_name
     FROM vchtype v
     LEFT JOIN vchtype p ON v.parent_id = p.id AND v.parent_id != v.id
     ORDER BY v.name ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT id, name, parent_id, deemed_positive, is_system, prefix, branch, affects_ledger FROM vchtype WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

// Set (or clear) just the voucher-number prefix. Allowed on ANY type, including
// system primaries — only the prefix changes, not name/parent/posting behaviour.
// Empty / blank → stored as NULL (plain numbering).
async function setPrefix(id, prefix) {
  const clean = (prefix === null || prefix === undefined || String(prefix).trim() === '')
    ? null
    : String(prefix).trim().slice(0, 16);
  await pool.execute('UPDATE vchtype SET prefix = :prefix WHERE id = :id', { id, prefix: clean });
}

// A child inherits its parent's posting behaviour (deemed_positive). A primary
// (no parent) self-references its own id — matching the system-type convention
// (e.g. Sales.parent_id = Sales.id), so "primary === (parent_id === id)".
function cleanPrefix(prefix) {
  return (prefix === null || prefix === undefined || String(prefix).trim() === '')
    ? null
    : String(prefix).trim().slice(0, 16);
}

// Branch is stored as the branch NAME (resolved to branch_master.id when a
// bilty is saved). Blank/null → no branch (Branch field behaves normally).
function cleanBranch(branch) {
  return (branch === null || branch === undefined || String(branch).trim() === '')
    ? null
    : String(branch).trim().slice(0, 128);
}

async function create({ name, parent_id, prefix, branch, affects_ledger }) {
  const pid = parent_id || null;
  let deemedPositive = null;
  if (pid) {
    const parent = await findById(pid);
    if (!parent) { const e = new Error('parent_not_found'); e.code = 'parent_not_found'; throw e; }
    deemedPositive = parent.deemed_positive; // inherit parent's behaviour
  }
  const al = affects_ledger === false || affects_ledger === 0 || affects_ledger === '0' ? 0 : 1;
  const [r] = await pool.execute(
    `INSERT INTO vchtype (name, parent_id, deemed_positive, is_system, prefix, branch, affects_ledger)
     VALUES (:name, :parentId, :dp, 0, :prefix, :branch, :al)`,
    { name: String(name).trim(), parentId: pid, dp: deemedPositive, prefix: cleanPrefix(prefix), branch: cleanBranch(branch), al }
  );
  const id = r.insertId;
  if (!pid) {
    await pool.execute('UPDATE vchtype SET parent_id = :id WHERE id = :id', { id });
  }
  return { id };
}

async function update(id, { name, parent_id, prefix, branch, affects_ledger }) {
  const fields = [];
  const params = { id };
  if (name !== undefined) { fields.push('name = :name'); params.name = String(name).trim(); }
  if (prefix !== undefined) { fields.push('prefix = :prefix'); params.prefix = cleanPrefix(prefix); }
  if (branch !== undefined) { fields.push('branch = :branch'); params.branch = cleanBranch(branch); }
  if (affects_ledger !== undefined) {
    fields.push('affects_ledger = :al');
    params.al = affects_ledger === false || affects_ledger === 0 || affects_ledger === '0' ? 0 : 1;
  }
  if (parent_id !== undefined) {
    if (parent_id) {
      const parent = await findById(parent_id);
      if (!parent) { const e = new Error('parent_not_found'); e.code = 'parent_not_found'; throw e; }
      // Re-parenting re-inherits the new parent's posting behaviour.
      fields.push('parent_id = :parentId'); params.parentId = parent_id;
      fields.push('deemed_positive = :dp'); params.dp = parent.deemed_positive;
    } else {
      // Cleared parent → becomes a primary: self-reference + journal-style.
      fields.push('parent_id = :id');
      fields.push('deemed_positive = NULL');
    }
  }
  if (fields.length === 0) return;
  await pool.execute(`UPDATE vchtype SET ${fields.join(', ')} WHERE id = :id`, params);
}

// Number of CHILD types under this id (excludes the self-reference of a primary).
async function countChildren(id) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS n FROM vchtype WHERE parent_id = :id AND id <> :id',
    { id }
  );
  return Number(rows[0].n);
}

// Number of vouchers posted against this type — blocks deletion when in use.
async function countUsage(id) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS n FROM vch_details WHERE vch_type_id = :id',
    { id }
  );
  return Number(rows[0].n);
}

async function remove(id) {
  await pool.execute('DELETE FROM vchtype WHERE id = :id', { id });
}

module.exports = { findAll, findById, create, update, setPrefix, remove, countChildren, countUsage };
