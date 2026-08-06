UPDATE report_forward_runs
SET status = options->>'status_before_success_semantics',
    current_stage = options->>'status_before_success_semantics',
    options = options - 'status_before_success_semantics',
    updated_at = NOW()
WHERE options->>'status_before_success_semantics' IN ('partial_success', 'failed');
