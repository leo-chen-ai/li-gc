DROP INDEX IF EXISTS idx_dispatch_jobs_managed_attendance_match;

ALTER TABLE construction_managed_attendance_records
    DROP CONSTRAINT IF EXISTS chk_managed_attendance_photo_source,
    DROP COLUMN IF EXISTS photo_source;

CREATE OR REPLACE FUNCTION mark_managed_generated_attendance()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_managed_generated := EXISTS (
        SELECT 1
        FROM device_dispatch_jobs job
        JOIN construction_managed_attendance_records managed
          ON managed.id = job.managed_attendance_record_id
         AND managed.is_deleted = FALSE
        WHERE job.job_type = 'supplemental_attendance'
          AND job.worker_id = NEW.worker_id
          AND managed.direction = NEW.direction
          AND (NEW.serial_number IS NULL OR job.device_sn = NEW.serial_number)
          AND ABS(EXTRACT(EPOCH FROM (NEW.trigger_time - managed.planned_at))) <= 600
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
