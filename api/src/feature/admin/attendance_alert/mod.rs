use std::time::Duration;

use axum::{
    Json,
    extract::{Path, State},
    http::{StatusCode, Uri},
};
use chrono::{DateTime, Days, FixedOffset, NaiveDate, TimeZone, Utc};
use percent_encoding::percent_decode_str;
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::{Postgres, QueryBuilder, Row};
use uuid::Uuid;

use crate::{
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

const SHANGHAI_OFFSET_SECONDS: i32 = 8 * 60 * 60;
const SCHEDULE_HOUR: u32 = 14;

#[derive(Clone, Copy)]
enum AlertCategory {
    Manager,
    Worker,
    Supervisor,
}

impl AlertCategory {
    fn code(self) -> &'static str {
        match self {
            Self::Manager => "manager",
            Self::Worker => "worker",
            Self::Supervisor => "supervisor",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Manager => "管理人员",
            Self::Worker => "民工",
            Self::Supervisor => "监理",
        }
    }

    fn worker_filter(self) -> &'static str {
        match self {
            Self::Manager => "w.worker_type = 1001",
            Self::Worker => "w.worker_type = 1",
            Self::Supervisor => "w.is_key_personnel = TRUE",
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
struct AlertConfig {
    id: Uuid,
    project_id: Uuid,
    project_name: Option<String>,
    check_managers: bool,
    check_workers: bool,
    check_supervisors: bool,
}

#[derive(Debug)]
struct CategoryStats {
    expected_count: i32,
    attendance_count: i32,
    absent_count: i32,
    absent_details: Value,
}

#[derive(Debug, Clone)]
struct PageParams {
    page: i64,
    page_size: i64,
    keyword: String,
    project_id: Option<Uuid>,
    is_enabled: Option<bool>,
    category: Option<String>,
    status: Option<String>,
    alert_date: Option<NaiveDate>,
}

#[derive(Debug, Serialize)]
pub struct RunSummary {
    alert_date: String,
    scanned_configs: usize,
    written_logs: usize,
}

pub async fn list_configs(State(state): State<AppState>, uri: Uri) -> ApiResult<Value> {
    let params = page_params(&uri)?;
    let total = fetch_config_total(state.db.pool(), &params).await?;
    let items = fetch_config_items(state.db.pool(), &params).await?;

    Ok(ApiSuccess::default().with_data(json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

pub async fn create_config(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    let object = json_object(&body)?;
    let project_id = required_uuid(object.get("project_id"), "project_id")?;
    let is_enabled = optional_bool(object.get("is_enabled"), "is_enabled")?.unwrap_or(true);
    let check_managers =
        optional_bool(object.get("check_managers"), "check_managers")?.unwrap_or(true);
    let check_workers =
        optional_bool(object.get("check_workers"), "check_workers")?.unwrap_or(true);
    let check_supervisors =
        optional_bool(object.get("check_supervisors"), "check_supervisors")?.unwrap_or(true);
    let remark = optional_string(object.get("remark"));

    let config_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO construction_attendance_alert_configs (
            project_id, is_enabled, check_managers, check_workers, check_supervisors, remark
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (project_id) WHERE is_deleted = FALSE
        DO UPDATE SET
            is_enabled = EXCLUDED.is_enabled,
            check_managers = EXCLUDED.check_managers,
            check_workers = EXCLUDED.check_workers,
            check_supervisors = EXCLUDED.check_supervisors,
            remark = EXCLUDED.remark,
            updated_at = NOW()
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(is_enabled)
    .bind(check_managers)
    .bind(check_workers)
    .bind(check_supervisors)
    .bind(remark)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    let row = fetch_config(state.db.pool(), config_id).await?;
    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(row))
}

pub async fn update_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    let object = json_object(&body)?;
    let existing = fetch_config(state.db.pool(), config_id).await?;

    let project_id = object
        .get("project_id")
        .map(|value| required_uuid(Some(value), "project_id"))
        .transpose()?
        .unwrap_or_else(|| {
            existing["project_id"]
                .as_str()
                .and_then(|value| Uuid::parse_str(value).ok())
                .expect("stored project id")
        });
    let is_enabled = optional_bool(object.get("is_enabled"), "is_enabled")?
        .unwrap_or_else(|| existing["is_enabled"].as_bool().unwrap_or(true));
    let check_managers = optional_bool(object.get("check_managers"), "check_managers")?
        .unwrap_or_else(|| existing["check_managers"].as_bool().unwrap_or(true));
    let check_workers = optional_bool(object.get("check_workers"), "check_workers")?
        .unwrap_or_else(|| existing["check_workers"].as_bool().unwrap_or(true));
    let check_supervisors = optional_bool(object.get("check_supervisors"), "check_supervisors")?
        .unwrap_or_else(|| existing["check_supervisors"].as_bool().unwrap_or(true));
    let remark = if object.contains_key("remark") {
        optional_string(object.get("remark"))
    } else {
        optional_string(existing.get("remark"))
    };

    sqlx::query(
        r#"
        UPDATE construction_attendance_alert_configs
        SET project_id = $2,
            is_enabled = $3,
            check_managers = $4,
            check_workers = $5,
            check_supervisors = $6,
            remark = $7,
            updated_at = NOW()
        WHERE id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(config_id)
    .bind(project_id)
    .bind(is_enabled)
    .bind(check_managers)
    .bind(check_workers)
    .bind(check_supervisors)
    .bind(remark)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?;

    let row = fetch_config(state.db.pool(), config_id).await?;
    Ok(ApiSuccess::default().with_data(row))
}

pub async fn delete_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
) -> ApiResult<()> {
    let affected = sqlx::query(
        r#"
        UPDATE construction_attendance_alert_configs
        SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(config_id)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?
    .rows_affected();

    if affected == 0 {
        return Err(not_found());
    }

    Ok(ApiSuccess::default())
}

pub async fn list_logs(State(state): State<AppState>, uri: Uri) -> ApiResult<Value> {
    let params = page_params(&uri)?;
    let total = fetch_log_total(state.db.pool(), &params).await?;
    let items = fetch_log_items(state.db.pool(), &params).await?;

    Ok(ApiSuccess::default().with_data(json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

pub async fn run_alerts(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> ApiResult<RunSummary> {
    let object = json_object(&body)?;
    let alert_date = object
        .get("alert_date")
        .map(|value| required_date(value, "alert_date"))
        .transpose()?
        .unwrap_or_else(today_shanghai_date);
    let project_id = object
        .get("project_id")
        .map(|value| required_uuid(Some(value), "project_id"))
        .transpose()?;

    let summary = run_attendance_alerts(&state, alert_date, "manual", project_id).await?;

    Ok(ApiSuccess::default().with_data(summary))
}

pub fn spawn_attendance_alert_scheduler(state: AppState) {
    let enabled = std::env::var("ATTENDANCE_ALERT_SCHEDULER_ENABLED")
        .map(|value| {
            !matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "0" | "false" | "off"
            )
        })
        .unwrap_or(true);
    if !enabled {
        tracing::info!("attendance alert scheduler disabled");
        return;
    }

    tokio::spawn(async move {
        loop {
            let sleep_for = duration_until_next_shanghai_hour(Utc::now(), SCHEDULE_HOUR);
            tokio::time::sleep(sleep_for).await;
            let alert_date = today_shanghai_date();
            match run_attendance_alerts(&state, alert_date, "scheduled", None).await {
                Ok(summary) => tracing::info!(
                    alert_date = %summary.alert_date,
                    scanned_configs = summary.scanned_configs,
                    written_logs = summary.written_logs,
                    "attendance alert scheduler run finished"
                ),
                Err(error) => tracing::error!(
                    error = %error.message,
                    "attendance alert scheduler run failed"
                ),
            }
        }
    });
}

async fn run_attendance_alerts(
    state: &AppState,
    alert_date: NaiveDate,
    trigger_type: &'static str,
    project_id: Option<Uuid>,
) -> Result<RunSummary, ApiError> {
    let configs = fetch_enabled_configs(state.db.pool(), project_id).await?;
    let mut written_logs = 0_usize;

    for config in &configs {
        let categories = [
            (config.check_managers, AlertCategory::Manager),
            (config.check_workers, AlertCategory::Worker),
            (config.check_supervisors, AlertCategory::Supervisor),
        ];

        for (enabled, category) in categories {
            if !enabled {
                continue;
            }

            let stats =
                fetch_category_stats(state.db.pool(), config.project_id, alert_date, category)
                    .await?;
            if stats.expected_count == 0 || stats.absent_count == 0 {
                continue;
            }

            upsert_alert_log(
                state.db.pool(),
                config,
                alert_date,
                category,
                trigger_type,
                stats,
            )
            .await?;
            written_logs += 1;
        }
    }

    Ok(RunSummary {
        alert_date: alert_date.format("%Y-%m-%d").to_string(),
        scanned_configs: configs.len(),
        written_logs,
    })
}

async fn fetch_config(pool: &sqlx::PgPool, config_id: Uuid) -> Result<Value, ApiError> {
    sqlx::query_scalar::<_, Value>(
        r#"
        SELECT to_jsonb(r)
        FROM (
            SELECT c.*, p.name AS project_name
            FROM construction_attendance_alert_configs c
            JOIN construction_projects p ON p.id = c.project_id AND p.is_deleted = FALSE
            WHERE c.id = $1 AND c.is_deleted = FALSE
        ) r
        "#,
    )
    .bind(config_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)
}

async fn fetch_enabled_configs(
    pool: &sqlx::PgPool,
    project_id: Option<Uuid>,
) -> Result<Vec<AlertConfig>, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT c.id, c.project_id, p.name AS project_name,
               c.check_managers, c.check_workers, c.check_supervisors
        FROM construction_attendance_alert_configs c
        JOIN construction_projects p ON p.id = c.project_id AND p.is_deleted = FALSE
        WHERE c.is_deleted = FALSE AND c.is_enabled = TRUE
        "#,
    );

    if let Some(project_id) = project_id {
        query.push(" AND c.project_id = ").push_bind(project_id);
    }

    query
        .push(" ORDER BY c.created_at ASC")
        .build_query_as::<AlertConfig>()
        .fetch_all(pool)
        .await
        .map_err(db_error)
}

async fn fetch_category_stats(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    alert_date: NaiveDate,
    category: AlertCategory,
) -> Result<CategoryStats, ApiError> {
    let sql = format!(
        r#"
        WITH scoped_workers AS (
            SELECT
                w.id,
                w.project_id,
                w.unit_id,
                w.team_id,
                w.name,
                w.id_card,
                w.phone,
                t.name AS team_name,
                u.company_name AS unit_name
            FROM construction_workers w
            LEFT JOIN construction_teams t ON t.id = w.team_id AND t.is_deleted = FALSE
            LEFT JOIN construction_units u ON u.id = w.unit_id AND u.is_deleted = FALSE
            WHERE w.project_id = $1
              AND w.is_deleted = FALSE
              AND w.work_status = 1
              AND {}
        ),
        worker_attendance AS (
            SELECT
                scoped_workers.*,
                COALESCE(attendance.record_count, 0)::INTEGER AS record_count
            FROM scoped_workers
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::INTEGER AS record_count
                FROM construction_attendance_records r
                WHERE r.project_id = scoped_workers.project_id
                  AND r.worker_id = scoped_workers.id
                  AND r.is_deleted = FALSE
                  AND (r.trigger_time AT TIME ZONE 'Asia/Shanghai')::date = $2
            ) attendance ON TRUE
        )
        SELECT
            COUNT(*)::INTEGER AS expected_count,
            COUNT(*) FILTER (WHERE record_count > 0)::INTEGER AS attendance_count,
            COUNT(*) FILTER (WHERE record_count = 0)::INTEGER AS absent_count,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'worker_id', id,
                        'worker_name', name,
                        'id_card', id_card,
                        'phone', phone,
                        'unit_id', unit_id,
                        'unit_name', unit_name,
                        'team_id', team_id,
                        'team_name', team_name
                    )
                    ORDER BY COALESCE(name, ''), id
                ) FILTER (WHERE record_count = 0),
                '[]'::jsonb
            ) AS absent_details
        FROM worker_attendance
        "#,
        category.worker_filter()
    );

    let row = sqlx::query(&sql)
        .bind(project_id)
        .bind(alert_date)
        .fetch_one(pool)
        .await
        .map_err(db_error)?;

    Ok(CategoryStats {
        expected_count: row.try_get("expected_count").map_err(db_error)?,
        attendance_count: row.try_get("attendance_count").map_err(db_error)?,
        absent_count: row.try_get("absent_count").map_err(db_error)?,
        absent_details: row.try_get("absent_details").map_err(db_error)?,
    })
}

async fn upsert_alert_log(
    pool: &sqlx::PgPool,
    config: &AlertConfig,
    alert_date: NaiveDate,
    category: AlertCategory,
    trigger_type: &'static str,
    stats: CategoryStats,
) -> Result<(), ApiError> {
    let project_name = config.project_name.as_deref().unwrap_or("未命名项目");
    let message = format!(
        "{} {} 有 {} 名{}未考勤，需发送短信提醒（当前仅记录日志）",
        alert_date.format("%Y-%m-%d"),
        project_name,
        stats.absent_count,
        category.label()
    );
    let details = json!({
        "category_label": category.label(),
        "absent_workers": stats.absent_details,
    });

    sqlx::query(
        r#"
        INSERT INTO construction_attendance_alert_logs (
            config_id, project_id, alert_date, category, trigger_type, status,
            expected_count, attendance_count, absent_count, message, details
        )
        VALUES ($1, $2, $3, $4, $5, 'logged', $6, $7, $8, $9, $10)
        ON CONFLICT (project_id, alert_date, category) WHERE is_deleted = FALSE
        DO UPDATE SET
            config_id = EXCLUDED.config_id,
            trigger_type = EXCLUDED.trigger_type,
            status = EXCLUDED.status,
            expected_count = EXCLUDED.expected_count,
            attendance_count = EXCLUDED.attendance_count,
            absent_count = EXCLUDED.absent_count,
            message = EXCLUDED.message,
            details = EXCLUDED.details,
            updated_at = NOW()
        "#,
    )
    .bind(config.id)
    .bind(config.project_id)
    .bind(alert_date)
    .bind(category.code())
    .bind(trigger_type)
    .bind(stats.expected_count)
    .bind(stats.attendance_count)
    .bind(stats.absent_count)
    .bind(message)
    .bind(sqlx::types::Json(details))
    .execute(pool)
    .await
    .map_err(db_error)?;

    Ok(())
}

async fn fetch_config_total(pool: &sqlx::PgPool, params: &PageParams) -> Result<i64, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COUNT(*)::BIGINT
        FROM construction_attendance_alert_configs c
        JOIN construction_projects p ON p.id = c.project_id AND p.is_deleted = FALSE
        WHERE c.is_deleted = FALSE
        "#,
    );
    push_config_filters(&mut query, params);

    query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

async fn fetch_config_items(pool: &sqlx::PgPool, params: &PageParams) -> Result<Value, ApiError> {
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT c.*, p.name AS project_name
            FROM construction_attendance_alert_configs c
            JOIN construction_projects p ON p.id = c.project_id AND p.is_deleted = FALSE
            WHERE c.is_deleted = FALSE
        "#,
    );
    push_config_filters(&mut query, params);
    query
        .push(" ORDER BY c.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") r");

    query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

async fn fetch_log_total(pool: &sqlx::PgPool, params: &PageParams) -> Result<i64, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COUNT(*)::BIGINT
        FROM construction_attendance_alert_logs l
        JOIN construction_projects p ON p.id = l.project_id AND p.is_deleted = FALSE
        WHERE l.is_deleted = FALSE
        "#,
    );
    push_log_filters(&mut query, params);

    query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

