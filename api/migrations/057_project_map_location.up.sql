-- =============================================================================
-- MIGRATION 057: Project Map Location (项目地图定位)
-- =============================================================================
-- construction_projects 增加高德地图选点字段。
-- 注意：本迁移按生产库已应用的变更重建（详见 _sqlx_migrations version=57），
-- 字段定义与生产库保持一致，全部幂等。
-- =============================================================================

ALTER TABLE construction_projects
    ADD COLUMN IF NOT EXISTS latitude VARCHAR(200),
    ADD COLUMN IF NOT EXISTS map_poi_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS map_address VARCHAR(255);

COMMENT ON COLUMN construction_projects.latitude IS '地图定位纬度（高德 GCJ-02）';
COMMENT ON COLUMN construction_projects.map_poi_name IS '地图定位 POI 名称（高德选点）';
COMMENT ON COLUMN construction_projects.map_address IS '地图定位规范化地址（高德选点）';
