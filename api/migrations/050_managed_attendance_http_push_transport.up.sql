ALTER TABLE device_dispatch_jobs
    DROP CONSTRAINT IF EXISTS chk_device_dispatch_transport;

ALTER TABLE device_dispatch_jobs
    ADD CONSTRAINT chk_device_dispatch_transport
        CHECK (transport IN ('mqtt', 'http_pull', 'http_push', 'unsupported'));

COMMENT ON COLUMN device_dispatch_jobs.transport IS
    '任务传输方式：mqtt、http_pull、http_push或unsupported；弹厂家托管考勤使用http_push主动推送';
