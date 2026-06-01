-- Adds the `bill_to` column to the bilty table.
-- Uses the same source as `consignor` (ledger_master); stored as plain text
-- (denormalized name) for parity with the existing consignor column.
-- Existing rows backfill to NULL.

ALTER TABLE bilty
  ADD COLUMN bill_to VARCHAR(255) NULL AFTER consignor;
