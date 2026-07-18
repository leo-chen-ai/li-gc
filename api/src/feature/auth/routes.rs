use axum::{
    Router, middleware,
    routing::{delete, get, post},
};

use crate::{
    feature::auth::handlers, infrastructure::web::middleware::auth_middleware, state::AppState,
};

/// Routes that need brute-force rate limiting (login, register)
pub fn auth_sensitive_routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(handlers::register))
        .route(
            "/registration-leads",
            post(handlers::create_registration_lead),
        )
        .route("/login", post(handlers::login))
}

/// Remaining auth routes — refresh + protected (global rate limit only)
pub fn auth_routes() -> Router<AppState> {
    let public = Router::new()
        .route("/refresh", post(handlers::refresh))
        .route(
            "/scan-login/sessions",
            post(handlers::create_scan_login_session),
        )
        .route(
            "/scan-login/sessions/{scan_token}",
            get(handlers::get_scan_login_session),
        )
        .route(
            "/scan-login/sessions/{scan_token}/qr.svg",
            get(handlers::get_scan_login_qr_svg),
        );

    let protected = Router::new()
        .route("/logout", post(handlers::logout))
        .route("/me", get(handlers::me))
        .route("/change-password", post(handlers::change_password))
        .route(
            "/scan-login/sessions/{scan_token}/confirm",
            post(handlers::confirm_scan_login_session),
        )
        .route(
            "/sessions",
            get(handlers::list_sessions).delete(handlers::logout_all_sessions),
        )
        .route("/sessions/{id}", delete(handlers::revoke_session))
        .layer(middleware::from_fn(auth_middleware));

    public.merge(protected)
}
