'use strict';

// Migration: add `bill_to` column to bilty table.
// Source: same as `consignor` (free text mirroring ledger_master name).
// Idempotent — checks for column existence before altering.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

(async () => {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  try {
    const [cols] = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'bilty'
         AND column_name = 'bill_to'`
    );
    if (Number(cols[0].cnt) > 0) {
      console.log('[migrate] bilty.bill_to already exists — nothing to do.');
      return;
    }

    console.log('[migrate] Adding bilty.bill_to column...');
    await conn.execute(
      "ALTER TABLE bilty ADD COLUMN bill_to VARCHAR(255) NULL AFTER consignor"
    );
    console.log('[migrate] ✅ bilty.bill_to added.');
  } finally {
    await conn.end();
  }
  process.exit(0);
})().catch((err) => {
  console.error('[migrate] ❌ FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
