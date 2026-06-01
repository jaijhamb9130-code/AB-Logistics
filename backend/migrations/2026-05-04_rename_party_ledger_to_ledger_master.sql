-- ============================================================================
-- Rename `party_ledger` → `ledger_master` (table, columns, constraints, indexes)
-- Generated: 2026-05-04
--
-- This migration is idempotent where reasonable: it inspects information_schema
-- before each DDL so re-running it on an already-migrated DB is a no-op.
--
-- Order of operations (chosen to satisfy MySQL FK constraints):
--   1. Drop FK constraints that reference `party_ledger` (from vch_details,
--      ledger_entries, bill_allocation).
--   2. Drop FK constraints WITHIN `party_ledger` (so we can rename it).
--   3. RENAME TABLE party_ledger → ledger_master.
--   4. Rename column vch_details.party_ledger_id → ledger_master_id.
--   5. Rename indexes on the renamed table + on vch_details.
--   6. Re-add FK constraints with the new names, pointing to ledger_master.
--
-- DO NOT RUN AUTOMATICALLY — review and apply via your DB tooling.
-- ============================================================================

-- Use a single statement-mode session; wrap in implicit DDL transaction.
-- (DDL in MySQL auto-commits, but inspector blocks keep this idempotent.)

-- ── 1. Drop dependent FKs from other tables ────────────────────────────────

-- vch_details.fk_vch_details_party
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'vch_details'
               AND CONSTRAINT_NAME = 'fk_vch_details_party');
SET @sql := IF(@fk = 1, 'ALTER TABLE vch_details DROP FOREIGN KEY fk_vch_details_party', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ledger_entries.fk_ledger_entries_ledger
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'ledger_entries'
               AND CONSTRAINT_NAME = 'fk_ledger_entries_ledger');
SET @sql := IF(@fk = 1, 'ALTER TABLE ledger_entries DROP FOREIGN KEY fk_ledger_entries_ledger', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- bill_allocation.fk_bill_allocation_ledger
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'bill_allocation'
               AND CONSTRAINT_NAME = 'fk_bill_allocation_ledger');
SET @sql := IF(@fk = 1, 'ALTER TABLE bill_allocation DROP FOREIGN KEY fk_bill_allocation_ledger', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. Drop FKs that live ON party_ledger ──────────────────────────────────

-- party_ledger.fk_party_ledger_group (legacy plural-table name)
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'party_ledger'
               AND CONSTRAINT_NAME = 'fk_party_ledger_group');
SET @sql := IF(@fk = 1, 'ALTER TABLE party_ledger DROP FOREIGN KEY fk_party_ledger_group', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- party_ledger.fk_party_ledger_to_ledger_group (singular-table name)
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'party_ledger'
               AND CONSTRAINT_NAME = 'fk_party_ledger_to_ledger_group');
SET @sql := IF(@fk = 1, 'ALTER TABLE party_ledger DROP FOREIGN KEY fk_party_ledger_to_ledger_group', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- party_ledger.fk_party_ledger_created_by
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'party_ledger'
               AND CONSTRAINT_NAME = 'fk_party_ledger_created_by');
SET @sql := IF(@fk = 1, 'ALTER TABLE party_ledger DROP FOREIGN KEY fk_party_ledger_created_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. Rename table ────────────────────────────────────────────────────────

SET @t_old := (SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'party_ledger');
SET @t_new := (SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ledger_master');
SET @sql := IF(@t_old = 1 AND @t_new = 0,
  'RENAME TABLE party_ledger TO ledger_master',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4. Rename vch_details.party_ledger_id → ledger_master_id ───────────────

SET @col_old := (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_schema = DATABASE()
                    AND table_name = 'vch_details'
                    AND column_name = 'party_ledger_id');
SET @sql := IF(@col_old = 1,
  'ALTER TABLE vch_details CHANGE COLUMN party_ledger_id ledger_master_id INT UNSIGNED NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5. Rename indexes ──────────────────────────────────────────────────────

-- ledger_master indexes (formerly party_ledger)
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'ledger_master'
                AND INDEX_NAME = 'idx_party_ledger_group');
SET @sql := IF(@idx > 0,
  'ALTER TABLE ledger_master RENAME INDEX idx_party_ledger_group TO idx_ledger_master_group',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'ledger_master'
                AND INDEX_NAME = 'idx_party_ledger_name');
SET @sql := IF(@idx > 0,
  'ALTER TABLE ledger_master RENAME INDEX idx_party_ledger_name TO idx_ledger_master_name',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'ledger_master'
                AND INDEX_NAME = 'idx_party_ledger_tally');
SET @sql := IF(@idx > 0,
  'ALTER TABLE ledger_master RENAME INDEX idx_party_ledger_tally TO idx_ledger_master_tally',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- vch_details index for the renamed FK column
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'vch_details'
                AND INDEX_NAME = 'idx_vch_details_party');
SET @sql := IF(@idx > 0,
  'ALTER TABLE vch_details RENAME INDEX idx_vch_details_party TO idx_vch_details_ledger',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6. Recreate FKs with new names ─────────────────────────────────────────

-- ledger_master.fk_ledger_master_group  →  ledger_group(id)
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'ledger_master'
               AND CONSTRAINT_NAME = 'fk_ledger_master_group');
SET @t_lg := (SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ledger_group');
SET @sql := IF(@fk = 0 AND @t_lg = 1,
  'ALTER TABLE ledger_master ADD CONSTRAINT fk_ledger_master_group FOREIGN KEY (ledger_group_id) REFERENCES ledger_group(id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ledger_master.fk_ledger_master_to_ledger_group (mirrors the legacy singular-table FK)
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'ledger_master'
               AND CONSTRAINT_NAME = 'fk_ledger_master_to_ledger_group');
SET @sql := IF(@fk = 0 AND @t_lg = 1,
  'ALTER TABLE ledger_master ADD CONSTRAINT fk_ledger_master_to_ledger_group FOREIGN KEY (ledger_group_id) REFERENCES ledger_group(id) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ledger_master.fk_ledger_master_created_by  →  users(id)
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'ledger_master'
               AND CONSTRAINT_NAME = 'fk_ledger_master_created_by');
SET @sql := IF(@fk = 0,
  'ALTER TABLE ledger_master ADD CONSTRAINT fk_ledger_master_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- vch_details.fk_vch_details_ledger  →  ledger_master(id)
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'vch_details'
               AND CONSTRAINT_NAME = 'fk_vch_details_ledger');
SET @sql := IF(@fk = 0,
  'ALTER TABLE vch_details ADD CONSTRAINT fk_vch_details_ledger FOREIGN KEY (ledger_master_id) REFERENCES ledger_master(id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ledger_entries.fk_ledger_entries_ledger  →  ledger_master(id)  (name kept)
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'ledger_entries'
               AND CONSTRAINT_NAME = 'fk_ledger_entries_ledger');
SET @sql := IF(@fk = 0,
  'ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_entries_ledger FOREIGN KEY (ledger_id) REFERENCES ledger_master(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- bill_allocation.fk_bill_allocation_ledger  →  ledger_master(id)  (name kept)
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'bill_allocation'
               AND CONSTRAINT_NAME = 'fk_bill_allocation_ledger');
SET @sql := IF(@fk = 0,
  'ALTER TABLE bill_allocation ADD CONSTRAINT fk_bill_allocation_ledger FOREIGN KEY (ledger) REFERENCES ledger_master(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
