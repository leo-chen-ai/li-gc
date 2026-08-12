use std::time::Duration;

use axum::{
    Extension,
    extract::{Query, State},
};
use chrono::{DateTime, NaiveDate, Timelike, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    feature::auth::{AuthUser, Role},
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct WarningListParams {
    page: Option<i64>,
    page_size: Option<i64>,
    warning_type: Option<String>,
    project_id: Option<Uuid>,
    status: Option<String>,
    keyword: Option<String>,
}

pub async fn list_warnings(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Query(params): Query<WarningListParams>,
) -> ApiResult<Value> {
    if !auth_user.roles.contains(&Role::Admin) {
        let role = sqlx::query_scalar::<_, String>(
            "SELECT role FROM users WHERE id = $1 AND is_active = TRUE",
        )
        .bind(auth_user.user_id)
        .fetch_optional(state.db.pool())
        .await
        .map_err(db_error)?
        .ok_or_else(|| forbidden("当前账号不可用"))?;
        if role == "shujubaosong" {
            return Err(forbidden("数据报送角色无权访问首页预警"));
        }
    }

    let page = params.page.unwrap_or(1).max(1);
    let page_size = params.page_size.unwrap_or(10).clamp(1, 100);
    if let Some(value) = params.warning_type.as_deref()
        && !matches!(value, "device_offline" | "management_team_no_attendance")
    {
        return Err(bad_request("warning_type不受支持"));
    }
    if let Some(value) = params.status.as_deref()
        && !matches!(value, "active" | "resolved")
    {
        return Err(bad_request("status不受支持"));
    }

    let total = warning_query(&auth_user, &params, true, page, page_size)
        .build_query_scalar::<i64>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;
    let items = warning_query(&auth_user, &params, false, page, page_size)
        .build_query_scalar::<Value>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(json!({
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    })))
}

fn warning_query<'a>(
    auth_user: &'a AuthUser,
    params: &'a WarningListParams,
    count: bool,
    page: i64,
    page_size: i64,
) -> QueryBuilder<'a, Postgres> {
    let select = if count {
        "SELECT COUNT(*)::BIGINT FROM system_warning_records w JOIN construction_projects p ON p.id = w.project_id AND p.is_deleted = FALSE LEFT JOIN construction_attendance_devices d ON d.id = w.device_id LEFT JOIN construction_workers cw ON cw.id = w.worker_id LEFT JOIN construction_teams t ON t.id = cw.team_id WHERE TRUE"
    } else {
        "SELECT COALESCE(jsonb_agg(to_jsonb(result) ORDER BY result.created_at DESC), '[]'::jsonb) FROM (SELECT w.id, w.warning_type, w.project_id, p.name AS project_name, w.device_id, d.device_name, d.serial_number, w.worker_id, cw.name AS worker_name, t.name AS team_name, w.warning_date, w.occurred_at, w.title, w.message, w.details, w.resolved_at, w.created_at FROM system_warning_records w JOIN construction_projects p ON p.id = w.project_id AND p.is_deleted = FALSE LEFT JOIN construction_attendance_devices d ON d.id = w.device_id LEFT JOIN construction_workers cw ON cw.id = w.worker_id LEFT JOIN construction_teams t ON t.id = cw.team_id WHERE TRUE"
    };
    let mut query = QueryBuilder::new(select);
    if !auth_user.roles.contains(&Role::Admin) {
        query
            .push(" AND EXISTS (SELECT 1 FROM user_managed_projects ump WHERE ump.user_id = ")
            .push_bind(auth_user.user_id)
            .push(" AND ump.project_id = w.project_id)");
    }
    if let Some(value) = params.warning_type.as_deref() {
        query.push(" AND w.warning_type = ").push_bind(value);
    }
    if let Some(value) = params.project_id {
        query.push(" AND w.project_id = ").push_bind(value);
    }
    match params.status.as_deref() {
        Some("active") => {
            query.push(" AND w.resolved_at IS NULL");
        }
        Some("resolved") => {
            query.push(" AND w.resolved_at IS NOT NULL");
        }
        _ => {}
    }
    if let Some(keyword) = params
        .keyword
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        let pattern = format!("%{keyword}%");
        query
            .push(" AND (p.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR w.title ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR w.message ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR COALESCE(d.device_name, '') ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR COALESCE(d.serial_number, '') ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR COALESCE(cw.name, '') ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
    if !count {
        query
            .push(" ORDER BY w.created_at DESC LIMIT ")
            .push_bind(page_size)
            .push(" OFFSET ")
            .push_bind((page - 1) * page_size)
            .push(") result");
    }
    query
}

pub fn spawn_system_warning_scheduler(state: AppState) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(60));
        loop {
            ticker.tick().await;
            if let Err(error) = refresh_system_warnings(state.db.pool()).await {
                tracing::error!(error = %error.message, "system warning refresh failed");
            }
        }
    });
}

