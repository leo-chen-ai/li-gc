-- =============================================================================
-- MIGRATION 031: Attendance Device Issue Retry State
-- =============================================================================
-- Device issue reports are the operator-facing ledger. These fields make the
-- ledger retryable without losing the visible failure reason.
-- =============================================================================

ALTER TABLE construction_attendance_device_issue_reports
    ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN next_retry_at TIMESTAMPTZ,
    ADD COLUMN last_retry_at TIMESTAMPTZ,
    ADD COLUMN last_error TEXT,
    ADD COLUMN retry_locked_until TIMESTAMPTZ;

UPDATE construction_attendance_device_issue_reports
SET next_retry_at = CASE
        WHEN acknowledged_at IS NULL
         AND request_payload IS NOT NULL
         AND mqtt_message_id IS NOT NULL
         AND status IN ('pending', 'failed')
        THEN NOW()
        ELSE NULL
    END;

CREATE INDEX idx_construction_attendance_device_issue_reports_retry
    ON construction_attendance_device_issue_reports(status, next_retry_at, retry_locked_until)
    WHERE is_deleted = FALSE
      AND acknowledged_at IS NULL
      AND request_payload IS NOT NULL
      AND mqtt_message_id IS NOT NULL;
