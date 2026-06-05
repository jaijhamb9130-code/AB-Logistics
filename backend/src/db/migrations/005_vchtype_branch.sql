-- Migration 005 — add an optional `branch` to vchtype.
--
-- When a voucher type (e.g. a Bilty child) has a branch, the bilty form
-- auto-fills the Branch field from it and locks it. When null, the Branch
-- field works normally (typed/picked per bilty). Stores the branch NAME
-- (resolved to branch_master.id at save time, same as a typed branch).
-- Each type uses its OWN branch (no parent fallback).
--
-- Idempotent: guarded so re-running won't error if the column already exists.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vchtype'
    AND COLUMN_NAME = 'branch'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE vchtype ADD COLUMN branch VARCHAR(128) NULL DEFAULT NULL AFTER prefix',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
