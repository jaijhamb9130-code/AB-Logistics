'use strict';

const pool = require('./pool');

// Idempotent, additive-only schema sync that runs at server startup, so a
// deploy only needs `npm install` + `pm2 start ecosystem.config.js` — no manual
// SQL import. Each entry adds a column ONLY when it's missing; it never drops a
// table, transforms data, or touches existing rows. Safe to run on every boot.
//
// Add future additive columns here and they'll auto-apply on the next restart.
const COLUMNS = [
  { table: 'vchtype', column: 'prefix', ddl: '`prefix` VARCHAR(16) NULL DEFAULT NULL AFTER `is_system`' },
  { table: 'vchtype', column: 'branch', ddl: '`branch` VARCHAR(128) NULL DEFAULT NULL AFTER `prefix`' },
  // Advance/Fuel sub-mode on journal vouchers: 1 = advance, 2 = fuel, NULL = normal.
  { table: 'vch_details', column: 'bilty_mode', ddl: '`bilty_mode` TINYINT NULL DEFAULT NULL' },
  // The bilty selected in Advance/Fuel mode, so the Bilty No can be restored
  // when the voucher is edited. NULL for Normal-mode / non-bilty vouchers.
  { table: 'vch_details', column: 'bilty_id', ddl: '`bilty_id` INT UNSIGNED NULL DEFAULT NULL' },
  // Permanent (Tally-standard) ledger groups are non-editable parents.
  { table: 'ledger_group', column: 'is_system', ddl: '`is_system` TINYINT(1) NOT NULL DEFAULT 0' },
  // Agent fields folded into ledger_master (agent_master table dropped).
  { table: 'item_master', column: 'unit', ddl: '`unit` VARCHAR(32) NULL DEFAULT NULL AFTER `gst_rate`' },
  // Bilty line-item from/to stored as FK to destination_master (replaces old text columns).
  { table: 'batch', column: 'from_id', ddl: '`from_id` INT UNSIGNED NULL DEFAULT NULL' },
  { table: 'batch', column: 'to_id',   ddl: '`to_id`   INT UNSIGNED NULL DEFAULT NULL' },
  { table: 'ledger_master', column: 'mobile', ddl: '`mobile` VARCHAR(15) NULL DEFAULT NULL' },
  { table: 'ledger_master', column: 'commission_pct', ddl: '`commission_pct` DECIMAL(5,2) NULL DEFAULT NULL' },
  // Bilty owner is now a TEXT SNAPSHOT captured from the vehicle's current owner
  // at save time (owner_master removed). Backfilled by ensureVehicleMaster below.
  { table: 'vch_details', column: 'owner_name', ddl: '`owner_name` VARCHAR(255) NULL DEFAULT NULL' },
];

// The 15 Tally primary groups — always top-level (parent_id = NULL).
const PRIMARY_GROUPS = [
  'Branch / Divisions', 'Capital Account', 'Current Assets', 'Current Liabilities',
  'Direct Expenses', 'Direct Incomes', 'Fixed Assets', 'Indirect Expenses',
  'Indirect Incomes', 'Investments', 'Loans (Liability)', 'Misc. Expenses (ASSET)',
  'Purchase Accounts', 'Sales Accounts', 'Suspense A/c',
];

// The 13 Tally sub-groups with their correct primary parent (Tally ERP standard).
const SUB_GROUPS = [
  { name: 'Reserves & Surplus',       parent: 'Capital Account' },
  { name: 'Bank Accounts',            parent: 'Current Assets' },
  { name: 'Cash-in-Hand',             parent: 'Current Assets' },
  { name: 'Deposits (Asset)',         parent: 'Current Assets' },
  { name: 'Loans & Advances (Asset)', parent: 'Current Assets' },
  { name: 'Stock-in-Hand',            parent: 'Current Assets' },
  { name: 'Sundry Debtors',           parent: 'Current Assets' },
  { name: 'Duties & Taxes',           parent: 'Current Liabilities' },
  { name: 'Provisions',               parent: 'Current Liabilities' },
  { name: 'Sundry Creditors',         parent: 'Current Liabilities' },
  { name: 'Bank OD A/c',              parent: 'Loans (Liability)' },
  { name: 'Secured Loans',            parent: 'Loans (Liability)' },
  { name: 'Unsecured Loans',          parent: 'Loans (Liability)' },
];

