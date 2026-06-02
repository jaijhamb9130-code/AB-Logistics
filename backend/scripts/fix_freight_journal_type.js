'use strict';

/**
 * One-off repair: the seed DB ships system voucher types + "Bilty" but is
 * missing the "Freight Journal" type that every bilty's companion posting
 * needs. This adds it idempotently and reports on the ledgers the freight
 * journal also depends on ("Freight Expense", "Sales").
 *
 * Run from the backend dir:  node scripts/fix_freight_journal_type.js
 */

const pool = require('../src/db/pool');

(async () => {
  try {
    const [types] = await pool.execute(
      'SELECT id, name, parent_id, deemed_positive, is_system FROM vchtype ORDER BY id'
    );
    console.log('Existing vchtype rows:');
    for (const t of types) {
      console.log(`  #${t.id}  ${t.name}  (parent=${t.parent_id}, dp=${t.deemed_positive}, sys=${t.is_system})`);
    }

    const has = types.some((t) => t.name === 'Freight Journal');
    if (has) {
      console.log('\n"Freight Journal" already exists — nothing to insert.');
    } else {
      // Internal companion type: journal-style (deemed_positive NULL), system
      // row. parent_id stays NULL so it is NOT treated as a user-selectable
      // primary (the voucher rail shows only rows where parent_id === id).
      const [res] = await pool.execute(
        `INSERT INTO vchtype (name, parent_id, deemed_positive, is_system)
         VALUES ('Freight Journal', NULL, NULL, 1)`
      );
      console.log(`\nInserted "Freight Journal" as vchtype #${res.insertId} (parent_id=NULL, hidden from picker).`);
    }

    const [ledgers] = await pool.execute(
      "SELECT name FROM ledger_master WHERE name IN ('Freight Expense', 'Sales')"
    );
    const names = ledgers.map((r) => r.name);
    console.log('\nLedger dependency check:');
    console.log(`  Freight Expense: ${names.includes('Freight Expense') ? 'present' : 'MISSING'}`);
    console.log(`  Sales:           ${names.includes('Sales') ? 'present' : 'MISSING'}`);

    console.log('\nDone.');
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
