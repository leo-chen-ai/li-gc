-- =============================================================================
-- MIGRATION 040: Xinleda OpenAPI V2.9 and per-config integration bindings
-- =============================================================================

INSERT INTO integration_platforms (
    code, name, adapter, auth_type, config, remark
)
VALUES (
    'xinleda',
    '薪乐达',
    'xinleda',
    'appid_sha256_aes_cbc',
    jsonb_build_object(
        'capabilities', jsonb_build_array(
            'file_upload',
            'async_log_query',
            'company_import',
            'company_safeguard',
            'project_import',
            'labourer_entry_exit',
            'attendance_import',
            'manager_entry_exit',
            'labourer_import'
        ),
        'rate_limit_per_method_seconds', 1
    ),
    '浙江省企业工资支付监管平台 OpenAPI V2.9；凭证、项目编码和功能开关由项目平台配置维护。'
)
ON CONFLICT (code) WHERE is_deleted = FALSE DO UPDATE SET
    name = EXCLUDED.name,
    adapter = EXCLUDED.adapter,
    auth_type = EXCLUDED.auth_type,
    config = EXCLUDED.config,
    remark = EXCLUDED.remark,
    is_enabled = TRUE,
    updated_at = NOW();

-- One project can connect multiple companies/accounts of the same platform.
-- A runtime binding therefore belongs to one concrete platform config row,
-- rather than only to the project + platform type pair.
DROP INDEX IF EXISTS idx_platform_configs_yongxin_project_active;

ALTER TABLE integration_project_bindings
    ADD COLUMN platform_config_id UUID REFERENCES construction_platform_configs(id) ON DELETE CASCADE;

WITH binding_config_candidates AS (
    SELECT DISTINCT ON (binding.id)
        binding.id AS binding_id,
        config.id AS config_id
    FROM integration_project_bindings binding
    JOIN integration_platforms platform
      ON platform.id = binding.platform_id
    JOIN construction_platform_configs config
      ON config.project_id = binding.project_id
     AND config.is_deleted = FALSE
     AND (
         config.platform_type = platform.code
         OR (config.platform_type = 'ningbo_housing' AND platform.code = 'zhenhai')
     )
    WHERE binding.platform_config_id IS NULL
    ORDER BY binding.id, config.created_at, config.id
)
UPDATE integration_project_bindings binding
SET platform_config_id = candidate.config_id
FROM binding_config_candidates candidate
WHERE binding.id = candidate.binding_id;

DROP INDEX IF EXISTS idx_integration_project_bindings_project_platform_active;
CREATE INDEX idx_integration_project_bindings_project_platform_active
    ON integration_project_bindings(project_id, platform_id)
    WHERE is_deleted = FALSE;
CREATE UNIQUE INDEX idx_integration_project_bindings_config_active
    ON integration_project_bindings(platform_config_id)
    WHERE is_deleted = FALSE AND platform_config_id IS NOT NULL;
CREATE INDEX idx_integration_project_bindings_platform_config
    ON integration_project_bindings(platform_config_id)
    WHERE platform_config_id IS NOT NULL;

-- New jobs identify one concrete config through their binding. Historical
-- rows can have no binding; expose those only when the project has a single
-- active config of that platform, otherwise the owning account is ambiguous.
CREATE OR REPLACE FUNCTION platform_job_matches_config(
    p_job_binding_id UUID,
    p_job_platform_code TEXT,
    p_binding_config_id UUID,
    p_config_id UUID,
    p_project_id UUID,
    p_platform_type TEXT
)
RETURNS BOOLEAN AS $$
    SELECT p_binding_config_id = p_config_id
        OR (
            p_job_binding_id IS NULL
            -- Only the pre-binding Zhenhai ledger used unbound jobs. New
            -- adapters (including Xinleda) must never fall back by platform
            -- code because a deleted account could then leak into another
            -- account's status view.
            AND p_platform_type = 'ningbo_housing'
            AND p_job_platform_code = 'zhenhai'
            AND 1 = (
                SELECT COUNT(*)
                FROM construction_platform_configs candidate
                WHERE candidate.project_id = p_project_id
                  AND candidate.is_deleted = FALSE
                  AND candidate.is_enabled = TRUE
                  AND candidate.platform_type = p_platform_type
            )
        );
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION emit_construction_integration_event()
RETURNS TRIGGER AS $$
DECLARE
    source_row JSONB;
    event_project_id UUID;
    event_aggregate_id UUID;
    event_aggregate_type TEXT;
    event_type TEXT;
    event_payload JSONB;
