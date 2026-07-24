-- =============================================================================
-- MIGRATION 037: Data reporting center / browser report forwarding
-- =============================================================================

CREATE OR REPLACE FUNCTION report_forward_next_run(p_time TIME, p_timezone TEXT)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    candidate TIMESTAMPTZ;
BEGIN
    candidate := (((NOW() AT TIME ZONE p_timezone)::date + p_time) AT TIME ZONE p_timezone);
    IF candidate <= NOW() THEN
        candidate := candidate + INTERVAL '1 day';
    END IF;
    RETURN candidate;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE TABLE report_forward_configs (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted                    BOOLEAN NOT NULL DEFAULT FALSE,

    name                          VARCHAR(200) NOT NULL,
    adapter                       VARCHAR(80) NOT NULL DEFAULT 'xzy_zjzwfw',
    lifecycle_status              VARCHAR(24) NOT NULL DEFAULT 'draft'
                                  CHECK (lifecycle_status IN ('draft', 'testing', 'production', 'paused')),
    is_enabled                    BOOLEAN NOT NULL DEFAULT FALSE,

    source_base_url               TEXT NOT NULL DEFAULT 'http://tg.91jtg.com',
    source_username               VARCHAR(200) NOT NULL,
    source_password_cipher        BYTEA NOT NULL,
    project_mode                  VARCHAR(16) NOT NULL DEFAULT 'all'
                                  CHECK (project_mode IN ('all', 'selected')),
    include_projects              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    exclude_projects              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    target_base_url               TEXT NOT NULL DEFAULT 'https://www.zjzwfw.gov.cn',
    target_username               VARCHAR(200) NOT NULL,
    target_password_cipher        BYTEA NOT NULL,
    verification_type             VARCHAR(32) NOT NULL DEFAULT 'feishu'
                                  CHECK (verification_type IN ('feishu', 'manual')),
    verification_config_cipher    BYTEA,

    schedule_time                 TIME NOT NULL DEFAULT TIME '23:00',
    schedule_timezone             VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
    next_run_at                   TIMESTAMPTZ,
    settings                      JSONB NOT NULL DEFAULT '{}'::jsonb,
    remark                        TEXT,

    created_by_user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                    TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_report_forward_configs_name_active
    ON report_forward_configs(name) WHERE is_deleted = FALSE;
CREATE INDEX idx_report_forward_configs_due
    ON report_forward_configs(next_run_at)
    WHERE is_deleted = FALSE AND is_enabled = TRUE AND lifecycle_status = 'production';

CREATE TRIGGER update_report_forward_configs_updated_at
    BEFORE UPDATE ON report_forward_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE report_forward_runs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id             UUID REFERENCES report_forward_configs(id) ON DELETE SET NULL,
    config_name           VARCHAR(200) NOT NULL,
    trigger_type          VARCHAR(24) NOT NULL DEFAULT 'manual'
                          CHECK (trigger_type IN ('scheduled', 'manual', 'retry', 'test')),
    run_mode              VARCHAR(40) NOT NULL DEFAULT 'production'
                          CHECK (run_mode IN (
                              'production', 'test_source_login', 'test_project_list',
                              'test_download', 'test_transform', 'test_target_login',
                              'test_upload_validate', 'test_submit', 'test_full'
                          )),
    priority              INTEGER NOT NULL DEFAULT 50,
    status                VARCHAR(24) NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                              'pending', 'running', 'cancelling', 'cancelled',
                              'success', 'partial_success', 'failed'
                          )),
    current_stage         VARCHAR(64) NOT NULL DEFAULT 'queued',
    scheduled_date        DATE,
    options               JSONB NOT NULL DEFAULT '{}'::jsonb,

    discovered_count      INTEGER NOT NULL DEFAULT 0,
    downloaded_count      INTEGER NOT NULL DEFAULT 0,
    converted_count       INTEGER NOT NULL DEFAULT 0,
    item_count            INTEGER NOT NULL DEFAULT 0,
    uploaded_count        INTEGER NOT NULL DEFAULT 0,
    success_count         INTEGER NOT NULL DEFAULT 0,
    failure_count         INTEGER NOT NULL DEFAULT 0,

    cancel_requested      BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_by            VARCHAR(160),
    lease_expires_at      TIMESTAMPTZ,
    attempt_count         INTEGER NOT NULL DEFAULT 0,
    parent_run_id         UUID REFERENCES report_forward_runs(id) ON DELETE SET NULL,
    requested_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    started_at            TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ,
    error_summary         TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_report_forward_runs_scheduled_once
    ON report_forward_runs(config_id, scheduled_date)
    WHERE trigger_type = 'scheduled' AND run_mode = 'production';
