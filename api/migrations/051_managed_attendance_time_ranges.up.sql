ALTER TABLE construction_managed_attendance_configs
    ADD COLUMN check_in_end_time VARCHAR(8),
    ADD COLUMN check_out_end_time VARCHAR(8);

UPDATE construction_managed_attendance_configs
SET check_in_end_time = check_in_time,
    check_out_end_time = check_out_time;

ALTER TABLE construction_managed_attendance_configs
    ALTER COLUMN check_in_end_time SET NOT NULL,
    ALTER COLUMN check_out_end_time SET NOT NULL;

COMMENT ON COLUMN construction_managed_attendance_configs.check_in_end_time IS '随机进场时间区间结束时间，格式HH:mm或HH:mm:ss';
COMMENT ON COLUMN construction_managed_attendance_configs.check_out_end_time IS '随机出场时间区间结束时间，格式HH:mm或HH:mm:ss';