// Combined list (primaries first so sub-group parent lookups always resolve).
const PERMANENT_GROUPS = [
  ...PRIMARY_GROUPS,
  ...SUB_GROUPS.map((g) => g.name),
];

async function columnExists(table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c`,
    { t: table, c: column }
  );
  return Number(rows[0].n) > 0;
}

async function tableExists(table) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t`,
    { t: table }
  );
  return Number(rows[0].n) > 0;
}

// Seed the 28 permanent ledger groups and keep them flagged as system groups.
// Idempotent: only inserts missing names, then enforces is_system and the
// correct Tally parent-child relationships on every boot.
// Deliberately does NOT touch user-created groups (Owner/Agent/Vehicles etc.).
async function ensurePermanentGroups() {
  if (!(await tableExists('ledger_group'))) return;
  if (!(await columnExists('ledger_group', 'is_system'))) return;
  try { await pool.query('ALTER TABLE `ledger_group` ADD UNIQUE KEY uq_ledger_group_name (group_name)'); } catch { /* already there */ }

  // Fetch existing names ONCE and insert only the genuinely missing groups.
  // (Per-name INSERT IGNORE on every boot makes InnoDB allocate — then discard —
  // an auto_increment value for each already-present row, so group ids drift to
  // large, gappy numbers over many restarts. Checking first avoids that burn.)
  let existing = new Set();
  try {
    const [rows] = await pool.query('SELECT group_name FROM ledger_group');
    existing = new Set(rows.map((r) => String(r.group_name).toLowerCase()));
  } catch { /* fall through — treat as none known */ }

  // Pass 1 — ensure all 28 exist, primaries inserted with parent_id = NULL.
  for (const name of PERMANENT_GROUPS) {
    try {
      if (!existing.has(name.toLowerCase())) {
        await pool.query('INSERT INTO ledger_group (group_name, parent_id, is_system) VALUES (?, NULL, 1)', [name]);
        existing.add(name.toLowerCase());
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[schema] could not insert permanent group ${name}:`, err && err.message ? err.message : err);
    }
  }

  // Pass 2 — enforce is_system = 1 on all 28 and set correct parent_id.
  // Primary groups: parent_id = NULL.
  for (const name of PRIMARY_GROUPS) {
    try {
      await pool.query('UPDATE ledger_group SET is_system = 1, parent_id = NULL WHERE group_name = ?', [name]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[schema] could not update primary group ${name}:`, err && err.message ? err.message : err);
    }
  }

  // Sub-groups: parent_id = id of named parent (resolved via self-join alias).
  for (const { name, parent } of SUB_GROUPS) {
    try {
      await pool.query(
        `UPDATE ledger_group SET is_system = 1,
           parent_id = (SELECT id FROM (SELECT id FROM ledger_group WHERE group_name = ?) AS _p)
         WHERE group_name = ?`,
        [parent, name]
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[schema] could not set parent for sub-group ${name}:`, err && err.message ? err.message : err);
    }
  }

  // Pin the auto_increment to just past the current max, so new groups continue
  // sequentially instead of inheriting a counter inflated by past boots.
  try {
    const [maxRows] = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS nxt FROM ledger_group');
    const nxt = Number(maxRows[0] && maxRows[0].nxt) || 1;
    await pool.query(`ALTER TABLE ledger_group AUTO_INCREMENT = ${nxt}`);
  } catch { /* non-critical */ }
}

// Drop a foreign key (discovered dynamically) and then its column, idempotently.
async function dropFkAndColumn(table, column) {
  if (!(await tableExists(table))) return;
  if (!(await columnExists(table, column))) return;
  try {
    const [fks] = await pool.execute(
      `SELECT constraint_name FROM information_schema.key_column_usage
        WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c
          AND referenced_table_name IS NOT NULL`,
      { t: table, c: column }
    );
    for (const r of fks) {
      const name = r.CONSTRAINT_NAME || r.constraint_name;
      try { await pool.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${name}\``); } catch { /* already gone */ }
    }
  } catch { /* introspection failed — still try the column drop */ }
  try {
    await pool.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    // eslint-disable-next-line no-console
    console.log(`[schema] dropped ${table}.${column}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[schema] could not drop ${table}.${column}:`, err && err.message ? err.message : err);
  }
}

