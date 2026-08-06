-- 流程正常结束即为成功；外部平台业务拒绝、已存在等结果属于跳过明细。
UPDATE report_forward_runs r
SET options = jsonb_set(
        COALESCE(r.options, '{}'::jsonb),
        '{status_before_success_semantics}',
        to_jsonb(r.status),
        TRUE
    ),
    status = 'success',
    current_stage = 'success',
    updated_at = NOW()
WHERE r.status = 'partial_success'
   OR (
        r.status = 'failed'
        AND COALESCE(BTRIM(r.error_summary), '') = ''
        AND (
            EXISTS (
                SELECT 1
                FROM report_forward_run_projects p
                WHERE p.run_id = r.id
                  AND p.upload_failure_count > 0
            )
            OR EXISTS (
                SELECT 1
                FROM report_forward_items i
                WHERE i.run_id = r.id
                  AND i.target_result IS NOT NULL
            )
        )
   );
