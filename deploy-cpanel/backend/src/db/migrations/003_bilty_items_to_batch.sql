-- ============================================================================
-- Migration 003 — Retire `bilty_items`; bilty line items now live in `batch`,
-- with the per-voucher rollup in `inventory_entries`. Goods Type on the
-- bilty header becomes an FK to `item_master`. Items grow a `batch` flag.
--
-- Data is already empty (cleared in migration 002). Pure schema migration.
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1) item_master.batch — already present as ENUM('Yes','No') from a previous
-- change; reusing it as-is so we don't churn the existing form.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 2) batch: add bilty-specific columns + consignee FK so each batch row
--    carries everything a bilty line used to carry in `bilty_items`.
-- ----------------------------------------------------------------------------
ALTER TABLE batch
  ADD COLUMN consignee_id INT UNSIGNED NULL AFTER item_id,
  ADD COLUMN challan_no   VARCHAR(64)  NULL AFTER batch_name,
  ADD COLUMN lr_no        VARCHAR(64)  NULL AFTER challan_no,
  ADD COLUMN from_loc     VARCHAR(128) NULL AFTER lr_no,
  ADD COLUMN to_loc       VARCHAR(128) NULL AFTER from_loc,
  ADD COLUMN inc_rate     DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER amount,
  ADD COLUMN l_rate       DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER inc_rate,
  ADD COLUMN e_rate       DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER l_rate,
  ADD INDEX idx_batch_consignee (consignee_id),
  ADD CONSTRAINT fk_batch_consignee
    FOREIGN KEY (consignee_id) REFERENCES ledger_master(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3) vch_details: replace free-text `goods_type` with FK `goods_type_id`
--    pointing at item_master. Old column is dropped.
-- ----------------------------------------------------------------------------
ALTER TABLE vch_details
  DROP COLUMN goods_type,
  ADD COLUMN goods_type_id INT UNSIGNED NULL AFTER truck_type,
  ADD INDEX idx_vch_details_goods_type (goods_type_id),
  ADD CONSTRAINT fk_vch_details_goods_type
    FOREIGN KEY (goods_type_id) REFERENCES item_master(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 4) Drop the now-orphaned `bilty_items` table.
-- ----------------------------------------------------------------------------
DROP TABLE bilty_items;

SET FOREIGN_KEY_CHECKS = 1;
