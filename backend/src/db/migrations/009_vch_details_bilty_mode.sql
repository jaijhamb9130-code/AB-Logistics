-- Advance / Fuel sub-mode for journal-style vouchers (Contra/Journal/Payment/Receipt).
-- One column only: 1 = advance, 2 = fuel, NULL = normal voucher.
-- These vouchers are entered against a bilty; the bilty's owner auto-fills the
-- first ledger row. Applied idempotently at boot by ensureSchema.js as well.
ALTER TABLE vch_details
  ADD COLUMN bilty_mode TINYINT NULL DEFAULT NULL AFTER parent_vch_id;
