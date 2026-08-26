-- =============================================================================
-- MIGRATION 056 (down): Attendance Machine Mode
-- =============================================================================

DROP TABLE IF EXISTS construction_face_enrollments;

ALTER TABLE construction_attendance_records
    DROP COLUMN IF EXISTS attendance_point_id,
    DROP COLUMN IF EXISTS record_type;

DROP TABLE IF EXISTS construction_attendance_points;
