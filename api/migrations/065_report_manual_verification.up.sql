CREATE TABLE report_forward_verifications (
    run_id UUID PRIMARY KEY REFERENCES report_forward_runs(id) ON DELETE CASCADE,
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    expires_at TIMESTAMPTZ NOT NULL,
    code_cipher BYTEA
);
COMMENT ON TABLE report_forward_verifications IS '报送任务当前手动短信验证码请求，消费或结束后删除';
COMMENT ON COLUMN report_forward_verifications.run_id IS '所属报送任务 UUID，每个任务最多一个待处理请求';
COMMENT ON COLUMN report_forward_verifications.id IS '本轮验证码请求 UUID，防止过期弹窗提交到新请求';
COMMENT ON COLUMN report_forward_verifications.expires_at IS '验证码输入截止时间，含时区';
COMMENT ON COLUMN report_forward_verifications.code_cipher IS '短信验证码 AES256 加密密文，消费后立即删除';
UPDATE report_forward_configs SET is_enabled=FALSE, next_run_at=NULL WHERE verification_type='manual';
ALTER TABLE report_forward_configs ADD CONSTRAINT report_manual_no_schedule CHECK (verification_type <> 'manual' OR (NOT is_enabled AND next_run_at IS NULL));
