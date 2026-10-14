use axum::{
    Router,
    routing::{delete, get, post, put},
};

use crate::state::AppState;

use super::handler;

/// 照片处理模块路由，统一挂在 `/api/v1/admin/photo-processing` 下。
///
/// 这里**不挂** `auth_middleware` / `admin_middleware`：由 `admin_routes()` 统一挂，
/// 避免重复执行。天然满足「先只开放 admin」。
pub fn photo_routes() -> Router<AppState> {
    Router::new()
        .route("/generate", post(super::studio::generate))
        .route(
            "/groups",
            get(handler::list_groups).post(handler::create_group),
        )
        .route(
            "/groups/{id}",
            get(handler::get_group)
                .patch(handler::update_group)
                .delete(handler::delete_group),
        )
        .route(
            "/groups/{id}/photos",
            get(handler::list_group_photos).post(handler::add_group_photos),
        )
        .route(
            "/groups/{id}/photos/{photo_id}",
            delete(handler::delete_group_photo),
        )
        .route(
            "/groups/{id}/backgrounds/{direction}",
            put(handler::set_background).delete(handler::delete_background),
        )
        .route(
            "/groups/{id}/composite",
            post(handler::start_composite),
        )
        .route(
            "/groups/{id}/composited-pairs",
            get(handler::list_composited_pairs),
        )
        .route(
            "/composite-tasks/{id}",
            get(handler::get_composite_task),
        )
        .route(
            "/composite-tasks/{id}/cancel",
            post(handler::cancel_composite_task),
        )
        .route(
            "/attendance-photos",
            get(handler::list_attendance_photos),
        )
}
