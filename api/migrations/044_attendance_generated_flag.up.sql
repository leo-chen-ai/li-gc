ALTER TABLE construction_attendance_records
    ADD COLUMN is_generated BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN construction_attendance_records.is_generated IS '是否由后台考勤生成工具生成；TRUE为人工批量生成数据，FALSE为设备或其他来源数据';

CREATE INDEX idx_construction_attendance_records_generated
    ON construction_attendance_records(project_id, is_generated, trigger_time DESC)
    WHERE is_deleted = FALSE;
