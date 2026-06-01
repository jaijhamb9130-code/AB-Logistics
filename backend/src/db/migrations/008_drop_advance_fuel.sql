-- 008_drop_advance_fuel.sql
-- Removes the advance_details and fuel_details sidecar tables and the
-- advance_total / fuel_total columns from freight_memo. Frontend rows and
-- backend code paths for advances and fuels were stripped at the same time.
--
-- Idempotent: each statement only fires when the target object exists, so
-- re-running the migration on an already-migrated DB is a no-op.

SET @fkc := @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS advance_details;
DROP TABLE IF EXISTS fuel_details;

-- Drop freight_memo.advance_total if present.
SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name   = 'freight_memo'
     AND column_name  = 'advance_total'
);
SET @sql := IF(@col = 1, 'ALTER TABLE freight_memo DROP COLUMN advance_total', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop freight_memo.fuel_total if present.
SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name   = 'freight_memo'
     AND column_name  = 'fuel_total'
);
SET @sql := IF(@col = 1, 'ALTER TABLE freight_memo DROP COLUMN fuel_total', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS = @fkc;
