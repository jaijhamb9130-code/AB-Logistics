-- AB Logistics — Phase 1 schema
-- Users table backs JWT auth (BE-04, BE-05). Idempotent.

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','staff') NOT NULL DEFAULT 'staff',
  permissions JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Phase 2: track last-modified timestamp for audit/cache.
-- Idempotent: only adds the column if missing. Works on MySQL 8+.
SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name   = 'users'
     AND column_name  = 'updated_at'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Phase 3 — Bilty module.
--   Migration 002 retired the standalone `bilty` table — bilty headers now
--     live in `vch_details` (Phase 7), keyed off `vchtype`.
--   Migration 003 retired `bilty_items` — line items now live in `batch`,
--     with a per-voucher rollup in `inventory_entries`.
--   The CREATE TABLE blocks for `bilty` and `bilty_items` were removed
--     because re-running init-db.js was recreating them as orphan tables
--     after migration. The DROP statements below clean up any orphans left
--     over from the old schema (no-op when already absent).
--
-- Sidecar tables (advance_details, fuel_details) were removed — see migration
-- 008_drop_advance_fuel.sql. Only the freight_memo CREATE block below remains
-- as a fallback for fresh installs (its FK points at vch_details(id) after
-- migration 002, where bilty_id was renamed → vch_id).
-- ============================================================================

SET @fkc := @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS bilty_items;
DROP TABLE IF EXISTS bilty;
SET FOREIGN_KEY_CHECKS = @fkc;

-- ============================================================================
-- Phase 4 — Freight Memo (FREIGHT-01..06).
-- Derived from bilty — NEVER manually entered. One-memo-per-bilty enforced by
-- UNIQUE(bilty_id). Totals only; item data lives in bilty_items.
-- ============================================================================

