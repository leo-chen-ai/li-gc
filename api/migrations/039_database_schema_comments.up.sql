-- 为当前 public 业务表和全部字段补充中文结构备注。
-- 物理表名、字段名保持不变，避免影响应用 SQL 与外部工具。

DO $$
DECLARE
    table_titles JSONB := $titles$
    {
      "api_key_usage_logs": "API密钥调用日志",
      "api_keys": "API密钥",
      "auth_methods": "用户认证方式",
      "construction_attendance_alert_configs": "施工考勤预警配置",
      "construction_attendance_alert_logs": "施工考勤预警日志",
      "construction_attendance_device_issue_reports": "考勤机人员下发报告",
      "construction_attendance_devices": "施工考勤设备",
      "construction_attendance_record_photos": "施工考勤记录照片",
      "construction_attendance_records": "施工考勤记录",
      "construction_contract_templates": "施工合同模板",
      "construction_managed_attendance_configs": "自动托管考勤配置",
      "construction_managed_attendance_photo_groups": "自动托管考勤照片组",
      "construction_managed_attendance_records": "自动托管考勤记录",
      "construction_platform_configs": "施工项目平台配置",
      "construction_platform_logs": "施工项目平台交互日志",
      "construction_project_contract_configs": "施工项目合同配置",
      "construction_projects": "施工项目",
      "construction_teams": "施工班组",
      "construction_units": "施工参建单位",
      "construction_wage_batches": "施工工资批次",
      "construction_wage_items": "施工工资明细",
      "construction_work_hour_configs": "施工工时配置",
      "construction_workers": "施工人员",
      "device_dispatch_batches": "设备下发批次",
      "device_dispatch_events": "设备下发事件",
      "device_dispatch_jobs": "设备下发任务",
      "device_mqtt_messages": "设备MQTT消息",
      "enterprise_customers": "企业客户",
      "enterprise_own_entities": "企业自有主体",
      "enterprise_project_collections": "企业项目收款",
      "enterprise_project_issued_invoices": "企业项目开票",
      "enterprise_project_payments": "企业项目付款",
      "enterprise_project_received_invoices": "企业项目收票",
      "enterprise_projects": "企业经营项目",
      "integration_attempts": "平台对接请求尝试记录",
      "integration_entity_mappings": "平台实体映射",
      "integration_event_logs": "平台对接事件日志",
      "integration_jobs": "平台对接任务",
      "integration_media_mappings": "平台媒体文件映射",
      "integration_outbox_events": "平台对接发件箱事件",
      "integration_person_identities": "平台人员身份映射",
      "integration_platforms": "外部对接平台",
      "integration_project_bindings": "项目平台绑定",
      "integration_rate_limits": "平台接口限流状态",
      "integration_token_cache": "平台访问令牌缓存",
      "ops_construction_name_backup_20260624": "施工名称修复备份",
      "ops_construction_name_backup_20260624_refresh": "施工名称刷新备份",
      "registration_leads": "注册线索",
      "report_forward_artifacts": "数据报送文件产物",
      "report_forward_configs": "数据报送配置",
      "report_forward_events": "数据报送运行事件",
      "report_forward_items": "数据报送人员明细",
      "report_forward_run_projects": "数据报送运行项目",
      "report_forward_runs": "数据报送运行任务",
      "report_forward_worker_heartbeats": "数据报送执行器心跳",
      "role_configs": "角色配置",
      "role_menu_permissions": "角色菜单权限",
      "upload_files": "上传文件",
      "user_managed_projects": "用户可管理项目",
      "user_profiles": "用户资料",
      "user_sessions": "用户会话",
      "users": "系统用户"
    }
    $titles$::JSONB;
    column_titles JSONB := $columns$
    {
      "id": "主键ID",
      "user_id": "用户ID",
      "owner_user_id": "数据归属用户ID",
      "created_by_user_id": "创建人用户ID",
      "updated_by_user_id": "更新人用户ID",
      "requested_by_user_id": "任务发起用户ID",
      "revoked_by": "撤销操作人ID",
      "uploaded_by": "上传人用户ID",
      "project_id": "项目ID",
      "construction_project_id": "关联施工项目ID",
      "external_project_id": "外部平台项目ID",
      "run_project_id": "报送运行项目ID",
      "worker_id": "人员ID",
      "attendance_device_id": "考勤设备ID",
      "attendance_record_id": "考勤记录ID",
      "unit_id": "参建单位ID",
      "team_id": "班组ID",
      "leader_id": "班组长人员ID",
      "config_id": "配置ID",
      "platform_config_id": "平台配置ID",
      "platform_id": "对接平台ID",
      "binding_id": "平台绑定ID",
      "job_id": "任务ID",
      "batch_id": "批次ID",
      "template_id": "模板ID",
      "role_id": "角色ID",
      "api_key_id": "API密钥ID",
      "auth_method_id": "认证方式ID",
      "issued_invoice_id": "开票记录ID",
      "received_invoice_id": "收票记录ID",
      "counterparty_id": "交易对方ID",
      "own_entity_id": "自有主体ID",
      "photo_group_id": "照片组ID",
      "outbox_event_id": "发件箱事件ID",
      "aggregate_id": "聚合实体ID",
      "local_entity_id": "本地实体ID",
      "parent_run_id": "父运行任务ID",
      "run_id": "报送运行任务ID",
      "row_id": "原数据行ID",
      "biz_id": "业务记录ID",
      "name": "名称",
      "full_name": "姓名全称",
      "display_name": "显示名称",
      "username": "登录用户名",
      "email": "电子邮箱",
      "email_verified": "邮箱是否已验证",
      "phone": "手机号码",
      "phone_number": "手机号码",
      "phone_verified": "手机号码是否已验证",
      "person_name": "人员姓名",
      "worker_name": "人员姓名",
      "worker_phone": "人员手机号码",
      "worker_id_card": "人员身份证号码",
      "worker_id_card_mask": "人员脱敏身份证号码",
      "id_card": "身份证号码",
      "id_card_back_file": "身份证反面文件",
      "manager_id_card": "项目经理身份证号码",
      "manager_phone": "负责人手机号码",
      "gender": "性别",
      "nation": "民族",
      "nationality": "国籍",
      "date_of_birth": "出生日期",
      "address": "地址",
      "current_address": "现居地址",
      "company_address": "单位地址",
      "company_office_address": "单位办公地址",
      "address_code": "行政区划代码",
      "longitude": "经度",
      "latitude": "纬度",
      "code": "编码",
      "description": "说明",
      "remark": "备注",
      "message": "消息内容",
      "details": "明细数据",
      "context": "上下文数据",
      "metadata": "扩展元数据",
      "config": "配置数据",
      "settings": "运行设置",
      "options": "运行选项",
      "rules": "规则配置",
      "payload": "业务数据载荷",
      "request_payload": "请求数据载荷",
      "response_payload": "响应数据载荷",
      "ack_payload": "确认响应数据",
      "external_payload": "外部平台原始数据",
      "target_result": "目标平台处理结果",
      "target_receipt": "目标平台回执",
      "status": "状态",
      "processing_status": "处理状态",
      "generation_status": "生成状态",
      "online_status": "在线状态",
      "auth_status": "认证状态",
      "remote_state": "外部平台状态",
      "is_deleted": "是否已删除",
      "is_enabled": "是否启用",
      "is_active": "是否有效",
      "is_default": "是否默认",
      "is_primary": "是否主要认证方式",
      "is_verified": "是否已验证",
      "is_system": "是否系统内置",
      "is_manage_team": "是否管理班组",
      "is_key_personnel": "是否关键人员",
      "is_inspected": "是否已检查",
      "cancel_requested": "是否请求取消",
      "created_at": "创建时间",
      "updated_at": "更新时间",
      "deleted_at": "删除时间",
      "started_at": "开始时间",
      "completed_at": "完成时间",
      "expires_at": "过期时间",
      "last_error": "最后一次错误信息",
      "error_message": "错误信息",
      "error_summary": "错误摘要",
      "last_used_at": "最后使用时间",
      "last_sync_at": "最后同步时间",
      "last_seen_at": "最后在线时间",
      "last_heartbeat_at": "最后心跳时间",
      "last_active_at": "最后活跃时间",
      "last_pushed_at": "最后推送时间",
      "next_attempt_at": "下次尝试时间",
      "next_retry_at": "下次重试时间",
      "next_run_at": "下次运行时间",
      "locked_until": "任务锁定截止时间",
      "lease_expires_at": "任务租约过期时间",
      "scheduled_date": "计划执行日期",
      "schedule_time": "每日计划执行时间",
      "schedule_timezone": "计划时区",
      "attempt_count": "已尝试次数",
      "attempt_no": "本次尝试序号",
      "max_attempts": "最大尝试次数",
      "retry_count": "已重试次数",
      "max_retries": "最大重试次数",
      "success_count": "成功数量",
      "failure_count": "失败数量",
      "failed_count": "失败数量",
      "pending_count": "待处理数量",
      "total_count": "总数量",
      "item_count": "明细数量",
      "request_count": "请求数量",
      "use_count": "使用次数",
      "employee_count": "人员数量",
      "source_row_count": "源文件数据行数",
      "converted_row_count": "转换后数据行数",
      "upload_total_count": "上传总数量",
      "upload_success_count": "上传成功数量",
      "upload_failure_count": "上传失败数量",
      "source_row_no": "源文件行号",
      "platform_code": "平台编码",
      "platform_name": "平台名称",
      "platform_type": "平台类型",
      "adapter": "平台适配器编码",
      "auth_type": "认证方式类型",
      "base_url": "接口基础地址",
      "source_base_url": "数据源平台地址",
      "target_base_url": "目标平台地址",
      "public_url": "公开访问地址",
      "public_base_url": "公开访问基础地址",
      "endpoint": "存储服务端点",
      "object_key": "对象存储键",
      "bucket": "对象存储桶",
      "storage_driver": "存储驱动类型",
      "original_filename": "原始文件名",
      "content_type": "内容类型",
      "content_sha256": "内容SHA256摘要",
      "sha256": "文件SHA256摘要",
      "byte_size": "文件字节数",
      "size_bytes": "文件字节数",
      "artifact_type": "文件产物类型",
      "field_key": "业务字段键",
      "biz_type": "业务类型",
      "credentials": "加密后的平台凭据配置",
      "password_hash": "密码哈希值",
      "key_hash": "API密钥哈希值",
      "key_prefix": "API密钥前缀",
      "access_token": "访问令牌",
      "oauth_access_token": "OAuth访问令牌",
      "oauth_refresh_token": "OAuth刷新令牌",
      "source_password_cipher": "加密后的数据源密码",
      "target_password_cipher": "加密后的目标平台密码",
      "verification_config_cipher": "加密后的验证码配置",
      "identity_cipher": "加密后的身份信息",
      "identity_fingerprint": "身份信息不可逆指纹",
      "phone_cipher": "加密后的手机号码",
      "address_cipher": "加密后的地址",
      "serial_number": "设备序列号",
      "device_sn": "设备序列号",
      "device_name": "设备名称",
      "device_type": "设备类型",
      "mqtt_topic": "MQTT主题",
      "mqtt_message_id": "MQTT消息ID",
      "message_id": "消息ID",
      "direction": "方向",
      "action": "执行动作",
      "operation": "业务操作",
      "event_type": "事件类型",
      "trigger_type": "触发类型",
      "run_mode": "运行模式",
      "current_stage": "当前执行阶段",
      "priority": "任务优先级",
      "claimed_by": "任务领取者",
      "locked_by": "任务锁定者",
      "idempotency_key": "幂等键",
      "dedupe_key": "去重键",
      "external_request_id": "外部请求ID",
      "external_entity_id": "外部实体ID",
      "external_person_id": "外部人员ID",
      "enabled_events": "已启用的同步事件",
      "project_name": "项目名称",
      "external_project_name": "外部平台项目名称",
      "project_code": "项目编码",
      "company_name": "单位名称",
      "company_credit_code": "单位统一社会信用代码",
      "credit_code": "统一社会信用代码",
      "customer_name": "客户名称",
      "supplier_name": "供应商名称",
      "contact_name": "联系人姓名",
      "contact_phone": "联系人手机号码",
      "invoice_no": "发票号码",
      "invoice_date": "发票日期",
      "amount_cents": "金额（分）",
      "contract_amount_cents": "合同金额（分）",
      "payable_amount_cents": "应付金额（分）",
      "paid_amount_cents": "已付金额（分）",
      "unpaid_amount_cents": "未付金额（分）",
      "adjustment_amount_cents": "调整金额（分）",
      "tax_rate": "税率",
      "attendance_date": "考勤日期",
      "attendance_days": "考勤天数",
      "trigger_time": "考勤触发时间",
      "direction": "业务方向",
      "photo_url": "照片访问地址",
      "photo_data": "照片二进制数据",
      "photo_kind": "照片类型",
      "avatar_url": "头像访问地址",
      "avatar": "头像",
      "created_by": "创建人ID",
      "role": "用户角色",
      "menu_key": "菜单权限键",
      "scopes": "授权范围",
      "rate_limit_rpm": "每分钟请求限额"
    }
    $columns$::JSONB;
    table_row RECORD;
    column_row RECORD;
    table_title TEXT;
    column_title TEXT;
