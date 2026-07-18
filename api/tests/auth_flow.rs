mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use serde_json::json;

use common::*;

// ─── Register ────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_register_success() {
    let (app, _c) = build_test_app().await;

    let (status, body) = post_json(
        app,
        "/api/v1/auth/register",
        &json!({ "email": "alice@example.com", "name": "Alice", "password": "password123" }),
    )
    .await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(body["success"], true);
    assert!(body["data"]["token"]["access_token"].is_string());
    assert_eq!(body["data"]["user"]["email"], "alice@example.com");
    // refresh_token must NOT be in response body
    assert!(body["data"]["token"].get("refresh_token").is_none());
}

#[tokio::test]
async fn test_register_duplicate_email() {
    let (app, _c) = build_test_app().await;
    let payload = json!({ "email": "dup@example.com", "name": "Dup", "password": "password123" });

    post_json(app.clone(), "/api/v1/auth/register", &payload).await;
    let (status, body) = post_json(app, "/api/v1/auth/register", &payload).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["success"], false);
    assert_eq!(body["error_code"], "AUTH_002");
}

#[tokio::test]
async fn test_register_invalid_email() {
    let (app, _c) = build_test_app().await;

    let (status, body) = post_json(
        app,
        "/api/v1/auth/register",
        &json!({ "email": "not-an-email", "name": "Bob", "password": "password123" }),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["success"], false);
}

#[tokio::test]
async fn test_create_registration_lead_includes_username() {
    let (app, _c) = build_test_app().await;

    let (status, body) = post_json(
        app,
        "/api/v1/auth/registration-leads",
        &json!({
            "username": "lead_user",
            "name": "注册用户",
            "phone": "13800000000"
        }),
    )
    .await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(body["success"], true);
    assert_eq!(body["data"]["username"], "lead_user");
    assert_eq!(body["data"]["name"], "注册用户");
    assert_eq!(body["data"]["phone"], "13800000000");
}

