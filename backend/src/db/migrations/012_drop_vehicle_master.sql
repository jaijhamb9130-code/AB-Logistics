-- Vehicles already live in ledger_master (the 'Vehicles' group); the standalone
-- vehicle_master table is an unused orphan (0 rows, no FK references, no live
-- code path). Drop it.
DROP TABLE IF EXISTS vehicle_master;
