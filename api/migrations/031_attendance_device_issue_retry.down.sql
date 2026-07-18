DROP INDEX IF EXISTS idx_construction_attendance_device_issue_reports_retry;

ALTER TABLE construction_attendance_device_issue_reports
    DROP COLUMN IF EXISTS retry_locked_until,
    DROP COLUMN IF EXISTS last_error,
    DROP COLUMN IF EXISTS last_retry_at,
    DROP COLUMN IF EXISTS next_retry_at,
    DROP COLUMN IF EXISTS max_retries,
    DROP COLUMN IF EXISTS retry_count;