async fn fetch_log_items(pool: &sqlx::PgPool, params: &PageParams) -> Result<Value, ApiError> {
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT l.*, p.name AS project_name
            FROM construction_attendance_alert_logs l
            JOIN construction_projects p ON p.id = l.project_id AND p.is_deleted = FALSE
            WHERE l.is_deleted = FALSE
        "#,
    );
    push_log_filters(&mut query, params);
    query
        .push(" ORDER BY l.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") r");

    query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

fn push_config_filters(query: &mut QueryBuilder<'_, Postgres>, params: &PageParams) {
    if let Some(project_id) = params.project_id {
        query.push(" AND c.project_id = ").push_bind(project_id);
    }
    if let Some(is_enabled) = params.is_enabled {
        query.push(" AND c.is_enabled = ").push_bind(is_enabled);
    }
    if !params.keyword.is_empty() {
        let keyword = format!("%{}%", params.keyword);
        query
            .push(" AND (p.name ILIKE ")
            .push_bind(keyword.clone())
            .push(" OR c.remark ILIKE ")
            .push_bind(keyword)
            .push(")");
    }
}

fn push_log_filters(query: &mut QueryBuilder<'_, Postgres>, params: &PageParams) {
    if let Some(project_id) = params.project_id {
        query.push(" AND l.project_id = ").push_bind(project_id);
    }
    if let Some(alert_date) = params.alert_date {
        query.push(" AND l.alert_date = ").push_bind(alert_date);
    }
    if let Some(category) = &params.category {
        query.push(" AND l.category = ").push_bind(category.clone());
    }
    if let Some(status) = &params.status {
        query.push(" AND l.status = ").push_bind(status.clone());
    }
    if !params.keyword.is_empty() {
        let keyword = format!("%{}%", params.keyword);
        query
            .push(" AND (p.name ILIKE ")
            .push_bind(keyword.clone())
            .push(" OR l.message ILIKE ")
            .push_bind(keyword)
            .push(")");
    }
}

