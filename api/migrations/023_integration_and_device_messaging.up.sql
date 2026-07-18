-- =============================================================================
-- MIGRATION 023: Integration and Device Messaging Ledger
-- =============================================================================
-- Durable ledger for upstream platform integrations, internal jobs, and
-- attendance-device MQTT dispatch.
-- =============================================================================

CREATE TABLE integration_platforms (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,

    code                VARCHAR(80) NOT NULL,
    name                VARCHAR(200) NOT NULL,
    adapter             VARCHAR(80) NOT NULL,
    base_url            TEXT,
    auth_type           VARCHAR(80) NOT NULL DEFAULT 'none',
    config              JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    remark              TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_integration_platforms_code_active
    ON integration_platforms(code)
    WHERE is_deleted = FALSE;
CREATE INDEX idx_integration_platforms_adapter ON integration_platforms(adapter);
CREATE INDEX idx_integration_platforms_is_enabled ON integration_platforms(is_enabled);

CREATE TRIGGER update_integration_platforms_updated_at
    BEFORE UPDATE ON integration_platforms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE integration_project_bindings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    project_id          UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    platform_id         UUID NOT NULL REFERENCES integration_platforms(id) ON DELETE CASCADE,

    external_project_id VARCHAR(200),
    base_url            TEXT,
    credentials         JSONB NOT NULL DEFAULT '{}'::jsonb,
    config              JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled_events      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    is_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_at        TIMESTAMPTZ,
    remark              TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_integration_project_bindings_project_platform_active
    ON integration_project_bindings(project_id, platform_id)
    WHERE is_deleted = FALSE;
CREATE INDEX idx_integration_project_bindings_project_id
    ON integration_project_bindings(project_id);
CREATE INDEX idx_integration_project_bindings_platform_id
    ON integration_project_bindings(platform_id);
CREATE INDEX idx_integration_project_bindings_enabled
    ON integration_project_bindings(is_enabled);

CREATE TRIGGER update_integration_project_bindings_updated_at
    BEFORE UPDATE ON integration_project_bindings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE integration_entity_mappings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    binding_id          UUID NOT NULL REFERENCES integration_project_bindings(id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,

    entity_type         VARCHAR(80) NOT NULL,
    local_entity_id     UUID NOT NULL,
    external_entity_id  VARCHAR(200) NOT NULL,
    external_parent_id  VARCHAR(200),
    external_payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_pushed_at      TIMESTAMPTZ,
    remark              TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_integration_entity_mappings_local_active
    ON integration_entity_mappings(binding_id, entity_type, local_entity_id)
    WHERE is_deleted = FALSE;
CREATE UNIQUE INDEX idx_integration_entity_mappings_external_active
    ON integration_entity_mappings(binding_id, entity_type, external_entity_id)
    WHERE is_deleted = FALSE;
CREATE INDEX idx_integration_entity_mappings_project_type
    ON integration_entity_mappings(project_id, entity_type);

CREATE TRIGGER update_integration_entity_mappings_updated_at
    BEFORE UPDATE ON integration_entity_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE integration_outbox_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID REFERENCES construction_projects(id) ON DELETE CASCADE,

    event_type          VARCHAR(120) NOT NULL,
    aggregate_type      VARCHAR(80) NOT NULL,
    aggregate_id        UUID,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    status              VARCHAR(32) NOT NULL DEFAULT 'pending',
    published_at        TIMESTAMPTZ,
    locked_by           VARCHAR(120),
    locked_until        TIMESTAMPTZ,
    attempts            INTEGER NOT NULL DEFAULT 0,
    last_error          TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integration_outbox_events_status_created
    ON integration_outbox_events(status, created_at);
CREATE INDEX idx_integration_outbox_events_project_id
    ON integration_outbox_events(project_id);
CREATE INDEX idx_integration_outbox_events_aggregate
    ON integration_outbox_events(aggregate_type, aggregate_id);

CREATE TRIGGER update_integration_outbox_events_updated_at
    BEFORE UPDATE ON integration_outbox_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE integration_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID REFERENCES construction_projects(id) ON DELETE CASCADE,
    binding_id          UUID REFERENCES integration_project_bindings(id) ON DELETE SET NULL,
    outbox_event_id     UUID REFERENCES integration_outbox_events(id) ON DELETE SET NULL,

    platform_code       VARCHAR(80) NOT NULL,
    operation           VARCHAR(120) NOT NULL,
    entity_type         VARCHAR(80),
    local_entity_id     UUID,
    idempotency_key     VARCHAR(200) NOT NULL,
    request_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_payload    JSONB,
    status              VARCHAR(32) NOT NULL DEFAULT 'pending',
    attempt_count       INTEGER NOT NULL DEFAULT 0,
    max_attempts        INTEGER NOT NULL DEFAULT 5,
    next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by           VARCHAR(120),
    locked_until        TIMESTAMPTZ,
    last_error          TEXT,
    completed_at        TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_integration_jobs_idempotency_key
    ON integration_jobs(idempotency_key);
CREATE INDEX idx_integration_jobs_status_next
    ON integration_jobs(status, next_attempt_at, id);
CREATE INDEX idx_integration_jobs_platform_status
    ON integration_jobs(platform_code, status, next_attempt_at);
CREATE INDEX idx_integration_jobs_project_id
    ON integration_jobs(project_id);
CREATE INDEX idx_integration_jobs_binding_id
    ON integration_jobs(binding_id);

CREATE TRIGGER update_integration_jobs_updated_at
    BEFORE UPDATE ON integration_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE integration_attempts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES integration_jobs(id) ON DELETE CASCADE,
    project_id          UUID REFERENCES construction_projects(id) ON DELETE CASCADE,
    binding_id          UUID REFERENCES integration_project_bindings(id) ON DELETE SET NULL,

    attempt_no          INTEGER NOT NULL,
    transport           VARCHAR(32) NOT NULL DEFAULT 'http',
    request_method      VARCHAR(16),
    request_url         TEXT,
    request_headers     JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_body        JSONB,
    response_status     INTEGER,
    response_body       JSONB,
    duration_ms         INTEGER,
    status              VARCHAR(32) NOT NULL,
    error_message       TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integration_attempts_job_id ON integration_attempts(job_id);
CREATE INDEX idx_integration_attempts_project_created
    ON integration_attempts(project_id, created_at);
CREATE INDEX idx_integration_attempts_status_created
    ON integration_attempts(status, created_at);

CREATE TABLE integration_event_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID REFERENCES construction_projects(id) ON DELETE CASCADE,
    binding_id          UUID REFERENCES integration_project_bindings(id) ON DELETE SET NULL,
    job_id              UUID REFERENCES integration_jobs(id) ON DELETE SET NULL,

    platform_code       VARCHAR(80),
    event_type          VARCHAR(120) NOT NULL,
    level               VARCHAR(16) NOT NULL DEFAULT 'info',
    message             TEXT NOT NULL,
    context             JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integration_event_logs_project_created
    ON integration_event_logs(project_id, created_at DESC);
CREATE INDEX idx_integration_event_logs_job_created
    ON integration_event_logs(job_id, created_at);
CREATE INDEX idx_integration_event_logs_platform_created
    ON integration_event_logs(platform_code, created_at DESC);

CREATE TABLE integration_token_cache (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    binding_id          UUID NOT NULL REFERENCES integration_project_bindings(id) ON DELETE CASCADE,
    token_key           VARCHAR(120) NOT NULL DEFAULT 'default',
    access_token        TEXT NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_integration_token_cache_binding_key
    ON integration_token_cache(binding_id, token_key);
CREATE INDEX idx_integration_token_cache_expires_at
    ON integration_token_cache(expires_at);

CREATE TRIGGER update_integration_token_cache_updated_at
    BEFORE UPDATE ON integration_token_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE device_dispatch_batches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,

    source              VARCHAR(80) NOT NULL DEFAULT 'manual',
    source_ref          VARCHAR(200),
    status              VARCHAR(32) NOT NULL DEFAULT 'pending',
    total_count         INTEGER NOT NULL DEFAULT 0,
    success_count       INTEGER NOT NULL DEFAULT 0,
    failed_count        INTEGER NOT NULL DEFAULT 0,
    pending_count       INTEGER NOT NULL DEFAULT 0,
    last_error          TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_dispatch_batches_project_created
    ON device_dispatch_batches(project_id, created_at DESC);
CREATE INDEX idx_device_dispatch_batches_status_updated
    ON device_dispatch_batches(status, updated_at);

CREATE TRIGGER update_device_dispatch_batches_updated_at
    BEFORE UPDATE ON device_dispatch_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE device_dispatch_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id            UUID REFERENCES device_dispatch_batches(id) ON DELETE SET NULL,
    project_id          UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    worker_id           UUID REFERENCES construction_workers(id) ON DELETE SET NULL,
    attendance_device_id UUID REFERENCES construction_attendance_devices(id) ON DELETE SET NULL,

    device_sn           VARCHAR(200) NOT NULL,
    action              VARCHAR(32) NOT NULL,
    mqtt_topic          VARCHAR(300) NOT NULL,
    message_id          VARCHAR(200) NOT NULL,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    status              VARCHAR(32) NOT NULL DEFAULT 'pending',
    attempt_count       INTEGER NOT NULL DEFAULT 0,
    max_attempts        INTEGER NOT NULL DEFAULT 3,
    next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at             TIMESTAMPTZ,
    ack_at              TIMESTAMPTZ,
    ack_code            VARCHAR(32),
    ack_payload         JSONB,
    last_error          TEXT,
    locked_by           VARCHAR(120),
    locked_until        TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_device_dispatch_jobs_message_id
    ON device_dispatch_jobs(message_id);
CREATE INDEX idx_device_dispatch_jobs_device_status_next
    ON device_dispatch_jobs(device_sn, status, next_attempt_at, id);
CREATE INDEX idx_device_dispatch_jobs_project_status
    ON device_dispatch_jobs(project_id, status, updated_at);
CREATE INDEX idx_device_dispatch_jobs_worker_device
    ON device_dispatch_jobs(project_id, worker_id, device_sn);

CREATE TRIGGER update_device_dispatch_jobs_updated_at
    BEFORE UPDATE ON device_dispatch_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE device_dispatch_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id            UUID REFERENCES device_dispatch_batches(id) ON DELETE SET NULL,
    job_id              UUID REFERENCES device_dispatch_jobs(id) ON DELETE CASCADE,

    event_type          VARCHAR(80) NOT NULL,
    message             TEXT,
    payload             JSONB,
    response_payload    JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_dispatch_events_job_created
    ON device_dispatch_events(job_id, created_at);
CREATE INDEX idx_device_dispatch_events_batch_created
    ON device_dispatch_events(batch_id, created_at);
CREATE INDEX idx_device_dispatch_events_type_created
    ON device_dispatch_events(event_type, created_at);

CREATE TABLE device_mqtt_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID REFERENCES construction_projects(id) ON DELETE CASCADE,
    attendance_device_id UUID REFERENCES construction_attendance_devices(id) ON DELETE SET NULL,

    device_sn           VARCHAR(200),
    direction           VARCHAR(16) NOT NULL,
    topic               VARCHAR(300) NOT NULL,
    operator            VARCHAR(80),
    message_id          VARCHAR(200),
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ,
    processing_status   VARCHAR(32) NOT NULL DEFAULT 'pending',
    error_message       TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_mqtt_messages_device_received
    ON device_mqtt_messages(device_sn, received_at DESC);
CREATE INDEX idx_device_mqtt_messages_topic_received
    ON device_mqtt_messages(topic, received_at DESC);
CREATE INDEX idx_device_mqtt_messages_status_received
    ON device_mqtt_messages(processing_status, received_at);

INSERT INTO integration_platforms (code, name, adapter, auth_type, base_url, config, remark)
VALUES (
    'zhenhai',
    'Zhenhai HugeSight',
    'zhenhai',
    'hugesight_token',
    'http://36.134.183.141:3020',
    '{
        "aes": "cbc-pkcs7",
        "token_path": "/api/comm/getToken",
        "endpoints": {
            "add_team": {"method": "POST", "path": "/api/comm/addTeam", "body": "form"},
            "add_staff_v2": {"method": "POST", "path": "/pro/api/comm/addStaff_v2", "body": "json"},
            "update_staff": {"method": "POST", "path": "/pro/api/comm/updateStaff", "body": "json"},
            "leave_staff": {"method": "POST", "path": "/api/comm/leaveStaff", "body": "form"},
            "restore_staff": {"method": "POST", "path": "/api/comm/restoreStaff", "body": "form"},
            "add_device": {"method": "POST", "path": "/pro/api/comm/addDevice", "body": "form"}
        }
    }'::jsonb,
    'Default upstream platform definition. Project credentials live in integration_project_bindings.'
)
ON CONFLICT DO NOTHING;
