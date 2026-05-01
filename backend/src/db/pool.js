'use strict';

const mysql = require('mysql2/promise');
const env = require('../config/env');

// MySQL connection pool (D-14 / T-01-14 mitigation: bounded pool prevents exhaustion)
const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  namedPlaceholders: true,
});

// Transactional wrapper. fn receives a dedicated connection and may execute
// any number of queries on it; commits on resolve, rolls back on throw.
pool.withTransaction = async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* swallow */ }
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = pool;
