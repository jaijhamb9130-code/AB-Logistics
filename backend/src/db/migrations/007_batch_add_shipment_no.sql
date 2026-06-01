-- ============================================================================
-- Migration 007 — Add `shipment_no` to `batch`.
-- Bilty form already collects this per-line (alphanumeric, optional) and the
-- shared bilty schema already validates it; the column was missing from the
-- table so values were dropped on save and never read back. Idempotent.
-- ============================================================================

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
