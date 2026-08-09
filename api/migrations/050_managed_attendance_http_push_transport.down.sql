UPDATE device_dispatch_jobs
SET transport = 'unsupported',
    updated_at = NOW()
WHERE transport = 'http_push';

ALTER TABLE device_dispatch_jobs
    DROP CONSTRAINT IF EXISTS chk_device_dispatch_transport;

ALTER TABLE device_dispatch_jobs
    ADD CONSTRAINT chk_device_dispatch_transport
        CHECK (transport IN ('mqtt', 'http_pull', 'unsupported'));

COMMENT ON COLUMN device_dispatch_jobs.transport IS
    '任务传输方式：mqtt、http_pull或unsupported';
