DROP INDEX IF EXISTS idx_attendance_real_photo_candidates;

DROP TRIGGER IF EXISTS mark_managed_generated_attendance_before_insert
    ON construction_attendance_records;
DROP FUNCTION IF EXISTS mark_managed_generated_attendance();

ALTER TABLE construction_attendance_records
    DROP COLUMN IF EXISTS is_managed_generated;

ALTER TABLE construction_managed_attendance_configs
    DROP COLUMN IF EXISTS use_attendance_record_photos;
