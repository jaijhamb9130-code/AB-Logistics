-- AB Logistics — Clean schema import for phpMyAdmin
-- Generated: 2026-05-05
-- Import this file into an EMPTY database named `ab_logistics`
-- All 20 tables, seed data only (no transaction records).
-- Login after import: admin / Admin@1234

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ─── Drop all tables (reverse FK order) ──────────────────────────────────────
DROP TABLE IF EXISTS `bill_allocation`;
DROP TABLE IF EXISTS `batch`;
DROP TABLE IF EXISTS `inventory_entries`;
DROP TABLE IF EXISTS `ledger_entries`;
DROP TABLE IF EXISTS `vch_details`;
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `freight_memo`;
DROP TABLE IF EXISTS `bilty_items`;
DROP TABLE IF EXISTS `bilty`;
DROP TABLE IF EXISTS `vehicle_master`;
DROP TABLE IF EXISTS `destination_master`;
DROP TABLE IF EXISTS `item_master`;
DROP TABLE IF EXISTS `item_group`;
DROP TABLE IF EXISTS `item_category`;
DROP TABLE IF EXISTS `ledger_master`;
DROP TABLE IF EXISTS `vchtype`;
DROP TABLE IF EXISTS `ledger_group`;
DROP TABLE IF EXISTS `users`;

-- ─── 1. users ─────────────────────────────────────────────────────────────────
CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','staff') NOT NULL DEFAULT 'staff',
  `permissions` json NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 2. ledger_group ──────────────────────────────────────────────────────────
CREATE TABLE `ledger_group` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `group_name` varchar(64) NOT NULL,
  `parent_id` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ledger_group_parent` (`parent_id`),
  CONSTRAINT `fk_ledger_group_parent` FOREIGN KEY (`parent_id`) REFERENCES `ledger_group` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 3. item_category ─────────────────────────────────────────────────────────
CREATE TABLE `item_category` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `category_name` varchar(64) NOT NULL,
  `parent_id` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_item_category_name` (`category_name`),
  KEY `idx_item_category_parent` (`parent_id`),
  CONSTRAINT `fk_item_category_parent` FOREIGN KEY (`parent_id`) REFERENCES `item_category` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 4. item_group ────────────────────────────────────────────────────────────
CREATE TABLE `item_group` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `group_name` varchar(64) NOT NULL,
  `parent_id` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_item_group_name` (`group_name`),
  KEY `idx_item_group_parent` (`parent_id`),
  CONSTRAINT `fk_item_group_parent` FOREIGN KEY (`parent_id`) REFERENCES `item_group` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 5. vchtype ───────────────────────────────────────────────────────────────
CREATE TABLE `vchtype` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `parent_id` int unsigned DEFAULT NULL,
  `deemed_positive` enum('YES','NO') DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vchtype_name` (`name`),
  KEY `idx_vchtype_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 6. item_master ───────────────────────────────────────────────────────────
CREATE TABLE `item_master` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `item_group_id` int unsigned DEFAULT NULL,
  `item_category_id` int unsigned DEFAULT NULL,
  `hsn_code` varchar(20) DEFAULT NULL,
  `gst_rate` decimal(5,2) DEFAULT NULL,
  `tally_master_id` varchar(64) DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `batch` enum('Yes','No') NOT NULL DEFAULT 'No',
  PRIMARY KEY (`id`),
  KEY `idx_item_master_name` (`name`),
  KEY `idx_item_master_tally` (`tally_master_id`),
  KEY `fk_item_master_created_by` (`created_by`),
  KEY `idx_item_master_group` (`item_group_id`),
  KEY `idx_item_master_category` (`item_category_id`),
  CONSTRAINT `fk_item_master_category` FOREIGN KEY (`item_category_id`) REFERENCES `item_category` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_item_master_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_item_master_group` FOREIGN KEY (`item_group_id`) REFERENCES `item_group` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 7. ledger_master ──────────────────────────────────────────────────────────
