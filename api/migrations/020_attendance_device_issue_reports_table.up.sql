-- =============================================================================
-- MIGRATION 020: Attendance Device Issue Reports
-- =============================================================================
-- Stores worker profile issue actions sent to attendance devices.
-- =============================================================================

CREATE TABLE construction_attendance_device_issue_reports (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted            BOOLEAN NOT NULL DEFAULT FALSE,
    project_id            UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    worker_id             UUID REFERENCES construction_workers(id) ON DELETE SET NULL,
    attendance_device_id  UUID REFERENCES construction_attendance_devices(id) ON DELETE SET NULL,

    worker_name           VARCHAR(200),
    worker_id_card        VARCHAR(50),
    worker_phone          VARCHAR(50),
    avatar_url            TEXT,
    device_name           VARCHAR(200),
    serial_number         VARCHAR(200),
    device_type           VARCHAR(100),
    action                VARCHAR(32) NOT NULL DEFAULT 'create',
    status                VARCHAR(32) NOT NULL DEFAULT 'pending',
    issued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    message               TEXT,
    remark                TEXT,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_construction_attendance_device_issue_reports_project_id
    ON construction_attendance_device_issue_reports(project_id);
CREATE INDEX idx_construction_attendance_device_issue_reports_worker_id
    ON construction_attendance_device_issue_reports(worker_id);
CREATE INDEX idx_construction_attendance_device_issue_reports_device_id
    ON construction_attendance_device_issue_reports(attendance_device_id);
CREATE INDEX idx_construction_attendance_device_issue_reports_status
    ON construction_attendance_device_issue_reports(status);
CREATE INDEX idx_construction_attendance_device_issue_reports_action
    ON construction_attendance_device_issue_reports(action);
CREATE INDEX idx_construction_attendance_device_issue_reports_issued_at
    ON construction_attendance_device_issue_reports(issued_at);
CREATE INDEX idx_construction_attendance_device_issue_reports_is_deleted
    ON construction_attendance_device_issue_reports(is_deleted);

CREATE TRIGGER update_construction_attendance_device_issue_reports_updated_at
    BEFORE UPDATE ON construction_attendance_device_issue_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