BEGIN
    FOR table_row IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name <> '_sqlx_migrations'
        ORDER BY table_name
    LOOP
        table_title := table_titles ->> table_row.table_name;
        IF table_title IS NULL THEN
            RAISE EXCEPTION '缺少表 % 的中文备注配置', table_row.table_name;
        END IF;

        EXECUTE format('COMMENT ON TABLE public.%I IS %L', table_row.table_name, table_title);

        FOR column_row IN
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = table_row.table_name
            ORDER BY ordinal_position
        LOOP
            column_title := column_titles ->> column_row.column_name;
            IF column_title IS NULL THEN
                column_title := CASE
                    WHEN column_row.column_name LIKE 'is\_%' ESCAPE '\' THEN '是否启用该业务属性'
                    WHEN column_row.column_name LIKE '%\_id' ESCAPE '\' THEN table_title || '关联记录ID'
                    WHEN column_row.column_name LIKE '%\_at' ESCAPE '\' THEN table_title || '相关时间'
                    WHEN column_row.column_name LIKE '%\_date' ESCAPE '\' THEN table_title || '相关日期'
                    WHEN column_row.column_name LIKE '%\_count' ESCAPE '\' THEN table_title || '相关数量'
                    WHEN column_row.column_name LIKE '%\_status' ESCAPE '\' THEN table_title || '相关状态'
                    WHEN column_row.column_name LIKE '%\_url' ESCAPE '\' THEN table_title || '相关访问地址'
                    WHEN column_row.column_name LIKE '%\_file' ESCAPE '\' THEN table_title || '相关文件'
                    WHEN column_row.column_name LIKE '%\_photos' ESCAPE '\' THEN table_title || '相关图片集合'
                    WHEN column_row.column_name LIKE '%\_payload' ESCAPE '\' THEN table_title || '相关数据载荷'
                    WHEN column_row.column_name LIKE '%\_type' ESCAPE '\' THEN table_title || '相关类型'
                    WHEN column_row.column_name LIKE '%\_name' ESCAPE '\' THEN table_title || '相关名称'
                    WHEN column_row.column_name LIKE '%\_code' ESCAPE '\' THEN table_title || '相关编码'
                    WHEN column_row.column_name LIKE '%\_reason' ESCAPE '\' THEN table_title || '相关原因'
                    ELSE table_title || '业务属性'
                END;
            END IF;
            EXECUTE format(
                'COMMENT ON COLUMN public.%I.%I IS %L',
                table_row.table_name,
                column_row.column_name,
                column_title
            );
        END LOOP;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class relation_info
        JOIN pg_catalog.pg_namespace namespace_info
          ON namespace_info.oid = relation_info.relnamespace
        LEFT JOIN pg_catalog.pg_description description_info
          ON description_info.objoid = relation_info.oid
         AND description_info.classoid = 'pg_catalog.pg_class'::regclass
         AND description_info.objsubid = 0
        WHERE namespace_info.nspname = 'public'
          AND relation_info.relkind IN ('r', 'p')
          AND relation_info.relname <> '_sqlx_migrations'
          AND description_info.description IS NULL
    ) THEN
        RAISE EXCEPTION '仍有业务表缺少中文备注';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute column_info
        JOIN pg_catalog.pg_class relation_info
          ON relation_info.oid = column_info.attrelid
        JOIN pg_catalog.pg_namespace namespace_info
          ON namespace_info.oid = relation_info.relnamespace
        LEFT JOIN pg_catalog.pg_description description_info
          ON description_info.objoid = relation_info.oid
         AND description_info.classoid = 'pg_catalog.pg_class'::regclass
         AND description_info.objsubid = column_info.attnum
        WHERE namespace_info.nspname = 'public'
          AND relation_info.relkind IN ('r', 'p')
          AND relation_info.relname <> '_sqlx_migrations'
          AND column_info.attnum > 0
          AND NOT column_info.attisdropped
          AND description_info.description IS NULL
    ) THEN
        RAISE EXCEPTION '仍有业务字段缺少中文备注';
    END IF;
END
$$;
