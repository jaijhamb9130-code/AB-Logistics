-- ============================================================================
-- Migration 001: Initial Audit Trail & Optimistic Locking
-- ============================================================================

-- 1. Expanded Audit Logs
-- Tracks state before and after changes for financial and business auditing.
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

-- 2. Optimistic Concurrency Control (OCC)
-- Adding version column to major business entities to prevent race conditions.
SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name   = 'bilty'
     AND column_name  = 'version'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE bilty ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name   = 'freight_memo'
     AND column_name  = 'version'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE freight_memo ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Stale Flag for Freight Memo
-- Indicates if the source Bilty has been modified since the memo snapshot was taken.
SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name   = 'freight_memo'
     AND column_name  = 'is_stale'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE freight_memo ADD COLUMN is_stale TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