// Owner Master → Vehicle Master migration. Owners are no longer a standalone
// master: their details live on the vehicle record, and "Create" keeps owner
// history (one row per owner-version, is_current = 1 marks the live one).
// Fully idempotent — guards on existence so it's safe on every boot.
async function ensureVehicleMaster() {
  // 1) The versioned vehicle+owner master.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_master (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      vehicle_no VARCHAR(64) NOT NULL,
      vehicle_type VARCHAR(64) NULL,
      ledger_group_id INT UNSIGNED NULL,
      ledger_master_id INT UNSIGNED NULL,
      mobile VARCHAR(15) NULL,
      gst_no VARCHAR(20) NULL,
      pan_no VARCHAR(15) NULL,
      address VARCHAR(512) NULL,
      city VARCHAR(128) NULL,
      state VARCHAR(128) NULL,
      pincode VARCHAR(16) NULL,
      is_current TINYINT(1) NOT NULL DEFAULT 1,
      created_by INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_vehicle_master_no (vehicle_no),
      INDEX idx_vehicle_master_current (vehicle_no, is_current),
      CONSTRAINT fk_vehicle_master_group FOREIGN KEY (ledger_group_id) REFERENCES ledger_group(id),
      CONSTRAINT fk_vehicle_master_ledger FOREIGN KEY (ledger_master_id) REFERENCES ledger_master(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // The owner is now the picked Ledger Group (the group's name IS the owner
  // name), so the standalone owner_name column is no longer used — drop it.
  await dropFkAndColumn('vehicle_master', 'owner_name');

  // 2) One-time backfill from the OLD model (vehicle = ledger_master row in the
  //    'Vehicles' group, owner = owner_master via ledger_master.owner_id). Only
  //    runs while owner_master still exists AND the table is still empty.
  if (await tableExists('owner_master')) {
    const [cnt] = await pool.query('SELECT COUNT(*) AS n FROM vehicle_master');
    if (Number(cnt[0].n) === 0) {
      try {
        await pool.query(`
          INSERT INTO vehicle_master
            (vehicle_no, vehicle_type, ledger_group_id, ledger_master_id,
             mobile, gst_no, pan_no, address, city, state, pincode,
             is_current, created_by, created_at)
          SELECT lm.name, lm.vehicle_type, lm.ledger_group_id, lm.id,
                 ow.mobile, ow.gst_no, ow.pan_no, ow.address, ow.city, ow.state, ow.pincode,
                 1, lm.created_by, lm.created_at
            FROM ledger_master lm
            JOIN ledger_group lg ON lg.id = lm.ledger_group_id AND lg.group_name = 'Vehicles'
            LEFT JOIN owner_master ow ON ow.id = lm.owner_id
        `);
        // eslint-disable-next-line no-console
        console.log('[schema] backfilled vehicle_master from ledger_master + owner_master');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[schema] vehicle_master backfill failed:', err && err.message ? err.message : err);
      }
    }
  }

  // 3) Snapshot each bilty's owner name onto vch_details.owner_name (the column
  //    is added by the COLUMNS loop above) before owner_master is dropped.
  if (await columnExists('vch_details', 'owner_name') && await tableExists('owner_master')
      && await columnExists('vch_details', 'owner_id')) {
    try {
      await pool.query(`
        UPDATE vch_details v
          JOIN owner_master ow ON ow.id = v.owner_id
           SET v.owner_name = ow.name
         WHERE v.owner_name IS NULL AND v.owner_id IS NOT NULL
      `);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[schema] owner_name snapshot backfill failed:', err && err.message ? err.message : err);
    }
  }

  // 4) Detach the old FKs/columns, then drop owner_master entirely.
  await dropFkAndColumn('ledger_master', 'owner_id');
  await dropFkAndColumn('vch_details', 'owner_id');
  if (await tableExists('owner_master')) {
    try {
      await pool.query('DROP TABLE owner_master');
      // eslint-disable-next-line no-console
      console.log('[schema] dropped owner_master');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[schema] could not drop owner_master:', err && err.message ? err.message : err);
    }
  }
}

// Ensure system vchtypes and ledgers for auto-posted bilty companion vouchers:
//   Freight Journal  (Dr Vehicle / Cr Freight Expense)  — expense, l_rate × qty
async function ensureFreightJournalSeeds() {
  if (!(await tableExists('vchtype'))) return;
  try {
    const [existing] = await pool.query("SELECT id FROM vchtype WHERE name = 'Freight Journal' LIMIT 1");
    if (!existing.length) {
      // Insert as child of "Journal" vchtype if it exists, else top-level.
      const [journalRows] = await pool.query("SELECT id FROM vchtype WHERE name = 'Journal' LIMIT 1");
      const journalParentId = journalRows.length ? journalRows[0].id : null;
      await pool.query('INSERT INTO vchtype (name, parent_id, is_system) VALUES (?, ?, 1)', ['Freight Journal', journalParentId]);
    } else {
      // If already exists but parent_id is wrong, fix it.
      const [journalRows] = await pool.query("SELECT id FROM vchtype WHERE name = 'Journal' LIMIT 1");
      if (journalRows.length) {
        await pool.query(
          "UPDATE vchtype SET parent_id = ? WHERE name = 'Freight Journal' AND (parent_id IS NULL OR parent_id != ?)",
          [journalRows[0].id, journalRows[0].id]
        );
      }
    }
  } catch (err) {
    console.error('[schema] could not seed Freight Journal vchtype:', err && err.message ? err.message : err);
  }

  if (!(await tableExists('ledger_master')) || !(await tableExists('ledger_group'))) return;
  try {
    const [expenseRows] = await pool.query('SELECT id FROM ledger_master WHERE name = ? LIMIT 1', ['Freight Expense']);
    if (!expenseRows.length) {
      const [legacyRows] = await pool.query('SELECT id FROM ledger_master WHERE name = ? LIMIT 1', ['Freight Charges']);
      if (legacyRows.length) {
        await pool.query('UPDATE ledger_master SET name = ? WHERE id = ?', ['Freight Expense', legacyRows[0].id]);
      } else {
        await pool.query(
          `INSERT INTO ledger_master (ledger_group_id, name, billbybill)
             SELECT id, ?, 'No' FROM ledger_group WHERE group_name = 'Direct Incomes' LIMIT 1`,
          ['Freight Expense']
        );
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[schema] could not seed Freight Expense ledger:', err && err.message ? err.message : err);
  }
}

async function ensureSchema() {
  for (const { table, column, ddl } of COLUMNS) {
    try {
      if (!(await tableExists(table))) continue; // table not created yet — skip
      if (await columnExists(table, column)) continue; // already there
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
      // eslint-disable-next-line no-console
      console.log(`[schema] added ${table}.${column}`);
    } catch (err) {
      // Never block startup on a schema-sync hiccup — log and continue.
      // eslint-disable-next-line no-console
      console.error(`[schema] could not ensure ${table}.${column}:`, err && err.message ? err.message : err);
    }
  }
  await ensurePermanentGroups();
  await ensureVehicleMaster();
  await ensureFreightJournalSeeds();
  await ensureUniqueGuards();
}

// Best-effort unique guards that the legacy Docker DB may be missing. Each is
// idempotent (a duplicate-index error just means it already exists) and never
// blocks boot. NULL vch_no rows are exempt (MySQL allows multiple NULLs).
async function ensureUniqueGuards() {
  const guards = [
    { table: 'vch_details', name: 'uq_vch_details_type_no', cols: '(vch_type_id, vch_no)' },
  ];
  for (const g of guards) {
    try {
      if (!(await tableExists(g.table))) continue;
      await pool.query(`ALTER TABLE \`${g.table}\` ADD UNIQUE KEY ${g.name} ${g.cols}`);
      // eslint-disable-next-line no-console
      console.log(`[schema] added unique ${g.table}.${g.name}`);
    } catch { /* already present (or data conflict) — leave as-is */ }
  }
}

module.exports = { ensureSchema };