fn page_params(uri: &Uri) -> Result<PageParams, ApiError> {
    let mut page = 1_i64;
    let mut page_size = 10_i64;
    let mut keyword = String::new();
    let mut project_id = None;
    let mut is_enabled = None;
    let mut category = None;
    let mut status = None;
    let mut alert_date = None;

    if let Some(query) = uri.query() {
        for pair in query.split('&') {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next().unwrap_or_default();
            let value = decode_query_value(parts.next().unwrap_or_default());
            let trimmed = value.trim();

            match key {
                "page" => page = trimmed.parse::<i64>().unwrap_or(1).max(1),
                "page_size" => page_size = trimmed.parse::<i64>().unwrap_or(10).clamp(1, 100),
                "keyword" | "q" => keyword = trimmed.to_owned(),
                "project_id" if !trimmed.is_empty() => {
                    project_id = Some(
                        Uuid::parse_str(trimmed)
                            .map_err(|_| invalid_column_value("project_id", "uuid"))?,
                    );
                }
                "is_enabled" if !trimmed.is_empty() => {
                    is_enabled = Some(parse_bool(trimmed, "is_enabled")?);
                }
                "category" if !trimmed.is_empty() && trimmed != "all" => {
                    category = Some(valid_category(trimmed)?);
                }
                "status" if !trimmed.is_empty() && trimmed != "all" => {
                    status = Some(trimmed.to_owned());
                }
                "alert_date" if !trimmed.is_empty() => {
                    alert_date = Some(parse_date(trimmed, "alert_date")?);
                }
                _ => {}
            }
        }
    }

    Ok(PageParams {
        page,
        page_size,
        keyword: keyword.trim().to_owned(),
        project_id,
        is_enabled,
        category,
        status,
        alert_date,
    })
}

