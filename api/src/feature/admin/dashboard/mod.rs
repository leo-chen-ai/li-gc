pub mod dto;
pub mod handler;
pub mod service;

use axum::{Router, middleware, routing::get};

use crate::{
    infrastructure::web::middleware::auth_middleware,
    state::AppState,
};

pub fn dashboard_routes() -> Router<AppState> {
    Router::new()
        .route("/overview", get(handler::overview))
        .route("/projects/map", get(handler::projects_map))
        .route("/smart-site", get(handler::smart_site))
        .route("/alerts/30d", get(handler::alerts_30d))
        .route("/alerts/today", get(handler::alerts_today))
        .route("/attendance/30d", get(handler::attendance_30d))
        .route("/projects/{project_id}/board", get(handler::project_board))
        .route(
            "/projects/{project_id}/attendance/feed",
            get(handler::attendance_feed),
        )
        .route(
            "/projects/{project_id}/attendance/30d",
            get(handler::project_attendance_30d),
        )
        .route(
            "/projects/{project_id}/attendance/today-hourly",
            get(handler::project_attendance_today_hourly),
        )
        .route_layer(middleware::from_fn(auth_middleware))
}
