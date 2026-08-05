DROP INDEX IF EXISTS idx_managed_attendance_records_dispatch_status;

ALTER TABLE construction_managed_attendance_records
    DROP CONSTRAINT IF EXISTS chk_managed_attendance_dispatch_status,
    DROP COLUMN IF EXISTS dispatch_message,
    DROP COLUMN IF EXISTS dispatched_at,
    DROP COLUMN IF EXISTS dispatch_status;
