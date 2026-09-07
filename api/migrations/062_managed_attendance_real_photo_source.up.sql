ALTER TABLE construction_managed_attendance_configs
    ADD COLUMN use_attendance_record_photos BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN construction_managed_attendance_configs.use_attendance_record_photos IS
    '是否允许从该人员7天前的真实考勤记录中随机选取同日成对进出照片作为托管照片来源';

ALTER TABLE construction_attendance_records
    ADD COLUMN is_managed_generated BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN construction_attendance_records.is_managed_generated IS
    '内部来源标识：是否由人员考勤托管产生；仅用于防止托管照片被再次抽取，不对外暴露';

CREATE INDEX idx_attendance_real_photo_candidates
    ON construction_attendance_records(project_id, worker_id, trigger_time DESC, direction)
    WHERE is_deleted = FALSE
      AND is_generated = FALSE
      AND is_managed_generated = FALSE;

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

CREATE TRIGGER mark_managed_generated_attendance_before_insert
    BEFORE INSERT ON construction_attendance_records
    FOR EACH ROW
    EXECUTE FUNCTION mark_managed_generated_attendance();

UPDATE construction_attendance_records attendance
SET is_managed_generated = TRUE
WHERE attendance.is_managed_generated = FALSE
  AND EXISTS (
      SELECT 1
      FROM device_dispatch_jobs job
      JOIN construction_managed_attendance_records managed
        ON managed.id = job.managed_attendance_record_id
       AND managed.is_deleted = FALSE
      WHERE job.job_type = 'supplemental_attendance'
        AND job.worker_id = attendance.worker_id
        AND managed.direction = attendance.direction
        AND (attendance.serial_number IS NULL OR job.device_sn = attendance.serial_number)
        AND ABS(EXTRACT(EPOCH FROM (attendance.trigger_time - managed.planned_at))) <= 600
  );
