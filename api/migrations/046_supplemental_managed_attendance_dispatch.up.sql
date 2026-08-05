ALTER TABLE construction_managed_attendance_configs
    ADD COLUMN attendance_device_id UUID REFERENCES construction_attendance_devices(id) ON DELETE SET NULL;

COMMENT ON COLUMN construction_managed_attendance_configs.attendance_device_id IS '托管考勤补录目标设备ID，可为空；设备必须有效且属于同一项目';

CREATE INDEX idx_managed_attendance_configs_device_id
    ON construction_managed_attendance_configs(attendance_device_id)
    WHERE attendance_device_id IS NOT NULL;

ALTER TABLE device_dispatch_jobs
    ALTER COLUMN mqtt_topic DROP NOT NULL,
    ADD COLUMN job_type VARCHAR(64) NOT NULL DEFAULT 'legacy_device_dispatch',
    ADD COLUMN adapter_code VARCHAR(100) NOT NULL DEFAULT 'legacy_mqtt',
    ADD COLUMN transport VARCHAR(32) NOT NULL DEFAULT 'mqtt',
    ADD COLUMN managed_attendance_record_id UUID REFERENCES construction_managed_attendance_records(id) ON DELETE CASCADE,
    ADD COLUMN device_result_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    ADD COLUMN device_result_message TEXT,
    ADD COLUMN device_reported_at TIMESTAMPTZ;

COMMENT ON COLUMN device_dispatch_jobs.mqtt_topic IS 'MQTT下发主题；HTTP拉取等非MQTT任务为空';
COMMENT ON COLUMN device_dispatch_jobs.status IS '平台投递状态：pending待投递、processing投递中、delivered已送达设备接口、failed投递失败、skipped已跳过';
COMMENT ON COLUMN device_dispatch_jobs.job_type IS '任务类型：legacy_device_dispatch历史设备下发、supplemental_attendance补录考勤下发';
COMMENT ON COLUMN device_dispatch_jobs.adapter_code IS '设备协议适配器稳定编码，如vendor_b；unsupported_前缀表示暂不支持';
COMMENT ON COLUMN device_dispatch_jobs.transport IS '任务传输方式：mqtt、http_pull或unsupported';
COMMENT ON COLUMN device_dispatch_jobs.managed_attendance_record_id IS '关联的托管考勤补录记录ID，仅补录考勤任务使用';
COMMENT ON COLUMN device_dispatch_jobs.device_result_status IS '设备处理结果：pending待反馈、accepted已受理、success处理成功、failed处理失败';
COMMENT ON COLUMN device_dispatch_jobs.device_result_message IS '设备反馈消息或不支持设备适配器的明确原因';
COMMENT ON COLUMN device_dispatch_jobs.device_reported_at IS '设备结果上报时间，带时区；优先采用设备传入时间';

UPDATE device_dispatch_jobs
SET status = CASE
        WHEN status IN ('success', 'acknowledged', 'completed') THEN 'delivered'
        WHEN status IN ('pending', 'processing', 'delivered', 'failed', 'skipped') THEN status
        ELSE 'failed'
    END,
    last_error = CASE
        WHEN status NOT IN (
            'pending', 'processing', 'delivered', 'failed', 'skipped',
            'success', 'acknowledged', 'completed'
        ) THEN CONCAT('迁移前未知平台投递状态：', status)
        ELSE last_error
    END;

ALTER TABLE device_dispatch_jobs
    ADD CONSTRAINT chk_device_dispatch_job_platform_status
        CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'skipped')),
    ADD CONSTRAINT chk_device_dispatch_job_type
        CHECK (job_type IN ('legacy_device_dispatch', 'supplemental_attendance')),
    ADD CONSTRAINT chk_device_dispatch_transport
        CHECK (transport IN ('mqtt', 'http_pull', 'unsupported')),
    ADD CONSTRAINT chk_device_dispatch_result_status
        CHECK (device_result_status IN ('pending', 'accepted', 'success', 'failed')),
    ADD CONSTRAINT chk_supplemental_dispatch_identity
        CHECK (
            job_type <> 'supplemental_attendance'
            OR managed_attendance_record_id IS NOT NULL
        );

CREATE UNIQUE INDEX idx_device_dispatch_jobs_managed_record_device
    ON device_dispatch_jobs(managed_attendance_record_id, attendance_device_id)
    WHERE managed_attendance_record_id IS NOT NULL AND attendance_device_id IS NOT NULL;

CREATE INDEX idx_device_dispatch_jobs_supplemental_claim
    ON device_dispatch_jobs(attendance_device_id, adapter_code, status, next_attempt_at, locked_until, id)
    WHERE job_type = 'supplemental_attendance';

CREATE INDEX idx_device_dispatch_jobs_managed_record
    ON device_dispatch_jobs(managed_attendance_record_id, updated_at DESC)
    WHERE managed_attendance_record_id IS NOT NULL;

INSERT INTO role_menu_permissions (role_id, menu_key)
SELECT id, 'supplemental_attendance'
FROM role_configs
WHERE code = 'admin'
ON CONFLICT (role_id, menu_key) DO NOTHING;
