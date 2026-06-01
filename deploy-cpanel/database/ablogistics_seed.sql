/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `agent_master`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agent_master` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `mobile` varchar(15) DEFAULT NULL,
  `gst_no` varchar(20) DEFAULT NULL,
  `pan_no` varchar(15) DEFAULT NULL,
  `address` varchar(512) DEFAULT NULL,
  `city` varchar(128) DEFAULT NULL,
  `state` varchar(128) DEFAULT NULL,
  `pincode` varchar(16) DEFAULT NULL,
  `commission_pct` decimal(5,2) DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `fk_agent_master_created_by` (`created_by`),
  CONSTRAINT `fk_agent_master_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `agent_master` WRITE;
/*!40000 ALTER TABLE `agent_master` DISABLE KEYS */;
INSERT INTO `agent_master` VALUES (1,'Bansal Transport Agent','9000000001',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(2,'Krishna Logistics Agent','9000000002',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(3,'Shree Ram Agent','9000000003',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07');
/*!40000 ALTER TABLE `agent_master` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `batch`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `batch` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `vch_id` int unsigned NOT NULL,
  `inventory_id` int unsigned DEFAULT NULL,
  `item_id` int unsigned NOT NULL,
  `batch_no` varchar(255) DEFAULT NULL,
  `qty` decimal(10,3) NOT NULL DEFAULT '1.000',
  `rate` decimal(14,2) NOT NULL DEFAULT '0.00',
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `consignee_id` int unsigned DEFAULT NULL,
  `challan_no` varchar(64) DEFAULT NULL,
  `lr_no` varchar(64) DEFAULT NULL,
  `inc_rate` decimal(12,2) DEFAULT '0.00',
  `l_rate` decimal(12,2) DEFAULT '0.00',
  `e_rate` decimal(12,2) DEFAULT '0.00',
  `shipment_no` varchar(64) DEFAULT NULL,
  `from_id` int unsigned DEFAULT NULL,
  `to_id` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_batch_vch` (`vch_id`),
  KEY `idx_batch_inv` (`inventory_id`),
  KEY `idx_batch_item` (`item_id`),
  KEY `fk_batch_consignee_id` (`consignee_id`),
  KEY `fk_batch_from_id` (`from_id`),
  KEY `fk_batch_to_id` (`to_id`),
  CONSTRAINT `fk_batch_consignee_id` FOREIGN KEY (`consignee_id`) REFERENCES `ledger_master` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_batch_from_id` FOREIGN KEY (`from_id`) REFERENCES `destination_master` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_batch_inv` FOREIGN KEY (`inventory_id`) REFERENCES `inventory_entries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_batch_item` FOREIGN KEY (`item_id`) REFERENCES `item_master` (`id`),
  CONSTRAINT `fk_batch_to_id` FOREIGN KEY (`to_id`) REFERENCES `destination_master` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_batch_vch` FOREIGN KEY (`vch_id`) REFERENCES `vch_details` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `batch` WRITE;
/*!40000 ALTER TABLE `batch` DISABLE KEYS */;
/*!40000 ALTER TABLE `batch` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `bill_allocation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `bill_allocation` WRITE;
/*!40000 ALTER TABLE `bill_allocation` DISABLE KEYS */;
/*!40000 ALTER TABLE `bill_allocation` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `branch_master`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `branch_master` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(128) NOT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `fk_branch_master_created_by` (`created_by`),
  CONSTRAINT `fk_branch_master_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `branch_master` WRITE;
/*!40000 ALTER TABLE `branch_master` DISABLE KEYS */;
INSERT INTO `branch_master` VALUES (1,'Jaipur',NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(2,'Delhi',NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(3,'Mumbai',NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(4,'Bangalore',NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(5,'Hyderabad',NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07');
/*!40000 ALTER TABLE `branch_master` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `destination_master`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `destination_master` WRITE;
/*!40000 ALTER TABLE `destination_master` DISABLE KEYS */;
INSERT INTO `destination_master` VALUES (1,'Jaipur','Jaipur Depot','Jaipur','Rajasthan',NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(2,'Jaipur','Sikar Hub','Sikar','Rajasthan',NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(3,'Delhi','Delhi Yard','Delhi','Delhi',NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(4,'Delhi','Gurgaon Plant','Gurgaon','Haryana',NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(5,'Mumbai','Mumbai Port','Mumbai','Maharashtra',NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(6,'Mumbai','Pune Branch','Pune','Maharashtra',NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(7,'Bangalore','Bangalore Hub','Bangalore','Karnataka',NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(8,'Hyderabad','Hyderabad Yard','Hyderabad','Telangana',NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07');
/*!40000 ALTER TABLE `destination_master` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `freight_memo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `freight_memo` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `memo_no` varchar(32) NOT NULL,
  `vch_id` int unsigned NOT NULL,
  `memo_date` date DEFAULT NULL,
  `freight_total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `net_payable` decimal(12,2) NOT NULL DEFAULT '0.00',
  `generated_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `memo_no` (`memo_no`),
  UNIQUE KEY `uq_freight_memo_vch_id` (`vch_id`),
  KEY `idx_freight_memo_memo_no` (`memo_no`),
  KEY `fk_freight_memo_generated_by` (`generated_by`),
  KEY `idx_freight_memo_vch_id` (`vch_id`),
  CONSTRAINT `fk_freight_memo_generated_by` FOREIGN KEY (`generated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_freight_memo_vch` FOREIGN KEY (`vch_id`) REFERENCES `vch_details` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `freight_memo` WRITE;
/*!40000 ALTER TABLE `freight_memo` DISABLE KEYS */;
/*!40000 ALTER TABLE `freight_memo` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `inventory_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_entries` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `led_id` int unsigned DEFAULT NULL,
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
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `inventory_entries` WRITE;
/*!40000 ALTER TABLE `inventory_entries` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventory_entries` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `item_category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `item_category` WRITE;
/*!40000 ALTER TABLE `item_category` DISABLE KEYS */;
/*!40000 ALTER TABLE `item_category` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `item_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `item_group` WRITE;
/*!40000 ALTER TABLE `item_group` DISABLE KEYS */;
/*!40000 ALTER TABLE `item_group` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `item_master`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
  `unit` varchar(32) DEFAULT NULL,
  `opening_qty` decimal(12,3) NOT NULL DEFAULT '0.000',
  `opening_rate` decimal(14,2) NOT NULL DEFAULT '0.00',
  `opening_value` decimal(14,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `idx_item_master_name` (`name`),
  KEY `idx_item_master_tally` (`tally_master_id`),
  KEY `fk_item_master_created_by` (`created_by`),
  KEY `idx_item_master_group` (`item_group_id`),
  KEY `idx_item_master_category` (`item_category_id`),
  CONSTRAINT `fk_item_master_category` FOREIGN KEY (`item_category_id`) REFERENCES `item_category` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_item_master_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_item_master_group` FOREIGN KEY (`item_group_id`) REFERENCES `item_group` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `item_master` WRITE;
/*!40000 ALTER TABLE `item_master` DISABLE KEYS */;
INSERT INTO `item_master` VALUES (1,'Cement Bags',NULL,NULL,'25232990',0.00,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07','Yes','ton',0.000,0.00,0.00),(2,'Steel Rods',NULL,NULL,'72142000',0.00,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07','Yes','ton',0.000,0.00,0.00),(3,'Coal',NULL,NULL,'27011200',0.00,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07','Yes','ton',0.000,0.00,0.00),(4,'Wheat Grains',NULL,NULL,'10011900',0.00,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07','Yes','ton',0.000,0.00,0.00),(5,'Plastic Granules',NULL,NULL,'39021000',0.00,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07','Yes','ton',0.000,0.00,0.00);
/*!40000 ALTER TABLE `item_master` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `ledger_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `ledger_entries` WRITE;
/*!40000 ALTER TABLE `ledger_entries` DISABLE KEYS */;
/*!40000 ALTER TABLE `ledger_entries` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `ledger_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ledger_group` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `group_name` varchar(64) NOT NULL,
  `parent_id` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ledger_group_parent` (`parent_id`),
  CONSTRAINT `fk_ledger_group_parent` FOREIGN KEY (`parent_id`) REFERENCES `ledger_group` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `ledger_group` WRITE;
/*!40000 ALTER TABLE `ledger_group` DISABLE KEYS */;
INSERT INTO `ledger_group` VALUES (1,'party',NULL,'2026-05-29 06:17:38'),(2,'owner',NULL,'2026-05-29 06:17:38'),(3,'agent',NULL,'2026-05-29 06:17:38'),(4,'Sales Accounts',NULL,'2026-05-29 06:17:38'),(5,'Purchase Accounts',1,'2026-05-29 06:17:38'),(6,'Duties & Taxes',NULL,'2026-05-29 06:17:38'),(7,'Indirect Income',NULL,'2026-05-29 06:17:38'),(8,'Bank Accounts',NULL,'2026-05-29 06:17:38'),(9,'Cash-in-Hand',NULL,'2026-05-29 06:17:38'),(10,'Direct Expenses',NULL,'2026-05-29 06:17:38'),(11,'Sundry Debtors',NULL,'2026-05-29 06:17:38'),(12,'Sundry Creditors',NULL,'2026-05-29 06:22:13'),(13,'Vehicles',12,'2026-05-29 06:22:13');
/*!40000 ALTER TABLE `ledger_group` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `ledger_master`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ledger_master` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ledger_group_id` int unsigned NOT NULL,
  `billbybill` enum('Yes','No') NOT NULL DEFAULT 'No',
  `name` varchar(255) NOT NULL,
  `vehicle_type` varchar(64) DEFAULT NULL,
  `owner_id` int unsigned DEFAULT NULL,
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
  KEY `idx_ledger_master_owner` (`owner_id`),
  CONSTRAINT `fk_ledger_master_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ledger_master_owner` FOREIGN KEY (`owner_id`) REFERENCES `owner_master` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ledger_master_to_ledger_group` FOREIGN KEY (`ledger_group_id`) REFERENCES `ledger_group` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `ledger_master` WRITE;
/*!40000 ALTER TABLE `ledger_master` DISABLE KEYS */;
INSERT INTO `ledger_master` VALUES (1,4,'No','Sales',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:06','2026-05-29 06:24:06',0.00,'Dr'),(2,10,'No','Freight Expense',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr'),(3,11,'No','Star Cement Pvt Ltd',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr'),(4,11,'No','JK Steel Industries',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr'),(5,11,'No','Global Coal Traders',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr'),(6,11,'No','Bharat Agro Mills',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr'),(7,11,'No','Reliance Polymers',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr'),(8,11,'No','Adani Logistics',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr'),(9,13,'No','RJ-14-AA-9999',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr'),(10,13,'No','DL-1L-AB-5566',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr'),(11,13,'No','MH-12-CD-7788',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr'),(12,13,'No','KA-05-EF-3344',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr'),(13,13,'No','TS-09-GH-2211',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr'),(14,13,'No','HR-26-XY-4488',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07',0.00,'Dr');
/*!40000 ALTER TABLE `ledger_master` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `owner_master`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `owner_master` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `mobile` varchar(15) DEFAULT NULL,
  `gst_no` varchar(20) DEFAULT NULL,
  `pan_no` varchar(15) DEFAULT NULL,
  `address` varchar(512) DEFAULT NULL,
  `city` varchar(128) DEFAULT NULL,
  `state` varchar(128) DEFAULT NULL,
  `pincode` varchar(16) DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `fk_owner_master_created_by` (`created_by`),
  CONSTRAINT `fk_owner_master_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `owner_master` WRITE;
/*!40000 ALTER TABLE `owner_master` DISABLE KEYS */;
INSERT INTO `owner_master` VALUES (1,'Ramesh Singh','9876543210',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(2,'Suresh Kumar','9876543211',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(3,'Mahesh Patel','9876543212',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(4,'Vinod Sharma','9876543213',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(5,'Anil Gupta','9876543214',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07');
/*!40000 ALTER TABLE `owner_master` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','$2b$10$JYap9NcmYgKtL7VE4ACwcu23HEzqF88YPyVkwc09t6BVCkr8EiQsq','admin','[\"*\"]',1,'2026-05-29 06:17:38','2026-05-29 06:51:23');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `vch_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vch_details` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `vch_type_id` int unsigned DEFAULT NULL,
  `vch_no` varchar(100) DEFAULT NULL,
  `vch_date` date DEFAULT NULL,
  `ledger_master_id` int unsigned DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `remark` text,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `branch_id` int unsigned DEFAULT NULL,
  `agent_id` int unsigned DEFAULT NULL,
  `bill_to_id` int unsigned DEFAULT NULL,
  `owner_id` int unsigned DEFAULT NULL,
  `vehicle_id` int unsigned DEFAULT NULL,
  `goods_type_id` int unsigned DEFAULT NULL,
  `zone_id` int unsigned DEFAULT NULL,
  `parent_vch_id` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vch_details_type` (`vch_type_id`),
  KEY `idx_vch_details_date` (`vch_date`),
  KEY `idx_vch_details_ledger` (`ledger_master_id`),
  KEY `fk_vch_details_created_by` (`created_by`),
  KEY `fk_vch_details_branch_id` (`branch_id`),
  KEY `fk_vch_details_agent_id` (`agent_id`),
  KEY `fk_vch_details_bill_to_id` (`bill_to_id`),
  KEY `fk_vch_details_owner_id` (`owner_id`),
  KEY `fk_vch_details_vehicle_id` (`vehicle_id`),
  KEY `fk_vch_details_goods_type_id` (`goods_type_id`),
  KEY `fk_vch_details_zone_id` (`zone_id`),
  KEY `fk_vch_details_parent_vch_id` (`parent_vch_id`),
  CONSTRAINT `fk_vch_details_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agent_master` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vch_details_bill_to_id` FOREIGN KEY (`bill_to_id`) REFERENCES `ledger_master` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vch_details_branch_id` FOREIGN KEY (`branch_id`) REFERENCES `branch_master` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vch_details_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vch_details_goods_type_id` FOREIGN KEY (`goods_type_id`) REFERENCES `item_master` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vch_details_ledger` FOREIGN KEY (`ledger_master_id`) REFERENCES `ledger_master` (`id`),
  CONSTRAINT `fk_vch_details_owner_id` FOREIGN KEY (`owner_id`) REFERENCES `owner_master` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vch_details_parent_vch_id` FOREIGN KEY (`parent_vch_id`) REFERENCES `vch_details` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vch_details_type` FOREIGN KEY (`vch_type_id`) REFERENCES `vchtype` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vch_details_vehicle_id` FOREIGN KEY (`vehicle_id`) REFERENCES `ledger_master` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vch_details_zone_id` FOREIGN KEY (`zone_id`) REFERENCES `zone_master` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `vch_details` WRITE;
/*!40000 ALTER TABLE `vch_details` DISABLE KEYS */;
/*!40000 ALTER TABLE `vch_details` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `vchtype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `vchtype` WRITE;
/*!40000 ALTER TABLE `vchtype` DISABLE KEYS */;
INSERT INTO `vchtype` VALUES (1,'Sales',1,'YES',1,'2026-05-29 06:17:38','2026-05-29 06:17:38'),(2,'Purchase',2,'NO',1,'2026-05-29 06:17:38','2026-05-29 06:17:38'),(3,'Receipt',3,NULL,1,'2026-05-29 06:17:38','2026-05-29 06:17:38'),(4,'Payment',4,NULL,1,'2026-05-29 06:17:38','2026-05-29 06:17:38'),(5,'Journal',5,NULL,1,'2026-05-29 06:17:38','2026-05-29 06:17:38'),(6,'Contra',6,NULL,1,'2026-05-29 06:17:38','2026-05-29 06:17:38'),(7,'Debit Note',7,'YES',1,'2026-05-29 06:17:38','2026-05-29 06:17:38'),(8,'Credit Note',8,'NO',1,'2026-05-29 06:17:38','2026-05-29 06:17:38'),(9,'Bilty',9,'YES',1,'2026-05-29 06:20:11','2026-05-29 06:20:11'),(10,'Freight Journal',5,'YES',0,'2026-05-29 06:20:50','2026-05-29 06:20:50');
/*!40000 ALTER TABLE `vchtype` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `zone_master`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `zone_master` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(128) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `fk_zone_master_created_by` (`created_by`),
  CONSTRAINT `fk_zone_master_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `zone_master` WRITE;
/*!40000 ALTER TABLE `zone_master` DISABLE KEYS */;
INSERT INTO `zone_master` VALUES (1,'North',NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(2,'South',NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(3,'East',NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(4,'West',NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07'),(5,'Central',NULL,NULL,'2026-05-29 06:24:07','2026-05-29 06:24:07');
/*!40000 ALTER TABLE `zone_master` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

