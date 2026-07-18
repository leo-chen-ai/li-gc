ALTER TABLE construction_attendance_device_issue_reports
    ADD COLUMN mqtt_message_id VARCHAR(200),
    ADD COLUMN request_payload JSONB,
    ADD COLUMN response_payload JSONB,
    ADD COLUMN acknowledged_at TIMESTAMPTZ;

CREATE INDEX idx_construction_attendance_device_issue_reports_mqtt_message_id
    ON construction_attendance_device_issue_reports(mqtt_message_id);
