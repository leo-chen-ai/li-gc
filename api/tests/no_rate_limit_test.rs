use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode},
};
use quax::{
    infrastructure::{config::Config, persistence::Database},
    routes::app_routes,
    state::AppState,
};
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

#[test]
fn repeated_requests_keep_validation_and_auth_responses() {
    // This test binary has one test; initialize the environment before starting Tokio.
    unsafe {
        std::env::set_var("RUST_ENV", "development");
        std::env::set_var("JWT_ACCESS_SECRET", "test-access-secret-min-32-chars-ok!!");
        std::env::set_var("JWT_REFRESH_SECRET", "test-refresh-secret-min-32-chars-ok!");
        std::env::set_var("DATABASE_URL", "postgres://test:test@127.0.0.1:1/unused");
    }
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            let config = Config::load().unwrap();
            // Rejected input and missing credentials must never access the database.
            let pool = PgPoolOptions::new()
                .connect_lazy(&config.database.url)
                .unwrap();
            let app = app_routes(AppState::new_for_test(config, Database::from_pool(pool)));
            for (method, path, count, expected) in [
                ("POST", "/api/v1/auth/login", 121, StatusCode::BAD_REQUEST),
                ("POST", "/api/v1/auth/register", 11, StatusCode::BAD_REQUEST),
                ("GET", "/api/v1/auth/me", 121, StatusCode::UNAUTHORIZED),
                ("POST", "/quality", 601, StatusCode::BAD_REQUEST),
            ] {
                for attempt in 1..=count {
                    let request = Request::builder()
                        .method(method)
                        .uri(path)
                        .header("content-type", "application/json")
                        .extension(ConnectInfo(
                            "127.0.0.1:12345".parse::<std::net::SocketAddr>().unwrap(),
                        ))
                        .body(Body::from("{"))
                        .unwrap();
                    let response = app.clone().oneshot(request).await.unwrap();
                    assert_eq!(response.status(), expected, "{path} attempt {attempt}");
                }
            }
        });
}