fn decode_query_value(value: &str) -> String {
    percent_decode_str(&value.replace('+', " "))
        .decode_utf8_lossy()
        .into_owned()
}

fn json_object(body: &Value) -> Result<&serde_json::Map<String, Value>, ApiError> {
    body.as_object()
        .ok_or_else(|| invalid_input("Request body must be a JSON object"))
}

fn required_uuid(value: Option<&Value>, field: &str) -> Result<Uuid, ApiError> {
    match value {
        Some(Value::String(value)) if !value.trim().is_empty() => {
            Uuid::parse_str(value.trim()).map_err(|_| invalid_column_value(field, "uuid"))
        }
        _ => Err(invalid_column_value(field, "uuid")),
    }
}

fn optional_bool(value: Option<&Value>, field: &str) -> Result<Option<bool>, ApiError> {
    let Some(value) = value else {
        return Ok(None);
    };
    match value {
        Value::Null => Ok(None),
        Value::Bool(value) => Ok(Some(*value)),
        Value::Number(value) if value.as_i64() == Some(1) => Ok(Some(true)),
        Value::Number(value) if value.as_i64() == Some(0) => Ok(Some(false)),
        Value::String(value) if value.trim().is_empty() => Ok(None),
        Value::String(value) => parse_bool(value.trim(), field).map(Some),
        _ => Err(invalid_column_value(field, "boolean")),
    }
}