CREATE TABLE IF NOT EXISTS freight_memo (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  memo_no VARCHAR(32) NOT NULL UNIQUE,
  bilty_id INT UNSIGNED NOT NULL UNIQUE,
  memo_date DATE NULL,
  freight_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_payable DECIMAL(12,2) NOT NULL DEFAULT 0,
  generated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_freight_memo_bilty_id (bilty_id),
  INDEX idx_freight_memo_memo_no (memo_no),
  CONSTRAINT fk_freight_memo_bilty FOREIGN KEY (bilty_id) REFERENCES bilty(id) ON DELETE CASCADE,
  CONSTRAINT fk_freight_memo_generated_by FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- Modernization Phase 0 — Audit Trail & Data Integrity
-- ============================================================================

-- audit_logs: tracks EVERY create/update/delete across all business tables.
-- entity_id is a generic reference to the affected row's primary key.
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  action ENUM('CREATE','UPDATE','DELETE','GENERATE') NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Idempotent: drop the OCC `version` column from `vch_details` and
-- `freight_memo` if present. Removed by user request — last-write-wins is
-- now the persistence semantics. The dead OCC code paths in BiltyService /
-- FreightService were stripped at the same time.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vch_details' AND column_name = 'version');
SET @sql := IF(@col = 1, 'ALTER TABLE vch_details DROP COLUMN version', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'freight_memo' AND column_name = 'version');
SET @sql := IF(@col = 1, 'ALTER TABLE freight_memo DROP COLUMN version', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Idempotent: drop is_stale on freight_memo if present. Removed by user
-- request — no code path read or wrote it (FreightService never persisted
-- a stale flag), so the column was always 0.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'freight_memo' AND column_name = 'is_stale');
SET @sql := IF(@col = 1, 'ALTER TABLE freight_memo DROP COLUMN is_stale', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Ledger Groups & Masters (Phase: party / owner / agent / item / vehicle / destination)
-- ============================================================================

-- NEW: ledger_group table for hierarchical categorization (BE-20)
CREATE TABLE IF NOT EXISTS ledger_group (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_name VARCHAR(64) NOT NULL,
  parent_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ledger_group_name (group_name),
  INDEX idx_ledger_group_parent (parent_id),
  CONSTRAINT fk_ledger_group_parent FOREIGN KEY (parent_id) REFERENCES ledger_group(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Idempotent: add the unique index on existing DBs that pre-date it. Because
-- the column uses utf8mb4's default case-insensitive collation
-- (utf8mb4_0900_ai_ci), this ALTER treats "owner" / "Owner" / "OWNER" as
-- duplicates — MySQL will reject the second insert with ER_DUP_ENTRY which
-- the controller surfaces as a 409 "name_taken" to the client.
SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name   = 'ledger_group'
     AND index_name   = 'uq_ledger_group_name'
);
SET @sql := IF(@idx = 0, 'ALTER TABLE ledger_group ADD UNIQUE KEY uq_ledger_group_name (group_name)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Seed (REMOVED): the original schema seeded lowercase party/owner/agent at
-- fixed ids 1/2/3, but the live DB now uses user-created groups under
-- "Sundry Debtors" (Owner / Agent — created manually via Ledger Groups
-- admin). Re-running init-db was reintroducing the seed rows as duplicates,
-- causing the Owner / Agent master pages to resolve to the wrong group id.
-- If a fresh DB needs starter system groups, create them via the Ledger
-- Groups admin UI rather than seeding here.

-- ledger_master: shared table for Party / Owner / Agent (differentiated by ledger_group_id)
CREATE TABLE IF NOT EXISTS ledger_master (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ledger_group_id INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  gst_no VARCHAR(20) NULL,
  pan_no VARCHAR(15) NULL,
  address VARCHAR(512) NULL,
  city VARCHAR(128) NULL,
  state VARCHAR(128) NULL,
  country VARCHAR(128) NULL,
  pincode VARCHAR(16) NULL,
  tally_master_id VARCHAR(64) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ledger_master_group (ledger_group_id),
  INDEX idx_ledger_master_name (name),
  INDEX idx_ledger_master_tally (tally_master_id),
  CONSTRAINT fk_ledger_master_group FOREIGN KEY (ledger_group_id) REFERENCES ledger_group(id),
  CONSTRAINT fk_ledger_master_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migration: rename type -> ledger_group_id if needed (for older installations)
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ledger_master' AND column_name = 'type');
-- If column 'type' exists, it means we need to migrate.
-- 1. First convert string values to IDs while it's still a string/enum column
SET @type := (SELECT DATA_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ledger_master' AND column_name = 'type');
SET @sql := IF(@type IN ('enum','varchar','char'), 'UPDATE ledger_master SET type = CASE WHEN type = ''party'' THEN ''1'' WHEN type = ''owner'' THEN ''2'' WHEN type = ''agent'' THEN ''3'' ELSE type END', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- 2. Then rename and change type
SET @sql := IF(@col > 0, 'ALTER TABLE ledger_master CHANGE COLUMN type ledger_group_id INT UNSIGNED NOT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;



-- 4) item_master: goods types with HSN code + GST rate
CREATE TABLE IF NOT EXISTS item_master (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  hsn_code VARCHAR(20) NULL,
  gst_rate DECIMAL(5,2) NULL,
  tally_master_id VARCHAR(64) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_item_master_name (name),
  INDEX idx_item_master_tally (tally_master_id),
  CONSTRAINT fk_item_master_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5) Vehicles are NOT a separate master — they live as ledger_master rows in
-- the system "Vehicles" sub-group of Sundry Creditors. The truck's ledger row
-- IS the vehicle: vch_details.vehicle_id FK → ledger_master.id (filtered by
-- ledger_group.group_name = 'Vehicles'). The legacy `vehicle_master` table
-- has been dropped — see migration that translated FKs to ledger_master ids.

-- 6) destination_master: single flat table — branch is a string column, not a separate table.
-- branch is nullable: a row with branch=NULL is a standalone destination not under any branch.
-- Bilty Branch dropdown uses SELECT DISTINCT branch; From/To dropdown filters by branch.
CREATE TABLE IF NOT EXISTS destination_master (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch VARCHAR(255) NULL,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(128) NULL,
  state VARCHAR(128) NULL,
  pincode VARCHAR(16) NULL,
  tally_master_id VARCHAR(64) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_destination_master_branch (branch),
  INDEX idx_destination_master_name (name),
  INDEX idx_destination_master_tally (tally_master_id),
  CONSTRAINT fk_destination_master_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Idempotent: drop the old two-table design if it exists (first init-db ran with that design).
SET @t1 := (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'destination_locations');
SET @sql := IF(@t1 = 1, 'DROP TABLE destination_locations', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @t2 := (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'destination_branches');
SET @sql := IF(@t2 = 1, 'DROP TABLE destination_branches', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Ledger Groups: the `ledger_group` table (singular) is created externally
-- by your Docker setup. We DON'T create or seed it here — only reference it
-- for the FK constraint on ledger_master.ledger_group_id.
--
-- Cleanup: drop the previously-attempted `ledger_groups` (plural) table and
-- its FK if they were ever created on this database. Both steps are
-- idempotent — safe to re-run.
-- ============================================================================

-- 1) Drop the old FK that pointed to the plural `ledger_groups` table.
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'ledger_master'
               AND CONSTRAINT_NAME = 'fk_ledger_master_group');
SET @sql := IF(@fk = 1,
  'ALTER TABLE ledger_master DROP FOREIGN KEY fk_ledger_master_group',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Drop the old plural `ledger_groups` table if it exists.
DROP TABLE IF EXISTS ledger_groups;

-- 3) Add FK from ledger_master.ledger_group_id → ledger_group.id (singular,
--    Docker-managed). ON DELETE RESTRICT blocks removing a group that's
--    still referenced. Idempotent.
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'ledger_master'
               AND CONSTRAINT_NAME = 'fk_ledger_master_to_ledger_group');
SET @t := (SELECT COUNT(*) FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ledger_group');
SET @sql := IF(@fk = 0 AND @t = 1,
  'ALTER TABLE ledger_master ADD CONSTRAINT fk_ledger_master_to_ledger_group FOREIGN KEY (ledger_group_id) REFERENCES ledger_group(id) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Phase 7 — Billing / Vouchers (Tally-style double-entry).
-- Sign convention is data-driven via vchtype.deemed_positive:
--   YES (Sales/Debit Note)     → Party Dr (+), Goods Cr (−), inventory negative
--   NO  (Purchase/Credit Note) → Party Cr (−), Goods Dr (+), inventory positive
--   NULL (Receipt/Payment/Journal/Contra) → journal mode, no items
-- All ledger entries are signed; SUM(ledger_entries.amount per voucher) = 0.
-- ============================================================================

-- 1) Extend ledger_group with system groups for Sales/Purchase/Tax/Bank/Cash/Expense.
INSERT IGNORE INTO ledger_group (id, group_name, parent_id) VALUES (4,  'Sales Accounts',     NULL);
INSERT IGNORE INTO ledger_group (id, group_name, parent_id) VALUES (5,  'Purchase Accounts',  NULL);
INSERT IGNORE INTO ledger_group (id, group_name, parent_id) VALUES (6,  'Duties & Taxes',     NULL);
INSERT IGNORE INTO ledger_group (id, group_name, parent_id) VALUES (7,  'Indirect Income',    NULL);
INSERT IGNORE INTO ledger_group (id, group_name, parent_id) VALUES (8,  'Bank Accounts',      NULL);
INSERT IGNORE INTO ledger_group (id, group_name, parent_id) VALUES (9,  'Cash-in-Hand',       NULL);
INSERT IGNORE INTO ledger_group (id, group_name, parent_id) VALUES (10, 'Direct Expenses',    NULL);

-- 2) Extend ledger_master: billbybill flag + opening balance.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ledger_master' AND column_name = 'billbybill');
SET @sql := IF(@col = 0, 'ALTER TABLE ledger_master ADD COLUMN billbybill ENUM(''Yes'',''No'') NOT NULL DEFAULT ''No'' AFTER ledger_group_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- party group (id=1) is Sundry Debtors equivalent — flip billbybill=Yes once.
UPDATE ledger_master SET billbybill = 'Yes' WHERE ledger_group_id = 1 AND billbybill = 'No';

SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ledger_master' AND column_name = 'opening_balance');
SET @sql := IF(@col = 0, 'ALTER TABLE ledger_master ADD COLUMN opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ledger_master' AND column_name = 'opening_balance_type');
SET @sql := IF(@col = 0, 'ALTER TABLE ledger_master ADD COLUMN opening_balance_type ENUM(''Dr'',''Cr'') NOT NULL DEFAULT ''Dr''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Seed system ledgers (Sales, Purchase, CGST, SGST, IGST, Roundoff). Idempotent.
INSERT INTO ledger_master (ledger_group_id, name, billbybill)
SELECT 4, 'Sales',    'No' WHERE NOT EXISTS (SELECT 1 FROM ledger_master WHERE name = 'Sales'    AND ledger_group_id = 4);
INSERT INTO ledger_master (ledger_group_id, name, billbybill)
SELECT 5, 'Purchase', 'No' WHERE NOT EXISTS (SELECT 1 FROM ledger_master WHERE name = 'Purchase' AND ledger_group_id = 5);
INSERT INTO ledger_master (ledger_group_id, name, billbybill)
SELECT 6, 'CGST',     'No' WHERE NOT EXISTS (SELECT 1 FROM ledger_master WHERE name = 'CGST'     AND ledger_group_id = 6);
INSERT INTO ledger_master (ledger_group_id, name, billbybill)
SELECT 6, 'SGST',     'No' WHERE NOT EXISTS (SELECT 1 FROM ledger_master WHERE name = 'SGST'     AND ledger_group_id = 6);
INSERT INTO ledger_master (ledger_group_id, name, billbybill)
SELECT 6, 'IGST',     'No' WHERE NOT EXISTS (SELECT 1 FROM ledger_master WHERE name = 'IGST'     AND ledger_group_id = 6);
INSERT INTO ledger_master (ledger_group_id, name, billbybill)
SELECT 7, 'Roundoff', 'No' WHERE NOT EXISTS (SELECT 1 FROM ledger_master WHERE name = 'Roundoff' AND ledger_group_id = 7);

-- 4) Extend item_master with batch flag.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'item_master' AND column_name = 'batch');
SET @sql := IF(@col = 0, 'ALTER TABLE item_master ADD COLUMN batch ENUM(''Yes'',''No'') NOT NULL DEFAULT ''No''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5) Voucher type master.
CREATE TABLE IF NOT EXISTS vchtype (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  parent_id INT UNSIGNED NULL,
  deemed_positive ENUM('YES','NO') NULL DEFAULT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  -- Optional voucher-number prefix. When set, the voucher form auto-fills
  -- vch_no as `<prefix>-<number>`; when null, numbering starts plainly.
  prefix VARCHAR(16) NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vchtype_name (name),
  INDEX idx_vchtype_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed 8 system voucher types (idempotent).
INSERT INTO vchtype (name, deemed_positive, is_system)
SELECT 'Sales',       'YES', 1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Sales'       AND is_system = 1);
INSERT INTO vchtype (name, deemed_positive, is_system)
SELECT 'Purchase',    'NO',  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Purchase'    AND is_system = 1);
INSERT INTO vchtype (name, deemed_positive, is_system)
SELECT 'Receipt',     NULL,  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Receipt'     AND is_system = 1);
INSERT INTO vchtype (name, deemed_positive, is_system)
SELECT 'Payment',     NULL,  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Payment'     AND is_system = 1);
INSERT INTO vchtype (name, deemed_positive, is_system)
SELECT 'Journal',     NULL,  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Journal'     AND is_system = 1);
INSERT INTO vchtype (name, deemed_positive, is_system)
SELECT 'Contra',      NULL,  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Contra'      AND is_system = 1);
INSERT INTO vchtype (name, deemed_positive, is_system)
SELECT 'Debit Note',  'YES', 1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Debit Note'  AND is_system = 1);
INSERT INTO vchtype (name, deemed_positive, is_system)
SELECT 'Credit Note', 'NO',  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Credit Note' AND is_system = 1);

-- Set parent_id = self for all root system types (Tally convention).
UPDATE vchtype SET parent_id = id WHERE is_system = 1 AND parent_id IS NULL;

-- Internal companion type: every Bilty auto-posts a "Freight Journal" voucher
-- (Dr Freight Expense / Cr vehicle ledger). Required by biltyModel — without
-- it, bilty creation fails with `freight_journal_vchtype_missing`. parent_id
-- stays NULL (added AFTER the self-parent UPDATE above) and the UI filters it
-- out by name, so it never appears as a user-selectable voucher type.
INSERT INTO vchtype (name, deemed_positive, is_system)
SELECT 'Freight Journal', NULL, 1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Freight Journal');

-- 6) Voucher header — one row per voucher.
CREATE TABLE IF NOT EXISTS vch_details (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vch_type_id INT UNSIGNED NULL,
  vch_no VARCHAR(100) NULL,
  vch_date DATE NULL,
  ledger_master_id INT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  remark TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vch_details_type (vch_type_id),
  INDEX idx_vch_details_date (vch_date),
  INDEX idx_vch_details_ledger (ledger_master_id),
  CONSTRAINT fk_vch_details_type       FOREIGN KEY (vch_type_id)     REFERENCES vchtype(id)      ON DELETE SET NULL,
  CONSTRAINT fk_vch_details_ledger      FOREIGN KEY (ledger_master_id) REFERENCES ledger_master(id),
  CONSTRAINT fk_vch_details_created_by FOREIGN KEY (created_by)      REFERENCES users(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7) Ledger entries — signed Dr/Cr lines. SUM per vch_id = 0 (enforced in code).
CREATE TABLE IF NOT EXISTS ledger_entries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vch_id INT UNSIGNED NOT NULL,
  ledger_id INT UNSIGNED NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ledger_entries_vch (vch_id),
  INDEX idx_ledger_entries_ledger (ledger_id),
  CONSTRAINT fk_ledger_entries_vch    FOREIGN KEY (vch_id)    REFERENCES vch_details(id)  ON DELETE CASCADE,
  CONSTRAINT fk_ledger_entries_ledger FOREIGN KEY (ledger_id) REFERENCES ledger_master(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8) Inventory entries. led_id points to the GOODS ledger entry (Sales/Purchase row).
CREATE TABLE IF NOT EXISTS inventory_entries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  led_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  qty DECIMAL(10,3) NOT NULL DEFAULT 1,
  rate DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inventory_entries_led (led_id),
  INDEX idx_inventory_entries_item (item_id),
  CONSTRAINT fk_inventory_entries_led  FOREIGN KEY (led_id)  REFERENCES ledger_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_entries_item FOREIGN KEY (item_id) REFERENCES item_master(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9) Batch — one row per item per voucher (NULL batch_name for non-batch items).
CREATE TABLE IF NOT EXISTS batch (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vch_id INT UNSIGNED NOT NULL,
  inventory_id INT UNSIGNED NULL,
  item_id INT UNSIGNED NOT NULL,
  batch_name VARCHAR(255) NULL,
  qty DECIMAL(10,3) NOT NULL DEFAULT 1,
  rate DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_batch_vch (vch_id),
  INDEX idx_batch_inv (inventory_id),
  INDEX idx_batch_item (item_id),
  CONSTRAINT fk_batch_vch  FOREIGN KEY (vch_id)       REFERENCES vch_details(id)        ON DELETE CASCADE,
  CONSTRAINT fk_batch_inv  FOREIGN KEY (inventory_id) REFERENCES inventory_entries(id)  ON DELETE CASCADE,
  CONSTRAINT fk_batch_item FOREIGN KEY (item_id)      REFERENCES item_master(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Idempotent: add shipment_no on existing batch tables (migration 007).
-- The bilty form collects this per-line; missing column was silently dropping
-- the value on save and returning nothing on read.
SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name   = 'batch'
     AND column_name  = 'shipment_no'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE batch ADD COLUMN shipment_no VARCHAR(64) NULL AFTER e_rate',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 10) Bill allocation. Open balance per (ledger, billname) = SUM(amount); zero = settled.
CREATE TABLE IF NOT EXISTS bill_allocation (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vchid INT UNSIGNED NOT NULL,
  ledentry_id INT UNSIGNED NULL,
  ledger INT UNSIGNED NULL,
  billname VARCHAR(255) NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bill_allocation_vchid (vchid),
  INDEX idx_bill_allocation_ledentry (ledentry_id),
  INDEX idx_bill_allocation_billname (billname),
  INDEX idx_bill_allocation_ledger (ledger),
  CONSTRAINT fk_bill_allocation_vch      FOREIGN KEY (vchid)       REFERENCES vch_details(id)    ON DELETE CASCADE,
  CONSTRAINT fk_bill_allocation_ledentry FOREIGN KEY (ledentry_id) REFERENCES ledger_entries(id) ON DELETE SET NULL,
  CONSTRAINT fk_bill_allocation_ledger   FOREIGN KEY (ledger)      REFERENCES ledger_master(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- Item Group & Item Category — hierarchical masters mirroring ledger_group.
-- Both are self-FK'd to support a single-level "Primary" parent semantics.
-- ============================================================================

CREATE TABLE IF NOT EXISTS item_group (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_name VARCHAR(64) NOT NULL,
  parent_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_item_group_name (group_name),
  INDEX idx_item_group_parent (parent_id),
  CONSTRAINT fk_item_group_parent FOREIGN KEY (parent_id) REFERENCES item_group(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS item_category (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(64) NOT NULL,
  parent_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_item_category_name (category_name),
  INDEX idx_item_category_parent (parent_id),
  CONSTRAINT fk_item_category_parent FOREIGN KEY (parent_id) REFERENCES item_category(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================================
-- Idempotent: link item_master to item_group and item_category.
-- ============================================================================
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'item_master' AND column_name = 'item_group_id');
SET @sql := IF(@col = 0, 'ALTER TABLE item_master ADD COLUMN item_group_id INT UNSIGNED NULL AFTER name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'item_master' AND column_name = 'item_category_id');
SET @sql := IF(@col = 0, 'ALTER TABLE item_master ADD COLUMN item_category_id INT UNSIGNED NULL AFTER item_group_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'item_master' AND index_name = 'idx_item_master_group');
SET @sql := IF(@idx = 0, 'ALTER TABLE item_master ADD INDEX idx_item_master_group (item_group_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'item_master' AND index_name = 'idx_item_master_category');
SET @sql := IF(@idx = 0, 'ALTER TABLE item_master ADD INDEX idx_item_master_category (item_category_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'item_master' AND constraint_name = 'fk_item_master_group');
SET @sql := IF(@fk = 0, 'ALTER TABLE item_master ADD CONSTRAINT fk_item_master_group FOREIGN KEY (item_group_id) REFERENCES item_group(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'item_master' AND constraint_name = 'fk_item_master_category');
SET @sql := IF(@fk = 0, 'ALTER TABLE item_master ADD CONSTRAINT fk_item_master_category FOREIGN KEY (item_category_id) REFERENCES item_category(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
