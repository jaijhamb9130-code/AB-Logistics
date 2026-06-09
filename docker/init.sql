-- ============================================================================
-- AB Logistics — Fresh Docker Init
-- Reflects the FINAL schema after all migrations + ensureSchema.js columns.
-- Run order: schema first, seeds second.
-- After `docker compose up`, seed admin user: cd backend && node src/db/init-db.js
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED      AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)       NOT NULL UNIQUE,
  password_hash VARCHAR(255)      NOT NULL,
  role          ENUM('admin','staff') NOT NULL DEFAULT 'staff',
  permissions   JSON              NOT NULL,
  is_active     TINYINT(1)        NOT NULL DEFAULT 1,
  created_at    DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- LEDGER GROUP  (Tally-style hierarchical account groups)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger_group (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_name   VARCHAR(64)  NOT NULL,
  parent_id    INT UNSIGNED NULL,
  is_system    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ledger_group_name (group_name),
  INDEX idx_ledger_group_parent (parent_id),
  CONSTRAINT fk_ledger_group_parent
    FOREIGN KEY (parent_id) REFERENCES ledger_group(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- LEDGER MASTER  (Party / Owner / Agent — differentiated by ledger_group_id)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger_master (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ledger_group_id      INT UNSIGNED NOT NULL,
  billbybill           ENUM('Yes','No') NOT NULL DEFAULT 'No',
  name                 VARCHAR(255) NOT NULL,
  gst_no               VARCHAR(20)  NULL,
  pan_no               VARCHAR(15)  NULL,
  address              VARCHAR(512) NULL,
  city                 VARCHAR(128) NULL,
  state                VARCHAR(128) NULL,
  country              VARCHAR(128) NULL,
  pincode              VARCHAR(16)  NULL,
  tally_master_id      VARCHAR(64)  NULL,
  opening_balance      DECIMAL(14,2) NOT NULL DEFAULT 0,
  opening_balance_type ENUM('Dr','Cr') NOT NULL DEFAULT 'Dr',
  mobile               VARCHAR(15)  NULL,
  commission_pct       DECIMAL(5,2) NULL,
  created_by           INT UNSIGNED NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ledger_master_group (ledger_group_id),
  INDEX idx_ledger_master_name (name),
  INDEX idx_ledger_master_tally (tally_master_id),
  CONSTRAINT fk_ledger_master_group
    FOREIGN KEY (ledger_group_id) REFERENCES ledger_group(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ledger_master_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- ITEM GROUP & ITEM CATEGORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS item_group (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_name   VARCHAR(64)  NOT NULL,
  parent_id    INT UNSIGNED NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_item_group_name (group_name),
  INDEX idx_item_group_parent (parent_id),
  CONSTRAINT fk_item_group_parent
    FOREIGN KEY (parent_id) REFERENCES item_group(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS item_category (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(64)  NOT NULL,
  parent_id     INT UNSIGNED NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_item_category_name (category_name),
  INDEX idx_item_category_parent (parent_id),
  CONSTRAINT fk_item_category_parent
    FOREIGN KEY (parent_id) REFERENCES item_category(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- ITEM MASTER
-- ============================================================================
CREATE TABLE IF NOT EXISTS item_master (
  id               INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(255)  NOT NULL,
  item_group_id    INT UNSIGNED  NULL,
  item_category_id INT UNSIGNED  NULL,
  hsn_code         VARCHAR(20)   NULL,
  gst_rate         DECIMAL(5,2)  NULL,
  tally_master_id  VARCHAR(64)   NULL,
  batch            ENUM('Yes','No') NOT NULL DEFAULT 'No',
  opening_qty      DECIMAL(12,3) NOT NULL DEFAULT 0,
  opening_rate     DECIMAL(14,2) NOT NULL DEFAULT 0,
  opening_value    DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_by       INT UNSIGNED  NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_item_master_name (name),
  INDEX idx_item_master_tally (tally_master_id),
  INDEX idx_item_master_group (item_group_id),
  INDEX idx_item_master_category (item_category_id),
  CONSTRAINT fk_item_master_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_item_master_group
    FOREIGN KEY (item_group_id) REFERENCES item_group(id) ON DELETE SET NULL,
  CONSTRAINT fk_item_master_category
    FOREIGN KEY (item_category_id) REFERENCES item_category(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- DESTINATION MASTER
-- ============================================================================
CREATE TABLE IF NOT EXISTS destination_master (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch          VARCHAR(255) NULL,
  name            VARCHAR(255) NOT NULL,
  city            VARCHAR(128) NULL,
  state           VARCHAR(128) NULL,
  pincode         VARCHAR(16)  NULL,
  tally_master_id VARCHAR(64)  NULL,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_destination_master_branch (branch),
  INDEX idx_destination_master_name (name),
  INDEX idx_destination_master_tally (tally_master_id),
  CONSTRAINT fk_destination_master_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- BRANCH MASTER  (bilty branches / company branches)
-- ============================================================================
CREATE TABLE IF NOT EXISTS branch_master (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL UNIQUE,
  created_by INT UNSIGNED NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_branch_master_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- VOUCHER TYPE MASTER  (Tally-style vchtype)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vchtype (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  parent_id      INT UNSIGNED NULL,
  deemed_positive ENUM('YES','NO') NULL DEFAULT NULL,
  is_system      TINYINT(1)   NOT NULL DEFAULT 0,
  prefix         VARCHAR(16)  NULL DEFAULT NULL,
  branch         VARCHAR(128) NULL DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vchtype_name (name),
  INDEX idx_vchtype_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- VEHICLE MASTER  (versioned owner+vehicle tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_master (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_no       VARCHAR(64)  NOT NULL,
  vehicle_type     VARCHAR(64)  NULL,
  ledger_group_id  INT UNSIGNED NULL,
  ledger_master_id INT UNSIGNED NULL,
  mobile           VARCHAR(15)  NULL,
  gst_no           VARCHAR(20)  NULL,
  pan_no           VARCHAR(15)  NULL,
  address          VARCHAR(512) NULL,
  city             VARCHAR(128) NULL,
  state            VARCHAR(128) NULL,
  pincode          VARCHAR(16)  NULL,
  is_current       TINYINT(1)   NOT NULL DEFAULT 1,
  created_by       INT UNSIGNED NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vehicle_master_no (vehicle_no),
  INDEX idx_vehicle_master_current (vehicle_no, is_current),
  CONSTRAINT fk_vehicle_master_group
    FOREIGN KEY (ledger_group_id) REFERENCES ledger_group(id),
  CONSTRAINT fk_vehicle_master_ledger
    FOREIGN KEY (ledger_master_id) REFERENCES ledger_master(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- VOUCHER DETAILS  (one row per voucher header — bilty, sales, payment, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vch_details (
  id               INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  vch_type_id      INT UNSIGNED  NULL,
  vch_no           VARCHAR(100)  NULL,
  vch_date         DATE          NULL,
  branch_id        INT UNSIGNED  NULL,
  ledger_master_id INT UNSIGNED  NOT NULL,
  agent_id         INT UNSIGNED  NULL,
  bill_to_id       INT UNSIGNED  NULL,
  owner_name       VARCHAR(255)  NULL,
  vehicle_id       INT UNSIGNED  NULL,
  goods_type_id    INT UNSIGNED  NULL,
  amount           DECIMAL(14,2) NOT NULL DEFAULT 0,
  remark           TEXT          NULL,
  parent_vch_id    INT UNSIGNED  NULL,
  bilty_mode       TINYINT       NULL DEFAULT NULL,
  bilty_id         INT UNSIGNED  NULL DEFAULT NULL,
  created_by       INT UNSIGNED  NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vch_details_type_no (vch_type_id, vch_no),
  INDEX idx_vch_details_type (vch_type_id),
  INDEX idx_vch_details_date (vch_date),
  INDEX idx_vch_details_ledger (ledger_master_id),
  INDEX idx_vch_details_agent (agent_id),
  INDEX idx_vch_details_bill_to (bill_to_id),
  INDEX idx_vch_details_vehicle (vehicle_id),
  INDEX idx_vch_details_goods_type (goods_type_id),
  INDEX idx_vch_details_branch (branch_id),
  CONSTRAINT fk_vch_details_type
    FOREIGN KEY (vch_type_id) REFERENCES vchtype(id) ON DELETE SET NULL,
  CONSTRAINT fk_vch_details_ledger
    FOREIGN KEY (ledger_master_id) REFERENCES ledger_master(id),
  CONSTRAINT fk_vch_details_agent
    FOREIGN KEY (agent_id) REFERENCES ledger_master(id) ON DELETE SET NULL,
  CONSTRAINT fk_vch_details_billto
    FOREIGN KEY (bill_to_id) REFERENCES ledger_master(id) ON DELETE SET NULL,
  CONSTRAINT fk_vch_details_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES ledger_master(id) ON DELETE SET NULL,
  CONSTRAINT fk_vch_details_goods_type
    FOREIGN KEY (goods_type_id) REFERENCES item_master(id) ON DELETE SET NULL,
  CONSTRAINT fk_vch_details_branch
    FOREIGN KEY (branch_id) REFERENCES branch_master(id) ON DELETE SET NULL,
  CONSTRAINT fk_vch_details_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Self-referential FKs added after table exists
ALTER TABLE vch_details
  ADD CONSTRAINT fk_vch_details_parent
    FOREIGN KEY (parent_vch_id) REFERENCES vch_details(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_vch_details_bilty
    FOREIGN KEY (bilty_id) REFERENCES vch_details(id) ON DELETE SET NULL;

-- ============================================================================
-- LEDGER ENTRIES  (signed Dr/Cr lines; SUM per vch_id = 0)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger_entries (
  id         INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  vch_id     INT UNSIGNED  NULL,
  ledger_id  INT UNSIGNED  NULL,
  amount     DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ledger_entries_vch (vch_id),
  INDEX idx_ledger_entries_ledger (ledger_id),
  CONSTRAINT fk_ledger_entries_vch
    FOREIGN KEY (vch_id) REFERENCES vch_details(id) ON DELETE CASCADE,
  CONSTRAINT fk_ledger_entries_ledger
    FOREIGN KEY (ledger_id) REFERENCES ledger_master(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- INVENTORY ENTRIES  (goods rollup per ledger entry)
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_entries (
  id         INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  led_id     INT UNSIGNED  NULL,
  item_id    INT UNSIGNED  NOT NULL,
  qty        DECIMAL(10,3) NOT NULL DEFAULT 1,
  rate       DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount     DECIMAL(14,2) NOT NULL DEFAULT 0,
  gst_rate   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inventory_entries_led (led_id),
  INDEX idx_inventory_entries_item (item_id),
  CONSTRAINT fk_inventory_entries_led
    FOREIGN KEY (led_id) REFERENCES ledger_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_entries_item
    FOREIGN KEY (item_id) REFERENCES item_master(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- BATCH  (bilty line items: one row per item per voucher)
-- ============================================================================
CREATE TABLE IF NOT EXISTS batch (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  vch_id       INT UNSIGNED  NULL,
  inventory_id INT UNSIGNED  NULL,
  item_id      INT UNSIGNED  NOT NULL,
  consignee_id INT UNSIGNED  NULL,
  batch_no     VARCHAR(255)  NULL,
  challan_no   VARCHAR(64)   NULL,
  lr_no        VARCHAR(64)   NULL,
  from_loc     VARCHAR(128)  NULL,
  to_loc       VARCHAR(128)  NULL,
  qty          DECIMAL(10,3) NOT NULL DEFAULT 1,
  rate         DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount       DECIMAL(14,2) NOT NULL DEFAULT 0,
  inc_rate     DECIMAL(12,2) NOT NULL DEFAULT 0,
  l_rate       DECIMAL(12,2) NOT NULL DEFAULT 0,
  e_rate       DECIMAL(12,2) NOT NULL DEFAULT 0,
  shipment_no  VARCHAR(64)   NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_batch_vch (vch_id),
  INDEX idx_batch_inv (inventory_id),
  INDEX idx_batch_item (item_id),
  INDEX idx_batch_consignee (consignee_id),
  CONSTRAINT fk_batch_vch
    FOREIGN KEY (vch_id) REFERENCES vch_details(id) ON DELETE CASCADE,
  CONSTRAINT fk_batch_inv
    FOREIGN KEY (inventory_id) REFERENCES inventory_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_batch_item
    FOREIGN KEY (item_id) REFERENCES item_master(id),
  CONSTRAINT fk_batch_consignee
    FOREIGN KEY (consignee_id) REFERENCES ledger_master(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- BILL ALLOCATION  (open-bill tracking per ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bill_allocation (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  vchid       INT UNSIGNED  NOT NULL,
  ledentry_id INT UNSIGNED  NULL,
  ledger      INT UNSIGNED  NULL,
  billname    VARCHAR(255)  NULL,
  amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bill_allocation_vchid (vchid),
  INDEX idx_bill_allocation_ledentry (ledentry_id),
  INDEX idx_bill_allocation_billname (billname),
  INDEX idx_bill_allocation_ledger (ledger),
  CONSTRAINT fk_bill_allocation_vch
    FOREIGN KEY (vchid) REFERENCES vch_details(id) ON DELETE CASCADE,
  CONSTRAINT fk_bill_allocation_ledentry
    FOREIGN KEY (ledentry_id) REFERENCES ledger_entries(id) ON DELETE SET NULL,
  CONSTRAINT fk_bill_allocation_ledger
    FOREIGN KEY (ledger) REFERENCES ledger_master(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  action      ENUM('CREATE','UPDATE','DELETE','GENERATE') NOT NULL,
  entity_type VARCHAR(64)  NOT NULL,
  entity_id   INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NULL,
  before_json JSON         NULL,
  after_json  JSON         NULL,
  ip_address  VARCHAR(45)  NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_created (created_at),
  CONSTRAINT fk_audit_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- FREIGHT MEMO  (derived from bilty; one memo per bilty/vch)
-- ============================================================================
CREATE TABLE IF NOT EXISTS freight_memo (
  id            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  memo_no       VARCHAR(32)   NOT NULL UNIQUE,
  vch_id        INT UNSIGNED  NOT NULL UNIQUE,
  memo_date     DATE          NULL,
  freight_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_payable   DECIMAL(12,2) NOT NULL DEFAULT 0,
  generated_by  INT UNSIGNED  NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_freight_memo_vch_id (vch_id),
  INDEX idx_freight_memo_memo_no (memo_no),
  CONSTRAINT fk_freight_memo_vch
    FOREIGN KEY (vch_id) REFERENCES vch_details(id) ON DELETE CASCADE,
  CONSTRAINT fk_freight_memo_generated_by
    FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- SEEDS — System / permanent data
-- ============================================================================

-- 28 standard Tally ledger groups (non-editable, is_system = 1).
-- Step 1: insert the 15 primary groups (always top-level, parent_id = NULL).
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system) VALUES
  ('Branch / Divisions',     NULL, 1),
  ('Capital Account',        NULL, 1),
  ('Current Assets',         NULL, 1),
  ('Current Liabilities',    NULL, 1),
  ('Direct Expenses',        NULL, 1),
  ('Direct Incomes',         NULL, 1),
  ('Fixed Assets',           NULL, 1),
  ('Indirect Expenses',      NULL, 1),
  ('Indirect Incomes',       NULL, 1),
  ('Investments',            NULL, 1),
  ('Loans (Liability)',      NULL, 1),
  ('Misc. Expenses (ASSET)', NULL, 1),
  ('Purchase Accounts',      NULL, 1),
  ('Sales Accounts',         NULL, 1),
  ('Suspense A/c',           NULL, 1);

-- Step 2: insert the 13 Tally sub-groups with the correct primary parent.
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Reserves & Surplus', id, 1 FROM ledger_group WHERE group_name = 'Capital Account' LIMIT 1;
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Bank Accounts', id, 1 FROM ledger_group WHERE group_name = 'Current Assets' LIMIT 1;
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Cash-in-Hand', id, 1 FROM ledger_group WHERE group_name = 'Current Assets' LIMIT 1;
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Deposits (Asset)', id, 1 FROM ledger_group WHERE group_name = 'Current Assets' LIMIT 1;
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Loans & Advances (Asset)', id, 1 FROM ledger_group WHERE group_name = 'Current Assets' LIMIT 1;
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Stock-in-Hand', id, 1 FROM ledger_group WHERE group_name = 'Current Assets' LIMIT 1;
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Sundry Debtors', id, 1 FROM ledger_group WHERE group_name = 'Current Assets' LIMIT 1;
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Duties & Taxes', id, 1 FROM ledger_group WHERE group_name = 'Current Liabilities' LIMIT 1;
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Provisions', id, 1 FROM ledger_group WHERE group_name = 'Current Liabilities' LIMIT 1;
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Sundry Creditors', id, 1 FROM ledger_group WHERE group_name = 'Current Liabilities' LIMIT 1;
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Bank OD A/c', id, 1 FROM ledger_group WHERE group_name = 'Loans (Liability)' LIMIT 1;
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Secured Loans', id, 1 FROM ledger_group WHERE group_name = 'Loans (Liability)' LIMIT 1;
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Unsecured Loans', id, 1 FROM ledger_group WHERE group_name = 'Loans (Liability)' LIMIT 1;

-- User-created sub-groups under Sundry Creditors (owner / agent / Vehicles)
INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Owner',
         (SELECT id FROM ledger_group WHERE group_name = 'Sundry Creditors' LIMIT 1),
         0
  WHERE NOT EXISTS (SELECT 1 FROM ledger_group WHERE group_name = 'Owner');

INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Agent',
         (SELECT id FROM ledger_group WHERE group_name = 'Sundry Creditors' LIMIT 1),
         0
  WHERE NOT EXISTS (SELECT 1 FROM ledger_group WHERE group_name = 'Agent');

INSERT IGNORE INTO ledger_group (group_name, parent_id, is_system)
  SELECT 'Vehicles',
         (SELECT id FROM ledger_group WHERE group_name = 'Sundry Creditors' LIMIT 1),
         0
  WHERE NOT EXISTS (SELECT 1 FROM ledger_group WHERE group_name = 'Vehicles');

-- 9 system voucher types (Tally standard + Bilty)
INSERT IGNORE INTO vchtype (name, deemed_positive, is_system)
  SELECT 'Sales',       'YES', 1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Sales'       AND is_system = 1);
INSERT IGNORE INTO vchtype (name, deemed_positive, is_system)
  SELECT 'Purchase',    'NO',  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Purchase'    AND is_system = 1);
INSERT IGNORE INTO vchtype (name, deemed_positive, is_system)
  SELECT 'Receipt',     NULL,  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Receipt'     AND is_system = 1);
INSERT IGNORE INTO vchtype (name, deemed_positive, is_system)
  SELECT 'Payment',     NULL,  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Payment'     AND is_system = 1);
INSERT IGNORE INTO vchtype (name, deemed_positive, is_system)
  SELECT 'Journal',     NULL,  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Journal'     AND is_system = 1);
INSERT IGNORE INTO vchtype (name, deemed_positive, is_system)
  SELECT 'Contra',      NULL,  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Contra'      AND is_system = 1);
INSERT IGNORE INTO vchtype (name, deemed_positive, is_system)
  SELECT 'Debit Note',  'YES', 1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Debit Note'  AND is_system = 1);
INSERT IGNORE INTO vchtype (name, deemed_positive, is_system)
  SELECT 'Credit Note', 'NO',  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Credit Note' AND is_system = 1);
INSERT IGNORE INTO vchtype (name, deemed_positive, is_system)
  SELECT 'Bilty',       NULL,  1 WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Bilty'       AND is_system = 1);

-- Self-parent for all system types (Tally convention)
UPDATE vchtype SET parent_id = id WHERE is_system = 1 AND parent_id IS NULL;

-- System ledgers: Sales, Purchase, CGST, SGST, IGST, Roundoff
INSERT INTO ledger_master (ledger_group_id, name, billbybill)
  SELECT id, 'Sales', 'No' FROM ledger_group WHERE group_name = 'Sales Accounts' LIMIT 1
  ON DUPLICATE KEY UPDATE name = name;

INSERT INTO ledger_master (ledger_group_id, name, billbybill)
  SELECT id, 'Purchase', 'No' FROM ledger_group WHERE group_name = 'Purchase Accounts' LIMIT 1
  ON DUPLICATE KEY UPDATE name = name;

INSERT INTO ledger_master (ledger_group_id, name, billbybill)
  SELECT id, 'CGST', 'No' FROM ledger_group WHERE group_name = 'Duties & Taxes' LIMIT 1
  ON DUPLICATE KEY UPDATE name = name;

INSERT INTO ledger_master (ledger_group_id, name, billbybill)
  SELECT id, 'SGST', 'No' FROM ledger_group WHERE group_name = 'Duties & Taxes' LIMIT 1
  ON DUPLICATE KEY UPDATE name = name;

INSERT INTO ledger_master (ledger_group_id, name, billbybill)
  SELECT id, 'IGST', 'No' FROM ledger_group WHERE group_name = 'Duties & Taxes' LIMIT 1
  ON DUPLICATE KEY UPDATE name = name;

INSERT INTO ledger_master (ledger_group_id, name, billbybill)
  SELECT id, 'Roundoff', 'No' FROM ledger_group WHERE group_name = 'Indirect Incomes' LIMIT 1
  ON DUPLICATE KEY UPDATE name = name;
