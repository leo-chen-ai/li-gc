DROP INDEX IF EXISTS idx_construction_attendance_devices_last_seen_at;
DROP INDEX IF EXISTS idx_construction_attendance_devices_online_status;

ALTER TABLE construction_attendance_devices
    DROP COLUMN IF EXISTS last_mqtt_payload,
    DROP COLUMN IF EXISTS last_mqtt_topic,
    DROP COLUMN IF EXISTS last_offline_at,
    DROP COLUMN IF EXISTS last_online_at,
    DROP COLUMN IF EXISTS last_heartbeat_at,
    DROP COLUMN IF EXISTS last_seen_at,
    DROP COLUMN IF EXISTS online_status;
