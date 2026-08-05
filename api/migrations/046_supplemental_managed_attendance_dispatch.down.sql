DELETE FROM role_menu_permissions
WHERE menu_key = 'supplemental_attendance';

DROP INDEX IF EXISTS idx_device_dispatch_jobs_managed_record;
DROP INDEX IF EXISTS idx_device_dispatch_jobs_supplemental_claim;
DROP INDEX IF EXISTS idx_device_dispatch_jobs_managed_record_device;

ALTER TABLE device_dispatch_jobs
    DROP CONSTRAINT IF EXISTS chk_supplemental_dispatch_identity,
    DROP CONSTRAINT IF EXISTS chk_device_dispatch_result_status,
    DROP CONSTRAINT IF EXISTS chk_device_dispatch_transport,
    DROP CONSTRAINT IF EXISTS chk_device_dispatch_job_type,
    DROP CONSTRAINT IF EXISTS chk_device_dispatch_job_platform_status;

DELETE FROM device_dispatch_jobs
WHERE job_type = 'supplemental_attendance' OR mqtt_topic IS NULL;

ALTER TABLE device_dispatch_jobs
    DROP COLUMN IF EXISTS device_reported_at,
    DROP COLUMN IF EXISTS device_result_message,
    DROP COLUMN IF EXISTS device_result_status,
    DROP COLUMN IF EXISTS managed_attendance_record_id,
    DROP COLUMN IF EXISTS transport,
    DROP COLUMN IF EXISTS adapter_code,
    DROP COLUMN IF EXISTS job_type,
    ALTER COLUMN mqtt_topic SET NOT NULL;

COMMENT ON COLUMN device_dispatch_jobs.mqtt_topic IS 'MQTT主题';
COMMENT ON COLUMN device_dispatch_jobs.status IS '状态';

DROP INDEX IF EXISTS idx_managed_attendance_configs_device_id;

ALTER TABLE construction_managed_attendance_configs
    DROP COLUMN IF EXISTS attendance_device_id;
