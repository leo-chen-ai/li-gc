-- =============================================================================
-- MIGRATION 025: Managed Attendance
-- =============================================================================
-- Stores lightweight managed attendance configuration, photo groups, and
-- generated preview records. These records are separate from real attendance.
-- =============================================================================

CREATE TABLE construction_managed_attendance_photo_groups (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,

    name              VARCHAR(200) NOT NULL,
    generation_status VARCHAR(32) NOT NULL DEFAULT 'draft',
    in_photos         JSONB NOT NULL DEFAULT '[]'::jsonb,
    out_photos        JSONB NOT NULL DEFAULT '[]'::jsonb,
    remark            TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_construction_managed_attendance_photo_groups_project_id
    ON construction_managed_attendance_photo_groups(project_id);
CREATE INDEX idx_construction_managed_attendance_photo_groups_is_deleted
    ON construction_managed_attendance_photo_groups(is_deleted);

CREATE TRIGGER update_construction_managed_attendance_photo_groups_updated_at
    BEFORE UPDATE ON construction_managed_attendance_photo_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE construction_managed_attendance_configs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    worker_id               UUID NOT NULL REFERENCES construction_workers(id) ON DELETE CASCADE,
    photo_group_id          UUID REFERENCES construction_managed_attendance_photo_groups(id) ON DELETE SET NULL,
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,

    monthly_attendance_days SMALLINT NOT NULL,
    shift                   VARCHAR(16) NOT NULL DEFAULT 'day',
    check_in_time           VARCHAR(8) NOT NULL,
    check_out_time          VARCHAR(8) NOT NULL,
    is_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
    remark                  TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,

    CONSTRAINT chk_managed_attendance_monthly_days
        CHECK (monthly_attendance_days BETWEEN 1 AND 31),
    CONSTRAINT chk_managed_attendance_shift
        CHECK (shift IN ('day', 'night'))
);

CREATE INDEX idx_construction_managed_attendance_configs_project_id
    ON construction_managed_attendance_configs(project_id);
CREATE INDEX idx_construction_managed_attendance_configs_worker_id
    ON construction_managed_attendance_configs(worker_id);
CREATE INDEX idx_construction_managed_attendance_configs_photo_group_id
    ON construction_managed_attendance_configs(photo_group_id);
CREATE INDEX idx_construction_managed_attendance_configs_is_enabled
    ON construction_managed_attendance_configs(is_enabled);
CREATE INDEX idx_construction_managed_attendance_configs_is_deleted
    ON construction_managed_attendance_configs(is_deleted);
CREATE UNIQUE INDEX idx_construction_managed_attendance_configs_active_unique
    ON construction_managed_attendance_configs(project_id, worker_id, shift)
    WHERE is_deleted = FALSE;

CREATE TRIGGER update_construction_managed_attendance_configs_updated_at
    BEFORE UPDATE ON construction_managed_attendance_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE construction_managed_attendance_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id           UUID NOT NULL REFERENCES construction_managed_attendance_configs(id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    worker_id           UUID NOT NULL REFERENCES construction_workers(id) ON DELETE CASCADE,
    photo_group_id      UUID REFERENCES construction_managed_attendance_photo_groups(id) ON DELETE SET NULL,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,

    worker_name         VARCHAR(200),
    worker_id_card_mask VARCHAR(64),
    attendance_date     DATE NOT NULL,
    direction           SMALLINT NOT NULL,
    shift               VARCHAR(16) NOT NULL,
    planned_at          TIMESTAMPTZ NOT NULL,
    photo_url           TEXT,
    status              VARCHAR(32) NOT NULL DEFAULT 'generated',
    error_message       TEXT,
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT chk_managed_attendance_record_direction
        CHECK (direction IN (0, 1)),
    CONSTRAINT chk_managed_attendance_record_shift
        CHECK (shift IN ('day', 'night'))
);

CREATE INDEX idx_construction_managed_attendance_records_config_id
    ON construction_managed_attendance_records(config_id);
CREATE INDEX idx_construction_managed_attendance_records_project_id
    ON construction_managed_attendance_records(project_id);
CREATE INDEX idx_construction_managed_attendance_records_worker_id
    ON construction_managed_attendance_records(worker_id);
CREATE INDEX idx_construction_managed_attendance_records_attendance_date
    ON construction_managed_attendance_records(attendance_date);
CREATE INDEX idx_construction_managed_attendance_records_status
    ON construction_managed_attendance_records(status);
CREATE INDEX idx_construction_managed_attendance_records_is_deleted
    ON construction_managed_attendance_records(is_deleted);
CREATE UNIQUE INDEX idx_construction_managed_attendance_records_unique_active
    ON construction_managed_attendance_records(config_id, attendance_date, direction)
    WHERE is_deleted = FALSE;

CREATE TRIGGER update_construction_managed_attendance_records_updated_at
    BEFORE UPDATE ON construction_managed_attendance_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

INSERT INTO role_menu_permissions (role_id, menu_key)
SELECT id, 'managed_attendance'
FROM role_configs
WHERE code = 'admin'
ON CONFLICT (role_id, menu_key) DO NOTHING;
