CREATE TABLE construction_attendance_alert_configs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    project_id          UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    is_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    check_managers      BOOLEAN NOT NULL DEFAULT TRUE,
    check_workers       BOOLEAN NOT NULL DEFAULT TRUE,
    check_supervisors   BOOLEAN NOT NULL DEFAULT TRUE,
    remark              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_construction_attendance_alert_configs_project_active
    ON construction_attendance_alert_configs(project_id)
    WHERE is_deleted = FALSE;
CREATE INDEX idx_construction_attendance_alert_configs_enabled
    ON construction_attendance_alert_configs(is_enabled);

CREATE TRIGGER update_construction_attendance_alert_configs_updated_at
    BEFORE UPDATE ON construction_attendance_alert_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE construction_attendance_alert_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    config_id           UUID REFERENCES construction_attendance_alert_configs(id) ON DELETE SET NULL,
    project_id          UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    alert_date          DATE NOT NULL,
    category            VARCHAR(32) NOT NULL,
    trigger_type        VARCHAR(32) NOT NULL DEFAULT 'manual',
    status              VARCHAR(32) NOT NULL DEFAULT 'logged',
    expected_count      INTEGER NOT NULL DEFAULT 0,
    attendance_count    INTEGER NOT NULL DEFAULT 0,
    absent_count        INTEGER NOT NULL DEFAULT 0,
    message             TEXT NOT NULL,
    details             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT chk_construction_attendance_alert_logs_category
        CHECK (category IN ('manager', 'worker', 'supervisor')),
    CONSTRAINT chk_construction_attendance_alert_logs_trigger_type
        CHECK (trigger_type IN ('manual', 'scheduled')),
    CONSTRAINT chk_construction_attendance_alert_logs_status
        CHECK (status IN ('logged', 'failed'))
);

CREATE UNIQUE INDEX idx_construction_attendance_alert_logs_project_date_category_active
    ON construction_attendance_alert_logs(project_id, alert_date, category)
    WHERE is_deleted = FALSE;
CREATE INDEX idx_construction_attendance_alert_logs_project_created
    ON construction_attendance_alert_logs(project_id, created_at DESC);
CREATE INDEX idx_construction_attendance_alert_logs_date_category
    ON construction_attendance_alert_logs(alert_date DESC, category);

CREATE TRIGGER update_construction_attendance_alert_logs_updated_at
    BEFORE UPDATE ON construction_attendance_alert_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

INSERT INTO role_menu_permissions (role_id, menu_key)
SELECT id, 'attendance_alerts'
FROM role_configs
WHERE code = 'admin'
ON CONFLICT (role_id, menu_key) DO NOTHING;
