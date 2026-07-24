use axum::{
    Json,
    body::Body,
    extract::{Extension, Path, State},
    http::{StatusCode, Uri, header},
    response::{IntoResponse, Response},
};
use chrono::NaiveTime;
use percent_encoding::percent_decode_str;
use reqwest::Url;
use rust_xlsxwriter::{Color, Format, FormatAlign, Workbook};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    feature::auth::types::claims::AuthUser,
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

const DEFAULT_SOURCE_URL: &str = "http://tg.91jtg.com";
const DEFAULT_TARGET_URL: &str = "https://www.zjzwfw.gov.cn";
const DEFAULT_TIMEZONE: &str = "Asia/Shanghai";

const RUN_MODES: &[&str] = &[
    "production",
    "test_source_login",
    "test_project_list",
    "test_download",
    "test_transform",
    "test_target_login",
    "test_upload_validate",
    "test_submit",
    "test_full",
];

#[derive(Debug, Deserialize)]
pub struct ConfigInput {
    pub name: String,
    #[serde(default = "default_source_url")]
    pub source_base_url: String,
    pub source_username: String,
    pub source_password: Option<String>,
    #[serde(default = "default_project_mode")]
    pub project_mode: String,
    #[serde(default)]
    pub include_projects: Vec<String>,
    #[serde(default)]
    pub exclude_projects: Vec<String>,
    #[serde(default = "default_target_url")]
    pub target_base_url: String,
    pub target_username: String,
    pub target_password: Option<String>,
    #[serde(default = "default_verification_type")]
    pub verification_type: String,
    pub verification_config: Option<Value>,
    #[serde(default = "default_schedule_time")]
    pub schedule_time: String,
    #[serde(default = "default_timezone")]
    pub schedule_timezone: String,
    #[serde(default = "default_lifecycle")]
    pub lifecycle_status: String,
    #[serde(default)]
    pub is_enabled: bool,
    #[serde(default = "empty_object")]
    pub settings: Value,
    pub remark: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRunInput {
    #[serde(default = "default_production_mode")]
    pub run_mode: String,
    #[serde(default = "empty_object")]
    pub options: Value,
}

#[derive(Debug, Clone)]
struct ListParams {
    page: i64,
    page_size: i64,
    keyword: String,
    status: Option<String>,
    outcome: Option<String>,
    config_id: Option<Uuid>,
    run_id: Option<Uuid>,
}

pub async fn summary(State(state): State<AppState>) -> ApiResult<Value> {
    let data = sqlx::query_scalar::<_, Value>(
        r#"
        SELECT jsonb_build_object(
            'config_count', (SELECT COUNT(*)::int FROM report_forward_configs WHERE is_deleted = FALSE),
            'enabled_config_count', (SELECT COUNT(*)::int FROM report_forward_configs WHERE is_deleted = FALSE AND is_enabled = TRUE AND lifecycle_status = 'production'),
            'running_count', (SELECT COUNT(*)::int FROM report_forward_runs WHERE status IN ('running', 'cancelling')),
            'queued_count', (SELECT COUNT(*)::int FROM report_forward_runs WHERE status = 'pending'),
            'today_success_count', (SELECT COUNT(*)::int FROM report_forward_runs WHERE status = 'success' AND (created_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date),
            'today_failure_count', (SELECT COUNT(*)::int FROM report_forward_runs WHERE status IN ('failed', 'partial_success') AND (created_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date),
            'today_item_count', (SELECT COALESCE(SUM(item_count), 0)::int FROM report_forward_runs WHERE (created_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date),
            'workers', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'worker_id', worker_id,
                    'pod_name', pod_name,
                    'status', CASE WHEN last_seen_at < NOW() - INTERVAL '90 seconds' THEN 'offline' ELSE status END,
                    'current_run_id', current_run_id,
                    'worker_version', worker_version,
                    'last_seen_at', last_seen_at
                ) ORDER BY worker_id)
                FROM report_forward_worker_heartbeats
            ), '[]'::jsonb)
        )
        "#,
    )
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(data))
}

pub async fn list_configs(State(state): State<AppState>, uri: Uri) -> ApiResult<Value> {
    let params = list_params(&uri)?;
    let offset = (params.page - 1) * params.page_size;
    let keyword = format!("%{}%", params.keyword);

    let total = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)::bigint
        FROM report_forward_configs c
        WHERE c.is_deleted = FALSE
          AND ($1 = '%%' OR c.name ILIKE $1 OR c.source_username ILIKE $1 OR c.target_username ILIKE $1)
          AND ($2::text IS NULL OR c.lifecycle_status = $2)
        "#,
    )
    .bind(&keyword)
    .bind(&params.status)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    let items = sqlx::query_scalar::<_, Value>(
        r#"
        SELECT COALESCE(jsonb_agg(row_data ORDER BY updated_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                (to_jsonb(c)
                    - 'source_password_cipher'
                    - 'target_password_cipher'
                    - 'verification_config_cipher')
                || jsonb_build_object(
                    'source_password_configured', octet_length(c.source_password_cipher) > 0,
                    'target_password_configured', octet_length(c.target_password_cipher) > 0,
                    'verification_configured', c.verification_config_cipher IS NOT NULL,
                    'active_run_count', (
                        SELECT COUNT(*)::int FROM report_forward_runs r
                        WHERE r.config_id = c.id AND r.status IN ('pending', 'running', 'cancelling')
                    )
                ) AS row_data,
                c.updated_at
            FROM report_forward_configs c
            WHERE c.is_deleted = FALSE
              AND ($1 = '%%' OR c.name ILIKE $1 OR c.source_username ILIKE $1 OR c.target_username ILIKE $1)
              AND ($2::text IS NULL OR c.lifecycle_status = $2)
            ORDER BY c.updated_at DESC
            LIMIT $3 OFFSET $4
        ) rows
        "#,
    )
    .bind(&keyword)
    .bind(&params.status)
    .bind(params.page_size)
    .bind(offset)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(json!({
        "items": items, "total": total, "page": params.page, "page_size": params.page_size
    })))
}

