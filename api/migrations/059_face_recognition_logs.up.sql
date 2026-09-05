CREATE TABLE construction_face_recognition_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    point_id UUID NOT NULL,
    actor_user_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    reason TEXT NOT NULL DEFAULT '',
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    photo BYTEA,
    crop_photo BYTEA,
    elapsed_ms BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);
COMMENT ON TABLE construction_face_recognition_logs IS '移动人脸机识别调试日志，含成功、未匹配及异常；照片保留7天，日志保留30天';
COMMENT ON COLUMN construction_face_recognition_logs.id IS '识别请求日志ID（UUID）';
COMMENT ON COLUMN construction_face_recognition_logs.project_id IS '所属项目ID，查询及照片访问必须校验项目授权';
COMMENT ON COLUMN construction_face_recognition_logs.point_id IS '考勤点ID快照，点位删除后仍保留识别记录';
COMMENT ON COLUMN construction_face_recognition_logs.actor_user_id IS '发起识别的登录用户ID快照';
COMMENT ON COLUMN construction_face_recognition_logs.status IS '处理状态：processing处理中、success打卡成功、not_matched未匹配、error异常、interrupted中断';
COMMENT ON COLUMN construction_face_recognition_logs.reason IS '识别失败原因或处理结果说明';
COMMENT ON COLUMN construction_face_recognition_logs.details IS 'JSON诊断数据：检测及匹配分数、阈值、图像尺寸、模型、摄像头参数、结果；不保存特征向量';
COMMENT ON COLUMN construction_face_recognition_logs.photo IS '上传画面的JPEG压缩调试副本，不超过200KiB，仅经授权接口读取，7天后清理';
COMMENT ON COLUMN construction_face_recognition_logs.crop_photo IS '人脸检测框留边裁剪的JPEG调试副本，不超过120KiB，仅经授权接口读取，7天后清理';
COMMENT ON COLUMN construction_face_recognition_logs.elapsed_ms IS '从开始处理到产生结果的总耗时，单位毫秒';
COMMENT ON COLUMN construction_face_recognition_logs.created_at IS '识别请求开始时间（带时区）';
COMMENT ON COLUMN construction_face_recognition_logs.finished_at IS '识别请求处理完成时间（带时区）';
CREATE INDEX idx_face_recognition_logs_project_time ON construction_face_recognition_logs(project_id, created_at DESC);
CREATE INDEX idx_face_recognition_logs_time ON construction_face_recognition_logs(created_at DESC);
INSERT INTO role_menu_permissions(role_id,menu_key)
SELECT id,'face_recognition_logs' FROM role_configs WHERE code='admin' ON CONFLICT DO NOTHING;
