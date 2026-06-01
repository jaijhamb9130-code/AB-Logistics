'use strict';

// Idempotent schema bootstrap. Reads schema.sql and executes every
// non-empty statement against DATABASE_URL. Safe to re-run.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

(async () => {
  const sqlPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
    // eslint-disable-next-line no-console
    console.log('[init-db] OK — schema applied.');
  } finally {
    await conn.end();
  }
  process.exit(0);
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[init-db] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
