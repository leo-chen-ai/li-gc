use axum::{
    Extension,
    extract::State,
    http::{StatusCode, Uri},
};
use chrono::{Datelike, NaiveDate};
use percent_encoding::percent_decode_str;
use serde_json::Value;
use sqlx::{Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    feature::auth::{AuthUser, Role},
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

#[derive(Debug)]
struct ListParams {
    page: i64,
    page_size: i64,
    project_id: Option<Uuid>,
    keyword: String,
    month: Option<NaiveDate>,
    send_status: Option<String>,
    device_status: Option<String>,
}

pub async fn list_records(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    uri: Uri,
) -> ApiResult<Value> {
    let params = parse_params(&uri)?;
    let total = fetch_total(state.db.pool(), &auth_user, &params).await?;
    let summary = fetch_summary(state.db.pool(), &auth_user, &params).await?;
    let items = fetch_items(state.db.pool(), &auth_user, &params).await?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "summary": summary,
    })))
}

async fn fetch_items(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    params: &ListParams,
) -> Result<Value, ApiError> {
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.planned_at DESC, item.id DESC), '[]'::jsonb)
        FROM (
            SELECT
                r.*,
                p.name AS project_name,
                CASE WHEN d.id IS NULL THEN NULL ELSE d.id END AS device_id,
                d.device_name,
                d.serial_number AS device_sn,
                d.device_type,
                CASE WHEN d.id IS NULL THEN NULL ELSE d.id END AS target_device_id,
                d.device_name AS target_device_name,
                d.serial_number AS target_device_sn,
                d.serial_number AS target_device_serial_number,
                d.device_type AS target_device_type,
                j.id AS device_job_id,
                j.adapter_code AS device_adapter,
                j.id AS job_id,
                j.adapter_code,
                CASE WHEN d.id IS NULL OR j.id IS NULL THEN 'unassigned' ELSE j.status END AS send_status,
                COALESCE(j.attempt_count, 0) AS send_attempt_count,
                j.sent_at,
                COALESCE(j.last_error, r.dispatch_message) AS send_message,
                j.device_result_status,
                j.ack_code AS device_result_code,
                j.device_result_message,
                j.device_reported_at
            FROM construction_managed_attendance_records r
            JOIN construction_projects p ON p.id = r.project_id AND p.is_deleted = FALSE
            JOIN construction_managed_attendance_configs c ON c.id = r.config_id
            LEFT JOIN device_dispatch_jobs j
              ON j.managed_attendance_record_id = r.id
             AND j.job_type = 'supplemental_attendance'
            LEFT JOIN construction_attendance_devices d
              ON d.id = j.attendance_device_id AND d.is_deleted = FALSE
            WHERE r.is_deleted = FALSE
        "#,
    );
    push_base_filters(&mut query, auth_user, params);
    push_status_filters(&mut query, params);
    query
        .push(" ORDER BY r.planned_at DESC, r.id DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") item");
    query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

async fn fetch_total(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    params: &ListParams,
) -> Result<i64, ApiError> {
    let mut query = base_count_query();
    push_base_filters(&mut query, auth_user, params);
    push_status_filters(&mut query, params);
    query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

async fn fetch_summary(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    params: &ListParams,
) -> Result<Value, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT jsonb_build_object(
            'total', COUNT(*)::bigint,
            'unassigned', COUNT(*) FILTER (WHERE d.id IS NULL OR j.id IS NULL)::bigint,
            'pending_send', COUNT(*) FILTER (WHERE d.id IS NOT NULL AND j.status = 'pending')::bigint,
            'sent', COUNT(*) FILTER (WHERE j.sent_at IS NOT NULL)::bigint,
            'device_success', COUNT(*) FILTER (WHERE j.device_result_status = 'success')::bigint,
            'device_failed', COUNT(*) FILTER (WHERE j.device_result_status = 'failed')::bigint
        )
        FROM construction_managed_attendance_records r
        JOIN construction_projects p ON p.id = r.project_id AND p.is_deleted = FALSE
        JOIN construction_managed_attendance_configs c ON c.id = r.config_id
        LEFT JOIN device_dispatch_jobs j
          ON j.managed_attendance_record_id = r.id
         AND j.job_type = 'supplemental_attendance'
        LEFT JOIN construction_attendance_devices d
          ON d.id = j.attendance_device_id AND d.is_deleted = FALSE
        WHERE r.is_deleted = FALSE
        "#,
    );
    push_base_filters(&mut query, auth_user, params);
    query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

