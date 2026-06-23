mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use quax::feature::auth::{Role, utils::jwt::create_token_pair};
use serde_json::json;
use uuid::Uuid;

use common::*;

fn admin_token() -> String {
    create_token_pair(Uuid::new_v4(), "admin@example.com", &[Role::Admin])
        .expect("admin token")
        .access_token
}

async fn post_authed(
    app: axum::Router,
    uri: &str,
    token: &str,
    body: serde_json::Value,
) -> (StatusCode, serde_json::Value) {
    let req = Request::builder()
        .method("POST")
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let (status, _, json) = raw_request(app, req).await;
    (status, json)
}

async fn put_authed(
    app: axum::Router,
    uri: &str,
    token: &str,
    body: serde_json::Value,
) -> (StatusCode, serde_json::Value) {
    let req = Request::builder()
        .method("PUT")
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let (status, _, json) = raw_request(app, req).await;
    (status, json)
}

async fn delete_authed(
    app: axum::Router,
    uri: &str,
    token: &str,
) -> (StatusCode, serde_json::Value) {
    let req = Request::builder()
        .method("DELETE")
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let (status, _, json) = raw_request(app, req).await;
    (status, json)
}

#[tokio::test]
async fn test_admin_can_list_seeded_roles_with_menu_permissions() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let (status, body) = get_authed(app, "/api/v1/admin/roles", &token).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["success"], true);

    let roles = body["data"].as_array().expect("roles array");
    let admin = roles
        .iter()
        .find(|role| role["code"] == "admin")
        .expect("seeded admin role");

    assert_eq!(admin["name"], "系统管理员");
    assert_eq!(
        admin["menu_keys"],
        json!([
            "projects",
            "users",
            "roles",
            "attendance_devices",
            "attendance_device_issue_reports",
            "uploads"
        ])
    );
    assert!(admin["user_count"].as_i64().expect("user_count") >= 0);
}

#[tokio::test]
async fn test_admin_can_create_role_and_update_menu_permissions() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let (status, body) = post_authed(
        app.clone(),
        "/api/v1/admin/roles",
        &token,
        json!({
            "name": "项目安全员",
            "code": "safety_officer",
            "description": "负责项目安全巡检和风险查看"
        }),
    )
    .await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(body["data"]["code"], "safety_officer");
    assert_eq!(body["data"]["menu_keys"], json!(["projects"]));

    let role_id = body["data"]["id"].as_str().expect("role id");
    let (status, body) = put_authed(
        app,
        &format!("/api/v1/admin/roles/{role_id}/menus"),
        &token,
        json!({ "menu_keys": ["users", "uploads"] }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["data"]["menu_keys"],
        json!(["projects", "users", "uploads"])
    );
}

#[tokio::test]
async fn test_admin_update_role_menus_ignores_stale_menu_keys() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let (status, body) = post_authed(
        app.clone(),
        "/api/v1/admin/roles",
        &token,
        json!({
            "name": "旧缓存兼容角色",
            "code": "legacy_menu_client",
            "description": "用于验证旧前端菜单 key 不会阻塞权限保存"
        }),
    )
    .await;

    assert_eq!(status, StatusCode::CREATED);
    let role_id = body["data"]["id"].as_str().expect("role id");

    let (status, body) = put_authed(
        app,
        &format!("/api/v1/admin/roles/{role_id}/menus"),
        &token,
        json!({ "menu_keys": ["users", "api_keys", "attendance_devices", "attendance_device_issue_reports"] }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["data"]["menu_keys"],
        json!([
            "projects",
            "users",
            "attendance_devices",
            "attendance_device_issue_reports"
        ])
    );
}

#[tokio::test]
async fn test_admin_can_delete_custom_role() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let (status, body) = post_authed(
        app.clone(),
        "/api/v1/admin/roles",
        &token,
        json!({
            "name": "临时角色",
            "code": "temp_role",
            "description": "用于删除测试"
        }),
    )
    .await;

    assert_eq!(status, StatusCode::CREATED);

    let role_id = body["data"]["id"].as_str().expect("role id");
    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/roles/{role_id}"),
        &token,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["success"], true);

    let (status, body) = get_authed(app, "/api/v1/admin/roles", &token).await;
    assert_eq!(status, StatusCode::OK);
    let roles = body["data"].as_array().expect("roles array");
    assert!(!roles.iter().any(|role| role["code"] == "temp_role"));
}

#[tokio::test]
async fn test_admin_cannot_delete_system_role() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let (status, body) = get_authed(app.clone(), "/api/v1/admin/roles", &token).await;
    assert_eq!(status, StatusCode::OK);
    let roles = body["data"].as_array().expect("roles array");
    let admin = roles
        .iter()
        .find(|role| role["code"] == "admin")
        .expect("seeded admin role");
    let admin_id = admin["id"].as_str().expect("admin role id");

    let (status, body) =
        delete_authed(app, &format!("/api/v1/admin/roles/{admin_id}"), &token).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["success"], false);
}
