-- Permanent ledger groups overhaul.
-- The 28 standard (Tally) groups become permanent, non-editable top-level
-- parents (is_system=1). User-created groups are always children (is_system=0).
-- The leftover custom groups owner/agent/Vehicles are re-parented under
-- Sundry Creditors as NON-system children (kept so bilty + advance/fuel keep
-- working); the empty 'party' group is removed.
--
-- NOTE: the legacy running DB had NO unique index on group_name, so we de-dupe
-- (keeping the lowest id per name, which the ledgers reference) and add the
-- unique key BEFORE inserting, so the INSERT IGNORE below actually skips
-- existing groups instead of duplicating them.

ALTER TABLE ledger_group ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 0;

UPDATE ledger_group SET group_name='Indirect Incomes' WHERE group_name='Indirect Income';

DELETE FROM ledger_group
 WHERE id NOT IN (SELECT keep FROM (SELECT MIN(id) AS keep FROM ledger_group GROUP BY group_name) t);

ALTER TABLE ledger_group ADD UNIQUE KEY uq_ledger_group_name (group_name);

INSERT IGNORE INTO ledger_group (group_name, parent_id) VALUES
('Branch / Divisions',NULL),('Capital Account',NULL),('Reserves & Surplus',NULL),
('Current Assets',NULL),('Bank Accounts',NULL),('Cash-in-Hand',NULL),
('Deposits (Asset)',NULL),('Loans & Advances (Asset)',NULL),('Stock-in-Hand',NULL),
('Sundry Debtors',NULL),('Current Liabilities',NULL),('Duties & Taxes',NULL),
('Provisions',NULL),('Sundry Creditors',NULL),('Direct Expenses',NULL),
('Direct Incomes',NULL),('Fixed Assets',NULL),('Indirect Expenses',NULL),
('Indirect Incomes',NULL),('Investments',NULL),('Loans (Liability)',NULL),
('Bank OD A/c',NULL),('Secured Loans',NULL),('Unsecured Loans',NULL),
('Misc. Expenses (ASSET)',NULL),('Purchase Accounts',NULL),('Sales Accounts',NULL),
('Suspense A/c',NULL);

UPDATE ledger_group SET is_system=1, parent_id=NULL WHERE group_name IN (
 'Branch / Divisions','Capital Account','Reserves & Surplus','Current Assets',
 'Bank Accounts','Cash-in-Hand','Deposits (Asset)','Loans & Advances (Asset)',
 'Stock-in-Hand','Sundry Debtors','Current Liabilities','Duties & Taxes','Provisions',
 'Sundry Creditors','Direct Expenses','Direct Incomes','Fixed Assets','Indirect Expenses',
 'Indirect Incomes','Investments','Loans (Liability)','Bank OD A/c','Secured Loans',
 'Unsecured Loans','Misc. Expenses (ASSET)','Purchase Accounts','Sales Accounts','Suspense A/c');

UPDATE ledger_group
  SET is_system=0,
      parent_id=(SELECT id FROM (SELECT id FROM ledger_group WHERE group_name='Sundry Creditors' LIMIT 1) t)
  WHERE group_name IN ('owner','agent','Vehicles');

DELETE FROM ledger_group WHERE group_name='party';