pub async fn refresh_system_warnings(pool: &sqlx::PgPool) -> Result<(), ApiError> {
    refresh_device_offline_warnings(pool).await?;
    let shanghai_now = Utc::now() + chrono::Duration::hours(8);
    if shanghai_now.hour() >= 14 {
        let warning_date = shanghai_now.date_naive();
        let occurred_at = DateTime::from_naive_utc_and_offset(
            warning_date
                .and_hms_opt(6, 0, 0)
                .expect("valid warning time"),
            Utc,
        );
        refresh_management_team_attendance_warnings(pool, warning_date, occurred_at).await?;
    }
    Ok(())
}

pub async fn refresh_device_offline_warnings(pool: &sqlx::PgPool) -> Result<(), ApiError> {
    let offline_condition = r#"(
        (d.online_status = 'offline' AND COALESCE(d.last_offline_at, d.last_seen_at, d.created_at) <= NOW() - INTERVAL '30 minutes')
        OR COALESCE(d.last_heartbeat_at, d.last_seen_at, d.created_at) <= NOW() - INTERVAL '30 minutes'
    )"#;
    let insert_sql = format!(
        r#"
        INSERT INTO system_warning_records (
            warning_type, project_id, device_id, warning_date, occurred_at, title, message, details
        )
        SELECT 'device_offline', d.project_id, d.id,
               (NOW() AT TIME ZONE 'Asia/Shanghai')::date,
               LEAST(NOW(), COALESCE(d.last_heartbeat_at, d.last_seen_at, d.last_online_at, d.created_at) + INTERVAL '30 minutes'),
               '考勤机离线',
               CONCAT(COALESCE(p.name, '未命名项目'), '的', COALESCE(NULLIF(d.device_name, ''), NULLIF(d.serial_number, ''), '未命名考勤机'), '已离线超过30分钟'),
               jsonb_build_object('device_name', d.device_name, 'serial_number', d.serial_number, 'online_status', d.online_status, 'last_heartbeat_at', d.last_heartbeat_at)
        FROM construction_attendance_devices d
        JOIN construction_projects p ON p.id = d.project_id AND p.is_deleted = FALSE
        WHERE d.is_deleted = FALSE AND {offline_condition}
        ON CONFLICT (device_id) WHERE warning_type = 'device_offline' AND resolved_at IS NULL DO NOTHING
    "#
    );
    sqlx::query(&insert_sql)
        .execute(pool)
        .await
        .map_err(db_error)?;

    let resolve_sql = format!(
        r#"
        UPDATE system_warning_records w
        SET resolved_at = NOW(), updated_at = NOW()
        FROM construction_attendance_devices d
        WHERE w.warning_type = 'device_offline' AND w.resolved_at IS NULL
          AND w.device_id = d.id AND (d.is_deleted = TRUE OR NOT {offline_condition})
    "#
    );
    sqlx::query(&resolve_sql)
        .execute(pool)
        .await
        .map_err(db_error)?;
    Ok(())
}

pub async fn refresh_management_team_attendance_warnings(
    pool: &sqlx::PgPool,
    warning_date: NaiveDate,
    occurred_at: DateTime<Utc>,
) -> Result<(), ApiError> {
    sqlx::query(r#"
        INSERT INTO system_warning_records (
            warning_type, project_id, worker_id, warning_date, occurred_at, title, message, details
        )
        SELECT 'management_team_no_attendance', w.project_id, w.id,
               $1,
               $2,
               '管理班组人员未考勤',
               CONCAT(COALESCE(p.name, '未命名项目'), '管理班组的', COALESCE(w.name, '未命名人员'), '截至14:00仍无今日考勤记录'),
               jsonb_build_object('worker_name', w.name, 'team_name', t.name, 'unit_name', u.company_name, 'phone', w.phone)
        FROM construction_workers w
        JOIN construction_projects p ON p.id = w.project_id AND p.is_deleted = FALSE
        JOIN construction_teams t ON t.id = w.team_id AND t.is_deleted = FALSE AND BTRIM(t.name) = '管理班组'
        LEFT JOIN construction_units u ON u.id = w.unit_id AND u.is_deleted = FALSE
        WHERE w.is_deleted = FALSE AND w.work_status = 1
          AND NOT EXISTS (
              SELECT 1 FROM construction_attendance_records ar
              WHERE ar.worker_id = w.id AND ar.project_id = w.project_id AND ar.is_deleted = FALSE
                AND (ar.trigger_time AT TIME ZONE 'Asia/Shanghai')::date = $1
          )
        ON CONFLICT (worker_id, warning_date) WHERE warning_type = 'management_team_no_attendance' DO NOTHING
    "#)
    .bind(warning_date)
    .bind(occurred_at)
    .execute(pool)
    .await
    .map_err(db_error)?;
    Ok(())
}

fn bad_request(message: &'static str) -> ApiError {
    ApiError::default()
        .with_code(axum::http::StatusCode::BAD_REQUEST)
        .with_message(message)
}

fn forbidden(message: &'static str) -> ApiError {
    ApiError::default()
        .with_code(axum::http::StatusCode::FORBIDDEN)
        .with_message(message)
}

fn db_error(error: sqlx::Error) -> ApiError {
    ApiError::default().log_only(error)
}
