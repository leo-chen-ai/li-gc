-- =============================================================================
-- MIGRATION 010: Attendance Device Bindings
-- =============================================================================
-- Stores attendance machine bindings per construction project.
-- =============================================================================

CREATE TABLE construction_attendance_devices (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
    project_id     UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,

    device_type    VARCHAR(100) NOT NULL DEFAULT 'A厂家',
    serial_number  VARCHAR(200),
    device_name    VARCHAR(200),
    direction      SMALLINT NOT NULL DEFAULT 0,
    remark         TEXT,

    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ
);

CREATE INDEX idx_construction_attendance_devices_project_id
    ON construction_attendance_devices(project_id);
CREATE INDEX idx_construction_attendance_devices_serial_number
    ON construction_attendance_devices(serial_number);
CREATE INDEX idx_construction_attendance_devices_direction
    ON construction_attendance_devices(direction);
CREATE INDEX idx_construction_attendance_devices_is_deleted
    ON construction_attendance_devices(is_deleted);
CREATE UNIQUE INDEX idx_construction_attendance_devices_project_serial_active
    ON construction_attendance_devices(project_id, serial_number)
    WHERE is_deleted = FALSE AND serial_number IS NOT NULL;

CREATE TRIGGER update_construction_attendance_devices_updated_at
    BEFORE UPDATE ON construction_attendance_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

INSERT INTO role_menu_permissions (role_id, menu_key)
SELECT id, 'attendance_devices'
FROM role_configs
WHERE code = 'admin'
ON CONFLICT (role_id, menu_key) DO NOTHING;
