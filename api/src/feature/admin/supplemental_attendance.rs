use axum::{
    Extension, Json,
    extract::{Path, State},
    http::{StatusCode, Uri},
};
use chrono::{DateTime, Datelike, NaiveDate, Utc};
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
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    send_status: Option<String>,
    device_status: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct DeleteRecordsBody {
    record_ids: Vec<Uuid>,
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

pub async fn delete_records(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(body): Json<DeleteRecordsBody>,
) -> ApiResult<Value> {
    let mut record_ids = body.record_ids;
    record_ids.sort_unstable();
    record_ids.dedup();
    if record_ids.is_empty() {
        return Err(bad_request("请至少选择一条下发记录"));
    }
    if record_ids.len() > 500 {
        return Err(bad_request("单次最多删除 500 条下发记录"));
    }

    let mut tx = state.db.pool().begin().await.map_err(db_error)?;
    let accessible_ids = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT r.id
        FROM construction_managed_attendance_records r
        WHERE r.id = ANY($1)
          AND r.is_deleted = FALSE
          AND ($2 OR EXISTS (
              SELECT 1
              FROM user_managed_projects ump
              WHERE ump.user_id = $3 AND ump.project_id = r.project_id
          ))
        FOR UPDATE
        "#,
    )
    .bind(&record_ids)
    .bind(auth_user.roles.contains(&Role::Admin))
    .bind(auth_user.user_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(db_error)?;
    if accessible_ids.len() != record_ids.len() {
        return Err(bad_request("所选下发记录不存在或无权删除"));
    }

    sqlx::query(
        r#"
        UPDATE device_dispatch_jobs
        SET status = CASE WHEN status IN ('pending', 'processing') THEN 'skipped' ELSE status END,
            last_error = CASE WHEN status IN ('pending', 'processing') THEN '管理员删除下发记录' ELSE last_error END,
            locked_by = NULL,
            locked_until = NULL,
            updated_at = NOW()
        WHERE managed_attendance_record_id = ANY($1)
          AND job_type = 'supplemental_attendance'
        "#,
    )
    .bind(&accessible_ids)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;

    let deleted_count = sqlx::query(
        r#"
        UPDATE construction_managed_attendance_records
        SET is_deleted = TRUE,
            deleted_at = NOW(),
            updated_at = NOW()
        WHERE id = ANY($1) AND is_deleted = FALSE
        "#,
    )
    .bind(&accessible_ids)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?
    .rows_affected();
    tx.commit().await.map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "deleted_count": deleted_count,
    })))
}

pub async fn get_dispatch_log(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(job_id): Path<Uuid>,
) -> ApiResult<Value> {
    let item = sqlx::query_scalar::<_, Value>(
        r#"
        SELECT jsonb_build_object(
            'job_id', j.id,
            'record_id', r.id,
            'attempt_count', j.attempt_count,
            'status', j.status,
            'last_error', j.last_error,
            'sent_at', j.sent_at,
            'event_type', e.event_type,
            'message', e.message,
            'request_payload', e.payload,
            'response_payload', e.response_payload,
            'logged_at', e.created_at
        )
        FROM device_dispatch_jobs j
        JOIN construction_managed_attendance_records r
          ON r.id = j.managed_attendance_record_id
        LEFT JOIN LATERAL (
            SELECT event_type, message, payload, response_payload, created_at
            FROM device_dispatch_events
            WHERE job_id = j.id
              AND event_type IN ('attendance_photo_pushed', 'attendance_photo_push_failed')
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        ) e ON TRUE
        WHERE j.id = $1
          AND j.job_type = 'supplemental_attendance'
          AND ($2 OR EXISTS (
              SELECT 1 FROM user_managed_projects ump
              WHERE ump.user_id = $3 AND ump.project_id = r.project_id
          ))
        "#,
    )
    .bind(job_id)
    .bind(auth_user.roles.contains(&Role::Admin))
    .bind(auth_user.user_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(|| bad_request("下发任务不存在或无权查看"))?;
    Ok(ApiSuccess::default().with_data(item))
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
    if let Some(start_time) = params.start_time {
        query.push(" AND r.planned_at >= ").push_bind(start_time);
    }
    if let Some(end_time) = params.end_time {
        query.push(" AND r.planned_at <= ").push_bind(end_time);
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
        start_time: None,
        end_time: None,
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
            "start_time" if !value.is_empty() => {
                params.start_time = Some(
                    DateTime::parse_from_rfc3339(&value)
                        .map_err(|_| bad_request("start_time必须是带时区的ISO时间"))?
                        .with_timezone(&Utc),
                );
            }
            "end_time" if !value.is_empty() => {
                params.end_time = Some(
                    DateTime::parse_from_rfc3339(&value)
                        .map_err(|_| bad_request("end_time必须是带时区的ISO时间"))?
                        .with_timezone(&Utc),
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
    if params
        .start_time
        .zip(params.end_time)
        .is_some_and(|(start, end)| start > end)
    {
        return Err(bad_request("开始时间不能晚于结束时间"));
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_planned_time_range() {
        let uri: Uri = "/records?start_time=2026-08-09T00%3A00%3A00%2B08%3A00&end_time=2026-08-09T23%3A59%3A59%2B08%3A00"
            .parse()
            .unwrap();
        let params = parse_params(&uri).unwrap();
        assert_eq!(params.start_time.unwrap().timestamp(), 1_786_204_800);
        assert_eq!(params.end_time.unwrap().timestamp(), 1_786_291_199);
    }

    #[test]
    fn rejects_reversed_planned_time_range() {
        let uri: Uri = "/records?start_time=2026-08-10T00%3A00%3A00%2B08%3A00&end_time=2026-08-09T00%3A00%3A00%2B08%3A00"
            .parse()
            .unwrap();
        assert!(parse_params(&uri).is_err());
    }
}