pub async fn create_config(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(input): Json<ConfigInput>,
) -> ApiResult<Value> {
    let normalized = validate_config(input, true)?;
    let key = credential_key()?;
    let schedule_time = parse_schedule_time(&normalized.schedule_time)?;
    let verification_json = normalized
        .verification_config
        .as_ref()
        .map(Value::to_string);
    let source_password = normalized.source_password.as_deref().unwrap_or_default();
    let target_password = normalized.target_password.as_deref().unwrap_or_default();

    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO report_forward_configs (
            name, source_base_url, source_username, source_password_cipher,
            project_mode, include_projects, exclude_projects,
            target_base_url, target_username, target_password_cipher,
            verification_type, verification_config_cipher,
            schedule_time, schedule_timezone, lifecycle_status, is_enabled,
            next_run_at, settings, remark, created_by_user_id, updated_by_user_id
        )
        VALUES (
            $1, $2, $3, pgp_sym_encrypt($4, $20, 'cipher-algo=aes256'),
            $5, $6, $7,
            $8, $9, pgp_sym_encrypt($10, $20, 'cipher-algo=aes256'),
            $11, CASE WHEN $12::text IS NULL THEN NULL ELSE pgp_sym_encrypt($12, $20, 'cipher-algo=aes256') END,
            $13, $14, $15, $16,
            CASE WHEN $16 THEN report_forward_next_run($13, $14) ELSE NULL END,
            $17, $18, $19, $19
        )
        RETURNING id
        "#,
    )
    .bind(&normalized.name)
    .bind(&normalized.source_base_url)
    .bind(&normalized.source_username)
    .bind(source_password)
    .bind(&normalized.project_mode)
    .bind(&normalized.include_projects)
    .bind(&normalized.exclude_projects)
    .bind(&normalized.target_base_url)
    .bind(&normalized.target_username)
    .bind(target_password)
    .bind(&normalized.verification_type)
    .bind(verification_json)
    .bind(schedule_time)
    .bind(&normalized.schedule_timezone)
    .bind(&normalized.lifecycle_status)
    .bind(normalized.is_enabled)
    .bind(&normalized.settings)
    .bind(normalized.remark.as_deref())
    .bind(auth_user.user_id)
    .bind(key)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    let data = fetch_config(state.db.pool(), id).await?;
    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(data))
}

pub async fn get_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
) -> ApiResult<Value> {
    let key = credential_key()?;
    Ok(ApiSuccess::default()
        .with_data(fetch_config_with_secrets(state.db.pool(), config_id, &key).await?))
}

pub async fn update_config(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(config_id): Path<Uuid>,
    Json(input): Json<ConfigInput>,
) -> ApiResult<Value> {
    fetch_config(state.db.pool(), config_id).await?;
    let normalized = validate_config(input, false)?;
    let key = credential_key()?;
    let schedule_time = parse_schedule_time(&normalized.schedule_time)?;
    let verification_json = normalized
        .verification_config
        .as_ref()
        .map(Value::to_string);

    let affected = sqlx::query(
        r#"
        UPDATE report_forward_configs
        SET name = $2,
            source_base_url = $3,
            source_username = $4,
            source_password_cipher = CASE WHEN $5::text IS NULL OR BTRIM($5) = ''
                THEN source_password_cipher ELSE pgp_sym_encrypt($5, $20, 'cipher-algo=aes256') END,
            project_mode = $6,
            include_projects = $7,
            exclude_projects = $8,
            target_base_url = $9,
            target_username = $10,
            target_password_cipher = CASE WHEN $11::text IS NULL OR BTRIM($11) = ''
                THEN target_password_cipher ELSE pgp_sym_encrypt($11, $20, 'cipher-algo=aes256') END,
            verification_type = $12,
            verification_config_cipher = CASE WHEN $13::text IS NULL
                THEN verification_config_cipher ELSE pgp_sym_encrypt($13, $20, 'cipher-algo=aes256') END,
            schedule_time = $14,
            schedule_timezone = $15,
            lifecycle_status = $16,
            is_enabled = $17,
            next_run_at = CASE WHEN $17 THEN report_forward_next_run($14, $15) ELSE NULL END,
            settings = $18,
            remark = $19,
            updated_by_user_id = $21,
            updated_at = NOW()
        WHERE id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(config_id)
    .bind(&normalized.name)
    .bind(&normalized.source_base_url)
    .bind(&normalized.source_username)
    .bind(normalized.source_password.as_deref())
    .bind(&normalized.project_mode)
    .bind(&normalized.include_projects)
    .bind(&normalized.exclude_projects)
    .bind(&normalized.target_base_url)
    .bind(&normalized.target_username)
    .bind(normalized.target_password.as_deref())
    .bind(&normalized.verification_type)
    .bind(verification_json)
    .bind(schedule_time)
    .bind(&normalized.schedule_timezone)
    .bind(&normalized.lifecycle_status)
    .bind(normalized.is_enabled)
    .bind(&normalized.settings)
    .bind(normalized.remark.as_deref())
    .bind(key)
    .bind(auth_user.user_id)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?
    .rows_affected();

    if affected == 0 {
        return Err(not_found("报送配置不存在"));
    }
    Ok(ApiSuccess::default().with_data(fetch_config(state.db.pool(), config_id).await?))
}

pub async fn delete_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
) -> ApiResult<()> {
    let active = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM report_forward_runs WHERE config_id = $1 AND status IN ('pending','running','cancelling')",
    )
    .bind(config_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;
    if active > 0 {
        return Err(invalid_input("该配置仍有排队或运行中的任务，不能删除"));
    }
    let affected = sqlx::query(
        "UPDATE report_forward_configs SET is_deleted=TRUE, is_enabled=FALSE, deleted_at=NOW(), updated_at=NOW() WHERE id=$1 AND is_deleted=FALSE",
    )
    .bind(config_id)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?
    .rows_affected();
    if affected == 0 {
        return Err(not_found("报送配置不存在"));
    }
    Ok(ApiSuccess::default())
}

