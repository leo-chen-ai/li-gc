use axum::{
    Extension,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    feature::auth::{AuthUser, Role},
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

#[derive(Deserialize, Default)]
pub struct Filters {
    q: Option<String>,
    status: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
}

fn db_error(error: sqlx::Error) -> ApiError {
    ApiError::default().log_only(error)
}

async fn ensure_project_access(
    state: &AppState,
    user: &AuthUser,
    project_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
          SELECT 1 FROM construction_projects p
          WHERE p.id=$1 AND p.is_deleted=FALSE
            AND ($2 OR EXISTS(
              SELECT 1 FROM user_managed_projects ump
              WHERE ump.project_id=p.id AND ump.user_id=$3
            ))
        )"#,
    )
    .bind(project_id)
    .bind(user.roles.contains(&Role::Admin))
    .bind(user.user_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;
    if allowed {
        Ok(())
    } else {
        Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_message("无权查看该项目的人脸库"))
    }
}

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Query(filters): Query<Filters>,
) -> ApiResult<Value> {
    let page = filters.page.unwrap_or(1).clamp(1, 100_000);
    let page_size = filters.page_size.unwrap_or(20).clamp(1, 100);
    let keyword = filters
        .q
        .unwrap_or_default()
        .chars()
        .take(100)
        .collect::<String>();
    let status = filters.status.unwrap_or_default();
    let data = sqlx::query_scalar::<_, Value>(
        r#"WITH projects AS (
          SELECT p.id, p.name,
            EXISTS(SELECT 1 FROM construction_attendance_points ap
              WHERE ap.project_id=p.id AND ap.is_deleted=FALSE AND ap.machine_mode_enabled=TRUE) AS mobile_face_enabled,
            EXISTS(SELECT 1 FROM construction_project_attendance_settings s
              WHERE s.project_id=p.id AND s.worker_attendance_enabled=TRUE AND s.require_face=TRUE) AS geofence_face_enabled
          FROM construction_projects p
          WHERE p.is_deleted=FALSE
            AND ($1 OR EXISTS(SELECT 1 FROM user_managed_projects ump WHERE ump.project_id=p.id AND ump.user_id=$2))
            AND ($3='' OR p.name ILIKE '%'||$3||'%')
        ), worker_rows AS (
          SELECT p.id AS project_id, w.id AS worker_id, latest.status, latest.last_error
          FROM projects p
          LEFT JOIN construction_workers w ON w.project_id=p.id AND w.is_deleted=FALSE
            AND NULLIF(TRIM(COALESCE(w.avatar,'')),'') IS NOT NULL
          LEFT JOIN LATERAL (
            SELECT e.status,e.last_error FROM construction_face_enrollments e
            WHERE e.project_id=p.id AND e.worker_id=w.id
            ORDER BY e.created_at DESC,e.id DESC LIMIT 1
          ) latest ON TRUE
        ), stats AS (
          SELECT project_id,
            COUNT(worker_id) AS total,
            COUNT(worker_id) FILTER (WHERE status='synced') AS synced,
            COUNT(worker_id) FILTER (WHERE status='pending') AS queued,
            COUNT(worker_id) FILTER (WHERE status='processing') AS processing,
            COUNT(worker_id) FILTER (WHERE status='failed') AS failed,
            MAX(last_error) FILTER (WHERE status='failed') AS last_error
          FROM worker_rows GROUP BY project_id
        ), rows AS (
          SELECT p.id,p.name,p.mobile_face_enabled,p.geofence_face_enabled,
            (p.mobile_face_enabled OR p.geofence_face_enabled) AS enabled,
            COALESCE(s.total,0) AS total,COALESCE(s.synced,0) AS synced,
            COALESCE(s.queued,0) AS queued,COALESCE(s.processing,0) AS processing,
            COALESCE(s.failed,0) AS failed,s.last_error
          FROM projects p LEFT JOIN stats s ON s.project_id=p.id
        ), filtered AS (
          SELECT * FROM rows WHERE
            $4='' OR ($4='enabled' AND enabled) OR ($4='disabled' AND NOT enabled)
            OR ($4='syncing' AND (queued>0 OR processing>0)) OR ($4='failed' AND failed>0)
        ), paged AS (
          SELECT * FROM filtered ORDER BY enabled DESC,failed DESC,processing DESC,name
          LIMIT $5 OFFSET $6
        )
        SELECT jsonb_build_object(
          'total',(SELECT COUNT(*) FROM filtered),
          'enabled_count',(SELECT COUNT(*) FROM rows WHERE enabled),
          'failed_count',(SELECT COUNT(*) FROM rows WHERE failed>0),
          'syncing_count',(SELECT COUNT(*) FROM rows WHERE queued>0 OR processing>0),
          'items',COALESCE((SELECT jsonb_agg(to_jsonb(paged)) FROM paged),'[]'::jsonb)
        )"#,
    )
    .bind(user.roles.contains(&Role::Admin))
    .bind(user.user_id)
    .bind(keyword)
    .bind(status)
    .bind(page_size)
    .bind((page - 1) * page_size)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    let service = super::http_client(&state)
        .get(format!("{}/health", super::base_url(&state)))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map(|_| json!({"available":true,"message":"人脸服务运行正常"}))
        .unwrap_or_else(
            |error| json!({"available":false,"message":format!("人脸服务不可用：{error}")}),
        );
    Ok(ApiSuccess::default().with_data(json!({"summary":data,"service":service})))
}

pub async fn retry(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    ensure_project_access(&state, &user, project_id).await?;
    if !super::project_face_library_enabled_checked(state.db.pool(), project_id)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("该项目未启用人脸库"));
    }
    let queued = super::enqueue_project_face_enrollments(state.db.pool(), project_id)
        .await
        .map_err(db_error)?;
    Ok(ApiSuccess::default().with_data(json!({"queued":queued})))
}