// ─── Login ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_login_success() {
    let (app, _c) = build_test_app().await;

    post_json(
        app.clone(),
        "/api/v1/auth/register",
        &json!({ "email": "bob@example.com", "name": "Bob", "password": "hunter2" }),
    )
    .await;

    let (status, body) = post_json(
        app,
        "/api/v1/auth/login",
        &json!({ "email": "bob@example.com", "password": "hunter2" }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(body["data"]["token"]["access_token"].is_string());
    assert_eq!(body["data"]["user"]["email"], "bob@example.com");
}

#[tokio::test]
async fn test_login_success_with_username() {
    let (app, _c) = build_test_app().await;

    post_json(
        app.clone(),
        "/api/v1/auth/register",
        &json!({
            "email": "username-login@example.com",
            "username": "username_login",
            "name": "Username Login",
            "password": "hunter2"
        }),
    )
    .await;

    let (status, body) = post_json(
        app,
        "/api/v1/auth/login",
        &json!({ "email": "username_login", "password": "hunter2" }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(body["data"]["token"]["access_token"].is_string());
    assert_eq!(body["data"]["user"]["username"], "username_login");
}

#[tokio::test]
async fn test_login_wrong_password() {
    let (app, _c) = build_test_app().await;

    post_json(
        app.clone(),
        "/api/v1/auth/register",
        &json!({ "email": "carol@example.com", "name": "Carol", "password": "correct" }),
    )
    .await;

    let (status, body) = post_json(
        app,
        "/api/v1/auth/login",
        &json!({ "email": "carol@example.com", "password": "wrong" }),
    )
    .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["error_code"], "AUTH_001");
}

#[tokio::test]
async fn test_login_nonexistent_user() {
    let (app, _c) = build_test_app().await;

    let (status, _) = post_json(
        app,
        "/api/v1/auth/login",
        &json!({ "email": "ghost@example.com", "password": "anything" }),
    )
    .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ─── Protected endpoints ─────────────────────────────────────────────────────

#[tokio::test]
async fn test_get_me_unauthenticated() {
    let (app, _c) = build_test_app().await;

    let req = Request::builder()
        .method("GET")
        .uri("/api/v1/users/me")
        .body(Body::empty())
        .unwrap();

    let (status, _, _) = raw_request(app, req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_get_me_with_valid_token() {
    let (app, _c) = build_test_app().await;

    let (_, reg) = post_json(
        app.clone(),
        "/api/v1/auth/register",
        &json!({ "email": "dave@example.com", "name": "Dave", "password": "pass1234" }),
    )
    .await;

    let token = reg["data"]["token"]["access_token"].as_str().unwrap();
    let (status, body) = get_authed(app, "/api/v1/users/me", token).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["email"], "dave@example.com");
    assert_eq!(body["data"]["name"], "Dave");
}

#[tokio::test]
async fn test_get_me_invalid_token() {
    let (app, _c) = build_test_app().await;

    let (status, _) = get_authed(app, "/api/v1/users/me", "invalid.jwt.token").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ─── Update profile ───────────────────────────────────────────────────────────

#[tokio::test]
async fn test_update_me() {
    let (app, _c) = build_test_app().await;

    let (_, reg) = post_json(
        app.clone(),
        "/api/v1/auth/register",
        &json!({ "email": "eve@example.com", "name": "Eve", "password": "pass1234" }),
    )
    .await;
    let token = reg["data"]["token"]["access_token"].as_str().unwrap();

    let (status, body) = patch_authed(
        app,
        "/api/v1/users/me",
        token,
        &json!({ "name": "Eve Updated" }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["name"], "Eve Updated");
    assert_eq!(body["data"]["email"], "eve@example.com");
}

// ─── Refresh token ────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_refresh_token_success() {
    let (app, _c) = build_test_app().await;

    // Register — response has Set-Cookie: refresh_token
    let req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({ "email": "frank@example.com", "name": "Frank", "password": "pass1234" })
                .to_string(),
        ))
        .unwrap();

    let (status, headers, _) = raw_request(app.clone(), req).await;
    assert_eq!(status, StatusCode::CREATED);

    let cookie = extract_set_cookie(&headers, "refresh_token")
        .expect("refresh_token cookie must be set after register");

    let (status, body) =
        post_json_with_cookie(app, "/api/v1/auth/refresh", &json!({}), &cookie).await;

    assert_eq!(status, StatusCode::OK);
    assert!(body["data"]["access_token"].is_string());
}

#[tokio::test]
async fn test_refresh_without_cookie() {
    let (app, _c) = build_test_app().await;

    let (status, _) = post_json(app, "/api/v1/auth/refresh", &json!({})).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ─── Scan login ──────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_scan_login_confirmed_session_returns_web_auth_response() {
    let (app, _c) = build_test_app().await;

    let (_, reg_body) = post_json(
        app.clone(),
        "/api/v1/auth/register",
        &json!({ "email": "scan-login@example.com", "name": "Scan User", "password": "pass1234" }),
    )
    .await;
    let mobile_token = reg_body["data"]["token"]["access_token"].as_str().unwrap();

    let (status, session_body) =
        post_json(app.clone(), "/api/v1/auth/scan-login/sessions", &json!({})).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(session_body["data"]["status"], "pending");
    assert!(session_body["data"]["scan_token"].is_string());
    assert!(session_body["data"]["qr_payload"].is_string());

    let scan_token = session_body["data"]["scan_token"].as_str().unwrap();
    let confirm_req = Request::builder()
        .method("POST")
        .uri(format!(
            "/api/v1/auth/scan-login/sessions/{scan_token}/confirm"
        ))
        .header(header::AUTHORIZATION, format!("Bearer {mobile_token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({}).to_string()))
        .unwrap();
    let (status, _, confirm_body) = raw_request(app.clone(), confirm_req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(confirm_body["data"]["status"], "confirmed");

    let poll_uri = format!("/api/v1/auth/scan-login/sessions/{scan_token}");
    let poll_req = Request::builder()
        .method("GET")
        .uri(&poll_uri)
        .body(Body::empty())
        .unwrap();
    let (status, headers, auth_body) = raw_request(app.clone(), poll_req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(auth_body["data"]["user"]["email"], "scan-login@example.com");
    assert!(auth_body["data"]["token"]["access_token"].is_string());
    assert!(
        extract_set_cookie(&headers, "refresh_token").is_some(),
        "confirmed scan login must set the normal web refresh cookie"
    );

    let web_token = auth_body["data"]["token"]["access_token"].as_str().unwrap();
    let (status, me_body) = get_authed(app, "/api/v1/auth/me", web_token).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me_body["data"]["email"], "scan-login@example.com");
}

#[tokio::test]
async fn test_scan_login_qr_endpoint_returns_svg() {
    let (app, _c) = build_test_app().await;

    let (status, session_body) =
        post_json(app.clone(), "/api/v1/auth/scan-login/sessions", &json!({})).await;
    assert_eq!(status, StatusCode::CREATED);
    let scan_token = session_body["data"]["scan_token"].as_str().unwrap();

    let req = Request::builder()
        .method("GET")
        .uri(format!(
            "/api/v1/auth/scan-login/sessions/{scan_token}/qr.svg"
        ))
        .body(Body::empty())
        .unwrap();
    let (status, headers, body) = raw_request(app, req).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok()),
        Some("image/svg+xml")
    );
    assert!(body["raw"].as_str().unwrap_or_default().contains("<svg"));
}

// ─── Full auth flow ───────────────────────────────────────────────────────────

/// register → get_me → update_me → refresh → get_me with new token
#[tokio::test]
async fn test_full_auth_flow() {
    let (app, _c) = build_test_app().await;

    // 1. Register
    let req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({ "email": "grace@example.com", "name": "Grace", "password": "secure123" })
                .to_string(),
        ))
        .unwrap();

    let (status, headers, reg_body) = raw_request(app.clone(), req).await;
    assert_eq!(status, StatusCode::CREATED);

    let refresh_cookie =
        extract_set_cookie(&headers, "refresh_token").expect("refresh_token cookie must be set");
    let access_token = reg_body["data"]["token"]["access_token"]
        .as_str()
        .unwrap()
        .to_string();

    // 2. GET /users/me
    let (status, me_body) = get_authed(app.clone(), "/api/v1/users/me", &access_token).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me_body["data"]["email"], "grace@example.com");

    // 3. PATCH /users/me
    let (status, upd_body) = patch_authed(
        app.clone(),
        "/api/v1/users/me",
        &access_token,
        &json!({ "name": "Grace Updated" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(upd_body["data"]["name"], "Grace Updated");

    // 4. POST /auth/refresh — rotate refresh token, get new access token
    let (status, ref_body) = post_json_with_cookie(
        app.clone(),
        "/api/v1/auth/refresh",
        &json!({}),
        &refresh_cookie,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let new_token = ref_body["data"]["access_token"]
        .as_str()
        .expect("new access_token must be in refresh response")
        .to_string();

    assert_ne!(new_token, access_token, "refreshed token must differ");

    // 5. GET /users/me with new token — still authenticated, name persisted
    let (status, me_body2) = get_authed(app, "/api/v1/users/me", &new_token).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me_body2["data"]["name"], "Grace Updated");
}
