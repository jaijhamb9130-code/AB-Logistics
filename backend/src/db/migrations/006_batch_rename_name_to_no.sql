-- ============================================================================
-- Migration 006 — rename `batch.batch_name` → `batch.batch_no` so the column
-- matches the form label.
-- ============================================================================

ALTER TABLE batch
  CHANGE COLUMN batch_name batch_no VARCHAR(255) NULL;