fn base_count_query() -> QueryBuilder<'static, Postgres> {
    QueryBuilder::<Postgres>::new(
        r#"
        SELECT COUNT(*)::bigint
        FROM construction_managed_attendance_records r
        JOIN construction_projects p ON p.id = r.project_id AND p.is_deleted = FALSE
        JOIN construction_managed_attendance_configs c ON c.id = r.config_id
        LEFT JOIN device_dispatch_jobs j
          ON j.managed_attendance_record_id = r.id
         AND j.job_type = 'supplemental_attendance'
        LEFT JOIN construction_attendance_devices d
          ON d.id = j.attendance_device_id AND d.is_deleted = FALSE
        WHERE r.is_deleted = FALSE
        "#,
    )
}

fn push_base_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    auth_user: &AuthUser,
    params: &ListParams,
) {
    if !auth_user.roles.contains(&Role::Admin) {
        query
            .push(" AND EXISTS (SELECT 1 FROM user_managed_projects ump WHERE ump.user_id = ")
            .push_bind(auth_user.user_id)
            .push(" AND ump.project_id = r.project_id)");
    }
    if let Some(project_id) = params.project_id {
        query.push(" AND r.project_id = ").push_bind(project_id);
    }
    if let Some(month) = params.month {
        let next_month = if month.month() == 12 {
            NaiveDate::from_ymd_opt(month.year() + 1, 1, 1)
        } else {
            NaiveDate::from_ymd_opt(month.year(), month.month() + 1, 1)
        }
        .expect("validated month");
        query
            .push(" AND r.attendance_date >= ")
            .push_bind(month)
            .push(" AND r.attendance_date < ")
            .push_bind(next_month);
    }
    if !params.keyword.is_empty() {
        let pattern = format!("%{}%", params.keyword);
        query
            .push(" AND (r.worker_name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR r.worker_id_card_mask ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR d.device_name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR d.serial_number ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
}

fn push_status_filters(query: &mut QueryBuilder<'_, Postgres>, params: &ListParams) {
    if let Some(status) = &params.send_status {
        if status == "unassigned" {
            query.push(" AND (d.id IS NULL OR j.id IS NULL)");
        } else {
            query
                .push(" AND d.id IS NOT NULL AND j.status = ")
                .push_bind(status.clone());
        }
    }
    if let Some(status) = &params.device_status {
        query
            .push(" AND j.id IS NOT NULL AND j.device_result_status = ")
            .push_bind(status.clone());
    }
}

fn parse_params(uri: &Uri) -> Result<ListParams, ApiError> {
    let mut params = ListParams {
        page: 1,
        page_size: 10,
        project_id: None,
        keyword: String::new(),
        month: None,
        send_status: None,
        device_status: None,
    };
    for pair in uri
        .query()
        .unwrap_or_default()
        .split('&')
        .filter(|pair| !pair.is_empty())
    {
        let (key, raw_value) = pair.split_once('=').unwrap_or((pair, ""));
        let value = percent_decode_str(&raw_value.replace('+', " "))
            .decode_utf8_lossy()
            .trim()
            .to_owned();
        match key {
            "page" => params.page = value.parse::<i64>().unwrap_or(1).max(1),
            "page_size" => params.page_size = value.parse::<i64>().unwrap_or(10).clamp(1, 100),
            "project_id" if !value.is_empty() => {
                params.project_id =
                    Some(Uuid::parse_str(&value).map_err(|_| bad_request("project_id必须是UUID"))?);
            }
            "keyword" | "q" => params.keyword = value,
            "month" if !value.is_empty() => {
                params.month = Some(
                    NaiveDate::parse_from_str(&format!("{value}-01"), "%Y-%m-%d")
                        .map_err(|_| bad_request("month必须是YYYY-MM"))?,
                );
            }
            "send_status" if !value.is_empty() && value != "all" => {
                if !matches!(
                    value.as_str(),
                    "unassigned" | "pending" | "processing" | "delivered" | "failed" | "skipped"
                ) {
                    return Err(bad_request("send_status不受支持"));
                }
                params.send_status = Some(value);
            }
            "device_status" if !value.is_empty() && value != "all" => {
                if !matches!(
                    value.as_str(),
                    "pending" | "accepted" | "success" | "failed"
                ) {
                    return Err(bad_request("device_status不受支持"));
                }
                params.device_status = Some(value);
            }
            _ => {}
        }
    }
    Ok(params)
}

fn bad_request(message: impl Into<String>) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::BAD_REQUEST)
        .with_message(message)
}

fn db_error(error: sqlx::Error) -> ApiError {
    ApiError::default().with_debug(error.to_string())
}
