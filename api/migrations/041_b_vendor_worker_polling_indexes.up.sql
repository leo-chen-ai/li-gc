-- B厂家设备按序列号轮询人员时使用，避免对设备绑定表做全表扫描。
CREATE INDEX idx_attendance_devices_b_serial_normalized
    ON construction_attendance_devices (BTRIM(serial_number))
    WHERE is_deleted = FALSE AND device_type = 'B厂家';

-- B厂家增量查询按项目和事件时间读取人员变更及删除快照。
CREATE INDEX idx_outbox_worker_changes_project_created
    ON integration_outbox_events (project_id, created_at, aggregate_id)
    WHERE event_type = 'construction.worker.changed'
      AND aggregate_type = 'worker';
