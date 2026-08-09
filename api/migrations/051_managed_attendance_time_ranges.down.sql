ALTER TABLE construction_managed_attendance_configs
    DROP COLUMN IF EXISTS check_out_end_time,
    DROP COLUMN IF EXISTS check_in_end_time;
