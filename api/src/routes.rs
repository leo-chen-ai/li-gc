use axum::{Extension, Router, extract::DefaultBodyLimit};
use tower_http::services::ServeDir;

use crate::{
    feature::{admin, auth, device_vendor_b, health, miniapp, ocr, upload, user},
    state::AppState,
};

const API_REQUEST_BODY_LIMIT_BYTES: usize = 50 * 1024 * 1024;

pub fn app_routes(state: AppState) -> Router {
    // Provide session_blacklist to auth middleware
    let blacklist = state.session_blacklist.clone();
    let api_routes = Router::new()
        .nest(
            "/auth",
            auth::auth_routes().merge(auth::auth_sensitive_routes()),
        )
        .nest("/users", user::user_routes())
        .nest("/uploads", upload::upload_routes())
        .nest("/ocr", ocr::ocr_routes())
        .nest("/miniapp", miniapp::routes::miniapp_routes(state.clone()))
        .nest(
            "/management",
            admin::routes::management_routes(state.clone()),
        )
        .nest("/admin", admin::routes::admin_routes())
        .nest("/admin/api-keys", admin::api_key::api_key_routes())
        .nest("/dashboard", admin::dashboard::dashboard_routes())
        .layer(Extension(blacklist)) // Inject blacklist for auth middleware
        .layer(DefaultBodyLimit::max(API_REQUEST_BODY_LIMIT_BYTES));

    Router::new()
        .nest("/health", health::health_routes())
        .merge(device_vendor_b::routes())
        .nest("/api/v1", api_routes)
        .nest_service("/media", ServeDir::new("uploads"))
        .fallback(handle_404)
        .with_state(state)
}

async fn handle_404() -> crate::infrastructure::web::response::ApiError {
    crate::infrastructure::web::response::ApiError::default()
        .with_code(axum::http::StatusCode::NOT_FOUND)
        .with_message("The requested endpoint does not exist")
}