BEGIN
    source_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    event_project_id := CASE
        WHEN TG_TABLE_NAME = 'construction_projects' THEN (source_row ->> 'id')::uuid
        ELSE (source_row ->> 'project_id')::uuid
    END;
    event_aggregate_id := (source_row ->> 'id')::uuid;

    event_aggregate_type := CASE TG_TABLE_NAME
        WHEN 'construction_projects' THEN 'project'
        WHEN 'construction_units' THEN 'unit'
        WHEN 'construction_teams' THEN 'team'
        WHEN 'construction_workers' THEN 'worker'
        ELSE TG_TABLE_NAME
    END;
    event_type := 'construction.' || event_aggregate_type || '.changed';
    event_payload := jsonb_build_object(
        'operation', lower(TG_OP),
        'source_table', TG_TABLE_NAME,
        'occurred_at', clock_timestamp()
    );

    IF TG_TABLE_NAME = 'construction_workers' AND TG_OP = 'UPDATE' THEN
        event_payload := event_payload || jsonb_build_object(
            'entry_exit_changed',
            (to_jsonb(OLD) -> 'work_status') IS DISTINCT FROM (to_jsonb(NEW) -> 'work_status')
            OR (to_jsonb(OLD) -> 'team_id') IS DISTINCT FROM (to_jsonb(NEW) -> 'team_id')
            OR (to_jsonb(OLD) -> 'entry_time') IS DISTINCT FROM (to_jsonb(NEW) -> 'entry_time')
            OR (to_jsonb(OLD) -> 'exit_time') IS DISTINCT FROM (to_jsonb(NEW) -> 'exit_time')
        );
    END IF;

    IF TG_OP = 'DELETE' THEN
        event_payload := event_payload || jsonb_build_object('deleted_snapshot', source_row);
    END IF;

    -- Parent project deletion cascades into units/teams/workers after the
    -- project row is no longer visible. Do not recreate an event whose FK
    -- points at that disappearing project.
    IF NOT EXISTS (
        SELECT 1 FROM construction_projects project WHERE project.id = event_project_id
    ) THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    INSERT INTO integration_outbox_events (
        project_id, event_type, aggregate_type, aggregate_id, payload, status
    )
    VALUES (
        event_project_id, event_type, event_aggregate_type,
        event_aggregate_id, event_payload, 'pending'
    );

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION emit_integration_binding_bootstrap_event()
RETURNS TRIGGER AS $$
DECLARE
    source_row JSONB;
    event_project_id UUID;
BEGIN
    source_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    event_project_id := (source_row ->> 'project_id')::uuid;
    IF NOT EXISTS (
        SELECT 1 FROM construction_projects project WHERE project.id = event_project_id
    ) THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    INSERT INTO integration_outbox_events (
        project_id, event_type, aggregate_type, aggregate_id, payload, status
    )
    VALUES (
        event_project_id,
        'integration.binding.bootstrap',
        'platform_config',
        (source_row ->> 'id')::uuid,
        jsonb_build_object(
            'operation', lower(TG_OP),
            'platform_type', source_row ->> 'platform_type',
            'occurred_at', clock_timestamp()
        ),
        'pending'
    );
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS emit_construction_projects_integration_event ON construction_projects;
CREATE TRIGGER emit_construction_projects_integration_event
    AFTER INSERT OR UPDATE ON construction_projects
    FOR EACH ROW EXECUTE FUNCTION emit_construction_integration_event();
