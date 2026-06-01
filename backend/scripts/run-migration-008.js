'use strict';

// One-off: apply migration 008_drop_advance_fuel.sql to the local DB.
// Usage:  node backend/scripts/run-migration-008.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

(async () => {
  const sqlPath = path.join(
    __dirname, '..', 'src', 'db', 'migrations', '008_drop_advance_fuel.sql'
  );
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
    console.log('[migration 008] OK — advance_details + fuel_details dropped, freight_memo columns removed.');
  } finally {
    await conn.end();
  }
  process.exit(0);
})().catch((err) => {
  console.error('[migration 008] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
