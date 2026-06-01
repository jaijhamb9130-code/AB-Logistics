-- ============================================================================
-- Migration 004 — item_master gains opening-stock columns:
--   opening_qty / opening_rate / opening_value
-- These are the totals shown in the item form. Per-batch breakdown for
-- batch=Yes items already lives in `batch` (created when a bilty references
-- the item). No separate batch-detail table at this stage.
-- ============================================================================

ALTER TABLE item_master
  ADD COLUMN opening_qty   DECIMAL(12,3) NOT NULL DEFAULT 0 AFTER batch,
  ADD COLUMN opening_rate  DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER opening_qty,
  ADD COLUMN opening_value DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER opening_rate;
