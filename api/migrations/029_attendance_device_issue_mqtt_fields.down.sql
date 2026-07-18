DROP INDEX IF EXISTS idx_construction_attendance_device_issue_reports_mqtt_message_id;

ALTER TABLE construction_attendance_device_issue_reports
    DROP COLUMN IF EXISTS mqtt_message_id,
    DROP COLUMN IF EXISTS request_payload,
    DROP COLUMN IF EXISTS response_payload,
    DROP COLUMN IF EXISTS acknowledged_at;
