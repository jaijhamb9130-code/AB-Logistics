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
-- Phase 5 — Orders & Vehicles (ORDER-01..04, VEHICLE-01..03).
-- Vehicles are an independent fleet entity; orders optionally reference a
-- vehicle via vehicle_id (FK → vehicles.id, NULLable). order_no is generated
-- server-side as 'OR-YYYY-NNNNNN' (same per-year sequence pattern as bilty_no
-- / memo_no — next-value computed transactionally with FOR UPDATE).
-- Status pipeline is enforced at the model layer; pending → in_progress →
-- completed is the only legal forward path.
-- ============================================================================

CREATE TABLE IF NOT EXISTS vehicles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_no VARCHAR(64) NOT NULL UNIQUE,
  vehicle_type VARCHAR(64) NULL,
  owner_name VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vehicles_vehicle_no (vehicle_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(32) NOT NULL UNIQUE,
  order_date DATE NULL,
  customer_name VARCHAR(255) NOT NULL,
  from_loc VARCHAR(128) NULL,
  to_loc VARCHAR(128) NULL,
  goods_desc VARCHAR(255) NULL,
  status ENUM('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
  vehicle_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_order_no (order_no),
  INDEX idx_orders_status (status),
  INDEX idx_orders_vehicle_id (vehicle_id),
  CONSTRAINT fk_orders_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- Phase 6 — Customers (CUST-01..04).
-- customer_no: CUS-YYYY-NNNNNN, auto-generated server-side.
-- orders.customer_id FK added idempotently below.
-- ============================================================================

CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_no VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(32) NULL,
  address VARCHAR(512) NULL,
  city VARCHAR(128) NULL,
  state VARCHAR(128) NULL,
  pincode VARCHAR(16) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_name (name),
  CONSTRAINT fk_customers_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Idempotent: add customer_id FK to orders.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'customer_id');
SET @sql := IF(@col = 0, 'ALTER TABLE orders ADD COLUMN customer_id INT UNSIGNED NULL AFTER customer_name, ADD INDEX idx_orders_customer_id (customer_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Idempotent: add FK constraint for orders.customer_id (separate step — constraint may not exist even if column does).
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND CONSTRAINT_NAME = 'fk_orders_customer');
SET @sql := IF(@fk = 0, 'ALTER TABLE orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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

