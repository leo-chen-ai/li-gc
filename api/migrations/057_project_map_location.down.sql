-- =============================================================================
-- MIGRATION 057 (down): Project Map Location
-- =============================================================================

ALTER TABLE construction_projects
    DROP COLUMN IF EXISTS latitude,
    DROP COLUMN IF EXISTS map_poi_name,
    DROP COLUMN IF EXISTS map_address;
