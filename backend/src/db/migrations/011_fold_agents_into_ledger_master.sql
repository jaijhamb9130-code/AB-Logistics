-- Fold agent_master into ledger_master (under the 'agent' group) and drop it.
-- Agents become ordinary ledgers; vch_details.agent_id is repointed from
-- agent_master to ledger_master.

-- 1. Copy every agent into ledger_master under the 'agent' group.
INSERT INTO ledger_master
  (ledger_group_id, name, mobile, gst_no, pan_no, address, city, state, pincode, commission_pct, created_by, billbybill)
SELECT (SELECT id FROM ledger_group WHERE group_name='agent' LIMIT 1),
       am.name, am.mobile, am.gst_no, am.pan_no, am.address, am.city, am.state, am.pincode,
       am.commission_pct, am.created_by, 'No'
FROM agent_master am;

-- 2. Drop the old FK so agent_id can point at ledger_master.
ALTER TABLE vch_details DROP FOREIGN KEY fk_vch_details_agent_id;

-- 3. Repoint existing agent_id values (match the old agent by name).
UPDATE vch_details v
JOIN agent_master am ON am.id = v.agent_id
JOIN ledger_master lm ON lm.name = am.name
   AND lm.ledger_group_id = (SELECT id FROM ledger_group WHERE group_name='agent' LIMIT 1)
SET v.agent_id = lm.id;

-- 4. New FK -> ledger_master.
ALTER TABLE vch_details
  ADD CONSTRAINT fk_vch_details_agent_id FOREIGN KEY (agent_id)
  REFERENCES ledger_master(id) ON DELETE SET NULL;

-- 5. Retire the standalone table.
DROP TABLE agent_master;
