use axum::{
    Router, middleware,
    routing::{delete, get, post, put},
};

use crate::{
    infrastructure::web::middleware::{admin_middleware, auth_middleware},
    state::AppState,
};

use super::{construction, log, role, stats, upload, user};

pub fn admin_routes() -> Router<AppState> {
    Router::new()
        .route("/log/level", post(log::handler::set_log_level))
        .route("/projects", get(construction::handler::list_projects))
        .route("/projects", post(construction::handler::create_project))
        .route(
            "/projects/options",
            get(construction::handler::list_project_options),
        )
        .route(
            "/projects/{id}",
            get(construction::handler::get_project)
                .put(construction::handler::update_project)
                .patch(construction::handler::update_project)
                .delete(construction::handler::delete_project),
        )
        .route(
            "/projects/{project_id}/units",
            get(construction::handler::list_units).post(construction::handler::create_unit),
        )
        .route(
            "/projects/{project_id}/units/{unit_id}",
            get(construction::handler::get_unit)
                .put(construction::handler::update_unit)
                .patch(construction::handler::update_unit)
                .delete(construction::handler::delete_unit),
        )
        .route(
            "/projects/{project_id}/teams",
            get(construction::handler::list_teams).post(construction::handler::create_team),
        )
        .route(
            "/projects/{project_id}/teams/{team_id}",
            get(construction::handler::get_team)
                .put(construction::handler::update_team)
                .patch(construction::handler::update_team)
                .delete(construction::handler::delete_team),
        )
        .route(
            "/projects/{project_id}/workers",
            get(construction::handler::list_workers).post(construction::handler::create_worker),
        )
        .route(
            "/projects/{project_id}/workers/{worker_id}",
            get(construction::handler::get_worker)
                .put(construction::handler::update_worker)
                .patch(construction::handler::update_worker)
                .delete(construction::handler::delete_worker),
        )
        .route(
            "/projects/{project_id}/attendance-records",
            get(construction::handler::list_attendance)
                .post(construction::handler::create_attendance),
        )
        .route(
            "/projects/{project_id}/attendance-records/{attendance_id}",
            get(construction::handler::get_attendance)
                .put(construction::handler::update_attendance)
                .patch(construction::handler::update_attendance)
                .delete(construction::handler::delete_attendance),
        )
        .route(
            "/projects/{project_id}/attendance-devices",
            get(construction::handler::list_attendance_devices)
                .post(construction::handler::create_attendance_device),
        )
        .route(
            "/projects/{project_id}/attendance-devices/{device_id}",
            get(construction::handler::get_attendance_device)
                .put(construction::handler::update_attendance_device)
                .patch(construction::handler::update_attendance_device)
                .delete(construction::handler::delete_attendance_device),
        )
        .route("/roles", get(role::handler::list_roles))
        .route("/roles", post(role::handler::create_role))
        .route("/roles/{id}", delete(role::handler::delete_role))
        .route("/roles/{id}/menus", put(role::handler::update_role_menus))
        .route("/uploads", get(upload::handler::list_uploads))
        .route("/users", get(user::handler::list_users))
        .route("/users/{id}/role", post(user::handler::update_user_role))
        .route("/stats", get(stats::handler::get_dashboard_stats))
        .route_layer(middleware::from_fn(admin_middleware))
        .route_layer(middleware::from_fn(auth_middleware))
}
