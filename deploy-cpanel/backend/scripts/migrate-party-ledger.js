'use strict';

// Migration: rename party_ledger → ledger_master and
// vch_details.party_ledger_id → ledger_master_id.
// Safe to re-run — skips if the table is already named ledger_master.

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
    multipleStatements: true,
  });

  try {
    // Check if party_ledger still exists
    const [tables] = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'party_ledger'`
    );
    if (Number(tables[0].cnt) === 0) {
      console.log('[migrate] party_ledger does not exist — already migrated. Nothing to do.');
      return;
    }

    console.log('[migrate] Starting party_ledger → ledger_master migration...');

    // 1. Drop FK constraints that REFERENCE party_ledger (on other tables)
    const [fks] = await conn.execute(
      `SELECT CONSTRAINT_NAME, TABLE_NAME
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE()
         AND CONSTRAINT_TYPE = 'FOREIGN KEY'
         AND (TABLE_NAME, CONSTRAINT_NAME) IN (
           SELECT TABLE_NAME, CONSTRAINT_NAME
           FROM information_schema.KEY_COLUMN_USAGE
           WHERE TABLE_SCHEMA = DATABASE()
             AND REFERENCED_TABLE_NAME = 'party_ledger'
         )`
    );
    for (const fk of fks) {
      console.log(`  Dropping FK ${fk.CONSTRAINT_NAME} on ${fk.TABLE_NAME}`);
      await conn.execute(`ALTER TABLE \`${fk.TABLE_NAME}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
    }

    // 2. Drop FK constraints ON party_ledger itself (e.g. fk_party_ledger_created_by, fk_party_ledger_to_ledger_group)
    const [selfFks] = await conn.execute(
      `SELECT CONSTRAINT_NAME
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'party_ledger'
         AND CONSTRAINT_TYPE = 'FOREIGN KEY'`
    );
    for (const fk of selfFks) {
      console.log(`  Dropping self FK ${fk.CONSTRAINT_NAME} on party_ledger`);
      await conn.execute(`ALTER TABLE party_ledger DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
    }

    // 3. Rename table
    console.log('  Renaming table party_ledger → ledger_master');
    await conn.execute('RENAME TABLE party_ledger TO ledger_master');

    // 4. Rename column vch_details.party_ledger_id → ledger_master_id
    const [cols] = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'vch_details' AND column_name = 'party_ledger_id'`
    );
    if (Number(cols[0].cnt) > 0) {
      console.log('  Renaming column vch_details.party_ledger_id → ledger_master_id');
      await conn.execute(
        'ALTER TABLE vch_details CHANGE COLUMN party_ledger_id ledger_master_id INT UNSIGNED NOT NULL'
      );
    }

    // 5. Re-create FK constraints pointing to ledger_master
    console.log('  Re-creating FK constraints...');

    // party_ledger self FKs (now on ledger_master)
    await conn.execute(
      `ALTER TABLE ledger_master
         ADD CONSTRAINT fk_ledger_master_created_by
           FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`
    );
    await conn.execute(
      `ALTER TABLE ledger_master
         ADD CONSTRAINT fk_ledger_master_to_ledger_group
           FOREIGN KEY (ledger_group_id) REFERENCES ledger_group(id) ON DELETE RESTRICT`
    );

    // vch_details → ledger_master
    await conn.execute(
      `ALTER TABLE vch_details
         ADD CONSTRAINT fk_vch_details_ledger
           FOREIGN KEY (ledger_master_id) REFERENCES ledger_master(id)`
    );

    // ledger_entries → ledger_master
    await conn.execute(
      `ALTER TABLE ledger_entries
         ADD CONSTRAINT fk_ledger_entries_ledger
           FOREIGN KEY (ledger_id) REFERENCES ledger_master(id) ON DELETE SET NULL`
    );

    // bill_allocation → ledger_master
    await conn.execute(
      `ALTER TABLE bill_allocation
         ADD CONSTRAINT fk_bill_allocation_ledger
           FOREIGN KEY (ledger) REFERENCES ledger_master(id) ON DELETE SET NULL`
    );

    // 6. Rename indexes on ledger_master (if old names exist)
    // MySQL 8 supports RENAME INDEX
    try {
      const [idxs] = await conn.execute(
        `SELECT INDEX_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ledger_master'
           AND INDEX_NAME LIKE 'idx_party_ledger%'
         GROUP BY INDEX_NAME`
      );
      for (const idx of idxs) {
        const newName = idx.INDEX_NAME.replace('idx_party_ledger', 'idx_ledger_master');
        console.log(`  Renaming index ${idx.INDEX_NAME} → ${newName}`);
        await conn.execute(`ALTER TABLE ledger_master RENAME INDEX \`${idx.INDEX_NAME}\` TO \`${newName}\``);
      }
    } catch (e) {
      console.log('  Index rename skipped (may not exist or already renamed).');
    }

    // Also rename the vch_details index if it has the old name
    try {
      const [vchIdxs] = await conn.execute(
        `SELECT INDEX_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vch_details'
           AND INDEX_NAME LIKE '%party%'
         GROUP BY INDEX_NAME`
      );
      for (const idx of vchIdxs) {
        const newName = idx.INDEX_NAME.replace('party_ledger', 'ledger_master').replace('party', 'ledger');
        console.log(`  Renaming vch_details index ${idx.INDEX_NAME} → ${newName}`);
        await conn.execute(`ALTER TABLE vch_details RENAME INDEX \`${idx.INDEX_NAME}\` TO \`${newName}\``);
      }
    } catch (e) {
      console.log('  vch_details index rename skipped.');
    }

    console.log('[migrate] ✅ Migration complete — party_ledger → ledger_master');
  } finally {
    await conn.end();
  }
  process.exit(0);
})().catch((err) => {
  console.error('[migrate] ❌ FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
