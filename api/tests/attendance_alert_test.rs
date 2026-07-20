mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use quax::feature::auth::{Role, utils::jwt::create_token_pair};
use serde_json::{Value, json};
use uuid::Uuid;

use common::*;

fn admin_token() -> String {
    create_token_pair(Uuid::new_v4(), "alert-admin@example.com", &[Role::Admin])
        .expect("admin token")
        .access_token
}

async fn authed_json(
    app: axum::Router,
    method: &str,
    uri: &str,
    token: &str,
    body: Value,
) -> (StatusCode, Value) {
    let req = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let (status, _, json) = raw_request(app, req).await;
    (status, json)
}

#[tokio::test]
async fn admin_can_configure_project_attendance_alerts_and_write_missing_logs() {
    let (app, _container) = build_test_app().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({
            "name": "预警测试项目",
            "status": 5,
            "manager": "陈经理",
            "manager_phone": "13800000000"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let project_id = body["data"]["id"].as_str().expect("project id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/units"),
        &token,
        json!({
            "company_name": "预警测试单位",
            "company_type": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let unit_id = body["data"]["id"].as_str().expect("unit id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/teams"),
        &token,
        json!({
            "unit_id": unit_id,
            "name": "预警测试班组",
            "work_type": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let team_id = body["data"]["id"].as_str().expect("team id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
        json!({
            "unit_id": unit_id,
            "team_id": team_id,
            "name": "未打卡管理人员",
            "phone": "13900000001",
            "worker_type": 1001,
            "work_type": 1001,
            "manager_type": "1",
            "work_status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
        json!({
            "unit_id": unit_id,
            "team_id": team_id,
            "name": "已打卡民工",
            "phone": "13900000002",
            "worker_type": 1,
            "work_type": 1,
            "work_status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let attended_worker_id = body["data"]["id"].as_str().expect("worker id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
        json!({
            "unit_id": unit_id,
            "team_id": team_id,
            "name": "未打卡监理",
            "phone": "13900000003",
            "worker_type": 9,
            "work_type": 1,
            "is_key_personnel": true,
            "work_status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/attendance-records"),
        &token,
        json!({
            "worker_id": attended_worker_id,
            "direction": 0,
            "trigger_time": "2026-06-30T00:30:00Z",
            "equipment_id": "gate-alert",
            "serial_number": "SN-ALERT-1"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/attendance-alert-configs",
        &token,
        json!({
            "project_id": project_id,
            "is_enabled": true,
            "check_managers": true,
            "check_workers": true,
            "check_supervisors": true,
            "remark": "每天 14 点检查"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    assert_eq!(body["data"]["project_id"], project_id);
    assert_eq!(body["data"]["project_name"], "预警测试项目");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/attendance-alerts/run",
        &token,
        json!({ "alert_date": "2026-06-30" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["alert_date"], "2026-06-30");
    assert_eq!(body["data"]["scanned_configs"], 1);
    assert_eq!(body["data"]["written_logs"], 2);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/attendance-alert-logs?project_id={project_id}&page=1&page_size=10"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 2);
    let items = body["data"]["items"].as_array().expect("logs");
    assert!(items.iter().any(|item| {
        item["category"] == "manager"
            && item["expected_count"] == 1
            && item["attendance_count"] == 0
            && item["absent_count"] == 1
            && item["message"]
                .as_str()
                .is_some_and(|message| message.contains("管理人员"))
    }));
    assert!(items.iter().any(|item| {
        item["category"] == "supervisor"
            && item["expected_count"] == 1
            && item["attendance_count"] == 0
            && item["absent_count"] == 1
            && item["message"]
                .as_str()
                .is_some_and(|message| message.contains("监理"))
    }));

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/attendance-alerts/run",
        &token,
        json!({ "alert_date": "2026-06-30" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["written_logs"], 2);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/attendance-alert-logs?project_id={project_id}&page=1&page_size=10"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 2);
}
