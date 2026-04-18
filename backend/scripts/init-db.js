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
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  // multipleStatements lets us send the whole file at once if needed;
  // we still iterate to give better error reporting.
  const conn = await mysql.createConnection({ uri: env.DATABASE_URL, multipleStatements: true });
  try {
    for (const stmt of statements) {
      // eslint-disable-next-line no-await-in-loop
      await conn.query(stmt);
    }
    // eslint-disable-next-line no-console
    console.log('[init-db] OK —', statements.length, 'statement(s) applied.');
  } finally {
    await conn.end();
  }
  process.exit(0);
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[init-db] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
