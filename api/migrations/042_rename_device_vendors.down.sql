-- 回滚：恢复旧厂家名称。
UPDATE construction_attendance_devices
SET device_type = 'B厂家'
WHERE device_type = '弹厂家';

UPDATE construction_attendance_devices
SET device_type = 'A厂家'
WHERE device_type = '海厂家';

UPDATE construction_attendance_device_issue_reports
SET device_type = 'B厂家'
WHERE device_type = '弹厂家';

UPDATE construction_attendance_device_issue_reports
SET device_type = 'A厂家'
WHERE device_type = '海厂家';

DROP INDEX IF EXISTS idx_attendance_devices_b_serial_normalized;
CREATE INDEX idx_attendance_devices_b_serial_normalized
    ON construction_attendance_devices (BTRIM(serial_number))
    WHERE is_deleted = FALSE AND device_type = 'B厂家';