CREATE INDEX idx_report_forward_runs_queue
    ON report_forward_runs(status, priority DESC, created_at)
    WHERE status IN ('pending', 'running', 'cancelling');
CREATE INDEX idx_report_forward_runs_config_created
    ON report_forward_runs(config_id, created_at DESC);

CREATE TRIGGER update_report_forward_runs_updated_at
    BEFORE UPDATE ON report_forward_runs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE report_forward_run_projects (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                UUID NOT NULL REFERENCES report_forward_runs(id) ON DELETE CASCADE,
    external_project_id   VARCHAR(240),
    external_project_name VARCHAR(500) NOT NULL,
    status                VARCHAR(32) NOT NULL DEFAULT 'discovered',
    current_stage         VARCHAR(64) NOT NULL DEFAULT 'discovered',
    source_row_count      INTEGER NOT NULL DEFAULT 0,
    converted_row_count   INTEGER NOT NULL DEFAULT 0,
    upload_total_count    INTEGER NOT NULL DEFAULT 0,
    upload_success_count  INTEGER NOT NULL DEFAULT 0,
    upload_failure_count  INTEGER NOT NULL DEFAULT 0,
    target_receipt        JSONB,
    last_error            TEXT,
    started_at            TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_id, external_project_name)
);

CREATE INDEX idx_report_forward_run_projects_run
    ON report_forward_run_projects(run_id, created_at);
CREATE TRIGGER update_report_forward_run_projects_updated_at
    BEFORE UPDATE ON report_forward_run_projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE report_forward_items (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                UUID NOT NULL REFERENCES report_forward_runs(id) ON DELETE CASCADE,
    run_project_id        UUID NOT NULL REFERENCES report_forward_run_projects(id) ON DELETE CASCADE,
    source_row_no         INTEGER,
    person_name           VARCHAR(200) NOT NULL,
    gender                VARCHAR(32),
    household_type        VARCHAR(100),
    identity_type         VARCHAR(64),
    identity_cipher       BYTEA,
    identity_fingerprint  VARCHAR(64) NOT NULL,
    phone_cipher          BYTEA,
    address_cipher        BYTEA,
    status                VARCHAR(32) NOT NULL DEFAULT 'converted',
    target_result         JSONB,
    last_error            TEXT,
    pushed_at             TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_project_id, identity_fingerprint)
);

CREATE INDEX idx_report_forward_items_run_status
    ON report_forward_items(run_id, status);
CREATE INDEX idx_report_forward_items_project_status
    ON report_forward_items(run_project_id, status);
CREATE TRIGGER update_report_forward_items_updated_at
    BEFORE UPDATE ON report_forward_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE report_forward_artifacts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                UUID NOT NULL REFERENCES report_forward_runs(id) ON DELETE CASCADE,
    run_project_id        UUID REFERENCES report_forward_run_projects(id) ON DELETE CASCADE,
    artifact_type         VARCHAR(40) NOT NULL,
    object_key            TEXT NOT NULL,
    original_filename     TEXT NOT NULL,
    content_type          VARCHAR(160),
    byte_size             BIGINT NOT NULL DEFAULT 0,
    sha256                VARCHAR(64) NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_forward_artifacts_run
    ON report_forward_artifacts(run_id, artifact_type, created_at);

CREATE TABLE report_forward_events (
    id                    BIGSERIAL PRIMARY KEY,
    run_id                UUID NOT NULL REFERENCES report_forward_runs(id) ON DELETE CASCADE,
    run_project_id        UUID REFERENCES report_forward_run_projects(id) ON DELETE CASCADE,
    stage                 VARCHAR(64) NOT NULL,
    level                 VARCHAR(16) NOT NULL DEFAULT 'info'
                          CHECK (level IN ('debug', 'info', 'warning', 'error')),
    message               TEXT NOT NULL,
    context               JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_forward_events_run_created
    ON report_forward_events(run_id, id);

CREATE TABLE report_forward_worker_heartbeats (
    worker_id             VARCHAR(160) PRIMARY KEY,
    pod_name              VARCHAR(200),
    status                VARCHAR(24) NOT NULL DEFAULT 'idle',
    current_run_id        UUID REFERENCES report_forward_runs(id) ON DELETE SET NULL,
    worker_version        VARCHAR(80),
    last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO role_menu_permissions (role_id, menu_key)
SELECT id, 'data_reporting'
FROM role_configs
WHERE code = 'admin'
ON CONFLICT DO NOTHING;