pub async fn create_run(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(config_id): Path<Uuid>,
    Json(input): Json<CreateRunInput>,
) -> ApiResult<Value> {
    if !RUN_MODES.contains(&input.run_mode.as_str()) {
        return Err(invalid_input("不支持的运行或测试类型"));
    }
    if !input.options.is_object() {
        return Err(invalid_input("options 必须是 JSON 对象"));
    }
    let config = fetch_config(state.db.pool(), config_id).await?;
    if input.run_mode == "production"
        && (!config["is_enabled"].as_bool().unwrap_or(false)
            || config["lifecycle_status"].as_str() != Some("production"))
    {
        return Err(invalid_input("正式运行前必须将配置切换为正式启用"));
    }
    validate_run_options(state.db.pool(), config_id, &input).await?;
    let options = options_for_current_worker(input.options.clone());
    let trigger = if input.run_mode == "production" {
        "manual"
    } else {
        "test"
    };
    let priority = if trigger == "test" { 100 } else { 80 };
    let id = insert_run(
        state.db.pool(),
        config_id,
        config["name"].as_str().unwrap_or("未命名配置"),
        trigger,
        &input.run_mode,
        priority,
        &options,
        Some(auth_user.user_id),
        None,
    )
    .await?;
    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(fetch_run(state.db.pool(), id).await?))
}

pub async fn list_runs(State(state): State<AppState>, uri: Uri) -> ApiResult<Value> {
    let params = list_params(&uri)?;
    let offset = (params.page - 1) * params.page_size;
    let keyword = format!("%{}%", params.keyword);
    let total = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*)::bigint FROM report_forward_runs r
           WHERE ($1 = '%%' OR r.config_name ILIKE $1 OR r.error_summary ILIKE $1)
             AND ($2::text IS NULL OR r.status = $2)
             AND ($3::uuid IS NULL OR r.config_id = $3)"#,
    )
    .bind(&keyword)
    .bind(&params.status)
    .bind(params.config_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;
    let items = sqlx::query_scalar::<_, Value>(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(rows) ORDER BY rows.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT r.*,
                   (SELECT COUNT(*)::int FROM report_forward_events e WHERE e.run_id=r.id) AS event_count,
                   (SELECT COUNT(*)::int FROM report_forward_artifacts a WHERE a.run_id=r.id) AS artifact_count
            FROM report_forward_runs r
            WHERE ($1 = '%%' OR r.config_name ILIKE $1 OR r.error_summary ILIKE $1)
              AND ($2::text IS NULL OR r.status = $2)
              AND ($3::uuid IS NULL OR r.config_id = $3)
            ORDER BY r.created_at DESC LIMIT $4 OFFSET $5
        ) rows
        "#,
    )
    .bind(&keyword)
    .bind(&params.status)
    .bind(params.config_id)
    .bind(params.page_size)
    .bind(offset)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;
    Ok(ApiSuccess::default().with_data(json!({
        "items": items, "total": total, "page": params.page, "page_size": params.page_size
    })))
}

pub async fn get_run(State(state): State<AppState>, Path(run_id): Path<Uuid>) -> ApiResult<Value> {
    Ok(ApiSuccess::default().with_data(fetch_run(state.db.pool(), run_id).await?))
}

pub async fn cancel_run(
    State(state): State<AppState>,
    Path(run_id): Path<Uuid>,
) -> ApiResult<Value> {
    let affected = sqlx::query(
        r#"UPDATE report_forward_runs
           SET cancel_requested=TRUE,
               status=CASE WHEN status='pending' THEN 'cancelled' ELSE 'cancelling' END,
               completed_at=CASE WHEN status='pending' THEN NOW() ELSE completed_at END,
               current_stage=CASE WHEN status='pending' THEN 'cancelled' ELSE current_stage END,
               updated_at=NOW()
           WHERE id=$1 AND status IN ('pending','running')"#,
    )
    .bind(run_id)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?
    .rows_affected();
    if affected == 0 {
        return Err(invalid_input("只有排队或运行中的任务可以取消"));
    }
    Ok(ApiSuccess::default().with_data(fetch_run(state.db.pool(), run_id).await?))
}

pub async fn retry_run(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(run_id): Path<Uuid>,
) -> ApiResult<Value> {
    let parent = sqlx::query(
        r#"SELECT config_id, config_name, run_mode, options, status
           FROM report_forward_runs WHERE id=$1"#,
    )
    .bind(run_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(|| not_found("运行任务不存在"))?;
    let status: String = parent.try_get("status").map_err(db_error)?;
    if !matches!(status.as_str(), "failed" | "partial_success" | "cancelled") {
        return Err(invalid_input("只有失败、部分成功或已取消任务可以重试"));
    }
    let config_id: Option<Uuid> = parent.try_get("config_id").map_err(db_error)?;
    let config_id = config_id.ok_or_else(|| invalid_input("原配置已不存在，无法重试"))?;
    let config = fetch_config(state.db.pool(), config_id).await?;
    let config_name: String = parent.try_get("config_name").map_err(db_error)?;
    let run_mode: String = parent.try_get("run_mode").map_err(db_error)?;
    let options: Value = parent.try_get("options").map_err(db_error)?;
    let options = options_for_current_worker(options);
    if run_mode == "production"
        && (!config["is_enabled"].as_bool().unwrap_or(false)
            || config["lifecycle_status"].as_str() != Some("production"))
    {
        return Err(invalid_input("正式任务重试前必须保持配置为正式启用"));
    }
    validate_run_options(
        state.db.pool(),
        config_id,
        &CreateRunInput {
            run_mode: run_mode.clone(),
            options: options.clone(),
        },
    )
    .await?;
    let new_id = insert_run(
        state.db.pool(),
        config_id,
        &config_name,
        "retry",
        &run_mode,
        90,
        &options,
        Some(auth_user.user_id),
        Some(run_id),
    )
    .await?;
    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(fetch_run(state.db.pool(), new_id).await?))
}

