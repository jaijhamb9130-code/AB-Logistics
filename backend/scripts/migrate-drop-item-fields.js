'use strict';

// Reverse migration: drop the 8 logistics-tracking fields from bilty_items
// (the user removed them from the UI on 2026-05-05). Keeps `shipment_no`.
// Idempotent — checks each column before dropping.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

const COLUMNS = [
  'del_date',
  'rec_date',
  'rec_by',
  'shortage',
  'bill_amount',
  'bill_date',
  'payment_amount',
  'payment_date',
];

(async () => {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  try {
    for (const col of COLUMNS) {
      const [rs] = await conn.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = 'bilty_items'
           AND column_name = ?`,
        [col]
      );
      if (Number(rs[0].cnt) === 0) {
        console.log(`[migrate] bilty_items.${col} not present — skip.`);
        continue;
      }
      console.log(`[migrate] Dropping bilty_items.${col}...`);
      await conn.execute(`ALTER TABLE bilty_items DROP COLUMN ${col}`);
    }
    console.log('[migrate] ✅ bilty_items columns removed.');
  } finally {
    await conn.end();
  }
  process.exit(0);
})().catch((err) => {
  console.error('[migrate] ❌ FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
