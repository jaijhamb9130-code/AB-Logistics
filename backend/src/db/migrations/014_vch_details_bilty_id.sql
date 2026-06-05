-- 014: Persist the bilty selected in Advance/Fuel mode on the voucher, so the
-- "Bilty No" field can be restored when the voucher is edited. Additive and
-- idempotent — mirrors backend/src/db/ensureSchema.js (which auto-applies it on
-- boot). NULL for Normal-mode / non-bilty vouchers.

ALTER TABLE vch_details
  ADD COLUMN bilty_id INT UNSIGNED NULL DEFAULT NULL AFTER bilty_mode;
