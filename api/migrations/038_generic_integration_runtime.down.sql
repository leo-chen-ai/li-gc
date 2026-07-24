DROP TRIGGER IF EXISTS emit_integration_binding_bootstrap ON construction_platform_configs;
DROP FUNCTION IF EXISTS emit_integration_binding_bootstrap_event();
DROP INDEX IF EXISTS idx_platform_configs_yongxin_project_active;

DROP TRIGGER IF EXISTS emit_construction_workers_integration_event ON construction_workers;
DROP TRIGGER IF EXISTS emit_construction_teams_integration_event ON construction_teams;
DROP TRIGGER IF EXISTS emit_construction_units_integration_event ON construction_units;
DROP FUNCTION IF EXISTS emit_construction_integration_event();

DROP TABLE IF EXISTS integration_media_mappings;
DROP TABLE IF EXISTS integration_rate_limits;

DROP INDEX IF EXISTS idx_integration_jobs_external_request;
ALTER TABLE integration_jobs
    DROP COLUMN IF EXISTS expires_at,
    DROP COLUMN IF EXISTS result_checked_at,
    DROP COLUMN IF EXISTS remote_state,
    DROP COLUMN IF EXISTS external_request_id;

DROP INDEX IF EXISTS idx_integration_outbox_events_dedupe_key;
ALTER TABLE integration_outbox_events DROP COLUMN IF EXISTS dedupe_key;

DELETE FROM integration_platforms WHERE code = 'yongxin_v2';
