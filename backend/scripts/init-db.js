'use strict';

// Idempotent schema bootstrap. Reads schema.sql and executes every
// non-empty statement against DATABASE_URL. Safe to re-run.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

(async () => {
  const sqlPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Send the file as one multi-statement query. Splitting on ';' corrupts
  // PREPARE/EXECUTE blocks that depend on session-scoped @-variables.
  const conn = await mysql.createConnection({ uri: env.DATABASE_URL, multipleStatements: true });
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
