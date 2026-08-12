CREATE TABLE system_warning_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warning_type    VARCHAR(32) NOT NULL,
    project_id      UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    device_id       UUID REFERENCES construction_attendance_devices(id) ON DELETE CASCADE,
    worker_id       UUID REFERENCES construction_workers(id) ON DELETE CASCADE,
    warning_date    DATE NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    title           VARCHAR(200) NOT NULL,
    message         TEXT NOT NULL,
    details         JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_system_warning_records_type
        CHECK (warning_type IN ('device_offline', 'management_team_no_attendance')),
    CONSTRAINT chk_system_warning_records_target
        CHECK (
            (warning_type = 'device_offline' AND device_id IS NOT NULL AND worker_id IS NULL)
            OR
            (warning_type = 'management_team_no_attendance' AND worker_id IS NOT NULL AND device_id IS NULL)
        )
);

COMMENT ON TABLE system_warning_records IS '首页及预警管理使用的系统预警明细记录';
COMMENT ON COLUMN system_warning_records.id IS '预警记录主键';
COMMENT ON COLUMN system_warning_records.warning_type IS '预警类型：device_offline考勤机离线，management_team_no_attendance管理班组人员14点未考勤';
COMMENT ON COLUMN system_warning_records.project_id IS '预警所属施工项目ID';
COMMENT ON COLUMN system_warning_records.device_id IS '离线预警对应的考勤机ID，仅考勤机离线类型有值';
COMMENT ON COLUMN system_warning_records.worker_id IS '未考勤预警对应的人员ID，仅管理班组未考勤类型有值';
COMMENT ON COLUMN system_warning_records.warning_date IS '预警业务日期，按Asia/Shanghai时区计算';
COMMENT ON COLUMN system_warning_records.occurred_at IS '预警条件首次满足的时间';
COMMENT ON COLUMN system_warning_records.title IS '预警标题快照';
COMMENT ON COLUMN system_warning_records.message IS '预警内容快照';
COMMENT ON COLUMN system_warning_records.details IS '设备、人员、班组等预警上下文JSON快照';
COMMENT ON COLUMN system_warning_records.resolved_at IS '预警恢复时间；为空表示仍在预警中';
COMMENT ON COLUMN system_warning_records.created_at IS '记录创建时间';
COMMENT ON COLUMN system_warning_records.updated_at IS '记录最后更新时间';

CREATE UNIQUE INDEX idx_system_warning_active_device
    ON system_warning_records(device_id)
    WHERE warning_type = 'device_offline' AND resolved_at IS NULL;
CREATE UNIQUE INDEX idx_system_warning_worker_date
    ON system_warning_records(worker_id, warning_date)
    WHERE warning_type = 'management_team_no_attendance';
CREATE INDEX idx_system_warning_project_created
    ON system_warning_records(project_id, created_at DESC);
CREATE INDEX idx_system_warning_type_created
    ON system_warning_records(warning_type, created_at DESC);

CREATE TRIGGER update_system_warning_records_updated_at
    BEFORE UPDATE ON system_warning_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
