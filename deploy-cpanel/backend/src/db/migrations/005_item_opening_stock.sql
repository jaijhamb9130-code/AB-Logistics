-- ============================================================================
-- Migration 005 — Item-master opening stock can now write rows to
-- `inventory_entries` (rollup) and `batch` (per-batch breakdown) without
-- being attached to a voucher.
--
-- Bilty / Sales / Purchase rows continue to set vch_id and led_id as before;
-- opening-stock rows simply leave them NULL.
-- ============================================================================

ALTER TABLE batch
  MODIFY COLUMN vch_id INT UNSIGNED NULL;

ALTER TABLE inventory_entries
  MODIFY COLUMN led_id INT UNSIGNED NULL;
