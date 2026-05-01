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
-- Phase 3 — Bilty module (BILTY-01..08, BE-01, BE-02, BE-03).
-- Tables are created idempotently so re-running init-db.js is safe.
-- Child tables FK → bilty(id) ON DELETE CASCADE so a bilty delete is clean.
-- ============================================================================

CREATE TABLE IF NOT EXISTS bilty (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bilty_no VARCHAR(32) NOT NULL UNIQUE,
  bilty_date DATE NULL,
  consignor VARCHAR(255) NOT NULL,
  owner_name VARCHAR(255) NULL,
  agent_name VARCHAR(255) NULL,
  branch VARCHAR(128) NULL,
  zone_name VARCHAR(128) NULL,
  truck_no VARCHAR(64) NOT NULL,
  goods_type VARCHAR(128) NULL,
  truck_type VARCHAR(64) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  INDEX idx_bilty_bilty_no (bilty_no),
  INDEX idx_bilty_created_by (created_by),
  CONSTRAINT fk_bilty_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bilty_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bilty_id INT UNSIGNED NOT NULL,
  challan_no VARCHAR(64) NULL,
  lr_no VARCHAR(64) NULL,
  from_loc VARCHAR(128) NULL,
  to_loc VARCHAR(128) NULL,
  consignee VARCHAR(255) NULL,
  qty DECIMAL(12,2) NOT NULL DEFAULT 0,
  rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  inc_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  l_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  e_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  INDEX idx_bilty_items_bilty_id (bilty_id),
  CONSTRAINT fk_bilty_items_bilty FOREIGN KEY (bilty_id) REFERENCES bilty(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS advance_details (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bilty_id INT UNSIGNED NOT NULL,
  adv_date DATE NULL,
  adv_from VARCHAR(128) NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  narration VARCHAR(255) NULL,
  INDEX idx_advance_details_bilty_id (bilty_id),
  CONSTRAINT fk_advance_details_bilty FOREIGN KEY (bilty_id) REFERENCES bilty(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fuel_details (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bilty_id INT UNSIGNED NOT NULL,
  from_loc VARCHAR(128) NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  doc_no VARCHAR(64) NULL,
  doc_date DATE NULL,
  INDEX idx_fuel_details_bilty_id (bilty_id),
  CONSTRAINT fk_fuel_details_bilty FOREIGN KEY (bilty_id) REFERENCES bilty(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  advance_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  fuel_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_payable DECIMAL(12,2) NOT NULL DEFAULT 0,
  generated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  is_stale TINYINT(1) NOT NULL DEFAULT 0,
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

-- Idempotent: add version to bilty for existing databases.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'bilty' AND column_name = 'version');
SET @sql := IF(@col = 0, 'ALTER TABLE bilty ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Idempotent: add version + is_stale to freight_memo for existing databases.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'freight_memo' AND column_name = 'version');
SET @sql := IF(@col = 0, 'ALTER TABLE freight_memo ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'freight_memo' AND column_name = 'is_stale');
SET @sql := IF(@col = 0, 'ALTER TABLE freight_memo ADD COLUMN is_stale TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
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
  INDEX idx_ledger_group_parent (parent_id),
  CONSTRAINT fk_ledger_group_parent FOREIGN KEY (parent_id) REFERENCES ledger_group(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed initial top-level groups (id=1,2,3 fixed)
INSERT IGNORE INTO ledger_group (id, group_name, parent_id) VALUES (1, 'party', NULL);
INSERT IGNORE INTO ledger_group (id, group_name, parent_id) VALUES (2, 'owner', NULL);
INSERT IGNORE INTO ledger_group (id, group_name, parent_id) VALUES (3, 'agent', NULL);

-- party_ledger: shared table for Party / Owner / Agent (differentiated by ledger_group_id)
CREATE TABLE IF NOT EXISTS party_ledger (
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
  INDEX idx_party_ledger_group (ledger_group_id),
  INDEX idx_party_ledger_name (name),
  INDEX idx_party_ledger_tally (tally_master_id),
  CONSTRAINT fk_party_ledger_group FOREIGN KEY (ledger_group_id) REFERENCES ledger_group(id),
  CONSTRAINT fk_party_ledger_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migration: rename type -> ledger_group_id if needed (for older installations)
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'party_ledger' AND column_name = 'type');
-- If column 'type' exists, it means we need to migrate.
-- 1. First convert string values to IDs while it's still a string/enum column
SET @type := (SELECT DATA_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'party_ledger' AND column_name = 'type');
SET @sql := IF(@type IN ('enum','varchar','char'), 'UPDATE party_ledger SET type = CASE WHEN type = ''party'' THEN ''1'' WHEN type = ''owner'' THEN ''2'' WHEN type = ''agent'' THEN ''3'' ELSE type END', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- 2. Then rename and change type
SET @sql := IF(@col > 0, 'ALTER TABLE party_ledger CHANGE COLUMN type ledger_group_id INT UNSIGNED NOT NULL', 'SELECT 1');
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

-- 5) vehicle_master: trucks with ownership / permit / driver details
-- name = truck registration number (plate); UNIQUE so autocomplete returns each truck once.
CREATE TABLE IF NOT EXISTS vehicle_master (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  vehicle_type VARCHAR(64) NULL,
  owner_name VARCHAR(255) NULL,
  owner_mobile VARCHAR(15) NULL,
  owner_pan VARCHAR(15) NULL,
  chassis_no VARCHAR(64) NULL,
  permit_no VARCHAR(64) NULL,
  validity_date DATE NULL,
  driver_name VARCHAR(255) NULL,
  driver_mobile VARCHAR(15) NULL,
  tally_master_id VARCHAR(64) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vehicle_master_name (name),
  INDEX idx_vehicle_master_tally (tally_master_id),
  CONSTRAINT fk_vehicle_master_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
-- for the FK constraint on party_ledger.ledger_group_id.
--
-- Cleanup: drop the previously-attempted `ledger_groups` (plural) table and
-- its FK if they were ever created on this database. Both steps are
-- idempotent — safe to re-run.
-- ============================================================================

-- 1) Drop the old FK that pointed to the plural `ledger_groups` table.
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'party_ledger'
               AND CONSTRAINT_NAME = 'fk_party_ledger_group');
SET @sql := IF(@fk = 1,
  'ALTER TABLE party_ledger DROP FOREIGN KEY fk_party_ledger_group',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Drop the old plural `ledger_groups` table if it exists.
DROP TABLE IF EXISTS ledger_groups;

-- 3) Add FK from party_ledger.ledger_group_id → ledger_group.id (singular,
--    Docker-managed). ON DELETE RESTRICT blocks removing a group that's
--    still referenced. Idempotent.
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'party_ledger'
               AND CONSTRAINT_NAME = 'fk_party_ledger_to_ledger_group');
SET @t := (SELECT COUNT(*) FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ledger_group');
SET @sql := IF(@fk = 0 AND @t = 1,
  'ALTER TABLE party_ledger ADD CONSTRAINT fk_party_ledger_to_ledger_group FOREIGN KEY (ledger_group_id) REFERENCES ledger_group(id) ON DELETE RESTRICT',
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

-- 2) Extend party_ledger: billbybill flag + opening balance.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'party_ledger' AND column_name = 'billbybill');
SET @sql := IF(@col = 0, 'ALTER TABLE party_ledger ADD COLUMN billbybill ENUM(''Yes'',''No'') NOT NULL DEFAULT ''No'' AFTER ledger_group_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- party group (id=1) is Sundry Debtors equivalent — flip billbybill=Yes once.
UPDATE party_ledger SET billbybill = 'Yes' WHERE ledger_group_id = 1 AND billbybill = 'No';

SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'party_ledger' AND column_name = 'opening_balance');
SET @sql := IF(@col = 0, 'ALTER TABLE party_ledger ADD COLUMN opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'party_ledger' AND column_name = 'opening_balance_type');
SET @sql := IF(@col = 0, 'ALTER TABLE party_ledger ADD COLUMN opening_balance_type ENUM(''Dr'',''Cr'') NOT NULL DEFAULT ''Dr''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Seed system ledgers (Sales, Purchase, CGST, SGST, IGST, Roundoff). Idempotent.
INSERT INTO party_ledger (ledger_group_id, name, billbybill)
SELECT 4, 'Sales',    'No' WHERE NOT EXISTS (SELECT 1 FROM party_ledger WHERE name = 'Sales'    AND ledger_group_id = 4);
INSERT INTO party_ledger (ledger_group_id, name, billbybill)
SELECT 5, 'Purchase', 'No' WHERE NOT EXISTS (SELECT 1 FROM party_ledger WHERE name = 'Purchase' AND ledger_group_id = 5);
INSERT INTO party_ledger (ledger_group_id, name, billbybill)
SELECT 6, 'CGST',     'No' WHERE NOT EXISTS (SELECT 1 FROM party_ledger WHERE name = 'CGST'     AND ledger_group_id = 6);
INSERT INTO party_ledger (ledger_group_id, name, billbybill)
SELECT 6, 'SGST',     'No' WHERE NOT EXISTS (SELECT 1 FROM party_ledger WHERE name = 'SGST'     AND ledger_group_id = 6);
INSERT INTO party_ledger (ledger_group_id, name, billbybill)
SELECT 6, 'IGST',     'No' WHERE NOT EXISTS (SELECT 1 FROM party_ledger WHERE name = 'IGST'     AND ledger_group_id = 6);
INSERT INTO party_ledger (ledger_group_id, name, billbybill)
SELECT 7, 'Roundoff', 'No' WHERE NOT EXISTS (SELECT 1 FROM party_ledger WHERE name = 'Roundoff' AND ledger_group_id = 7);

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

-- 6) Voucher header — one row per voucher.
CREATE TABLE IF NOT EXISTS vch_details (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vch_type_id INT UNSIGNED NULL,
  vch_no VARCHAR(100) NULL,
  vch_date DATE NULL,
  party_ledger_id INT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  remark TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vch_details_type (vch_type_id),
  INDEX idx_vch_details_date (vch_date),
  INDEX idx_vch_details_party (party_ledger_id),
  CONSTRAINT fk_vch_details_type       FOREIGN KEY (vch_type_id)     REFERENCES vchtype(id)      ON DELETE SET NULL,
  CONSTRAINT fk_vch_details_party      FOREIGN KEY (party_ledger_id) REFERENCES party_ledger(id),
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
  CONSTRAINT fk_ledger_entries_ledger FOREIGN KEY (ledger_id) REFERENCES party_ledger(id) ON DELETE SET NULL
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
  CONSTRAINT fk_bill_allocation_ledger   FOREIGN KEY (ledger)      REFERENCES party_ledger(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

