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

// Sanitized row (no password_hash) — for session hydration in authMiddleware.
// T-01-06 mitigation: password_hash is never selected here.
async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT id, username, role, permissions, is_active, created_at FROM users WHERE id = :id LIMIT 1',
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

module.exports = { findByUsername, findById, create };
