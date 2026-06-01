'use strict';

const { auditLog } = require('../utils/auditLog');

/**
 * Execute a function within a database transaction.
 * fn receives (conn, audit) — call audit({action, entityType, ...}) to log.
 *
 * @param {object} pool - mysql2 pool instance
 * @param {function} fn - async (conn, audit) => result
 * @returns {Promise<any>}
 */
async function transact(pool, fn) {
  const conn = await pool.getConnection();
  const audit = (params) => auditLog(conn, params);
  try {
    await conn.beginTransaction();
    const result = await fn(conn, audit);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { transact };