CREATE TABLE `ledger_master` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ledger_group_id` int unsigned NOT NULL,
  `billbybill` enum('Yes','No') NOT NULL DEFAULT 'No',
  `name` varchar(255) NOT NULL,
  `gst_no` varchar(20) DEFAULT NULL,
  `pan_no` varchar(15) DEFAULT NULL,
  `address` varchar(512) DEFAULT NULL,
  `city` varchar(128) DEFAULT NULL,
  `state` varchar(128) DEFAULT NULL,
  `country` varchar(128) DEFAULT NULL,
  `pincode` varchar(16) DEFAULT NULL,
  `tally_master_id` varchar(64) DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `opening_balance` decimal(14,2) NOT NULL DEFAULT '0.00',
  `opening_balance_type` enum('Dr','Cr') NOT NULL DEFAULT 'Dr',
  PRIMARY KEY (`id`),
  KEY `idx_ledger_master_group` (`ledger_group_id`),
  KEY `idx_ledger_master_name` (`name`),
  KEY `idx_ledger_master_tally` (`tally_master_id`),
  KEY `fk_ledger_master_created_by` (`created_by`),
  CONSTRAINT `fk_ledger_master_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ledger_master_to_ledger_group` FOREIGN KEY (`ledger_group_id`) REFERENCES `ledger_group` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 8. vehicle_master ────────────────────────────────────────────────────────
CREATE TABLE `vehicle_master` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `vehicle_type` varchar(64) DEFAULT NULL,
  `owner_name` varchar(255) DEFAULT NULL,
  `owner_mobile` varchar(15) DEFAULT NULL,
  `owner_pan` varchar(15) DEFAULT NULL,
  `chassis_no` varchar(64) DEFAULT NULL,
  `permit_no` varchar(64) DEFAULT NULL,
  `validity_date` date DEFAULT NULL,
  `driver_name` varchar(255) DEFAULT NULL,
  `driver_mobile` varchar(15) DEFAULT NULL,
  `tally_master_id` varchar(64) DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_vehicle_master_name` (`name`),
  KEY `idx_vehicle_master_tally` (`tally_master_id`),
  KEY `fk_vehicle_master_created_by` (`created_by`),
  CONSTRAINT `fk_vehicle_master_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 9. destination_master ────────────────────────────────────────────────────
CREATE TABLE `destination_master` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `branch` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `city` varchar(128) DEFAULT NULL,
  `state` varchar(128) DEFAULT NULL,
  `pincode` varchar(16) DEFAULT NULL,
  `tally_master_id` varchar(64) DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_destination_master_branch` (`branch`),
  KEY `idx_destination_master_name` (`name`),
  KEY `idx_destination_master_tally` (`tally_master_id`),
  KEY `fk_destination_master_created_by` (`created_by`),
  CONSTRAINT `fk_destination_master_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 10. bilty ─────────────────────────────────────────────────────────────────
CREATE TABLE `bilty` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `bilty_no` varchar(32) NOT NULL,
  `bilty_date` date DEFAULT NULL,
  `consignor` varchar(255) NOT NULL,
  `bill_to` varchar(255) DEFAULT NULL,
  `owner_name` varchar(255) DEFAULT NULL,
  `agent_name` varchar(255) DEFAULT NULL,
  `branch` varchar(128) DEFAULT NULL,
  `zone_name` varchar(128) DEFAULT NULL,
  `truck_no` varchar(64) NOT NULL,
  `goods_type` varchar(128) DEFAULT NULL,
  `truck_type` varchar(64) DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `version` int unsigned NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `bilty_no` (`bilty_no`),
  KEY `idx_bilty_bilty_no` (`bilty_no`),
  KEY `idx_bilty_created_by` (`created_by`),
  CONSTRAINT `fk_bilty_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 11. bilty_items ───────────────────────────────────────────────────────────