pub async fn list_items(State(state): State<AppState>, uri: Uri) -> ApiResult<Value> {
    let params = list_params(&uri)?;
    let run_id = params
        .run_id
        .ok_or_else(|| invalid_input("run_id 不能为空"))?;
    fetch_run_base(state.db.pool(), run_id).await?;
    let key = credential_key()?;
    let offset = (params.page - 1) * params.page_size;
    let keyword = format!("%{}%", params.keyword);
    let total = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM report_forward_items
           WHERE run_id=$1 AND ($2='%%' OR person_name ILIKE $2)
             AND ($3::text IS NULL OR status=$3)
             AND ($4::text IS NULL OR CASE
                    WHEN status IN ('submitted','validated') THEN 'success'
                    WHEN status='failed' THEN 'failed'
                    ELSE 'unknown' END=$4)"#,
    )
    .bind(run_id)
    .bind(&keyword)
    .bind(&params.status)
    .bind(&params.outcome)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;
    let counts = sqlx::query_scalar::<_, Value>(
        r#"SELECT jsonb_build_object(
              'all', COUNT(*)::int,
              'success', COUNT(*) FILTER (WHERE status IN ('submitted','validated'))::int,
              'failed', COUNT(*) FILTER (WHERE status='failed')::int,
              'unknown', COUNT(*) FILTER (WHERE status NOT IN ('submitted','validated','failed'))::int)
           FROM report_forward_items WHERE run_id=$1"#,
    )
    .bind(run_id).fetch_one(state.db.pool()).await.map_err(db_error)?;
    let items = sqlx::query_scalar::<_, Value>(
        r#"
        SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at, source_row_no), '[]'::jsonb)
        FROM (
            SELECT (to_jsonb(i) - 'identity_cipher' - 'phone_cipher' - 'address_cipher')
                || jsonb_build_object(
                    'project_name', p.external_project_name,
                    'identity_masked', CASE WHEN sensitive.identity_value IS NULL THEN NULL
                        ELSE LEFT(sensitive.identity_value, 6) || REPEAT('*', GREATEST(LENGTH(sensitive.identity_value)-10, 0)) || RIGHT(sensitive.identity_value, 4) END,
                    'phone_masked', CASE WHEN sensitive.phone_value IS NULL THEN NULL
                        ELSE LEFT(sensitive.phone_value, 3) || '****' || RIGHT(sensitive.phone_value, 4) END
                ) AS row_data,
                i.created_at, i.source_row_no
            FROM report_forward_items i
            JOIN report_forward_run_projects p ON p.id=i.run_project_id
            LEFT JOIN LATERAL (
                SELECT
                    CASE WHEN i.identity_cipher IS NULL THEN NULL ELSE pgp_sym_decrypt(i.identity_cipher, $4) END AS identity_value,
                    CASE WHEN i.phone_cipher IS NULL THEN NULL ELSE pgp_sym_decrypt(i.phone_cipher, $4) END AS phone_value
            ) sensitive ON TRUE
            WHERE i.run_id=$1 AND ($2='%%' OR i.person_name ILIKE $2) AND ($3::text IS NULL OR i.status=$3)
              AND ($5::text IS NULL OR CASE
                     WHEN i.status IN ('submitted','validated') THEN 'success'
                     WHEN i.status='failed' THEN 'failed'
                     ELSE 'unknown' END=$5)
            ORDER BY i.created_at, i.source_row_no LIMIT $6 OFFSET $7
        ) rows
        "#,
    )
    .bind(run_id).bind(&keyword).bind(&params.status).bind(key)
    .bind(&params.outcome).bind(params.page_size).bind(offset)
    .fetch_one(state.db.pool()).await.map_err(db_error)?;
    Ok(ApiSuccess::default().with_data(json!({
        "items": items, "total": total, "page": params.page, "page_size": params.page_size,
        "counts": counts
    })))
}

pub async fn export_items(
    State(state): State<AppState>,
    Path(run_id): Path<Uuid>,
    uri: Uri,
) -> Result<Response, ApiError> {
    let run = fetch_run_base(state.db.pool(), run_id).await?;
    let params = list_params(&uri)?;
    let keyword = format!("%{}%", params.keyword);
    let key = credential_key()?;
    let rows = sqlx::query(
        r#"
        SELECT p.external_project_name, i.source_row_no, i.person_name, i.gender,
               CASE WHEN sensitive.identity_value IS NULL THEN NULL
                    ELSE LEFT(sensitive.identity_value,6) ||
                         REPEAT('*',GREATEST(LENGTH(sensitive.identity_value)-10,0)) ||
                         RIGHT(sensitive.identity_value,4) END AS identity_masked,
               CASE WHEN sensitive.phone_value IS NULL THEN NULL
                    ELSE LEFT(sensitive.phone_value,3) || '****' ||
                         RIGHT(sensitive.phone_value,4) END AS phone_masked,
               i.status, i.target_result, i.last_error, i.pushed_at
        FROM report_forward_items i
        JOIN report_forward_run_projects p ON p.id=i.run_project_id
        LEFT JOIN LATERAL (
            SELECT
                CASE WHEN i.identity_cipher IS NULL THEN NULL ELSE pgp_sym_decrypt(i.identity_cipher,$5) END AS identity_value,
                CASE WHEN i.phone_cipher IS NULL THEN NULL ELSE pgp_sym_decrypt(i.phone_cipher,$5) END AS phone_value
        ) sensitive ON TRUE
        WHERE i.run_id=$1 AND ($2='%%' OR i.person_name ILIKE $2)
          AND ($3::text IS NULL OR i.status=$3)
          AND ($4::text IS NULL OR CASE
                 WHEN i.status IN ('submitted','validated') THEN 'success'
                 WHEN i.status='failed' THEN 'failed'
                 ELSE 'unknown' END=$4)
        ORDER BY p.created_at, i.created_at, i.source_row_no
        "#,
    )
    .bind(run_id)
    .bind(&keyword)
    .bind(&params.status)
    .bind(&params.outcome)
    .bind(key)
    .fetch_all(state.db.pool())
    .await
    .map_err(db_error)?;

    let bytes = build_items_workbook(&rows)?;
    let config_name = run["config_name"].as_str().unwrap_or("数据报送");
    let suffix = match params.outcome.as_deref() {
        Some("success") => "成功数据",
        Some("failed") => "失败数据",
        Some("unknown") => "未对应数据",
        _ => "全部人员结果",
    };
    let filename = format!("{}_{}.xlsx", sanitize_filename(config_name), suffix);
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(
            header::CONTENT_TYPE,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header(
            header::CONTENT_DISPOSITION,
            format!(
                "attachment; filename*=UTF-8''{}",
                percent_encoding::utf8_percent_encode(
                    &filename,
                    percent_encoding::NON_ALPHANUMERIC
                )
            ),
        )
        .body(Body::from(bytes))
        .map_err(|error| ApiError::default().with_debug(error.to_string()))?
        .into_response())
}

