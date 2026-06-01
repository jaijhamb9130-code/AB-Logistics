-- ============================================================================
-- Migration 002 — Retire `bilty` table; bilty becomes vchtype id=9 stored
-- entirely in `vch_details`. Renames bilty_id → vch_id on all child tables.
-- Wipes data from every business table EXCEPT vchtype, users, ledger_group.
--
-- ONE-WAY migration. Run once on existing DBs. Fresh deploys use schema.sql
-- (which is also updated to reflect the new structure).
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1) Wipe data — keep vchtype, users, ledger_group; clear everything else.
-- ----------------------------------------------------------------------------
TRUNCATE TABLE bill_allocation;
TRUNCATE TABLE batch;
TRUNCATE TABLE inventory_entries;
TRUNCATE TABLE ledger_entries;
TRUNCATE TABLE vch_details;
TRUNCATE TABLE freight_memo;
TRUNCATE TABLE fuel_details;
TRUNCATE TABLE advance_details;
TRUNCATE TABLE bilty_items;
TRUNCATE TABLE bilty;
TRUNCATE TABLE item_category;
TRUNCATE TABLE item_group;
TRUNCATE TABLE destination_master;
TRUNCATE TABLE vehicle_master;
TRUNCATE TABLE item_master;
TRUNCATE TABLE ledger_master;
TRUNCATE TABLE audit_logs;

-- ----------------------------------------------------------------------------
-- 2) Drop bilty FKs from child tables, rename bilty_id → vch_id.
-- ----------------------------------------------------------------------------
ALTER TABLE bilty_items
  DROP FOREIGN KEY fk_bilty_items_bilty,
  DROP INDEX idx_bilty_items_bilty_id,
  CHANGE COLUMN bilty_id vch_id INT UNSIGNED NOT NULL,
  ADD INDEX idx_bilty_items_vch_id (vch_id);

ALTER TABLE advance_details
  DROP FOREIGN KEY fk_advance_details_bilty,
  DROP INDEX idx_advance_details_bilty_id,
  CHANGE COLUMN bilty_id vch_id INT UNSIGNED NOT NULL,
  ADD INDEX idx_advance_details_vch_id (vch_id);

ALTER TABLE fuel_details
  DROP FOREIGN KEY fk_fuel_details_bilty,
  DROP INDEX idx_fuel_details_bilty_id,
  CHANGE COLUMN bilty_id vch_id INT UNSIGNED NOT NULL,
  ADD INDEX idx_fuel_details_vch_id (vch_id);

-- freight_memo had UNIQUE(bilty_id) — rename column, keep uniqueness.
ALTER TABLE freight_memo
  DROP FOREIGN KEY fk_freight_memo_bilty,
  DROP INDEX bilty_id,                  -- implicit UNIQUE index name
  DROP INDEX idx_freight_memo_bilty_id,
  CHANGE COLUMN bilty_id vch_id INT UNSIGNED NOT NULL,
  ADD UNIQUE KEY uq_freight_memo_vch_id (vch_id),
  ADD INDEX idx_freight_memo_vch_id (vch_id);

-- ----------------------------------------------------------------------------
-- 3) Drop the now-orphaned bilty table.
-- ----------------------------------------------------------------------------
DROP TABLE bilty;

-- ----------------------------------------------------------------------------
-- 4) Add Bilty as 9th vchtype row (idempotent + parent_id self).
-- ----------------------------------------------------------------------------
INSERT INTO vchtype (name, deemed_positive, is_system)
SELECT 'Bilty', NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM vchtype WHERE name = 'Bilty' AND is_system = 1);

UPDATE vchtype SET parent_id = id
WHERE name = 'Bilty' AND is_system = 1 AND parent_id IS NULL;

-- ----------------------------------------------------------------------------
-- 5) Extend vch_details with bilty header fields.
--    consignor lives in existing ledger_master_id (FK already present).
--    owner_name stays text until owner master is wired up (future migration
--    will add owner_id and backfill from owner_name without dropping data).
-- ----------------------------------------------------------------------------
ALTER TABLE vch_details
  ADD COLUMN branch     VARCHAR(128) NULL AFTER vch_date,
  ADD COLUMN gst_no     VARCHAR(32)  NULL AFTER branch,
  ADD COLUMN agent_id   INT UNSIGNED NULL AFTER ledger_master_id,
  ADD COLUMN bill_to_id INT UNSIGNED NULL AFTER agent_id,
  ADD COLUMN owner_name VARCHAR(255) NULL AFTER bill_to_id,
  ADD COLUMN truck_no   VARCHAR(64)  NULL AFTER owner_name,
  ADD COLUMN truck_type VARCHAR(64)  NULL AFTER truck_no,
  ADD COLUMN goods_type VARCHAR(128) NULL AFTER truck_type,
  ADD COLUMN zone       VARCHAR(128) NULL AFTER goods_type,
  -- OCC version (carried over from old bilty table; used by services).
  ADD COLUMN version    INT UNSIGNED NOT NULL DEFAULT 1 AFTER zone,
  ADD INDEX idx_vch_details_agent (agent_id),
  ADD INDEX idx_vch_details_bill_to (bill_to_id),
  ADD CONSTRAINT fk_vch_details_agent
    FOREIGN KEY (agent_id)   REFERENCES ledger_master(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_vch_details_billto
    FOREIGN KEY (bill_to_id) REFERENCES ledger_master(id) ON DELETE SET NULL,
  -- bilty_no is unique per voucher type. Same string can repeat across
  -- different vch_type_ids (e.g. a Sales voucher #1 and a Bilty #1).
  ADD UNIQUE KEY uq_vch_details_type_no (vch_type_id, vch_no);

-- ----------------------------------------------------------------------------
-- 6) Re-add FKs from child tables → vch_details (now that columns are vch_id).
-- ----------------------------------------------------------------------------
ALTER TABLE bilty_items
  ADD CONSTRAINT fk_bilty_items_vch
    FOREIGN KEY (vch_id) REFERENCES vch_details(id) ON DELETE CASCADE;

ALTER TABLE advance_details
  ADD CONSTRAINT fk_advance_details_vch
    FOREIGN KEY (vch_id) REFERENCES vch_details(id) ON DELETE CASCADE;

ALTER TABLE fuel_details
  ADD CONSTRAINT fk_fuel_details_vch
    FOREIGN KEY (vch_id) REFERENCES vch_details(id) ON DELETE CASCADE;

ALTER TABLE freight_memo
  ADD CONSTRAINT fk_freight_memo_vch
    FOREIGN KEY (vch_id) REFERENCES vch_details(id) ON DELETE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
