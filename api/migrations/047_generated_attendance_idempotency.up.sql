CREATE UNIQUE INDEX idx_construction_attendance_records_generated_identity
    ON construction_attendance_records(project_id, worker_id, direction, trigger_time)
    WHERE is_generated = TRUE AND is_deleted = FALSE;