fn build_items_workbook(rows: &[sqlx::postgres::PgRow]) -> Result<Vec<u8>, ApiError> {
    let mut workbook = Workbook::new();
    let china_offset = chrono::FixedOffset::east_opt(8 * 60 * 60)
        .ok_or_else(|| ApiError::default().with_message("初始化导出时区失败"))?;
    let worksheet = workbook.add_worksheet();
    worksheet.set_name("人员报送结果").map_err(xlsx_error)?;
    worksheet.set_freeze_panes(1, 0).map_err(xlsx_error)?;
    worksheet.set_column_width(0, 8).map_err(xlsx_error)?;
    worksheet.set_column_width(1, 42).map_err(xlsx_error)?;
    worksheet.set_column_width(2, 10).map_err(xlsx_error)?;
    worksheet.set_column_width(3, 14).map_err(xlsx_error)?;
    worksheet.set_column_width(4, 9).map_err(xlsx_error)?;
    worksheet.set_column_width(5, 22).map_err(xlsx_error)?;
    worksheet.set_column_width(6, 16).map_err(xlsx_error)?;
    worksheet.set_column_width(7, 16).map_err(xlsx_error)?;
    worksheet.set_column_width(8, 22).map_err(xlsx_error)?;
    worksheet.set_column_width(9, 48).map_err(xlsx_error)?;

    let header_format = Format::new()
        .set_bold()
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x0F6B5D))
        .set_align(FormatAlign::Center);
    let success_format = Format::new()
        .set_background_color(Color::RGB(0xDCFCE7))
        .set_font_color(Color::RGB(0x166534));
    let failed_format = Format::new()
        .set_background_color(Color::RGB(0xFEE2E2))
        .set_font_color(Color::RGB(0x991B1B));
    let unknown_format = Format::new()
        .set_background_color(Color::RGB(0xFEF3C7))
        .set_font_color(Color::RGB(0x92400E));
    let headers = [
        "序号",
        "项目",
        "来源行",
        "姓名",
        "性别",
        "身份证",
        "手机号",
        "报送结果",
        "完成时间",
        "错误/说明",
    ];
    for (column, value) in headers.iter().enumerate() {
        worksheet
            .write_string_with_format(0, column as u16, *value, &header_format)
            .map_err(xlsx_error)?;
    }
    for (index, row) in rows.iter().enumerate() {
        let excel_row = (index + 1) as u32;
        let status: String = row.try_get("status").map_err(db_error)?;
        let target_result: Option<Value> = row.try_get("target_result").map_err(db_error)?;
        let result_label = item_result_label(&status, target_result.as_ref());
        let pushed_at: Option<chrono::DateTime<chrono::Utc>> =
            row.try_get("pushed_at").map_err(db_error)?;
        let values = [
            (index + 1).to_string(),
            row.try_get::<String, _>("external_project_name")
                .map_err(db_error)?,
            row.try_get::<Option<i32>, _>("source_row_no")
                .map_err(db_error)?
                .map(|value| value.to_string())
                .unwrap_or_default(),
            row.try_get::<String, _>("person_name").map_err(db_error)?,
            row.try_get::<Option<String>, _>("gender")
                .map_err(db_error)?
                .unwrap_or_default(),
            row.try_get::<Option<String>, _>("identity_masked")
                .map_err(db_error)?
                .unwrap_or_default(),
            row.try_get::<Option<String>, _>("phone_masked")
                .map_err(db_error)?
                .unwrap_or_default(),
            result_label.to_owned(),
            pushed_at
                .map(|value| {
                    value
                        .with_timezone(&china_offset)
                        .format("%Y-%m-%d %H:%M:%S")
                        .to_string()
                })
                .unwrap_or_default(),
            row.try_get::<Option<String>, _>("last_error")
                .map_err(db_error)?
                .unwrap_or_else(|| item_result_note(&status, target_result.as_ref()).to_owned()),
        ];
        for (column, value) in values.iter().enumerate() {
            worksheet
                .write_string(excel_row, column as u16, value)
                .map_err(xlsx_error)?;
        }
        let result_format = if matches!(status.as_str(), "submitted" | "validated") {
            &success_format
        } else if status == "failed" {
            &failed_format
        } else {
            &unknown_format
        };
        worksheet
            .write_string_with_format(excel_row, 7, result_label, result_format)
            .map_err(xlsx_error)?;
    }
    if !rows.is_empty() {
        worksheet
            .autofilter(0, 0, rows.len() as u32, 9)
            .map_err(xlsx_error)?;
    }
    workbook.save_to_buffer().map_err(xlsx_error)
}

