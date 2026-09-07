ALTER TABLE construction_managed_attendance_records
    ADD COLUMN photo_source VARCHAR(32) NOT NULL DEFAULT 'photo_group';

COMMENT ON COLUMN construction_managed_attendance_records.photo_source IS
    '托管照片来源：photo_group照片组、attendance_history人员历史真实考勤';

ALTER TABLE construction_managed_attendance_records
    ADD CONSTRAINT chk_managed_attendance_photo_source
    CHECK (photo_source IN ('photo_group', 'attendance_history'));

CREATE INDEX idx_dispatch_jobs_managed_attendance_match
    ON device_dispatch_jobs(worker_id, device_sn, managed_attendance_record_id)
    WHERE job_type = 'supplemental_attendance';

CREATE OR REPLACE FUNCTION mark_managed_generated_attendance()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_managed_generated := NEW.is_managed_generated OR EXISTS (
        SELECT 1
        FROM device_dispatch_jobs job
        JOIN construction_managed_attendance_records managed
          ON managed.id = job.managed_attendance_record_id
         AND managed.is_deleted = FALSE
        WHERE job.job_type = 'supplemental_attendance'
          AND job.worker_id = NEW.worker_id
          AND managed.direction = NEW.direction
          AND job.device_sn = COALESCE(
              NULLIF(BTRIM(NEW.serial_number), ''),
              NULLIF(BTRIM(NEW.equipment_id), '')
          )
          AND ABS(EXTRACT(EPOCH FROM (NEW.trigger_time - managed.planned_at))) <= 600
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
