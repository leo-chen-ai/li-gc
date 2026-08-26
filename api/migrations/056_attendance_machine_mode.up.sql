-- =============================================================================
-- MIGRATION 056: Attendance Machine Mode (考勤机模式)
-- =============================================================================
-- 1. construction_attendance_points：项目考勤点，带考勤机模式开关。
-- 2. construction_attendance_records：新增 record_type / attendance_point_id，
--    支持“考勤点考勤”类型。
-- 3. construction_face_enrollments：工人人脸异步入库队列（推送到人脸服务）。
-- =============================================================================

CREATE TABLE construction_attendance_points (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,
    project_id           UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,

    name                 VARCHAR(200) NOT NULL,
    location             VARCHAR(400),
    machine_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    remark               TEXT,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ
);

COMMENT ON TABLE construction_attendance_points IS '项目考勤点：考勤机模式下的打卡点位配置';
COMMENT ON COLUMN construction_attendance_points.id IS '考勤点 ID（UUID）';
COMMENT ON COLUMN construction_attendance_points.is_deleted IS '是否已删除（逻辑删除标记）';
COMMENT ON COLUMN construction_attendance_points.project_id IS '所属项目 ID，关联 construction_projects.id';
COMMENT ON COLUMN construction_attendance_points.name IS '考勤点名称，如“东门闸机”';
COMMENT ON COLUMN construction_attendance_points.location IS '考勤点位置描述（文字说明）';
COMMENT ON COLUMN construction_attendance_points.machine_mode_enabled IS '是否开启考勤机模式（开启后小程序可刷脸打卡）';
COMMENT ON COLUMN construction_attendance_points.remark IS '备注';
COMMENT ON COLUMN construction_attendance_points.created_at IS '创建时间（带时区）';
COMMENT ON COLUMN construction_attendance_points.updated_at IS '更新时间（带时区）';
COMMENT ON COLUMN construction_attendance_points.deleted_at IS '删除时间（带时区），未删除为 NULL';

CREATE INDEX idx_construction_attendance_points_project_id
    ON construction_attendance_points(project_id);
CREATE INDEX idx_construction_attendance_points_is_deleted
    ON construction_attendance_points(is_deleted);

CREATE TRIGGER update_construction_attendance_points_updated_at
    BEFORE UPDATE ON construction_attendance_points
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 考勤记录扩展：考勤点考勤类型
ALTER TABLE construction_attendance_records
    ADD COLUMN record_type VARCHAR(40) NOT NULL DEFAULT 'device',
    ADD COLUMN attendance_point_id UUID REFERENCES construction_attendance_points(id) ON DELETE SET NULL;

COMMENT ON COLUMN construction_attendance_records.record_type IS '考勤来源类型：device=考勤机设备，attendance_point=考勤点考勤（人脸识别），manual=手工补录';
COMMENT ON COLUMN construction_attendance_records.attendance_point_id IS '考勤点 ID，record_type 为 attendance_point 时关联 construction_attendance_points.id';

CREATE INDEX idx_construction_attendance_records_record_type
    ON construction_attendance_records(record_type);
CREATE INDEX idx_construction_attendance_records_point_id
    ON construction_attendance_records(attendance_point_id);

-- 人脸异步入库队列
CREATE TABLE construction_face_enrollments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    worker_id      UUID NOT NULL REFERENCES construction_workers(id) ON DELETE CASCADE,

    status         VARCHAR(20) NOT NULL DEFAULT 'pending',
    action         VARCHAR(20) NOT NULL DEFAULT 'upsert',
    attempt_count  INTEGER NOT NULL DEFAULT 0,
    last_error     TEXT,
    synced_at      TIMESTAMPTZ,

    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE construction_face_enrollments IS '工人人脸异步入库队列：将工人头像人脸特征同步到人脸识别服务（按项目独立人脸库）';
COMMENT ON COLUMN construction_face_enrollments.id IS '队列任务 ID（UUID）';
COMMENT ON COLUMN construction_face_enrollments.project_id IS '所属项目 ID，人脸库按项目隔离';
COMMENT ON COLUMN construction_face_enrollments.worker_id IS '工人 ID，关联 construction_workers.id，作为人脸服务中的 person_id';
COMMENT ON COLUMN construction_face_enrollments.status IS '同步状态：pending=待同步，processing=同步中，synced=已同步，failed=同步失败';
COMMENT ON COLUMN construction_face_enrollments.action IS '同步动作：upsert=注册/更新人脸，delete=删除人脸';
COMMENT ON COLUMN construction_face_enrollments.attempt_count IS '已尝试次数（用于退避重试）';
COMMENT ON COLUMN construction_face_enrollments.last_error IS '最近一次同步失败原因';
COMMENT ON COLUMN construction_face_enrollments.synced_at IS '同步成功时间（带时区）';
COMMENT ON COLUMN construction_face_enrollments.created_at IS '创建时间（带时区）';
COMMENT ON COLUMN construction_face_enrollments.updated_at IS '更新时间（带时区）';

CREATE INDEX idx_construction_face_enrollments_status
    ON construction_face_enrollments(status, created_at);
CREATE INDEX idx_construction_face_enrollments_project_id
    ON construction_face_enrollments(project_id);
CREATE UNIQUE INDEX idx_construction_face_enrollments_worker_pending
    ON construction_face_enrollments(worker_id, action)
    WHERE status IN ('pending', 'processing');

CREATE TRIGGER update_construction_face_enrollments_updated_at
    BEFORE UPDATE ON construction_face_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