fn item_result_label(status: &str, target_result: Option<&Value>) -> &'static str {
    if target_result
        .and_then(|value| value.get("already_exists"))
        .and_then(Value::as_bool)
        == Some(true)
    {
        "政府平台已存在（成功）"
    } else if matches!(status, "submitted" | "validated") {
        "成功"
    } else if status == "failed" {
        "失败"
    } else {
        "无法对应到个人"
    }
}

fn item_result_note(status: &str, _target_result: Option<&Value>) -> &'static str {
    if status == "result_unknown" {
        "政府仅返回批量汇总，无法确认此人的具体结果"
    } else {
        ""
    }
}

fn sanitize_filename(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) {
                '_'
            } else {
                character
            }
        })
        .collect()
}

fn xlsx_error(error: rust_xlsxwriter::XlsxError) -> ApiError {
    ApiError::default()
        .with_message("生成 Excel 失败")
        .with_debug(error.to_string())
}

pub async fn download_artifact(
    State(state): State<AppState>,
    Path(artifact_id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let row = sqlx::query(
        "SELECT object_key, original_filename, content_type FROM report_forward_artifacts WHERE id=$1",
    )
    .bind(artifact_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(|| not_found("文件不存在"))?;
    let object_key: String = row.try_get("object_key").map_err(db_error)?;
    let filename: String = row.try_get("original_filename").map_err(db_error)?;
    let content_type: Option<String> = row.try_get("content_type").map_err(db_error)?;
    let bytes = state.storage.get(&object_key).await.map_err(|error| {
        ApiError::default()
            .with_message("读取报送文件失败")
            .with_debug(error.to_string())
    })?;
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(
            header::CONTENT_TYPE,
            content_type.unwrap_or_else(|| "application/octet-stream".to_owned()),
        )
        .header(
            header::CONTENT_DISPOSITION,
            format!(
                "attachment; filename*=UTF-8''{}",
                percent_encoding::utf8_percent_encode(
                    &filename,
                    percent_encoding::NON_ALPHANUMERIC
                )
            ),
        )
        .body(Body::from(bytes))
        .map_err(|error| ApiError::default().with_debug(error.to_string()))?
        .into_response())
}

async fn fetch_config(pool: &sqlx::PgPool, id: Uuid) -> Result<Value, ApiError> {
    sqlx::query_scalar::<_, Value>(
        r#"SELECT (to_jsonb(c) - 'source_password_cipher' - 'target_password_cipher' - 'verification_config_cipher')
                   || jsonb_build_object(
                       'source_password_configured', octet_length(c.source_password_cipher)>0,
                       'target_password_configured', octet_length(c.target_password_cipher)>0,
                       'verification_configured', c.verification_config_cipher IS NOT NULL)
            FROM report_forward_configs c WHERE c.id=$1 AND c.is_deleted=FALSE"#,
    )
    .bind(id).fetch_optional(pool).await.map_err(db_error)?
    .ok_or_else(|| not_found("报送配置不存在"))
}

async fn fetch_config_with_secrets(
    pool: &sqlx::PgPool,
    id: Uuid,
    key: &str,
) -> Result<Value, ApiError> {
    sqlx::query_scalar::<_, Value>(
        r#"SELECT (to_jsonb(c) - 'source_password_cipher' - 'target_password_cipher' - 'verification_config_cipher')
                   || jsonb_build_object(
                       'source_password_configured', octet_length(c.source_password_cipher)>0,
                       'target_password_configured', octet_length(c.target_password_cipher)>0,
                       'verification_configured', c.verification_config_cipher IS NOT NULL,
                       'source_password', pgp_sym_decrypt(c.source_password_cipher, $2),
                       'target_password', pgp_sym_decrypt(c.target_password_cipher, $2),
                       'verification_config', CASE WHEN c.verification_config_cipher IS NULL THEN NULL
                           ELSE pgp_sym_decrypt(c.verification_config_cipher, $2)::jsonb END)
            FROM report_forward_configs c WHERE c.id=$1 AND c.is_deleted=FALSE"#,
    )
    .bind(id)
    .bind(key)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(|| not_found("报送配置不存在"))
}

async fn fetch_run_base(pool: &sqlx::PgPool, id: Uuid) -> Result<Value, ApiError> {
    sqlx::query_scalar("SELECT to_jsonb(r) FROM report_forward_runs r WHERE id=$1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("运行任务不存在"))
}

async fn fetch_run(pool: &sqlx::PgPool, id: Uuid) -> Result<Value, ApiError> {
    fetch_run_base(pool, id).await?;
    sqlx::query_scalar::<_, Value>(
        r#"
        SELECT to_jsonb(r)
            || jsonb_build_object(
                'projects', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at) FROM report_forward_run_projects p WHERE p.run_id=r.id), '[]'::jsonb),
                'artifacts', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at) FROM report_forward_artifacts a WHERE a.run_id=r.id), '[]'::jsonb),
                'events', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM (SELECT * FROM report_forward_events WHERE run_id=r.id ORDER BY id DESC LIMIT 300) e), '[]'::jsonb)
            )
        FROM report_forward_runs r WHERE r.id=$1
        "#,
    ).bind(id).fetch_one(pool).await.map_err(db_error)
}

#[allow(clippy::too_many_arguments)]
async fn insert_run(
    pool: &sqlx::PgPool,
    config_id: Uuid,
    config_name: &str,
    trigger_type: &str,
    run_mode: &str,
    priority: i32,
    options: &Value,
    requested_by: Option<Uuid>,
    parent_run_id: Option<Uuid>,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO report_forward_runs
           (config_id, config_name, trigger_type, run_mode, priority, options, requested_by_user_id, parent_run_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id"#,
    )
    .bind(config_id).bind(config_name).bind(trigger_type).bind(run_mode).bind(priority)
    .bind(options).bind(requested_by).bind(parent_run_id)
    .fetch_one(pool).await.map_err(db_error)
}

