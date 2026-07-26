DROP TRIGGER IF EXISTS emit_construction_projects_integration_event ON construction_projects;
DROP FUNCTION IF EXISTS platform_job_matches_config(UUID, TEXT, UUID, UUID, UUID, TEXT);

DROP INDEX IF EXISTS idx_integration_project_bindings_platform_config;
DROP INDEX IF EXISTS idx_integration_project_bindings_config_active;
DROP INDEX IF EXISTS idx_integration_project_bindings_project_platform_active;

-- A rollback to the former schema can retain only one active binding/config
-- for each project and platform because that schema cannot represent more.
UPDATE integration_project_bindings binding
SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
WHERE binding.is_deleted = FALSE
  AND EXISTS (
      SELECT 1
      FROM integration_project_bindings earlier
      WHERE earlier.project_id = binding.project_id
        AND earlier.platform_id = binding.platform_id
        AND earlier.is_deleted = FALSE
        AND (earlier.created_at, earlier.id) < (binding.created_at, binding.id)
  );

ALTER TABLE integration_project_bindings DROP COLUMN IF EXISTS platform_config_id;

CREATE UNIQUE INDEX idx_integration_project_bindings_project_platform_active
    ON integration_project_bindings(project_id, platform_id)
    WHERE is_deleted = FALSE;

UPDATE construction_platform_configs config
SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
WHERE config.platform_type = 'yongxin_v2'
  AND config.is_deleted = FALSE
  AND EXISTS (
      SELECT 1
      FROM construction_platform_configs earlier
      WHERE earlier.project_id = config.project_id
        AND earlier.platform_type = config.platform_type
        AND earlier.is_deleted = FALSE
        AND (earlier.created_at, earlier.id) < (config.created_at, config.id)
  );

CREATE UNIQUE INDEX idx_platform_configs_yongxin_project_active
    ON construction_platform_configs(project_id, platform_type)
    WHERE is_deleted = FALSE AND platform_type = 'yongxin_v2';

DELETE FROM integration_platforms WHERE code = 'xinleda';
