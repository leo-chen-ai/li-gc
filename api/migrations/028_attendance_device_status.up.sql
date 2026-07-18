ALTER TABLE construction_attendance_devices
    ADD COLUMN online_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
    ADD COLUMN last_seen_at TIMESTAMPTZ,
    ADD COLUMN last_heartbeat_at TIMESTAMPTZ,
    ADD COLUMN last_online_at TIMESTAMPTZ,
    ADD COLUMN last_offline_at TIMESTAMPTZ,
    ADD COLUMN last_mqtt_topic VARCHAR(300),
    ADD COLUMN last_mqtt_payload JSONB;

CREATE INDEX idx_construction_attendance_devices_online_status
    ON construction_attendance_devices(online_status);

CREATE INDEX idx_construction_attendance_devices_last_seen_at
    ON construction_attendance_devices(last_seen_at DESC);
