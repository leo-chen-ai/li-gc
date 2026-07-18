CREATE INDEX idx_attendance_records_worker_serial_original_active
    ON construction_attendance_records(worker_id, serial_number, original_time)
    WHERE is_deleted = FALSE
      AND original_time IS NOT NULL;
