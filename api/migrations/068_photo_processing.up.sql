CREATE TABLE photo_processing_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    remark TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_photo_processing_groups_is_deleted
    ON photo_processing_groups(is_deleted, created_at DESC);

COMMENT ON TABLE photo_processing_groups IS '照片处理组，跨项目聚合多名工人的考勤人像照片，用于统一配置背景并批量AI合成';
COMMENT ON COLUMN photo_processing_groups.id IS '照片处理组UUID';
COMMENT ON COLUMN photo_processing_groups.name IS '照片处理组名称';
COMMENT ON COLUMN photo_processing_groups.remark IS '照片处理组备注，说明用途或合成要求';
COMMENT ON COLUMN photo_processing_groups.is_deleted IS '软删除标记';
COMMENT ON COLUMN photo_processing_groups.deleted_at IS '软删除时间，未删除时为空';
COMMENT ON COLUMN photo_processing_groups.created_by IS '创建该组的用户UUID，关联users表';
COMMENT ON COLUMN photo_processing_groups.created_at IS '组创建时间';
COMMENT ON COLUMN photo_processing_groups.updated_at IS '组信息最后更新时间';

CREATE TABLE photo_processing_group_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES photo_processing_groups(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES construction_workers(id) ON DELETE SET NULL,
    worker_name VARCHAR(100) NOT NULL,
    attendance_record_id UUID REFERENCES construction_attendance_records(id) ON DELETE SET NULL,
    attendance_date DATE NOT NULL,
    direction SMALLINT NOT NULL,
    photo_url TEXT NOT NULL,
    sort_index INTEGER NOT NULL DEFAULT 0,
    composite_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    composite_photo_url TEXT,
    composite_object_key VARCHAR(500),
    composite_error TEXT,
    composite_generation_id VARCHAR(128),
    composite_task_id UUID,
    composited_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT photo_processing_group_photos_direction CHECK (direction IN (0, 1)),
    CONSTRAINT photo_processing_group_photos_composite_status
        CHECK (composite_status IN ('pending', 'success', 'failed', 'skipped'))
);

CREATE INDEX idx_photo_processing_group_photos_group
    ON photo_processing_group_photos(group_id, direction) WHERE is_deleted = FALSE;
CREATE INDEX idx_photo_processing_group_photos_worker
    ON photo_processing_group_photos(group_id, worker_id, attendance_date) WHERE is_deleted = FALSE;
CREATE INDEX idx_photo_processing_group_photos_pending
    ON photo_processing_group_photos(group_id, composite_status) WHERE is_deleted = FALSE;

COMMENT ON TABLE photo_processing_group_photos IS '照片处理组内的单张考勤人像照片，按进场/出场区分，AI合成结果直接挂在此行';
COMMENT ON COLUMN photo_processing_group_photos.id IS '组内照片UUID';
COMMENT ON COLUMN photo_processing_group_photos.group_id IS '所属照片处理组UUID，删除组时级联删除';
COMMENT ON COLUMN photo_processing_group_photos.project_id IS '照片来源项目UUID';
COMMENT ON COLUMN photo_processing_group_photos.worker_id IS '照片所属工人UUID，删除工人时置空';
COMMENT ON COLUMN photo_processing_group_photos.worker_name IS '照片所属工人姓名快照，工人删除后仍可追溯';
COMMENT ON COLUMN photo_processing_group_photos.attendance_record_id IS '来源考勤记录UUID，用于回溯原始打卡';
COMMENT ON COLUMN photo_processing_group_photos.attendance_date IS '考勤日期，格式YYYY-MM-DD';
COMMENT ON COLUMN photo_processing_group_photos.direction IS '打卡方向：0=进场、1=出场，决定使用哪张背景图合成';
COMMENT ON COLUMN photo_processing_group_photos.photo_url IS '原始考勤照片地址，可能是http(s)外链或data:image/...;base64,前缀的base64数据';
COMMENT ON COLUMN photo_processing_group_photos.sort_index IS '组内展示排序序号，值越小越靠前';
COMMENT ON COLUMN photo_processing_group_photos.composite_status IS 'AI合成状态：pending待合成、success成功、failed失败、skipped跳过（无对应方向背景图）';
COMMENT ON COLUMN photo_processing_group_photos.composite_photo_url IS 'AI合成结果图片的公网访问地址';
COMMENT ON COLUMN photo_processing_group_photos.composite_object_key IS 'AI合成结果在对象存储中的逻辑key，形如uploads/photo-composite/...';
COMMENT ON COLUMN photo_processing_group_photos.composite_error IS 'AI合成失败原因，仅failed状态有值';
COMMENT ON COLUMN photo_processing_group_photos.composite_generation_id IS '上游AI服务返回的生成任务ID，用于排查和追溯';
COMMENT ON COLUMN photo_processing_group_photos.composite_task_id IS '最后一次合成该照片的任务UUID，关联photo_composite_tasks表';
COMMENT ON COLUMN photo_processing_group_photos.composited_at IS 'AI合成完成时间';
COMMENT ON COLUMN photo_processing_group_photos.is_deleted IS '软删除标记';
COMMENT ON COLUMN photo_processing_group_photos.deleted_at IS '软删除时间，未删除时为空';
COMMENT ON COLUMN photo_processing_group_photos.created_at IS '照片加入组的时间';
COMMENT ON COLUMN photo_processing_group_photos.updated_at IS '照片信息最后更新时间';