fn options_for_current_worker(mut options: Value) -> Value {
    let target = std::env::var("REPORT_FORWARD_RUN_TARGET")
        .unwrap_or_else(|_| "k3s".to_owned());
    if let Some(object) = options.as_object_mut() {
        object.insert("worker_target".to_owned(), Value::String(target));
    }
    options
}

async fn validate_run_options(
    pool: &sqlx::PgPool,
    config_id: Uuid,
    input: &CreateRunInput,
) -> Result<(), ApiError> {
    let artifact_type = match input.run_mode.as_str() {
        "test_transform" => Some("source"),
        "test_upload_validate" | "test_submit" => Some("converted"),
        _ => None,
    };
    if let Some(artifact_type) = artifact_type {
        let source_run_id = input
            .options
            .get("source_run_id")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid_input("该分阶段测试必须选择一个已完成的来源任务"))?;
        let source_run_id =
            Uuid::parse_str(source_run_id).map_err(|_| invalid_input("source_run_id 格式错误"))?;
        let exists = sqlx::query_scalar::<_, bool>(
            r#"SELECT EXISTS(
                SELECT 1 FROM report_forward_runs r
                WHERE r.id=$1 AND r.config_id=$2 AND r.status IN ('success','partial_success')
                  AND EXISTS(SELECT 1 FROM report_forward_artifacts a WHERE a.run_id=r.id AND a.artifact_type=$3)
            )"#,
        ).bind(source_run_id).bind(config_id).bind(artifact_type).fetch_one(pool).await.map_err(db_error)?;
        if !exists {
            return Err(invalid_input(if artifact_type == "source" {
                "所选来源任务没有可用于转换测试的原始文件"
            } else {
                "所选来源任务没有可用于上传测试的转换文件"
            }));
        }
    }
    Ok(())
}

fn validate_config(mut input: ConfigInput, create: bool) -> Result<ConfigInput, ApiError> {
    input.name = input.name.trim().to_owned();
    input.source_username = input.source_username.trim().to_owned();
    input.target_username = input.target_username.trim().to_owned();
    input.include_projects = normalize_names(input.include_projects);
    input.exclude_projects = normalize_names(input.exclude_projects);
    if input.name.is_empty() || input.source_username.is_empty() || input.target_username.is_empty()
    {
        return Err(invalid_input("配置名称、源站账号和目标站账号不能为空"));
    }
    if input.name.chars().count() > 200
        || input.source_username.chars().count() > 200
        || input.target_username.chars().count() > 200
    {
        return Err(invalid_input("配置名称和两端账号不能超过 200 个字符"));
    }
    if create
        && input
            .source_password
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .is_empty()
    {
        return Err(invalid_input("首次创建必须填写源站密码"));
    }
    if create
        && input
            .target_password
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .is_empty()
    {
        return Err(invalid_input("首次创建必须填写目标站密码"));
    }
    if !matches!(input.project_mode.as_str(), "all" | "selected") {
        return Err(invalid_input("project_mode 只能是 all 或 selected"));
    }
    if input.project_mode == "selected" && input.include_projects.is_empty() {
        return Err(invalid_input("指定项目模式至少需要填写一个项目"));
    }
    if !matches!(
        input.lifecycle_status.as_str(),
        "draft" | "testing" | "production" | "paused"
    ) {
        return Err(invalid_input("配置状态无效"));
    }
    if input.is_enabled && input.lifecycle_status != "production" {
        return Err(invalid_input("只有正式配置可以启用每日运行"));
    }
    if input.verification_type != "feishu" {
        return Err(invalid_input("无人值守任务当前仅支持飞书获取短信验证码"));
    }
    if create && input.verification_config.is_none() {
        return Err(invalid_input("飞书验证码模式必须填写飞书配置"));
    }
    if input
        .verification_config
        .as_ref()
        .is_some_and(|value| !value.is_object())
        || !input.settings.is_object()
    {
        return Err(invalid_input(
            "verification_config 和 settings 必须是 JSON 对象",
        ));
    }
    if let Some(verification) = input.verification_config.as_ref() {
        for field in ["app_id", "app_secret", "chat_id"] {
            if verification
                .get(field)
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or_default()
                .is_empty()
            {
                return Err(invalid_input(
                    "飞书配置必须完整填写 App ID、App Secret 和 Chat ID",
                ));
            }
        }
        if let Some(interval) = verification.get("poll_interval") {
            let interval = interval
                .as_u64()
                .ok_or_else(|| invalid_input("飞书轮询间隔必须是整数"))?;
            if !(1..=60).contains(&interval) {
                return Err(invalid_input("飞书轮询间隔必须在 1 到 60 秒之间"));
            }
        }
    }
    let settings = input
        .settings
        .as_object()
        .expect("settings was checked as an object");
    if settings
        .get("headless")
        .is_some_and(|value| !value.is_boolean())
    {
        return Err(invalid_input("headless 必须是布尔值"));
    }
    if let Some(timeout) = settings.get("upload_timeout_minutes") {
        let timeout = timeout
            .as_u64()
            .ok_or_else(|| invalid_input("上传超时必须是整数分钟"))?;
        if !(1..=120).contains(&timeout) {
            return Err(invalid_input("上传超时必须在 1 到 120 分钟之间"));
        }
    }
    if let Some(days) = settings.get("latest_entry_days") {
        let days = days
            .as_u64()
            .ok_or_else(|| invalid_input("最新进场天数必须是整数"))?;
        if !(1..=3650).contains(&days) {
            return Err(invalid_input("最新进场天数必须在 1 到 3650 天之间"));
        }
    }
    input.source_base_url =
        validate_official_url(&input.source_base_url, "tg.91jtg.com", DEFAULT_SOURCE_URL)?;
    input.target_base_url = validate_official_url(
        &input.target_base_url,
        "www.zjzwfw.gov.cn",
        DEFAULT_TARGET_URL,
    )?;
    if input.schedule_timezone != DEFAULT_TIMEZONE {
        return Err(invalid_input("当前仅支持 Asia/Shanghai 时区"));
    }
    parse_schedule_time(&input.schedule_time)?;
    Ok(input)
}

