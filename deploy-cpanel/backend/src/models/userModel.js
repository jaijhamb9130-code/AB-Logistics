'use strict';

const pool = require('../db/pool');

// Full row (includes password_hash) — ONLY for login verification.
async function findByUsername(username) {
  const [rows] = await pool.execute(
    'SELECT id, username, password_hash, role, permissions, is_active, created_at FROM users WHERE username = :u LIMIT 1',
    { u: username }
  );
  return rows[0] || null;
}

// Sanitized row (no password_hash) — for session hydration in authMiddleware
// AND for GET /api/users/:id. T-01-06 / T-02-02 mitigation: password_hash is
// never selected here; also returns Phase-02's updated_at column.
async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT id, username, role, permissions, is_active, created_at, updated_at FROM users WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

async function create({ username, password_hash, role, permissions }) {
  const [r] = await pool.execute(
    'INSERT INTO users (username, password_hash, role, permissions) VALUES (:username, :hash, :role, :perms)',
    {
      username,
      hash: password_hash,
      role,
      perms: JSON.stringify(permissions || []),
    }
  );
  return r.insertId;
}

// GET /api/users — admin-only list. Never selects password_hash (T-02-02).
async function findAll() {
  const [rows] = await pool.execute(
    'SELECT id, username, role, permissions, is_active, created_at, updated_at FROM users ORDER BY id ASC'
  );
  return rows;
}

// Dynamic PATCH — only columns supplied (!== undefined) are updated.
// T-02-09 mitigation: whitelist of allowed keys, no string concat into SQL,
// every value bound via mysql2 named placeholders.
async function update(id, patch) {
  if (!patch || typeof patch !== 'object') return false;

  const ALLOWED = ['username', 'password_hash', 'role', 'permissions'];
  const sets = [];
  const params = { id };

  for (const key of ALLOWED) {
    if (patch[key] === undefined) continue;
    if (key === 'permissions') {
      sets.push('permissions = :permissions');
      params.permissions = JSON.stringify(patch.permissions || []);
    } else {
      sets.push(`${key} = :${key}`);
      params[key] = patch[key];
    }
  }

  if (sets.length === 0) return false;

  const sql = `UPDATE users SET ${sets.join(', ')} WHERE id = :id`;
  const [r] = await pool.execute(sql, params);
  return r.affectedRows > 0;
}

// Flip is_active. active may be 0 | 1 | boolean — normalized to 0/1.
async function setActive(id, active) {
  const a = active ? 1 : 0;
  const [r] = await pool.execute(
    'UPDATE users SET is_active = :a WHERE id = :id',
    { a, id }
  );
  return r.affectedRows > 0;
}

// Uniqueness check used by update() to surface 409 username_taken without a
// race. Returns true iff another row with this username exists.
async function findByUsernameExcludingId(username, id) {
  const [rows] = await pool.execute(
    'SELECT id FROM users WHERE username = :u AND id != :id LIMIT 1',
    { u: username, id }
  );
  return rows.length > 0;
}

// Hard delete a user. The `created_by` columns on vch_details / ledger_master
// / vehicle_master / etc. FK back to users(id), so an active bookkeeper can't
// be deleted — MySQL surfaces ER_ROW_IS_REFERENCED_2, returned here as
// { in_use: true } for the controller to translate to 409.
async function deleteById(id) {
  try {
    const [r] = await pool.execute(
      'DELETE FROM users WHERE id = :id',
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
  findByUsername,
  findById,
  create,
  findAll,
  update,
  setActive,
  findByUsernameExcludingId,
  deleteById,
};
