-- 厂家名称从 B厂家 改为 弹厂家，更新部分索引的过滤条件。
DROP INDEX IF EXISTS idx_attendance_devices_b_serial_normalized;
CREATE INDEX idx_attendance_devices_b_serial_normalized
    ON construction_attendance_devices (BTRIM(serial_number))
    WHERE is_deleted = FALSE AND device_type = '弹厂家';

-- 同时更新已有设备记录中的 device_type 值。
UPDATE construction_attendance_devices
SET device_type = '弹厂家'
WHERE device_type = 'B厂家';

UPDATE construction_attendance_devices
SET device_type = '海厂家'
WHERE device_type = 'A厂家';

-- 更新历史报告中的 device_type 值。
UPDATE construction_attendance_device_issue_reports
SET device_type = '弹厂家'
WHERE device_type = 'B厂家';

UPDATE construction_attendance_device_issue_reports
SET device_type = '海厂家'
WHERE device_type = 'A厂家';
