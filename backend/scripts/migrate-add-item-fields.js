'use strict';

// Migration: add 9 logistics-tracking fields to bilty_items.
//   shipment_no, del_date, rec_date, rec_by, shortage,
//   bill_amount, bill_date, payment_amount, payment_date.
// Idempotent — checks each column before adding.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

const COLUMNS = [
  { name: 'shipment_no',     type: 'VARCHAR(64) NULL',     after: 'e_rate' },
  { name: 'del_date',        type: 'DATE NULL',            after: 'shipment_no' },
  { name: 'rec_date',        type: 'DATE NULL',            after: 'del_date' },
  { name: 'rec_by',          type: 'VARCHAR(128) NULL',    after: 'rec_date' },
  { name: 'shortage',        type: 'DECIMAL(12,2) NULL',   after: 'rec_by' },
  { name: 'bill_amount',     type: 'DECIMAL(12,2) NULL',   after: 'shortage' },
  { name: 'bill_date',       type: 'DATE NULL',            after: 'bill_amount' },
  { name: 'payment_amount',  type: 'DECIMAL(12,2) NULL',   after: 'bill_date' },
  { name: 'payment_date',    type: 'DATE NULL',            after: 'payment_amount' },
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
        [col.name]
      );
      if (Number(rs[0].cnt) > 0) {
        console.log(`[migrate] bilty_items.${col.name} already exists — skip.`);
        continue;
      }
      console.log(`[migrate] Adding bilty_items.${col.name}...`);
      await conn.execute(
        `ALTER TABLE bilty_items ADD COLUMN ${col.name} ${col.type} AFTER ${col.after}`
      );
    }
    console.log('[migrate] ✅ bilty_items extended.');
  } finally {
    await conn.end();
  }
  process.exit(0);
})().catch((err) => {
  console.error('[migrate] ❌ FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