fn parse_bool(value: &str, field: &str) -> Result<bool, ApiError> {
    match value.to_ascii_lowercase().as_str() {
        "true" | "1" => Ok(true),
        "false" | "0" => Ok(false),
        _ => Err(invalid_column_value(field, "boolean")),
    }
}

fn optional_string(value: Option<&Value>) -> Option<String> {
    value.and_then(|value| match value {
        Value::Null => None,
        Value::String(value) if value.trim().is_empty() => None,
        Value::String(value) => Some(value.trim().to_owned()),
        Value::Bool(value) => Some(value.to_string()),
        Value::Number(value) => Some(value.to_string()),
        Value::Array(_) | Value::Object(_) => None,
    })
}

fn required_date(value: &Value, field: &str) -> Result<NaiveDate, ApiError> {
    match value {
        Value::String(value) if !value.trim().is_empty() => parse_date(value.trim(), field),
        _ => Err(invalid_column_value(field, "YYYY-MM-DD")),
    }
}

fn parse_date(value: &str, field: &str) -> Result<NaiveDate, ApiError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| invalid_column_value(field, "YYYY-MM-DD"))
}

fn valid_category(value: &str) -> Result<String, ApiError> {
    match value {
        "manager" | "worker" | "supervisor" => Ok(value.to_owned()),
        _ => Err(invalid_column_value(
            "category",
            "manager, worker, or supervisor",
        )),
    }
}

