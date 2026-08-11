DROP INDEX IF EXISTS idx_construction_attendance_devices_qianyi_pubtopic;
DROP INDEX IF EXISTS idx_construction_attendance_devices_qianyi_serial_normalized;

COMMENT ON COLUMN construction_attendance_devices.qianyi_subtopic IS NULL;
COMMENT ON COLUMN construction_attendance_devices.qianyi_pubtopic IS NULL;

ALTER TABLE construction_attendance_devices
    DROP COLUMN IF EXISTS qianyi_pubtopic,
    DROP COLUMN IF EXISTS qianyi_subtopic;
