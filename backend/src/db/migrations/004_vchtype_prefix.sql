-- Migration 004 — add an optional voucher-number `prefix` to vchtype.
--
-- When a voucher type has a prefix, the voucher form auto-fills vch_no as
-- `<prefix>-<number>` (e.g. SAL-001). When null, numbering starts plainly.
-- Each type uses its OWN prefix (no parent fallback).
--
-- Idempotent: guarded so re-running won't error if the column already exists.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vchtype'
    AND COLUMN_NAME = 'prefix'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE vchtype ADD COLUMN prefix VARCHAR(16) NULL DEFAULT NULL AFTER is_system',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
