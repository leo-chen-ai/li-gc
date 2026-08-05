DROP INDEX IF EXISTS idx_construction_attendance_records_generated;

ALTER TABLE construction_attendance_records
    DROP COLUMN IF EXISTS is_generated;
