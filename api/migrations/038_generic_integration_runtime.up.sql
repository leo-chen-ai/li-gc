-- =============================================================================
-- MIGRATION 038: Generic integration runtime and Yongxin V2 platform
-- =============================================================================

INSERT INTO integration_platforms (
    code,
    name,
    adapter,
    auth_type,
    config,
    remark
)
VALUES (
    'yongxin_v2',
    '甬薪',
    'yongxin_v2',
    'appkey_timestamp_md5',
    jsonb_build_object(
        'capabilities', jsonb_build_array(
            'project_query',
            'unit_sync',
            'team_sync',
            'worker_sync',
            'entry_exit_sync',
            'attendance_sync',
            'image_upload',
            'async_result'
        ),
        'rate_limit_per_second', 2
    ),
    '甬薪。项目凭证和功能开关由项目平台配置维护。'
)
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_configs_yongxin_project_active
    ON construction_platform_configs(project_id, platform_type)
    WHERE is_deleted = FALSE AND platform_type = 'yongxin_v2';

ALTER TABLE integration_outbox_events
    ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(240);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_outbox_events_dedupe_key
    ON integration_outbox_events(dedupe_key)
    WHERE dedupe_key IS NOT NULL;

ALTER TABLE integration_jobs
    ADD COLUMN IF NOT EXISTS external_request_id VARCHAR(200),
    ADD COLUMN IF NOT EXISTS remote_state VARCHAR(32),
    ADD COLUMN IF NOT EXISTS result_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_integration_jobs_external_request
    ON integration_jobs(platform_code, external_request_id)
    WHERE external_request_id IS NOT NULL;

CREATE TABLE integration_rate_limits (
    platform_code  VARCHAR(80) NOT NULL,
    rate_key       VARCHAR(200) NOT NULL,
    next_allowed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (platform_code, rate_key)
);

CREATE TABLE integration_media_mappings (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    binding_id         UUID NOT NULL REFERENCES integration_project_bindings(id) ON DELETE CASCADE,
    project_id         UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    local_entity_type  VARCHAR(80) NOT NULL,
    local_entity_id    UUID NOT NULL,
    media_kind         VARCHAR(80) NOT NULL,
    content_sha256     VARCHAR(64) NOT NULL,
    external_path      TEXT NOT NULL,
    external_payload   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_integration_media_mappings_content
    ON integration_media_mappings(binding_id, content_sha256);
CREATE INDEX idx_integration_media_mappings_entity
    ON integration_media_mappings(binding_id, local_entity_type, local_entity_id, media_kind);

CREATE TRIGGER update_integration_media_mappings_updated_at
    BEFORE UPDATE ON integration_media_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Domain changes are captured in the same database transaction as the write.
-- The trigger only records platform-neutral facts; adapters decide whether they
-- support the event and each platform receives a separate integration job.
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
    event_project_id := (source_row ->> 'project_id')::uuid;
    event_aggregate_id := (source_row ->> 'id')::uuid;

    event_aggregate_type := CASE TG_TABLE_NAME
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
            OLD.work_status IS DISTINCT FROM NEW.work_status
            OR OLD.team_id IS DISTINCT FROM NEW.team_id
            OR OLD.entry_time IS DISTINCT FROM NEW.entry_time
            OR OLD.exit_time IS DISTINCT FROM NEW.exit_time
        );
    END IF;

    -- A deleted row can no longer be loaded by an asynchronous worker. Keep a
    -- private snapshot for the adapter, but never expose it in user-facing logs.
    IF TG_OP = 'DELETE' THEN
        event_payload := event_payload || jsonb_build_object('deleted_snapshot', source_row);
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

DROP TRIGGER IF EXISTS emit_construction_units_integration_event ON construction_units;
CREATE TRIGGER emit_construction_units_integration_event
    AFTER INSERT OR UPDATE OR DELETE ON construction_units
    FOR EACH ROW EXECUTE FUNCTION emit_construction_integration_event();

DROP TRIGGER IF EXISTS emit_construction_teams_integration_event ON construction_teams;
CREATE TRIGGER emit_construction_teams_integration_event
    AFTER INSERT OR UPDATE OR DELETE ON construction_teams
    FOR EACH ROW EXECUTE FUNCTION emit_construction_integration_event();

DROP TRIGGER IF EXISTS emit_construction_workers_integration_event ON construction_workers;
CREATE TRIGGER emit_construction_workers_integration_event
    AFTER INSERT OR UPDATE OR DELETE ON construction_workers
    FOR EACH ROW EXECUTE FUNCTION emit_construction_integration_event();

CREATE OR REPLACE FUNCTION emit_integration_binding_bootstrap_event()
RETURNS TRIGGER AS $$
DECLARE
    source_row JSONB;
BEGIN
    source_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    INSERT INTO integration_outbox_events (
        project_id, event_type, aggregate_type, aggregate_id, payload, status
    )
    VALUES (
        (source_row ->> 'project_id')::uuid,
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

DROP TRIGGER IF EXISTS emit_integration_binding_bootstrap ON construction_platform_configs;
CREATE TRIGGER emit_integration_binding_bootstrap
    AFTER INSERT OR UPDATE OR DELETE ON construction_platform_configs
    FOR EACH ROW EXECUTE FUNCTION emit_integration_binding_bootstrap_event();
