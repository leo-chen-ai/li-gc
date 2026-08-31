use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Extension,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    feature::auth::AuthUser,
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

use super::{dto::*, service};

/// GET /api/v1/dashboard/overview
pub async fn overview(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
) -> ApiResult<DashboardOverviewResponse> {
    let data = service::get_overview(state.db.pool(), &auth_user)
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_data(data)
        .with_message("Dashboard overview retrieved"))
}

/// GET /api/v1/dashboard/projects/map
pub async fn projects_map(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
) -> ApiResult<Vec<MapProjectItem>> {
    let data = service::get_map_projects(state.db.pool(), &auth_user)
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_data(data)
        .with_message("Map projects retrieved"))
}

/// GET /api/v1/dashboard/smart-site
pub async fn smart_site(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
) -> ApiResult<SmartSiteResponse> {
    let data = service::get_smart_site(state.db.pool(), &auth_user)
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_data(data)
        .with_message("Smart site data retrieved"))
}

/// GET /api/v1/dashboard/alerts/30d
pub async fn alerts_30d(
    Extension(_auth_user): Extension<AuthUser>,
) -> ApiResult<Alert30dResponse> {
    let data = service::get_alerts_30d();
    Ok(ApiSuccess::default()
        .with_data(data)
        .with_message("30-day alerts retrieved"))
}

/// GET /api/v1/dashboard/alerts/today
pub async fn alerts_today(
    Extension(_auth_user): Extension<AuthUser>,
) -> ApiResult<AlertTodayResponse> {
    let data = service::get_alerts_today();
    Ok(ApiSuccess::default()
        .with_data(data)
        .with_message("Today alerts retrieved"))
}

/// GET /api/v1/dashboard/attendance/30d
pub async fn attendance_30d(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
) -> ApiResult<Vec<Attendance30dPoint>> {
    let data = service::get_attendance_30d(state.db.pool(), &auth_user)
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_data(data)
        .with_message("30-day attendance retrieved"))
}

/// GET /api/v1/dashboard/projects/:id/board
pub async fn project_board(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<ProjectBoardResponse> {
    let data = service::get_project_board(state.db.pool(), &auth_user, project_id)
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::FORBIDDEN)
                .with_message("No access to this project")
        })?;

    Ok(ApiSuccess::default()
        .with_data(data)
        .with_message("Project board retrieved"))
}

#[derive(Deserialize)]
pub struct AttendanceFeedQuery {
    #[serde(default = "default_feed_limit")]
    pub limit: i64,
}

fn default_feed_limit() -> i64 {
    50
}

/// GET /api/v1/dashboard/projects/:id/attendance/feed
pub async fn attendance_feed(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    Query(params): Query<AttendanceFeedQuery>,
) -> ApiResult<Vec<AttendanceFeedItem>> {
    let limit = params.limit.clamp(1, 200);
    let data = service::get_attendance_feed(state.db.pool(), &auth_user, project_id, limit)
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::FORBIDDEN)
                .with_message("No access to this project")
        })?;

    Ok(ApiSuccess::default()
        .with_data(data)
        .with_message("Attendance feed retrieved"))
}

/// GET /api/v1/dashboard/projects/:id/attendance/30d
pub async fn project_attendance_30d(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Vec<ProjectAttendance30dPoint>> {
    let data = service::get_project_attendance_30d(state.db.pool(), &auth_user, project_id)
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::FORBIDDEN)
                .with_message("No access to this project")
        })?;

    Ok(ApiSuccess::default()
        .with_data(data)
        .with_message("Project 30-day attendance retrieved"))
}

/// GET /api/v1/dashboard/projects/:id/attendance/today-hourly
pub async fn project_attendance_today_hourly(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Vec<TodayHourlyPoint>> {
    let data = service::get_today_hourly(state.db.pool(), &auth_user, project_id)
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::FORBIDDEN)
                .with_message("No access to this project")
        })?;

    Ok(ApiSuccess::default()
        .with_data(data)
        .with_message("Today hourly attendance retrieved"))
}