CREATE TABLE `bilty_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `bilty_id` int unsigned NOT NULL,
  `challan_no` varchar(64) DEFAULT NULL,
  `lr_no` varchar(64) DEFAULT NULL,
  `from_loc` varchar(128) DEFAULT NULL,
  `to_loc` varchar(128) DEFAULT NULL,
  `consignee` varchar(255) DEFAULT NULL,
  `qty` decimal(12,2) NOT NULL DEFAULT '0.00',
  `rate` decimal(12,2) NOT NULL DEFAULT '0.00',
  `inc_rate` decimal(12,2) NOT NULL DEFAULT '0.00',
  `l_rate` decimal(12,2) NOT NULL DEFAULT '0.00',
  `e_rate` decimal(12,2) NOT NULL DEFAULT '0.00',
  `shipment_no` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bilty_items_bilty_id` (`bilty_id`),
  CONSTRAINT `fk_bilty_items_bilty` FOREIGN KEY (`bilty_id`) REFERENCES `bilty` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 12. freight_memo ─────────────────────────────────────────────────────────
CREATE TABLE `freight_memo` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `memo_no` varchar(32) NOT NULL,
  `bilty_id` int unsigned NOT NULL,
  `memo_date` date DEFAULT NULL,
  `freight_total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `net_payable` decimal(12,2) NOT NULL DEFAULT '0.00',
  `generated_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `version` int unsigned NOT NULL DEFAULT '1',
  `is_stale` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `memo_no` (`memo_no`),
  UNIQUE KEY `bilty_id` (`bilty_id`),
  KEY `idx_freight_memo_bilty_id` (`bilty_id`),
  KEY `idx_freight_memo_memo_no` (`memo_no`),
  KEY `fk_freight_memo_generated_by` (`generated_by`),
  CONSTRAINT `fk_freight_memo_bilty` FOREIGN KEY (`bilty_id`) REFERENCES `bilty` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_freight_memo_generated_by` FOREIGN KEY (`generated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 15. audit_logs ───────────────────────────────────────────────────────────
CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `action` enum('CREATE','UPDATE','DELETE','GENERATE') NOT NULL,
  `entity_type` varchar(64) NOT NULL,
  `entity_id` int unsigned NOT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `before_json` json DEFAULT NULL,
  `after_json` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_entity` (`entity_type`,`entity_id`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_created` (`created_at`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 16. vch_details ──────────────────────────────────────────────────────────
CREATE TABLE `vch_details` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `vch_type_id` int unsigned DEFAULT NULL,
  `vch_no` varchar(100) DEFAULT NULL,
  `vch_date` date DEFAULT NULL,
  `ledger_master_id` int unsigned NOT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `remark` text,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vch_details_type` (`vch_type_id`),
  KEY `idx_vch_details_date` (`vch_date`),
  KEY `idx_vch_details_ledger` (`ledger_master_id`),
  KEY `fk_vch_details_created_by` (`created_by`),
  CONSTRAINT `fk_vch_details_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vch_details_ledger` FOREIGN KEY (`ledger_master_id`) REFERENCES `ledger_master` (`id`),
  CONSTRAINT `fk_vch_details_type` FOREIGN KEY (`vch_type_id`) REFERENCES `vchtype` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 17. ledger_entries ───────────────────────────────────────────────────────
CREATE TABLE `ledger_entries` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `vch_id` int unsigned NOT NULL,
  `ledger_id` int unsigned DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ledger_entries_vch` (`vch_id`),
  KEY `idx_ledger_entries_ledger` (`ledger_id`),
  CONSTRAINT `fk_ledger_entries_ledger` FOREIGN KEY (`ledger_id`) REFERENCES `ledger_master` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ledger_entries_vch` FOREIGN KEY (`vch_id`) REFERENCES `vch_details` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 18. inventory_entries ────────────────────────────────────────────────────
CREATE TABLE `inventory_entries` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `led_id` int unsigned NOT NULL,
  `item_id` int unsigned NOT NULL,
  `qty` decimal(10,3) NOT NULL DEFAULT '1.000',
  `rate` decimal(14,2) NOT NULL DEFAULT '0.00',
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `gst_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inventory_entries_led` (`led_id`),
  KEY `idx_inventory_entries_item` (`item_id`),
  CONSTRAINT `fk_inventory_entries_item` FOREIGN KEY (`item_id`) REFERENCES `item_master` (`id`),
  CONSTRAINT `fk_inventory_entries_led` FOREIGN KEY (`led_id`) REFERENCES `ledger_entries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 19. batch ────────────────────────────────────────────────────────────────
CREATE TABLE `batch` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `vch_id` int unsigned NOT NULL,
  `inventory_id` int unsigned DEFAULT NULL,
  `item_id` int unsigned NOT NULL,
  `batch_name` varchar(255) DEFAULT NULL,
  `qty` decimal(10,3) NOT NULL DEFAULT '1.000',
  `rate` decimal(14,2) NOT NULL DEFAULT '0.00',
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_batch_vch` (`vch_id`),
  KEY `idx_batch_inv` (`inventory_id`),
  KEY `idx_batch_item` (`item_id`),
  CONSTRAINT `fk_batch_inv` FOREIGN KEY (`inventory_id`) REFERENCES `inventory_entries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_batch_item` FOREIGN KEY (`item_id`) REFERENCES `item_master` (`id`),
  CONSTRAINT `fk_batch_vch` FOREIGN KEY (`vch_id`) REFERENCES `vch_details` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── 20. bill_allocation ──────────────────────────────────────────────────────
CREATE TABLE `bill_allocation` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `vchid` int unsigned NOT NULL,
  `ledentry_id` int unsigned DEFAULT NULL,
  `ledger` int unsigned DEFAULT NULL,
  `billname` varchar(255) DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bill_allocation_vchid` (`vchid`),
  KEY `idx_bill_allocation_ledentry` (`ledentry_id`),
  KEY `idx_bill_allocation_billname` (`billname`),
  KEY `idx_bill_allocation_ledger` (`ledger`),
  CONSTRAINT `fk_bill_allocation_ledentry` FOREIGN KEY (`ledentry_id`) REFERENCES `ledger_entries` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bill_allocation_ledger` FOREIGN KEY (`ledger`) REFERENCES `ledger_master` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bill_allocation_vch` FOREIGN KEY (`vchid`) REFERENCES `vch_details` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─── Seed: admin user (password: Admin@1234) ──────────────────────────────────
INSERT INTO `users` (`id`, `username`, `password_hash`, `role`, `permissions`, `is_active`)
VALUES (1, 'admin', '$2b$10$KA5MEMlnI12m7T10h0fHHegiBKhDtwjga1mKv588EhX6J1UhAEDsq', 'admin', '["*"]', 1);

-- ─── Seed: ledger_group ───────────────────────────────────────────────────────
INSERT INTO `ledger_group` (`id`, `group_name`, `parent_id`) VALUES
(1,  'party',             NULL),
(2,  'owner',             NULL),
(3,  'agent',             NULL),
(4,  'Sales Accounts',    NULL),
(5,  'Purchase Accounts', 1),
(6,  'Duties & Taxes',    NULL),
(7,  'Indirect Income',   NULL),
(8,  'Bank Accounts',     NULL),
(9,  'Cash-in-Hand',      NULL),
(10, 'Direct Expenses',   NULL),
(11, 'Sundry Debtors',    NULL);

-- ─── Seed: vchtype (8 system voucher types) ───────────────────────────────────
INSERT INTO `vchtype` (`id`, `name`, `parent_id`, `deemed_positive`, `is_system`) VALUES
(1, 'Sales',       1, 'YES', 1),
(2, 'Purchase',    2, 'NO',  1),
(3, 'Receipt',     3,  NULL, 1),
(4, 'Payment',     4,  NULL, 1),
(5, 'Journal',     5,  NULL, 1),
(6, 'Contra',      6,  NULL, 1),
(7, 'Debit Note',  7, 'YES', 1),
(8, 'Credit Note', 8, 'NO',  1);

-- ─── Seed: system ledger_master entries ───────────────────────────────────────
INSERT INTO `ledger_master` (`ledger_group_id`, `billbybill`, `name`) VALUES
(4, 'No', 'Sales'),
(5, 'No', 'Purchase'),
(6, 'No', 'CGST'),
(6, 'No', 'SGST'),
(6, 'No', 'IGST'),
(7, 'No', 'Roundoff');

SET FOREIGN_KEY_CHECKS = 1;