fn today_shanghai_date() -> NaiveDate {
    let offset = FixedOffset::east_opt(SHANGHAI_OFFSET_SECONDS).expect("valid offset");
    Utc::now().with_timezone(&offset).date_naive()
}

fn duration_until_next_shanghai_hour(now_utc: DateTime<Utc>, hour: u32) -> Duration {
    let offset = FixedOffset::east_opt(SHANGHAI_OFFSET_SECONDS).expect("valid offset");
    let local_now = now_utc.with_timezone(&offset);
    let today_run = local_datetime(&offset, local_now.date_naive(), hour);
    let next_run = if local_now < today_run {
        today_run
    } else {
        let tomorrow = local_now
            .date_naive()
            .checked_add_days(Days::new(1))
            .expect("valid next day");
        local_datetime(&offset, tomorrow, hour)
    };

    next_run
        .with_timezone(&Utc)
        .signed_duration_since(now_utc)
        .to_std()
        .unwrap_or_else(|_| Duration::from_secs(60))
        .max(Duration::from_secs(1))
}

fn local_datetime(offset: &FixedOffset, date: NaiveDate, hour: u32) -> DateTime<FixedOffset> {
    offset
        .from_local_datetime(&date.and_hms_opt(hour, 0, 0).expect("valid scheduler hour"))
        .single()
        .expect("fixed offset has a single local time")
}

fn invalid_input(message: impl Into<String>) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::BAD_REQUEST)
        .with_message(message)
}

fn invalid_column_value(column: &str, expected: &str) -> ApiError {
    invalid_input(format!("{column} must be {expected}"))
}

fn not_found() -> ApiError {
    ApiError::default()
        .with_code(StatusCode::NOT_FOUND)
        .with_message("Attendance alert resource not found")
}

fn db_error(error: sqlx::Error) -> ApiError {
    ApiError::default().with_debug(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scheduler_waits_until_today_run_when_before_14() {
        let now = DateTime::parse_from_rfc3339("2026-06-30T05:00:00Z")
            .unwrap()
            .with_timezone(&Utc);

        assert_eq!(
            duration_until_next_shanghai_hour(now, 14),
            Duration::from_secs(60 * 60)
        );
    }

    #[test]
    fn scheduler_waits_until_tomorrow_run_when_after_14() {
        let now = DateTime::parse_from_rfc3339("2026-06-30T07:00:00Z")
            .unwrap()
            .with_timezone(&Utc);

        assert_eq!(
            duration_until_next_shanghai_hour(now, 14),
            Duration::from_secs(23 * 60 * 60)
        );
    }
}
