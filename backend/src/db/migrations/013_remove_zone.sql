-- Zone master removed entirely (table, column, FK, and all UI). Drop the FK and
-- column from vch_details, then the zone_master table.
ALTER TABLE vch_details DROP FOREIGN KEY fk_vch_details_zone_id;
ALTER TABLE vch_details DROP COLUMN zone_id;
DROP TABLE IF EXISTS zone_master;