CREATE TABLE photo_processing_group_backgrounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES photo_processing_groups(id) ON DELETE CASCADE,
    direction SMALLINT NOT NULL,
    photo_url TEXT NOT NULL,
    object_key VARCHAR(500),
    remark TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT photo_processing_group_backgrounds_direction CHECK (direction IN (0, 1))
);

CREATE UNIQUE INDEX idx_photo_processing_group_backgrounds_unique
    ON photo_processing_group_backgrounds(group_id, direction) WHERE is_deleted = FALSE;

COMMENT ON TABLE photo_processing_group_backgrounds IS '照片处理组的AI合成背景图，进场和出场各一张，因现场进/出场景不同需分别配置';
COMMENT ON COLUMN photo_processing_group_backgrounds.id IS '背景图UUID';
COMMENT ON COLUMN photo_processing_group_backgrounds.group_id IS '所属照片处理组UUID，删除组时级联删除';
COMMENT ON COLUMN photo_processing_group_backgrounds.direction IS '背景适用的打卡方向：0=进场、1=出场';
COMMENT ON COLUMN photo_processing_group_backgrounds.photo_url IS '背景图公网访问地址';
COMMENT ON COLUMN photo_processing_group_backgrounds.object_key IS '背景图在对象存储中的逻辑key，形如uploads/photo-processing/...';
COMMENT ON COLUMN photo_processing_group_backgrounds.remark IS '背景图备注';
COMMENT ON COLUMN photo_processing_group_backgrounds.is_deleted IS '软删除标记';
COMMENT ON COLUMN photo_processing_group_backgrounds.deleted_at IS '软删除时间，未删除时为空';
COMMENT ON COLUMN photo_processing_group_backgrounds.created_at IS '背景图上传时间';
COMMENT ON COLUMN photo_processing_group_backgrounds.updated_at IS '背景图最后更新时间';

CREATE TABLE photo_composite_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES photo_processing_groups(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    total_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    output_size VARCHAR(16) NOT NULL DEFAULT '1024x1536',
    prompt_text TEXT,
    error_summary TEXT,
    cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_by VARCHAR(160),
    lease_expires_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT photo_composite_tasks_status
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_photo_composite_tasks_queue
    ON photo_composite_tasks(status, created_at) WHERE status IN ('pending', 'running');
CREATE INDEX idx_photo_composite_tasks_group
    ON photo_composite_tasks(group_id, created_at DESC);

COMMENT ON TABLE photo_composite_tasks IS '照片处理组的AI合成任务，单张约14秒，由API进程内后台worker按租约领取并异步执行';
COMMENT ON COLUMN photo_composite_tasks.id IS '合成任务UUID';
COMMENT ON COLUMN photo_composite_tasks.group_id IS '目标照片处理组UUID，删除组时级联删除';
COMMENT ON COLUMN photo_composite_tasks.status IS '任务状态：pending待执行、running执行中、completed已完成、failed失败、cancelled已取消';
COMMENT ON COLUMN photo_composite_tasks.total_count IS '本批次计划合成的照片总张数';
COMMENT ON COLUMN photo_composite_tasks.success_count IS '合成成功的照片张数';
COMMENT ON COLUMN photo_composite_tasks.failed_count IS '合成失败的照片张数';
COMMENT ON COLUMN photo_composite_tasks.skipped_count IS '因缺少对应方向背景图而跳过的照片张数';
COMMENT ON COLUMN photo_composite_tasks.output_size IS '合成输出图片尺寸，宽高需均能被16整除，默认1024x1536竖版';
COMMENT ON COLUMN photo_composite_tasks.prompt_text IS '发起任务时快照的提示词，便于追溯不同批次的效果差异';
COMMENT ON COLUMN photo_composite_tasks.error_summary IS '任务级错误摘要，如API密钥未配置';
COMMENT ON COLUMN photo_composite_tasks.cancel_requested IS '是否已请求取消，worker在每张之间检查';
COMMENT ON COLUMN photo_composite_tasks.claimed_by IS '领取该任务的worker标识，用于租约归属判断';
COMMENT ON COLUMN photo_composite_tasks.lease_expires_at IS '租约到期时间，过期后其他worker可重新领取';
COMMENT ON COLUMN photo_composite_tasks.attempt_count IS '任务被领取的次数';
COMMENT ON COLUMN photo_composite_tasks.created_by IS '发起合成的用户UUID，关联users表';
COMMENT ON COLUMN photo_composite_tasks.created_at IS '任务创建时间';
COMMENT ON COLUMN photo_composite_tasks.started_at IS '任务开始执行时间';
COMMENT ON COLUMN photo_composite_tasks.completed_at IS '任务结束时间，完成、失败或取消时写入';

INSERT INTO role_menu_permissions(role_id, menu_key)
SELECT id, 'photo_processing' FROM role_configs WHERE code = 'admin'
ON CONFLICT (role_id, menu_key) DO NOTHING;
