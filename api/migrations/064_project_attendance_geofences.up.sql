CREATE TABLE construction_project_attendance_settings (
    project_id UUID PRIMARY KEY REFERENCES construction_projects(id),
    worker_attendance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    require_location BOOLEAN NOT NULL DEFAULT TRUE,
    require_face BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE construction_project_attendance_settings IS '项目工人小程序打卡规则配置';
COMMENT ON COLUMN construction_project_attendance_settings.project_id IS '项目UUID，与项目一对一';
COMMENT ON COLUMN construction_project_attendance_settings.worker_attendance_enabled IS '是否允许工人在小程序发起打卡';
COMMENT ON COLUMN construction_project_attendance_settings.require_location IS '工人打卡时是否必须提交定位并位于启用围栏内';
COMMENT ON COLUMN construction_project_attendance_settings.require_face IS '工人打卡时是否必须完成人脸识别';
COMMENT ON COLUMN construction_project_attendance_settings.created_at IS '配置创建时间';
COMMENT ON COLUMN construction_project_attendance_settings.updated_at IS '配置最后更新时间';

CREATE TABLE construction_attendance_geofences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES construction_projects(id),
    name TEXT NOT NULL,
    polygon JSONB NOT NULL,
    coordinate_system TEXT NOT NULL DEFAULT 'gcj02',
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    remark TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_construction_attendance_geofences_project
    ON construction_attendance_geofences(project_id, is_deleted, is_enabled);

COMMENT ON TABLE construction_attendance_geofences IS '项目工人小程序打卡的多边形电子围栏区域';
COMMENT ON COLUMN construction_attendance_geofences.id IS '电子围栏UUID';
COMMENT ON COLUMN construction_attendance_geofences.project_id IS '所属项目UUID';
COMMENT ON COLUMN construction_attendance_geofences.name IS '考勤区域名称';
COMMENT ON COLUMN construction_attendance_geofences.polygon IS '多边形顶点数组，格式为[{longitude,latitude}]，至少3点，首尾由系统自动闭合';
COMMENT ON COLUMN construction_attendance_geofences.coordinate_system IS '坐标系，当前固定为gcj02';
COMMENT ON COLUMN construction_attendance_geofences.is_enabled IS '是否启用该考勤区域';
COMMENT ON COLUMN construction_attendance_geofences.remark IS '考勤区域备注';
COMMENT ON COLUMN construction_attendance_geofences.is_deleted IS '软删除标记';
COMMENT ON COLUMN construction_attendance_geofences.deleted_at IS '软删除时间，未删除时为空';
COMMENT ON COLUMN construction_attendance_geofences.created_at IS '区域创建时间';
COMMENT ON COLUMN construction_attendance_geofences.updated_at IS '区域最后更新时间';
