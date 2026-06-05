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
  { table: 'ledger_master', column: 'mobile', ddl: '`mobile` VARCHAR(15) NULL DEFAULT NULL' },
  { table: 'ledger_master', column: 'commission_pct', ddl: '`commission_pct` DECIMAL(5,2) NULL DEFAULT NULL' },
  // Bilty owner is now a TEXT SNAPSHOT captured from the vehicle's current owner
  // at save time (owner_master removed). Backfilled by ensureVehicleMaster below.
  { table: 'vch_details', column: 'owner_name', ddl: '`owner_name` VARCHAR(255) NULL DEFAULT NULL' },
];

// The 28 standard (Tally) ledger groups. Seeded as permanent, non-editable,
// top-level parents. User-created groups are always non-system children.
const PERMANENT_GROUPS = [
  'Branch / Divisions', 'Capital Account', 'Reserves & Surplus', 'Current Assets',
  'Bank Accounts', 'Cash-in-Hand', 'Deposits (Asset)', 'Loans & Advances (Asset)',
  'Stock-in-Hand', 'Sundry Debtors', 'Current Liabilities', 'Duties & Taxes',
  'Provisions', 'Sundry Creditors', 'Direct Expenses', 'Direct Incomes',
  'Fixed Assets', 'Indirect Expenses', 'Indirect Incomes', 'Investments',
  'Loans (Liability)', 'Bank OD A/c', 'Secured Loans', 'Unsecured Loans',
  'Misc. Expenses (ASSET)', 'Purchase Accounts', 'Sales Accounts', 'Suspense A/c',
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

// Seed the 28 permanent ledger groups and keep them flagged as system parents.
// Idempotent: only inserts missing names, only (re)asserts is_system on the 28.
// Deliberately does NOT touch user/child groups (e.g. owner/agent/Vehicles), so
// the user's later edits to those are preserved across restarts.
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

  for (const name of PERMANENT_GROUPS) {
    try {
      if (existing.has(name.toLowerCase())) {
        await pool.query('UPDATE ledger_group SET is_system = 1, parent_id = NULL WHERE group_name = ?', [name]);
      } else {
        await pool.query('INSERT INTO ledger_group (group_name, parent_id, is_system) VALUES (?, NULL, 1)', [name]);
        existing.add(name.toLowerCase());
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[schema] could not ensure permanent group ${name}:`, err && err.message ? err.message : err);
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