fn validate_official_url(value: &str, host: &str, default: &str) -> Result<String, ApiError> {
    let value = if value.trim().is_empty() {
        default
    } else {
        value.trim()
    };
    let url = Url::parse(value).map_err(|_| invalid_input("网站地址格式错误"))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str() != Some(host)
        || url.port().is_some()
    {
        return Err(invalid_input(format!("网站地址只允许使用 {host}")));
    }
    Ok(format!("{}://{}", url.scheme(), host))
}

fn normalize_names(values: Vec<String>) -> Vec<String> {
    let mut result = Vec::new();
    for value in values {
        let value = value.trim();
        if !value.is_empty() && !result.iter().any(|item| item == value) {
            result.push(value.to_owned());
        }
    }
    result
}

fn parse_schedule_time(value: &str) -> Result<NaiveTime, ApiError> {
    NaiveTime::parse_from_str(value.trim(), "%H:%M")
        .or_else(|_| NaiveTime::parse_from_str(value.trim(), "%H:%M:%S"))
        .map_err(|_| invalid_input("运行时间必须是 HH:mm 格式"))
}

fn credential_key() -> Result<String, ApiError> {
    std::env::var("REPORT_FORWARD_CREDENTIAL_KEY")
        .ok()
        .filter(|value| value.trim().len() >= 32)
        .ok_or_else(|| ApiError::default().with_message("数据报送凭证加密密钥未配置"))
}

fn list_params(uri: &Uri) -> Result<ListParams, ApiError> {
    let mut params = ListParams {
        page: 1,
        page_size: 20,
        keyword: String::new(),
        status: None,
        outcome: None,
        config_id: None,
        run_id: None,
    };
    if let Some(query) = uri.query() {
        for pair in query.split('&') {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next().unwrap_or_default();
            let value = percent_decode_str(&parts.next().unwrap_or_default().replace('+', " "))
                .decode_utf8_lossy()
                .into_owned();
            let value = value.trim();
            match key {
                "page" => params.page = value.parse::<i64>().unwrap_or(1).max(1),
                "page_size" => params.page_size = value.parse::<i64>().unwrap_or(20).clamp(1, 100),
                "keyword" | "q" => params.keyword = value.to_owned(),
                "status" if !value.is_empty() && value != "all" => {
                    params.status = Some(value.to_owned())
                }
                "outcome" if !value.is_empty() && value != "all" => {
                    if !matches!(value, "success" | "failed" | "unknown") {
                        return Err(invalid_input("outcome 只支持 success、failed 或 unknown"));
                    }
                    params.outcome = Some(value.to_owned())
                }
                "config_id" if !value.is_empty() => {
                    params.config_id = Some(
                        Uuid::parse_str(value).map_err(|_| invalid_input("config_id 格式错误"))?,
                    )
                }
                "run_id" if !value.is_empty() => {
                    params.run_id =
                        Some(Uuid::parse_str(value).map_err(|_| invalid_input("run_id 格式错误"))?)
                }
                _ => {}
            }
        }
    }
    Ok(params)
}

fn default_source_url() -> String {
    DEFAULT_SOURCE_URL.to_owned()
}
fn default_target_url() -> String {
    DEFAULT_TARGET_URL.to_owned()
}
fn default_project_mode() -> String {
    "all".to_owned()
}
fn default_verification_type() -> String {
    "feishu".to_owned()
}
fn default_schedule_time() -> String {
    "23:00".to_owned()
}
fn default_timezone() -> String {
    DEFAULT_TIMEZONE.to_owned()
}
fn default_lifecycle() -> String {
    "draft".to_owned()
}
fn default_production_mode() -> String {
    "production".to_owned()
}
fn empty_object() -> Value {
    Value::Object(Map::new())
}

fn invalid_input(message: impl Into<String>) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::BAD_REQUEST)
        .with_message(message)
}
fn not_found(message: impl Into<String>) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::NOT_FOUND)
        .with_message(message)
}
fn db_error(error: sqlx::Error) -> ApiError {
    ApiError::default().with_debug(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> ConfigInput {
        ConfigInput {
            name: "测试配置".to_owned(),
            source_base_url: DEFAULT_SOURCE_URL.to_owned(),
            source_username: "source".to_owned(),
            source_password: Some("password".to_owned()),
            project_mode: "all".to_owned(),
            include_projects: vec![],
            exclude_projects: vec![],
            target_base_url: DEFAULT_TARGET_URL.to_owned(),
            target_username: "13800000000".to_owned(),
            target_password: Some("password".to_owned()),
            verification_type: "feishu".to_owned(),
            verification_config: Some(json!({
                "app_id": "cli_test", "app_secret": "secret", "chat_id": "oc_test"
            })),
            schedule_time: "23:00".to_owned(),
            schedule_timezone: DEFAULT_TIMEZONE.to_owned(),
            lifecycle_status: "draft".to_owned(),
            is_enabled: false,
            settings: json!({}),
            remark: None,
        }
    }

    #[test]
    fn selected_mode_requires_projects() {
        let mut value = input();
        value.project_mode = "selected".to_owned();
        assert!(validate_config(value, true).is_err());
    }

    #[test]
    fn only_production_can_enable_schedule() {
        let mut value = input();
        value.is_enabled = true;
        assert!(validate_config(value, true).is_err());
    }

    #[test]
    fn official_hosts_are_enforced() {
        let mut value = input();
        value.source_base_url = "http://127.0.0.1".to_owned();
        assert!(validate_config(value, true).is_err());
    }

    #[test]
    fn feishu_and_worker_settings_are_validated() {
        let mut value = input();
        value.verification_config = Some(json!({"app_id": "", "app_secret": "x", "chat_id": "y"}));
        assert!(validate_config(value, true).is_err());

        let mut value = input();
        value.settings = json!({"headless": true, "upload_timeout_minutes": 0});
        assert!(validate_config(value, true).is_err());
    }
}
