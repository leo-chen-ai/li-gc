ALTER TABLE construction_managed_attendance_records
    ADD COLUMN dispatch_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    ADD COLUMN dispatched_at TIMESTAMPTZ,
    ADD COLUMN dispatch_message TEXT;

COMMENT ON COLUMN construction_managed_attendance_records.dispatch_status IS '服务下发状态：pending待下发、processing下发中、success成功、failed失败、skipped已跳过';
COMMENT ON COLUMN construction_managed_attendance_records.dispatched_at IS '最近一次服务下发完成时间，带时区';
COMMENT ON COLUMN construction_managed_attendance_records.dispatch_message IS '最近一次服务下发结果或失败原因';

ALTER TABLE construction_managed_attendance_records
    ADD CONSTRAINT chk_managed_attendance_dispatch_status
    CHECK (dispatch_status IN ('pending', 'processing', 'success', 'failed', 'skipped'));

CREATE INDEX idx_managed_attendance_records_dispatch_status
    ON construction_managed_attendance_records(dispatch_status, planned_at)
    WHERE is_deleted = FALSE;
