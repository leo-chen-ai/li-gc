#![recursion_limit = "256"]

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
    create_token_pair(Uuid::new_v4(), "admin@example.com", &[Role::Admin])
        .expect("admin token")
        .access_token
}

fn user_token(user_id: Uuid) -> String {
    create_token_pair(user_id, "worker-admin@example.com", &[Role::User])
        .expect("user token")
        .access_token
}

async fn persisted_admin_token(pool: &sqlx::PgPool) -> String {
    let user_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO users (email, username, role, is_active, email_verified)
        VALUES ($1, $2, 'admin', TRUE, TRUE)
        RETURNING id
        "#,
    )
    .bind(format!("admin-{}@example.com", Uuid::new_v4()))
    .bind(format!("admin-{}", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("insert admin user");

    create_token_pair(user_id, "admin@example.com", &[Role::Admin])
        .expect("admin token")
        .access_token
}

async fn insert_unassigned_managed_record(pool: &sqlx::PgPool, name: &str) -> (Uuid, Uuid) {
    sqlx::query_as::<_, (Uuid, Uuid)>(
        r#"
        WITH project AS (
            INSERT INTO construction_projects (name, status) VALUES ($1, 1) RETURNING id
        ), unit AS (
            INSERT INTO construction_units (project_id, company_name)
            SELECT id, $1 || '单位' FROM project RETURNING id, project_id
        ), team AS (
            INSERT INTO construction_teams (project_id, unit_id, name, work_type)
            SELECT project_id, id, $1 || '班组', 900 FROM unit RETURNING id, project_id, unit_id
        ), worker AS (
            INSERT INTO construction_workers (project_id, unit_id, team_id, name)
            SELECT project_id, unit_id, id, $1 || '人员' FROM team RETURNING id, project_id
        ), config AS (
            INSERT INTO construction_managed_attendance_configs (
                project_id, worker_id, monthly_attendance_days, shift, check_in_time, check_out_time
            )
            SELECT project_id, id, 1, 'day', '08:00', '18:00' FROM worker
            RETURNING id, project_id, worker_id
        ), record AS (
            INSERT INTO construction_managed_attendance_records (
                config_id, project_id, worker_id, worker_name, attendance_date,
                direction, shift, planned_at, dispatch_status, dispatch_message
            )
            SELECT id, project_id, worker_id, $1 || '人员', DATE '2026-08-05',
                   0, 'day', TIMESTAMPTZ '2026-08-05 08:00:00+08', 'skipped',
                   '未配置目标考勤设备，未创建下发任务'
            FROM config
            RETURNING id, project_id
        )
        SELECT project_id, id FROM record
        "#,
    )
    .bind(name)
    .fetch_one(pool)
    .await
    .expect("insert unassigned managed attendance record")
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

async fn seed_attendance_device_issue_report(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    worker_id: Uuid,
    device_id: Uuid,
    action: &str,
    status: &str,
    issued_at: &str,
    message: &str,
    remark: Option<&str>,
) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO construction_attendance_device_issue_reports (
            project_id, worker_id, attendance_device_id,
            action, status, issued_at, message, remark
        )
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8)
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(worker_id)
    .bind(device_id)
    .bind(action)
    .bind(status)
    .bind(issued_at)
    .bind(message)
    .bind(remark)
    .fetch_one(pool)
    .await
    .expect("seed attendance device issue report")
}

async fn raw_get_authed(
    app: axum::Router,
    uri: &str,
    token: &str,
) -> (StatusCode, axum::http::HeaderMap, serde_json::Value) {
    let req = Request::builder()
        .method("GET")
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    raw_request(app, req).await
}

#[tokio::test]
async fn admin_can_search_and_paginate_projects_on_backend() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({
            "name": "后端分页搜索目标项目",
            "address": "分页搜索路 1 号",
            "status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let target_project_id = body["data"]["id"].as_str().expect("target project id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({
            "name": "后端分页搜索干扰项目",
            "address": "普通路 2 号",
            "status": 4
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let other_project_id = body["data"]["id"].as_str().expect("other project id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/platform-configs",
        &token,
        json!({
            "project_id": target_project_id,
            "platform_name": "市住建",
            "platform_type": "ningbo_housing",
            "config": {},
            "is_enabled": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = get_authed(
        app.clone(),
        "/api/v1/admin/projects?page=1&page_size=1&keyword=%E7%9B%AE%E6%A0%87&status=1",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["page"], 1);
    assert_eq!(body["data"]["page_size"], 1);
    let items = body["data"]["items"].as_array().expect("project items");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["id"], target_project_id);
    assert_eq!(items[0]["name"], "后端分页搜索目标项目");
    assert_eq!(
        items[0]["reporting_platforms"][0]["platform_name"],
        "市住建"
    );
    assert_eq!(items[0]["reporting_platforms"][0]["is_enabled"], true);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{target_project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body["data"]["reporting_platforms"][0]["platform_name"],
        "市住建"
    );

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{target_project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{other_project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
}

#[tokio::test]
async fn admin_can_manage_project_nested_resources_and_fake_attendance() {
    let (app, pool, _c) = build_test_app_with_pool().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({
            "name": "接口测试项目",
            "address": "测试路 1 号",
            "status": 1,
            "work_permit": "WP-API-001",
            "manager": "陈经理",
            "manager_phone": "13800000000"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let project_id = body["data"]["id"].as_str().expect("project id");
    let project_uuid = Uuid::parse_str(project_id).expect("project uuid");
    assert_eq!(body["data"]["name"], "接口测试项目");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}"),
        &token,
        json!({ "name": "接口测试项目-修改", "labor_cost": 8420 }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["name"], "接口测试项目-修改");
    assert_eq!(body["data"]["labor_cost"].as_f64(), Some(8420.0));

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["id"], project_id);
    assert_eq!(body["data"]["name"], "接口测试项目-修改");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/units"),
        &token,
        json!({
            "company_name": "接口测试单位",
            "company_credit_code": "91320000API0001X",
            "company_type": 1,
            "manager_name": "李负责人"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let unit_id = body["data"]["id"].as_str().expect("unit id");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/units/{unit_id}"),
        &token,
        json!({ "company_name": "接口测试单位-修改" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["company_name"], "接口测试单位-修改");

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/units"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["total"], 1);
    let units = body["data"]["items"].as_array().expect("units array");
    assert_eq!(units.len(), 1);
    assert_eq!(units[0]["id"], unit_id);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/units/{unit_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["company_name"], "接口测试单位-修改");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/teams"),
        &token,
        json!({
            "unit_id": unit_id,
            "name": "钢筋接口班",
            "work_type": 10,
            "attendance_start_time": "06:00",
            "attendance_end_time": "18:00"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let team_id = body["data"]["id"].as_str().expect("team id");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/teams/{team_id}"),
        &token,
        json!({ "name": "钢筋接口班-修改" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["name"], "钢筋接口班-修改");

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/teams"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["total"], 1);
    let teams = body["data"]["items"].as_array().expect("teams array");
    assert_eq!(teams.len(), 1);
    assert_eq!(teams[0]["id"], team_id);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/teams/{team_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["name"], "钢筋接口班-修改");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
        json!({
            "unit_id": unit_id,
            "team_id": team_id,
            "id_card": "320800199001011234",
            "name": "接口工人",
            "gender": 1,
            "phone": "13900000000",
            "worker_type": 1,
            "work_type": 10,
            "work_status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let worker_id = body["data"]["id"].as_str().expect("worker id");
    let worker_uuid = Uuid::parse_str(worker_id).expect("worker uuid");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/workers/{worker_id}"),
        &token,
        json!({ "name": "接口工人-修改" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["name"], "接口工人-修改");

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["total"], 1);
    let workers = body["data"]["items"].as_array().expect("workers array");
    assert_eq!(workers.len(), 1);
    assert_eq!(workers[0]["id"], worker_id);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/workers/{worker_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["name"], "接口工人-修改");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/attendance-records"),
        &token,
        json!({
            "worker_id": worker_id,
            "direction": 0,
            "trigger_time": "2026-06-18T08:00:00Z",
            "equipment_id": "gate-001",
            "serial_number": "SN-001",
            "original_time": "2026-06-18 08:00:00"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let attendance_id = body["data"]["id"].as_str().expect("attendance id");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/attendance-records/{attendance_id}"),
        &token,
        json!({
            "direction": 1,
            "serial_number": "SN-001-UPDATED"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["direction"], 1);
    assert_eq!(body["data"]["serial_number"], "SN-001-UPDATED");

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/attendance-records"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["total"], 1);
    let attendance_records = body["data"]["items"]
        .as_array()
        .expect("attendance records array");
    assert_eq!(attendance_records.len(), 1);
    assert_eq!(attendance_records[0]["id"], attendance_id);
    assert_eq!(
        attendance_records[0]["yongxin_reporting"]["status"],
        "not_configured"
    );
    assert_eq!(attendance_records[0]["yongxin_reporting"]["enabled"], false);

    let attendance_uuid = Uuid::parse_str(attendance_id).expect("attendance uuid");
    sqlx::query(
        r#"
        INSERT INTO construction_attendance_record_photos (
            attendance_record_id, project_id, worker_id, photo_kind, photo_data, source
        )
        VALUES ($1, $2, $3, 'closeup', 'split-closeup-base64', 'test')
        "#,
    )
    .bind(attendance_uuid)
    .bind(project_uuid)
    .bind(worker_uuid)
    .execute(&pool)
    .await
    .expect("insert split attendance photo");

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/attendance-records?keyword=SN-001-UPDATED"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["data"]["items"][0]["closeup_photo"],
        "split-closeup-base64"
    );

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/attendance-records/{attendance_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["serial_number"], "SN-001-UPDATED");
    assert_eq!(body["data"]["closeup_photo"], "split-closeup-base64");

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/attendance-records/{attendance_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["success"], true);

    let (status, _) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/workers/{worker_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/teams/{team_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/units/{unit_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = get_authed(app, "/api/v1/admin/projects", &token).await;
    assert_eq!(status, StatusCode::OK);
    let projects = body["data"].as_array().expect("projects array");
    assert!(
        !projects
            .iter()
            .any(|project| project["id"].as_str() == Some(project_id))
    );
}

#[tokio::test]
async fn admin_can_configure_generate_and_list_managed_attendance() {
    let (app, pool, _c) = build_test_app_with_pool().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({
            "name": "自动托管测试项目",
            "address": "托管路 1 号",
            "status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let project_id = body["data"]["id"].as_str().expect("project id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/attendance-devices"),
        &token,
        json!({
            "device_type": "B厂家",
            "serial_number": "MANAGED-B-001",
            "device_name": "托管考勤补录机"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let attendance_device_id = body["data"]["id"].as_str().expect("attendance device id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/units"),
        &token,
        json!({
            "company_name": "自动托管测试单位",
            "company_credit_code": "91320000AUTO001X",
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
            "name": "夜班托管班组",
            "work_type": 10,
            "attendance_start_time": "19:00",
            "attendance_end_time": "23:30"
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
            "id_card": "320800199001011234",
            "name": "张三",
            "gender": 1,
            "phone": "13900000000",
            "worker_type": 1,
            "work_type": 10,
            "work_status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let worker_id = body["data"]["id"].as_str().expect("worker id");

    let a_only_project_id: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects (name, status) VALUES ('仅海厂家项目', 1) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let a_only_unit_id: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_units (project_id, company_name) VALUES ($1, '海厂家单位') RETURNING id",
    )
    .bind(a_only_project_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let a_only_team_id: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_teams (project_id, unit_id, name, work_type) VALUES ($1, $2, '海厂家班组', 10) RETURNING id",
    )
    .bind(a_only_project_id)
    .bind(a_only_unit_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let a_only_worker_id: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_workers (project_id, unit_id, team_id, name) VALUES ($1, $2, $3, '海厂家人员') RETURNING id",
    )
    .bind(a_only_project_id)
    .bind(a_only_unit_id)
    .bind(a_only_team_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO construction_attendance_devices (project_id, device_type, serial_number) VALUES ($1, '海厂家', 'MANAGED-A-ONLY-001')",
    )
    .bind(a_only_project_id)
    .execute(&pool)
    .await
    .unwrap();
    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/managed-attendance/configs",
        &token,
        json!({
            "project_id": a_only_project_id,
            "worker_id": a_only_worker_id,
            "monthly_attendance_days": 3,
            "shift": "day",
            "check_in_time": "08:00",
            "check_out_time": "18:00",
            "is_enabled": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(body.to_string().contains("未配置弹厂家考勤机"), "{body}");

    let (status, _body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/managed-attendance/photo-groups",
        &token,
        json!({
            "project_id": project_id,
            "name": "非法照片组",
            "generation_status": "ready",
            "in_photos": [123],
            "out_photos": ["https://example.com/zhangsan-out.jpg"]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/managed-attendance/photo-groups",
        &token,
        json!({
            "project_id": project_id,
            "name": "张三夜班照片组",
            "generation_status": "ready",
            "in_photos": ["https://example.com/zhangsan-in.jpg"],
            "out_photos": ["https://example.com/zhangsan-out.jpg"],
            "remark": "AI 生图后续接入，当前先保存照片组 URL"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let photo_group_id = body["data"]["id"].as_str().expect("photo group id");
    assert_eq!(body["data"]["name"], "张三夜班照片组");
    assert_eq!(body["data"]["generation_status"], "ready");

    let foreign_project_id: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects (name, status) VALUES ('其他设备项目', 1) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let foreign_device_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO construction_attendance_devices (project_id, device_type, serial_number)
        VALUES ($1, 'B厂家', 'FOREIGN-B-001')
        RETURNING id
        "#,
    )
    .bind(foreign_project_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/managed-attendance/configs",
        &token,
        json!({
            "project_id": project_id,
            "worker_id": worker_id,
            "photo_group_id": photo_group_id,
            "attendance_device_id": foreign_device_id,
            "monthly_attendance_days": 3,
            "shift": "night",
            "check_in_time": "19:10",
            "check_out_time": "23:05"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/managed-attendance/configs",
        &token,
        json!({
            "project_id": project_id,
            "worker_id": worker_id,
            "photo_group_id": photo_group_id,
            "attendance_device_id": attendance_device_id,
            "monthly_attendance_days": 3,
            "shift": "night",
            "check_in_time": "19:10",
            "check_out_time": "23:05",
            "is_enabled": true,
            "remark": "张三夜班托管"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let config_id = body["data"]["id"].as_str().expect("config id");
    assert_eq!(body["data"]["worker_name"], "张三");
    assert_eq!(body["data"]["shift"], "night");
    assert_eq!(body["data"]["attendance_device_name"], "托管考勤补录机");
    assert_eq!(
        body["data"]["attendance_device_serial_number"],
        "MANAGED-B-001"
    );
    assert_eq!(body["data"]["attendance_device_type"], "B厂家");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/managed-attendance/configs/{config_id}/generate"),
        &token,
        json!({ "month": "2026-07" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["generated_count"], 6);
    assert_eq!(body["data"]["attendance_days"], 3);
    let generated_jobs: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM device_dispatch_jobs
        WHERE job_type = 'supplemental_attendance'
          AND adapter_code = 'vendor_b'
          AND transport = 'http_push'
          AND attendance_device_id = $1
        "#,
    )
    .bind(Uuid::parse_str(attendance_device_id).unwrap())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(generated_jobs, 6);

    let (status, body) = get_authed(
        app.clone(),
        &format!(
            "/api/v1/admin/managed-attendance/records?project_id={project_id}&month=2026-07&page=1&page_size=10"
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 6);
    let records = body["data"]["items"].as_array().expect("record items");
    assert_eq!(records.len(), 6);
    assert_eq!(records[0]["worker_name"], "张三");
    assert_eq!(records[0]["shift"], "night");
    assert_eq!(records[0]["photo_group_name"], "张三夜班照片组");
    assert_eq!(records[0]["status"], "generated");
    assert_eq!(records[0]["dispatch_status"], "skipped");
    let attendance_dates = records
        .iter()
        .filter_map(|record| record["attendance_date"].as_str())
        .collect::<std::collections::HashSet<_>>();
    assert_eq!(attendance_dates.len(), 3);
    assert!(records.iter().any(|record| {
        record["direction"] == 0 && record["photo_url"] == "https://example.com/zhangsan-in.jpg"
    }));
    assert!(records.iter().any(|record| {
        record["direction"] == 1 && record["photo_url"] == "https://example.com/zhangsan-out.jpg"
    }));

    let protected: (Uuid, chrono::DateTime<chrono::Utc>, serde_json::Value) = sqlx::query_as(
        r#"
        SELECT r.id, r.planned_at, j.payload
        FROM construction_managed_attendance_records r
        JOIN device_dispatch_jobs j ON j.managed_attendance_record_id = r.id
        WHERE r.config_id = $1 AND r.direction = 0 AND r.is_deleted = FALSE
        ORDER BY r.attendance_date
        LIMIT 1
        "#,
    )
    .bind(Uuid::parse_str(config_id).unwrap())
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "UPDATE device_dispatch_jobs SET status = 'delivered', device_result_status = 'success' WHERE managed_attendance_record_id = $1",
    )
    .bind(protected.0)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "UPDATE construction_managed_attendance_configs SET check_in_time = '20:10' WHERE id = $1",
    )
    .bind(Uuid::parse_str(config_id).unwrap())
    .execute(&pool)
    .await
    .unwrap();

    let (status, regenerated) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/managed-attendance/configs/{config_id}/generate"),
        &token,
        json!({ "month": "2026-07" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{regenerated}");
    let preserved: (chrono::DateTime<chrono::Utc>, serde_json::Value, String) = sqlx::query_as(
        r#"
        SELECT r.planned_at, j.payload, j.device_result_status
        FROM construction_managed_attendance_records r
        JOIN device_dispatch_jobs j ON j.managed_attendance_record_id = r.id
        WHERE r.id = $1
        "#,
    )
    .bind(protected.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(preserved.0, protected.1);
    assert_eq!(preserved.1, protected.2);
    assert_eq!(preserved.2, "success");

    let protected_date: chrono::NaiveDate = sqlx::query_scalar(
        "SELECT attendance_date FROM construction_managed_attendance_records WHERE id = $1",
    )
    .bind(protected.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    let (status, resent) = authed_json(
        app,
        "POST",
        &format!("/api/v1/admin/managed-attendance/configs/{config_id}/resend-day"),
        &token,
        json!({ "attendance_date": protected_date.format("%Y-%m-%d").to_string() }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{resent}");
    assert_eq!(resent["data"]["record_count"], 2);
    assert_eq!(resent["data"]["job_count"], 2);
    let resent_states: Vec<(String, String)> = sqlx::query_as(
        r#"
        SELECT j.status, j.device_result_status
        FROM device_dispatch_jobs j
        JOIN construction_managed_attendance_records r ON r.id = j.managed_attendance_record_id
        WHERE r.config_id = $1 AND r.attendance_date = $2
        ORDER BY r.direction
        "#,
    )
    .bind(Uuid::parse_str(config_id).unwrap())
    .bind(protected_date)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(resent_states, vec![("pending".into(), "pending".into()); 2]);
}

#[tokio::test]
async fn admin_project_resource_lists_filter_paginate_and_summarize_attendance_on_backend() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({
            "name": "资源分页筛选测试项目",
            "address": "资源测试路 1 号",
            "status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let project_id = body["data"]["id"].as_str().expect("project id");

    let mut unit_ids = Vec::new();
    for index in 0..12 {
        let (status, body) = authed_json(
            app.clone(),
            "POST",
            &format!("/api/v1/admin/projects/{project_id}/units"),
            &token,
            json!({
                "company_name": format!("分页单位{:02}", index),
                "company_credit_code": format!("91320000PAGE{:04}", index),
                "company_type": if index % 2 == 0 { 1 } else { 2 },
                "salary_calc_type": if index % 2 == 0 { 1 } else { 2 },
                "manager_name": format!("单位负责人{:02}", index),
                "manager_phone": format!("1391000{:04}", index)
            }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
        unit_ids.push(body["data"]["id"].as_str().expect("unit id").to_string());
    }
    let target_unit_id = unit_ids[11].clone();

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/units"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 12);
    assert_eq!(body["data"]["page_size"], 10);
    assert_eq!(body["data"]["items"].as_array().expect("units").len(), 10);

    let (status, body) = get_authed(
        app.clone(),
        &format!(
            "/api/v1/admin/projects/{project_id}/units?keyword=%E5%88%86%E9%A1%B5%E5%8D%95%E4%BD%8D11&company_type=2&salary_calc_type=2"
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["id"], target_unit_id);

    let mut team_ids = Vec::new();
    for index in 0..12 {
        let (status, body) = authed_json(
            app.clone(),
            "POST",
            &format!("/api/v1/admin/projects/{project_id}/teams"),
            &token,
            json!({
                "unit_id": target_unit_id,
                "name": format!("分页班组{:02}", index),
                "work_type": if index == 11 { 28 } else { 10 },
                "settlement_type": if index % 2 == 0 { 1 } else { 2 },
                "leader_name": format!("班组长{:02}", index),
                "leader_phone": format!("1392000{:04}", index),
                "team_no": format!("TEAM-PAGE-{index:02}"),
                "attendance_start_time": if index == 5 { "" } else { "06:00" },
                "attendance_end_time": if index == 5 { "" } else { "18:00" }
            }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
        team_ids.push(body["data"]["id"].as_str().expect("team id").to_string());
    }
    let target_team_id = team_ids[11].clone();

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/teams?unit_id={target_unit_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 12);
    assert_eq!(body["data"]["page_size"], 10);
    assert_eq!(body["data"]["items"].as_array().expect("teams").len(), 10);

    let (status, body) = get_authed(
        app.clone(),
        &format!(
            "/api/v1/admin/projects/{project_id}/teams?unit_id={target_unit_id}&keyword=TEAM-PAGE-11&work_type=28&attendance_configured=true"
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["id"], target_team_id);

    let mut worker_ids = Vec::new();
    for index in 0..12 {
        let (status, body) = authed_json(
            app.clone(),
            "POST",
            &format!("/api/v1/admin/projects/{project_id}/workers"),
            &token,
            json!({
                "unit_id": target_unit_id,
                "team_id": target_team_id,
                "id_card": format!("32080019900101{:04}", index),
                "name": format!("分页工人{:02}", index),
                "gender": 1,
                "phone": format!("1393000{:04}", index),
                "work_type": if index == 11 { 16 } else { 10 },
                "work_status": if index == 11 { 2 } else { 1 }
            }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
        worker_ids.push(body["data"]["id"].as_str().expect("worker id").to_string());
    }
    let target_worker_id = worker_ids[11].clone();

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/workers?team_id={target_team_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 12);
    assert_eq!(body["data"]["page_size"], 10);
    assert_eq!(body["data"]["items"].as_array().expect("workers").len(), 10);

    let (status, body) = get_authed(
        app.clone(),
        &format!(
            "/api/v1/admin/projects/{project_id}/workers?team_id={target_team_id}&keyword=13930000011&work_type=16&work_status=2"
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["id"], target_worker_id);

    for payload in [
        json!({
            "worker_id": target_worker_id,
            "direction": 0,
            "trigger_time": "2026-06-09T23:30:00Z",
            "equipment_id": "gate-in",
            "serial_number": "SN-TARGET-IN-1"
        }),
        json!({
            "worker_id": target_worker_id,
            "direction": 0,
            "trigger_time": "2026-06-10T00:30:00Z",
            "equipment_id": "gate-in",
            "serial_number": "SN-TARGET-IN-2"
        }),
        json!({
            "worker_id": target_worker_id,
            "direction": 1,
            "trigger_time": "2026-06-10T09:00:00Z",
            "equipment_id": "gate-out",
            "serial_number": "SN-TARGET-OUT-1"
        }),
        json!({
            "worker_id": target_worker_id,
            "direction": 1,
            "trigger_time": "2026-06-10T10:05:00Z",
            "equipment_id": "gate-out",
            "serial_number": "SN-TARGET-OUT-2"
        }),
        json!({
            "worker_id": worker_ids[0],
            "direction": 0,
            "trigger_time": "2026-06-10T00:00:00Z",
            "equipment_id": "other-gate",
            "serial_number": "SN-OTHER-IN"
        }),
    ] {
        let (status, body) = authed_json(
            app.clone(),
            "POST",
            &format!("/api/v1/admin/projects/{project_id}/attendance-records"),
            &token,
            payload,
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
    }

    let (status, body) = get_authed(
        app.clone(),
        &format!(
            "/api/v1/admin/projects/{project_id}/attendance-records?page=1&page_size=1&keyword=%E5%88%86%E9%A1%B5%E5%B7%A5%E4%BA%BA11&direction=0&attendance_date=2026-06-10"
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 2);
    assert_eq!(body["data"]["page_size"], 1);
    assert_eq!(
        body["data"]["items"].as_array().expect("attendance").len(),
        1
    );

    let (status, body) = get_authed(
        app.clone(),
        &format!(
            "/api/v1/admin/projects/{project_id}/attendance-records?view=calendar&month=2026-06&keyword=%E5%88%86%E9%A1%B5%E5%B7%A5%E4%BA%BA11"
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let rows = body["data"]["items"].as_array().expect("calendar rows");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["worker_id"], target_worker_id);
    let day = rows[0]["days"]
        .as_array()
        .expect("calendar days")
        .iter()
        .find(|day| day["day"] == 10)
        .expect("day 10");
    assert_eq!(day["first_in_time"], "07:30");
    assert_eq!(day["last_out_time"], "18:05");
    assert_eq!(day["working_hours"], 10.58);
}

#[tokio::test]
async fn unit_list_reports_yongxin_platform_sync_status() {
    let (app, pool, _container) = build_test_app_with_pool().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({ "name": "甬薪单位上报状态测试项目", "status": 1 }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let project_id = body["data"]["id"].as_str().expect("project id");
    let project_uuid = Uuid::parse_str(project_id).expect("valid project id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/platform-configs",
        &token,
        json!({
            "project_id": project_id,
            "platform_name": "甬薪精管 V2",
            "platform_type": "yongxin_v2",
            "config": {},
            "is_enabled": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let config_id = Uuid::parse_str(body["data"]["id"].as_str().expect("platform config id"))
        .expect("valid platform config id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/platform-configs",
        &token,
        json!({
            "project_id": project_id,
            "platform_name": "市住建",
            "platform_type": "ningbo_housing",
            "config": {},
            "is_enabled": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let binding_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO integration_project_bindings (
            project_id, platform_id, platform_config_id, is_enabled
        )
        SELECT $1, platform.id, $2, TRUE
        FROM integration_platforms platform
        WHERE platform.code = 'yongxin_v2' AND platform.is_deleted = FALSE
        RETURNING id
        "#,
    )
    .bind(project_uuid)
    .bind(config_id)
    .fetch_one(&pool)
    .await
    .expect("Yongxin binding");

    let mut unit_ids = Vec::new();
    for name in ["甬薪已同步单位", "甬薪未同步单位", "甬薪结果未知单位"] {
        let (status, body) = authed_json(
            app.clone(),
            "POST",
            &format!("/api/v1/admin/projects/{project_id}/units"),
            &token,
            json!({ "company_name": name }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
        unit_ids.push(
            Uuid::parse_str(body["data"]["id"].as_str().expect("unit id")).expect("valid unit id"),
        );
    }

    for (unit_id, job_status) in [(unit_ids[0], "success"), (unit_ids[2], "delivery_unknown")] {
        sqlx::query(
            r#"
            INSERT INTO integration_jobs (
                project_id, binding_id, platform_code, operation, entity_type,
                local_entity_id, idempotency_key, request_payload, status
            )
            VALUES ($1, $2, 'yongxin_v2', 'unit.sync', 'unit', $3, $4, '{}'::jsonb, $5)
            "#,
        )
        .bind(project_uuid)
        .bind(binding_id)
        .bind(unit_id)
        .bind(format!("yongxin-unit-status-{unit_id}"))
        .bind(job_status)
        .execute(&pool)
        .await
        .expect("insert Yongxin unit job");
    }

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/units"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let units = body["data"]["items"].as_array().expect("unit items");
    let synced = units
        .iter()
        .find(|unit| unit["company_name"] == "甬薪已同步单位")
        .expect("synced unit");
    assert_eq!(
        synced["reporting_platforms"][0]["platform_type"],
        "yongxin_v2"
    );
    assert_eq!(
        synced["reporting_platforms"][0]["platform_name"],
        "甬薪精管 V2"
    );
    assert_eq!(
        synced["reporting_platforms"]
            .as_array()
            .expect("reporting platforms")
            .len(),
        1
    );
    assert_eq!(synced["reporting_platforms"][0]["status"], "success");

    let not_reported = units
        .iter()
        .find(|unit| unit["company_name"] == "甬薪未同步单位")
        .expect("not reported unit");
    assert_eq!(
        not_reported["reporting_platforms"][0]["status"],
        "not_reported"
    );

    let summary = &body["data"]["reporting_summary"][0];
    assert_eq!(summary["platform_type"], "yongxin_v2");
    assert_eq!(summary["total_count"], 3);
    assert_eq!(summary["success_count"], 1);
    assert_eq!(summary["failure_count"], 1);
    assert_eq!(summary["not_reported_count"], 1);

    let (status, body) = authed_json(
        app,
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/units/reporting/repair"),
        &token,
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["attempted_count"], 1);
}

#[tokio::test]
async fn team_list_reports_latest_platform_status_and_project_summary() {
    let (app, pool, _container) = build_test_app_with_pool().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({ "name": "班组上报状态测试项目", "status": 1 }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let project_id = body["data"]["id"].as_str().expect("project id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/platform-configs",
        &token,
        json!({
            "project_id": project_id,
            "platform_name": "市住建",
            "platform_type": "ningbo_housing",
            "config": {},
            "is_enabled": false
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let platform_config_id = body["data"]["id"]
        .as_str()
        .expect("platform config id")
        .to_owned();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/units"),
        &token,
        json!({ "company_name": "上报状态测试单位" }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let unit_id = body["data"]["id"].as_str().expect("unit id");

    let mut team_ids = Vec::new();
    for name in ["成功班组", "失败班组", "未传班组"] {
        let (status, body) = authed_json(
            app.clone(),
            "POST",
            &format!("/api/v1/admin/projects/{project_id}/teams"),
            &token,
            json!({ "unit_id": unit_id, "name": name }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
        team_ids.push(
            Uuid::parse_str(body["data"]["id"].as_str().expect("team id")).expect("valid team id"),
        );
    }

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/platform-configs/{platform_config_id}"),
        &token,
        json!({ "is_enabled": true }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let project_uuid = Uuid::parse_str(project_id).expect("valid project id");
    for (team_id, job_status, last_error) in [
        (team_ids[0], "success", None),
        (team_ids[1], "failed", Some("班组长身份证校验失败")),
    ] {
        sqlx::query(
            r#"
            INSERT INTO integration_jobs
                (project_id, platform_code, operation, entity_type, local_entity_id,
                 idempotency_key, request_payload, status, last_error)
            VALUES ($1, 'zhenhai', 'addTeam', 'team', $2, $3, '{}'::jsonb, $4, $5)
            "#,
        )
        .bind(project_uuid)
        .bind(team_id)
        .bind(format!("team-reporting-status-{team_id}"))
        .bind(job_status)
        .bind(last_error)
        .execute(&pool)
        .await
        .expect("insert integration job");
    }

    let (status, body) = get_authed(
        app,
        &format!("/api/v1/admin/projects/{project_id}/teams"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let summary = &body["data"]["reporting_summary"][0];
    assert_eq!(summary["platform_name"], "市住建");
    assert_eq!(summary["success_count"], 1);
    assert_eq!(summary["failure_count"], 1);
    assert_eq!(summary["not_reported_count"], 1);

    let teams = body["data"]["items"].as_array().expect("team items");
    let success_team = teams
        .iter()
        .find(|team| team["name"] == "成功班组")
        .expect("success team");
    assert_eq!(success_team["reporting_platforms"][0]["status"], "success");
    let failed_team = teams
        .iter()
        .find(|team| team["name"] == "失败班组")
        .expect("failed team");
    assert_eq!(failed_team["reporting_platforms"][0]["status"], "failed");
    assert_eq!(
        failed_team["reporting_platforms"][0]["failure_reason"],
        "班组长身份证校验失败"
    );
    let not_reported_team = teams
        .iter()
        .find(|team| team["name"] == "未传班组")
        .expect("not reported team");
    assert_eq!(
        not_reported_team["reporting_platforms"][0]["status"],
        "not_reported"
    );
}

#[tokio::test]
async fn xinleda_management_worker_is_reported_instead_of_ignored() {
    let (app, pool, _container) = build_test_app_with_pool().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({ "name": "薪乐达管理人员状态测试", "status": 1 }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let project_id = body["data"]["id"].as_str().expect("project id");
    let project_uuid = Uuid::parse_str(project_id).expect("project uuid");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/platform-configs",
        &token,
        json!({
            "project_id": project_id,
            "platform_name": "薪乐达-总包账户",
            "platform_type": "xinleda",
            "config": {},
            "is_enabled": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let config_id = Uuid::parse_str(body["data"]["id"].as_str().expect("platform config id"))
        .expect("config uuid");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/units"),
        &token,
        json!({ "company_name": "薪乐达测试总包", "company_type": 1 }),
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
            "name": "项目管理班组",
            "work_type": 1001,
            "is_manage_team": true
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
            "id_card": "330203199001011234",
            "name": "薪乐达项目经理",
            "phone": "13800000000",
            "worker_type": 1001,
            "work_type": 1001,
            "manager_type": "1",
            "work_status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let worker_id =
        Uuid::parse_str(body["data"]["id"].as_str().expect("worker id")).expect("worker uuid");

    let binding_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO integration_project_bindings (
            project_id, platform_id, platform_config_id, is_enabled
        )
        SELECT $1, platform.id, $2, TRUE
        FROM integration_platforms platform
        WHERE platform.code = 'xinleda' AND platform.is_deleted = FALSE
        RETURNING id
        "#,
    )
    .bind(project_uuid)
    .bind(config_id)
    .fetch_one(&pool)
    .await
    .expect("Xinleda binding");
    sqlx::query(
        r#"
        INSERT INTO integration_jobs (
            project_id, binding_id, platform_code, operation, entity_type,
            local_entity_id, idempotency_key, request_payload, status
        )
        VALUES ($1, $2, 'xinleda', 'project.manager.entry', 'worker', $3, $4, '{}'::jsonb, 'success')
        "#,
    )
    .bind(project_uuid)
    .bind(binding_id)
    .bind(worker_id)
    .bind(format!("xinleda-manager-status-{worker_id}"))
    .execute(&pool)
    .await
    .expect("Xinleda manager job");

    let (status, body) = get_authed(
        app,
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body["data"]["items"][0]["reporting_platforms"][0]["status"],
        "success"
    );
    assert_eq!(body["data"]["reporting_summary"][0]["total_count"], 1);
    assert_eq!(body["data"]["reporting_summary"][0]["success_count"], 1);
    assert_eq!(body["data"]["reporting_summary"][0]["ignored_count"], 0);
}

#[tokio::test]
async fn enabled_ningbo_platform_requires_team_type_but_not_team_leader() {
    let (app, pool, _container) = build_test_app_with_pool().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({ "name": "宁波班组类型校验测试项目", "status": 1 }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let project_id = body["data"]["id"].as_str().expect("project id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/platform-configs",
        &token,
        json!({
            "project_id": project_id,
            "platform_name": "市住建",
            "platform_type": "ningbo_housing",
            "config": {},
            "is_enabled": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/units"),
        &token,
        json!({
            "company_name": "宁波班组类型测试单位",
            "company_credit_code": "91330200TEAMTYPE01X"
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
        json!({ "unit_id": unit_id, "name": "缺少类型班组" }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(
        body.to_string().contains("班组类型为必填项"),
        "unexpected validation response: {body}"
    );

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/teams"),
        &token,
        json!({
            "unit_id": unit_id,
            "name": "无班组长钢筋班",
            "work_type": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let team_id =
        Uuid::parse_str(body["data"]["id"].as_str().expect("team id")).expect("valid team id");

    let event = sqlx::query_as::<_, (String, String)>(
        r#"
        SELECT event_type, status
        FROM integration_outbox_events
        WHERE aggregate_id = $1
          AND aggregate_type = 'team'
        "#,
    )
    .bind(team_id)
    .fetch_one(&pool)
    .await
    .expect("automatic Ningbo sync event");
    assert_eq!(event.0, "ningbo.team.sync");
    assert_eq!(event.1, "pending");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/teams"),
        &token,
        json!({
            "unit_id": unit_id,
            "name": "项目管理班组",
            "work_type": 1001
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    assert_eq!(body["data"]["work_type"], 1001);
    assert_eq!(body["data"]["is_manage_team"], true);
    let manage_team_id = Uuid::parse_str(body["data"]["id"].as_str().expect("management team id"))
        .expect("valid management team id");
    let manage_sync_event_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM integration_outbox_events WHERE aggregate_id = $1 AND event_type = 'ningbo.team.sync' AND status = 'pending'",
    )
    .bind(manage_team_id)
    .fetch_one(&pool)
    .await
    .expect("count management team sync events");
    assert_eq!(
        manage_sync_event_count, 1,
        "management team must be queued for municipal platform reporting"
    );

    let (status, repair_body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/teams/reporting/repair"),
        &token,
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{repair_body}");
    assert_eq!(
        repair_body["data"]["attempted_count"], 2,
        "repair must include both ordinary and management teams"
    );

    let (status, body) = get_authed(
        app,
        &format!("/api/v1/admin/projects/{project_id}/teams"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let management_team = body["data"]["items"]
        .as_array()
        .expect("team items")
        .iter()
        .find(|team| team["id"] == manage_team_id.to_string())
        .expect("management team row");
    assert_eq!(
        management_team["reporting_platforms"][0]["status"],
        "not_reported"
    );
    let summary = &body["data"]["reporting_summary"][0];
    assert_eq!(summary["total_count"], 2);
    assert_eq!(summary["ignored_count"], 0);
    assert_eq!(summary["not_reported_count"], 2);
}

#[tokio::test]
async fn worker_and_team_updates_enqueue_only_the_required_async_targets() {
    let (app, pool, _container) = build_test_app_with_pool().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({ "name": "异步更新判断项目", "status": 1 }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let project_id = body["data"]["id"].as_str().expect("project id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/platform-configs",
        &token,
        json!({
            "project_id": project_id,
            "platform_name": "市住建",
            "platform_type": "ningbo_housing",
            "config": {},
            "is_enabled": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/units"),
        &token,
        json!({
            "company_name": "异步更新判断单位",
            "company_credit_code": "91330200ASYNC0001X",
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
        json!({ "unit_id": unit_id, "name": "异步班组", "work_type": 2 }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let team_id =
        Uuid::parse_str(body["data"]["id"].as_str().expect("team id")).expect("valid team id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
        json!({
            "unit_id": unit_id,
            "team_id": team_id,
            "id_card": "330283199710280537",
            "name": "异步工人",
            "phone": "18069021273",
            "work_type": 2,
            "work_status": 1,
            "avatar": "https://example.test/worker.jpg"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let worker_id =
        Uuid::parse_str(body["data"]["id"].as_str().expect("worker id")).expect("valid worker id");

    sqlx::query(
        r#"
        INSERT INTO integration_person_identities (
            platform_id, identity_type, identity_value, external_person_id, last_verified_at
        )
        SELECT id, 'id_card', '330283199710280537', 'TEST-YONGJIAN-CODE', NOW()
        FROM integration_platforms
        WHERE code = 'ningbo_housing' AND is_deleted = FALSE
        "#,
    )
    .execute(&pool)
    .await
    .expect("insert Yongjian identity cache");

    sqlx::query(
        r#"
        INSERT INTO integration_jobs (
            project_id, platform_code, operation, entity_type, local_entity_id,
            idempotency_key, request_payload, status, last_error
        )
        VALUES (
            $1, 'ningbo_housing', 'Project/AddWorkerV2', 'worker', $2,
            $3, '{}'::jsonb, 'failed', '该人员为备案人员，请通过信用系统操作'
        )
        "#,
    )
    .bind(Uuid::parse_str(project_id).expect("project uuid"))
    .bind(worker_id)
    .bind(format!("ningbo-recorded-worker-{worker_id}"))
    .execute(&pool)
    .await
    .expect("insert recorded-worker Ningbo result");

    let (status, workers_body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{workers_body}");
    assert_eq!(
        workers_body["data"]["items"][0]["reporting_platforms"][0]["yongjian_code"],
        "TEST-YONGJIAN-CODE"
    );
    assert_eq!(
        workers_body["data"]["items"][0]["reporting_platforms"][0]["status"],
        "success"
    );
    assert_eq!(
        workers_body["data"]["items"][0]["reporting_platforms"][0]["failure_reason"],
        Value::Null
    );
    assert_eq!(workers_body["data"]["reporting_summary"][0]["success_count"], 1);
    assert_eq!(workers_body["data"]["reporting_summary"][0]["failure_count"], 0);

    sqlx::query("DELETE FROM integration_outbox_events WHERE aggregate_id IN ($1, $2)")
        .bind(team_id)
        .bind(worker_id)
        .execute(&pool)
        .await
        .expect("clear create events");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/workers/{worker_id}"),
        &token,
        json!({ "name": "异步工人-修改" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let worker_events = sqlx::query_as::<_, (String, Value)>(
        r#"
        SELECT event_type, payload
        FROM integration_outbox_events
        WHERE aggregate_id = $1
        ORDER BY created_at, id
        "#,
    )
    .bind(worker_id)
    .fetch_all(&pool)
    .await
    .expect("worker update events");
    assert_eq!(worker_events.len(), 3, "{worker_events:?}");
    assert_eq!(worker_events[0].0, "construction.worker.changed");
    assert_eq!(worker_events[1].0, "ningbo.worker.reconcile");
    assert_eq!(worker_events[2].0, "attendance_device.worker.reconcile");
    assert_eq!(worker_events[2].1["action"], "update");

    sqlx::query("DELETE FROM integration_outbox_events WHERE aggregate_id = $1")
        .bind(worker_id)
        .execute(&pool)
        .await
        .expect("clear worker update events");
    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/workers/{worker_id}"),
        &token,
        json!({ "name": "异步工人-修改" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let unchanged_worker_events: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM integration_outbox_events WHERE aggregate_id = $1",
    )
    .bind(worker_id)
    .fetch_one(&pool)
    .await
    .expect("unchanged worker event count");
    assert_eq!(unchanged_worker_events, 0);

    sqlx::query("DELETE FROM integration_outbox_events WHERE aggregate_id = $1")
        .bind(team_id)
        .execute(&pool)
        .await
        .expect("clear team create events");
    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/teams/{team_id}"),
        &token,
        json!({ "name": "异步班组-修改" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let team_events: Vec<String> = sqlx::query_scalar(
        r#"
        SELECT event_type
        FROM integration_outbox_events
        WHERE aggregate_id = $1
        ORDER BY created_at, id
        "#,
    )
    .bind(team_id)
    .fetch_all(&pool)
    .await
    .expect("team update events");
    assert_eq!(
        team_events,
        vec![
            "construction.team.changed".to_owned(),
            "ningbo.team.sync".to_owned()
        ]
    );
    assert!(
        !team_events
            .iter()
            .any(|event| event.contains("attendance_device"))
    );
}

#[tokio::test]
async fn admin_can_manage_project_wage_batches_with_rows_import_export_and_delete() {
    let (app, pool, _c) = build_test_app_with_pool().await;
    let token = persisted_admin_token(&pool).await;

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({
            "name": "工资单接口测试项目",
            "status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let project_id = body["data"]["id"].as_str().expect("project id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/wage-batches"),
        &token,
        json!({
            "payroll_month": "2026-05",
            "company_name": "工资测试单位",
            "status": "confirmed",
            "remark": "手动工资单",
            "rows": [
                {
                    "worker_name": "工资工人甲",
                    "id_card": "332603197912123456",
                    "team_name": "木工班组",
                    "attendance_days": "22",
                    "monthly_settlement": "是",
                    "daily_settlement": "否",
                    "wage_card_number": "6222020202020202020",
                    "wage_bank": "中国银行",
                    "payable_amount": "5000",
                    "paid_amount": "4500",
                    "adjustment_amount": "100",
                    "adjustment_reason": "预留"
                },
                {
                    "worker_name": "工资工人乙",
                    "id_card": "332603198001012222",
                    "team_name": "钢筋班组",
                    "payable_amount_cents": 300000,
                    "paid_amount_cents": 300000
                }
            ]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let batch_id = body["data"]["id"].as_str().expect("wage batch id");
    assert_eq!(body["data"]["employee_count"], 2);
    assert_eq!(body["data"]["payable_amount_cents"], 800000);
    assert_eq!(body["data"]["paid_amount_cents"], 750000);
    assert_eq!(body["data"]["unpaid_amount_cents"], 50000);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/wage-batches?page=1&page_size=1"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["page_size"], 1);
    let batches = body["data"]["items"].as_array().expect("wage batch array");
    assert_eq!(batches.len(), 1);
    assert_eq!(batches[0]["id"], batch_id);
    let wage_items = batches[0]["items"].as_array().expect("wage items");
    assert_eq!(wage_items.len(), 2);
    let wage_worker_names = wage_items
        .iter()
        .filter_map(|item| item["worker_name"].as_str())
        .collect::<Vec<_>>();
    assert!(wage_worker_names.contains(&"工资工人甲"));
    assert!(wage_worker_names.contains(&"工资工人乙"));
    assert_eq!(body["data"]["summary"]["employee_count"], 2);
    assert_eq!(body["data"]["summary"]["payable_amount_cents"], 800000);

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/wage-batches/{batch_id}"),
        &token,
        json!({
            "payroll_month": "2026-06",
            "status": "paid",
            "rows": [
                {
                    "worker_name": "工资工人甲",
                    "id_card": "332603197912123456",
                    "team_name": "木工班组",
                    "payable_amount": "5200",
                    "paid_amount": "5200"
                }
            ]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["status"], "paid");
    assert_eq!(body["data"]["employee_count"], 1);
    assert_eq!(body["data"]["paid_amount_cents"], 520000);

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/wage-batches/import"),
        &token,
        json!({
            "payroll_month": "2026-06",
            "company_name": "工资测试单位",
            "status": "imported",
            "rows": [
                {
                    "worker_name": "导入工人",
                    "id_card": "332603198806061111",
                    "team_name": "水电班组",
                    "payable_amount": "4100",
                    "paid_amount": "3900"
                }
            ]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let import_batch_id = body["data"]["id"].as_str().expect("import batch id");
    assert_eq!(body["data"]["employee_count"], 1);
    assert_eq!(body["data"]["payable_amount_cents"], 410000);

    let (status, headers, body) = raw_get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/wage-batches/export?payroll_month=2026-06"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        headers
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()),
        Some("text/csv; charset=utf-8")
    );
    let csv = body["raw"].as_str().expect("csv body");
    assert!(csv.contains("工资工人甲"), "{csv}");
    assert!(csv.contains("导入工人"), "{csv}");
    assert!(csv.contains("=\"332603197912123456\""), "{csv}");

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/wage-batches/{import_batch_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/wage-batches/{batch_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/wage-batches"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 0);

    let (status, _) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn admin_can_manage_project_attendance_device_bindings() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({
            "name": "考勤机绑定测试项目",
            "status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let project_id = body["data"]["id"].as_str().expect("project id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/attendance-devices"),
        &token,
        json!({
            "serial_number": "A-DEVICE-001",
            "device_name": "南门进场考勤机",
            "direction": 0,
            "remark": "首台绑定设备"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let device_id = body["data"]["id"].as_str().expect("device id");
    assert_eq!(body["data"]["project_id"], project_id);
    assert_eq!(body["data"]["device_type"], "海厂家");
    assert_eq!(body["data"]["serial_number"], "A-DEVICE-001");
    assert_eq!(body["data"]["direction"], 0);

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/attendance-devices/{device_id}"),
        &token,
        json!({
            "device_type": "弹厂家",
            "device_name": "南门通用考勤机",
            "direction": 2,
            "remark": "调整为通用设备"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["device_type"], "弹厂家");
    assert_eq!(body["data"]["device_name"], "南门通用考勤机");
    assert_eq!(body["data"]["direction"], 2);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/attendance-devices"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let devices = body["data"]["items"]
        .as_array()
        .expect("attendance devices array");
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0]["id"], device_id);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/attendance-devices/{device_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["serial_number"], "A-DEVICE-001");
    assert_eq!(body["data"]["remark"], "调整为通用设备");

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/attendance-devices/{device_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["success"], true);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/attendance-devices"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body["data"]["items"]
            .as_array()
            .expect("attendance devices after delete")
            .len(),
        0
    );

    let (status, _) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn admin_can_search_and_paginate_project_attendance_devices_on_backend() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({
            "name": "考勤机分页测试项目",
            "status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let project_id = body["data"]["id"].as_str().expect("project id");

    let mut target_device_id = String::new();
    for index in 0..12 {
        let (status, body) = authed_json(
            app.clone(),
            "POST",
            &format!("/api/v1/admin/projects/{project_id}/attendance-devices"),
            &token,
            json!({
                "device_type": if index == 11 { "分页厂家" } else { "海厂家" },
                "serial_number": format!("SN-PAGE-{index:02}"),
                "device_name": format!("分页设备{:02}", index),
                "direction": if index == 11 { 1 } else { 0 },
                "remark": if index == 11 { "分页搜索目标" } else { "普通设备" }
            }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
        if index == 11 {
            target_device_id = body["data"]["id"].as_str().expect("device id").to_string();
        }
    }

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/attendance-devices"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 12);
    assert_eq!(body["data"]["page_size"], 10);
    assert_eq!(body["data"]["items"].as_array().expect("devices").len(), 10);

    let (status, body) = get_authed(
        app.clone(),
        &format!(
            "/api/v1/admin/projects/{project_id}/attendance-devices?keyword=%E5%88%86%E9%A1%B5%E6%90%9C%E7%B4%A2%E7%9B%AE%E6%A0%87&direction=1&page=1&page_size=5"
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["id"], target_device_id);

    let (status, _) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn admin_can_crud_search_paginate_attendance_device_issue_reports() {
    let (app, pool, _c) = build_test_app_with_pool().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({
            "name": "人员下发报告测试项目",
            "status": 1
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
            "company_name": "人员下发测试单位",
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
            "name": "人员下发测试班组",
            "work_type": 10
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
            "id_card": "320800199201019999",
            "name": "人员下发工人",
            "gender": 1,
            "phone": "13999990000",
            "avatar": "https://static.example.test/avatar.png",
            "worker_type": 1,
            "work_type": 10,
            "work_status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let worker_id = body["data"]["id"].as_str().expect("worker id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/attendance-devices"),
        &token,
        json!({
            "device_type": "实名制平台",
            "serial_number": "ISSUE-DEVICE-001",
            "device_name": "南门下发考勤机",
            "direction": 0,
            "remark": "下发目标设备"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let device_id = body["data"]["id"].as_str().expect("device id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/attendance-device-issue-reports",
        &token,
        json!({
            "project_id": project_id,
            "worker_id": worker_id,
            "attendance_device_id": device_id,
            "action": "create",
            "status": "pending",
            "issued_at": "2026-06-20T08:30:00Z",
            "message": "等待设备回执",
            "remark": "首条下发"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(
        body["message"],
        "MQTT_BROKER_URL 未配置，无法向 A 厂家设备下发人员"
    );

    let project_uuid = Uuid::parse_str(project_id).expect("project uuid");
    let worker_uuid = Uuid::parse_str(worker_id).expect("worker uuid");
    let device_uuid = Uuid::parse_str(device_id).expect("device uuid");
    let report_id = seed_attendance_device_issue_report(
        &pool,
        project_uuid,
        worker_uuid,
        device_uuid,
        "create",
        "pending",
        "2026-06-20T08:30:00Z",
        "等待设备回执",
        Some("首条下发"),
    )
    .await
    .to_string();
    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/attendance-device-issue-reports/{report_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["project_id"], project_id);
    assert_eq!(body["data"]["worker_name"], "人员下发工人");
    assert_eq!(body["data"]["device_name"], "南门下发考勤机");
    assert_eq!(body["data"]["serial_number"], "ISSUE-DEVICE-001");

    for index in 0..11 {
        seed_attendance_device_issue_report(
            &pool,
            project_uuid,
            worker_uuid,
            device_uuid,
            if index % 2 == 0 { "update" } else { "create" },
            "success",
            &format!("2026-06-20T09:{index:02}:00Z"),
            &format!("批量下发{index:02}"),
            None,
        )
        .await;
    }

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/attendance-device-issue-reports/{report_id}"),
        &token,
        json!({
            "status": "failed",
            "message": "设备离线，等待重试"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["status"], "failed");
    assert_eq!(body["data"]["message"], "设备离线，等待重试");

    let (status, body) = get_authed(
        app.clone(),
        "/api/v1/admin/attendance-device-issue-reports?page=1&page_size=10",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 12);
    assert_eq!(body["data"]["page_size"], 10);
    assert_eq!(body["data"]["items"].as_array().expect("reports").len(), 10);

    let (status, body) = get_authed(
        app.clone(),
        &format!(
            "/api/v1/admin/attendance-device-issue-reports?page=1&page_size=1&keyword=%E5%8D%97%E9%97%A8&project_id={project_id}&status=failed&action=create"
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["id"], report_id);
    assert_eq!(body["data"]["items"][0]["worker_name"], "人员下发工人");

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/attendance-device-issue-reports/{report_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["id"], report_id);
    assert_eq!(body["data"]["project_name"], "人员下发报告测试项目");

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/attendance-device-issue-reports/{report_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["success"], true);

    let (status, body) = get_authed(
        app.clone(),
        &format!(
            "/api/v1/admin/attendance-device-issue-reports?project_id={project_id}&status=failed"
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 0);

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
}

#[tokio::test]
async fn admin_api_accepts_full_normalized_non_platform_payloads() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();
    let leader_id = Uuid::new_v4().to_string();
    let dormitory_id = Uuid::new_v4().to_string();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({
            "name": "全字段项目",
            "address_code": "320800",
            "street": "府前街道",
            "start_date": "2026-03-18",
            "finish_date": "2027-12-30",
            "invest_total": 68000,
            "investment_nature": 1,
            "labor_cost": 8420,
            "status": 1,
            "category": 2,
            "industry": 3,
            "address": "枚皋路与淮海南路交叉口东侧",
            "longitude": "119.0382",
            "latitude": "33.6065",
            "work_permit": "320800202603180101",
            "supervision_area": "清江浦区",
            "contractor": "山淮建设工程有限公司",
            "contractor_credit_code": "91320800MA1SH0001X",
            "manager": "陈国强",
            "manager_phone": "13800000000",
            "contract_principal": "合同负责人",
            "contract_principal_id_card": "320800199001011111",
            "contract_principal_phone": "13800000001",
            "party_a": "淮安城发置业有限公司",
            "legal_representative": "李法人",
            "legal_representative_id_card": "320800199001012222",
            "company_office_address": "淮安市办公楼",
            "company_phone": "051700000000",
            "bid_notice": "中标通知书编号",
            "build_unit": "淮安城发置业有限公司",
            "build_unit_credit_code": "91320800MA1CF8802K",
            "labor_subcontractor": "苏北劳务工程有限公司",
            "labor_subcontractor_credit_code": "91320891MA1LW3019A",
            "build_nature": 4,
            "build_scale": 5,
            "acreage": 186000,
            "length": 1200,
            "purpose": 6,
            "progress_type": 7,
            "real_name_manager": "刘海宁",
            "real_name_manager_phone": "13900000001",
            "labor_manager": "王佳",
            "labor_manager_phone": "13900000002",
            "complaint_phone": "051711111111",
            "labor_complaint_phone": "051722222222",
            "company_complaint_phone": "051733333333",
            "project_complaint_phone": "051744444444",
            "nationality": "中国",
            "manager_id_card": "320800199001013333",
            "labor_manager_id_card": "320800199001014444",
            "contract_amount": 68000,
            "injury_insurance_number": "GSBX-001",
            "margin_amount": 300,
            "pay_date": "2026-06-25",
            "margin_photos": "margin.jpg",
            "injury_insurance_photos": "insurance.jpg",
            "payment_guarantee_photos": "guarantee.jpg",
            "contract_number": "HT-001",
            "contract_prefix": "SH",
            "party_a_seal": "party-seal.png",
            "legal_representative_seal": "legal-seal.png",
            "address_code_list": "320800,320812",
            "supervision_area_list": "A,B",
            "bid_notice_file": [{"name": "bid.pdf"}],
            "margin_photos_file": [{"name": "margin.pdf"}],
            "injury_insurance_photos_file": [{"name": "insurance.pdf"}],
            "payment_guarantee_photos_file": [{"name": "guarantee.pdf"}],
            "is_inspected": false,
            "is_handheld_device_enabled": true,
            "projectCode": "PLATFORM-SHOULD-BE-IGNORED"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let project = &body["data"];
    let project_id = project["id"].as_str().expect("project id");
    assert_eq!(project["name"], "全字段项目");
    assert_eq!(project["build_nature"], 4);
    assert_eq!(project["is_handheld_device_enabled"], true);
    assert!(project.get("projectCode").is_none());

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/units"),
        &token,
        json!({
            "company_name": "全字段参建单位",
            "company_credit_code": "91320800FULL0001X",
            "company_type": 2,
            "register_date": "2026-01-01",
            "register_area": "淮安市",
            "company_address": "淮安单位地址",
            "manager_name": "单位负责人",
            "manager_phone": "13800000002",
            "manager_id_card": "320800199001015555",
            "legal_person_name": "单位法人",
            "legal_person_id_card": "320800199001016666",
            "company_phone": "051755555555",
            "contract_amount": 1200,
            "attachment": "attachment.zip",
            "register_area_list": "320800,320812",
            "attachment_file": [{"name": "unit.pdf"}],
            "timer_set_a": 1,
            "timer_set_b": 2,
            "timer_set_c": 3,
            "salary_calc_type": 1,
            "quantity_unit_type": 2,
            "seal_photo": "seal.png",
            "rs_api_sta": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let unit = &body["data"];
    let unit_id = unit["id"].as_str().expect("unit id");
    assert_eq!(unit["company_name"], "全字段参建单位");
    assert_eq!(unit["timer_set_c"], 3);
    assert!(unit.get("rs_api_sta").is_none());

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/teams"),
        &token,
        json!({
            "unit_id": unit_id,
            "name": "全字段班组",
            "work_type": 10,
            "is_manage_team": true,
            "settlement_type": 7,
            "quantity_unit_type": 3,
            "remark": "班组备注",
            "attendance_start_time": "06:00",
            "attendance_end_time": "18:00",
            "attendance_is_next_day": true,
            "leader_id": leader_id,
            "leader_name": "班组长",
            "leader_phone": "13800000003",
            "leader_id_card": "320800199001017777",
            "team_no": "TEAM-001",
            "apiRunShiTeamId": "PLATFORM-SHOULD-BE-IGNORED"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let team = &body["data"];
    let team_id = team["id"].as_str().expect("team id");
    assert_eq!(team["name"], "全字段班组");
    assert_eq!(team["attendance_is_next_day"], true);
    assert!(team.get("apiRunShiTeamId").is_none());

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
        json!({
            "unit_id": unit_id,
            "team_id": team_id,
            "id_card": "320800199001011234",
            "name": "全字段工人",
            "gender": 1,
            "nation": "汉族",
            "visa_office": "淮安公安",
            "address": "身份证地址",
            "validity_period": "2020-01-01 至 2040-01-01",
            "ocr_photo": "ocr.jpg",
            "work_type": 10,
            "worker_type": 1,
            "political_status": 1,
            "education": 3,
            "settlement_type": 7,
            "quantity_unit_type": 4,
            "unit_price": 350,
            "salary_bank_card": "6222000000000000",
            "salary_bank": "中国银行",
            "has_insurance": true,
            "has_major_medical_history": true,
            "current_address": "现住址",
            "dormitory_id": dormitory_id,
            "id_card_back_file": "id-back.jpg",
            "phone": "13800000004",
            "is_manage_team": true,
            "is_key_personnel": true,
            "avatar": "avatar.jpg",
            "work_status": 2,
            "labor_contract_file": [{"name": "contract.pdf"}],
            "settlement_file": [{"name": "settlement.pdf"}],
            "exit_time": "2026-12-31",
            "auth_status": 2,
            "auth_fail_reason": "无",
            "manager_type": "1",
            "validity_period_end": "2040-01-01",
            "entry_time": "2026-03-20",
            "signature_photo": "signature.jpg",
            "signature_time": "2026-03-20",
            "native_place": 320800,
            "woAdmitGuid": "PLATFORM-SHOULD-BE-IGNORED"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let worker = &body["data"];
    let worker_id = worker["id"].as_str().expect("worker id");
    assert_eq!(worker["name"], "全字段工人");
    assert_eq!(worker["has_insurance"], true);
    assert_eq!(worker["native_place"], 320800);
    assert_eq!(worker["auth_status"], 2);
    assert_eq!(worker["auth_fail_reason"], Value::Null);
    assert!(worker.get("woAdmitGuid").is_none());

    let (status, body) = authed_json(
        app,
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/attendance-records"),
        &token,
        json!({
            "worker_id": worker_id,
            "direction": 1,
            "trigger_time": "2026-06-18T18:00:00Z",
            "equipment_id": "gate-002",
            "serial_number": "SN-FULL-001",
            "photo_path": "site.jpg",
            "overall_photo": "overall-base64",
            "closeup_photo": "closeup-base64",
            "original_time": "2026-06-18 18:00:00",
            "rs_send_sta": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let attendance = &body["data"];
    assert_eq!(attendance["direction"], 1);
    assert_eq!(attendance["serial_number"], "SN-FULL-001");
    assert!(attendance.get("rs_send_sta").is_none());
}

#[tokio::test]
async fn admin_api_accepts_form_style_nulls_by_column_type() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        &token,
        json!({
            "name": "表单空值项目",
            "status": 1,
            "is_inspected": true,
            "is_handheld_device_enabled": false
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let project_id = body["data"]["id"].as_str().expect("project id");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}"),
        &token,
        json!({
            "name": "表单空值项目-修改",
            "start_date": null,
            "finish_date": null,
            "investment_nature": null,
            "labor_cost": null,
            "manager": "2026-03-18",
            "bid_notice_file": null,
            "is_inspected": true,
            "is_handheld_device_enabled": false
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["name"], "表单空值项目-修改");
    assert_eq!(body["data"]["investment_nature"], Value::Null);
    assert_eq!(body["data"]["labor_cost"], Value::Null);
    assert_eq!(body["data"]["manager"], "2026-03-18");
    assert_eq!(body["data"]["bid_notice_file"], Value::Null);

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/units"),
        &token,
        json!({
            "company_name": "表单空值单位",
            "company_type": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let unit_id = body["data"]["id"].as_str().expect("unit id");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/units/{unit_id}"),
        &token,
        json!({
            "company_name": "2026-03-18",
            "company_type": null,
            "register_date": null,
            "attachment_file": null,
            "salary_calc_type": null
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["company_name"], "2026-03-18");
    assert_eq!(body["data"]["company_type"], Value::Null);
    assert_eq!(body["data"]["register_date"], Value::Null);
    assert_eq!(body["data"]["attachment_file"], Value::Null);

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/teams"),
        &token,
        json!({
            "unit_id": unit_id,
            "name": "表单空值班组"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let team_id = body["data"]["id"].as_str().expect("team id");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/teams/{team_id}"),
        &token,
        json!({
            "name": "2026-03-18",
            "work_type": null,
            "settlement_type": null,
            "leader_id": null,
            "is_manage_team": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["name"], "2026-03-18");
    assert_eq!(body["data"]["work_type"], 1001);
    assert_eq!(body["data"]["settlement_type"], Value::Null);
    assert_eq!(body["data"]["leader_id"], Value::Null);

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
        json!({
            "unit_id": unit_id,
            "team_id": team_id,
            "name": "无手机号工人",
            "id_card": "320800199001018888",
            "gender": 1,
            "worker_type": 1,
            "work_type": 10
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(body["message"], "请填写手机号");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
        json!({
            "unit_id": unit_id,
            "team_id": team_id,
            "name": "无工种建筑工人",
            "id_card": "320800199001017777",
            "gender": 1,
            "phone": "13800000001",
            "worker_type": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(body["message"], "请选择工种");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
        json!({
            "unit_id": unit_id,
            "team_id": team_id,
            "name": "无人员类型管理人员",
            "id_card": "320800199001016666",
            "gender": 1,
            "phone": "13800000002",
            "worker_type": 1001,
            "work_type": 1001
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(body["message"], "请选择人员类型");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        &token,
        json!({
            "unit_id": unit_id,
            "team_id": team_id,
            "name": "表单空值工人",
            "id_card": "320800199001019999",
            "gender": 1,
            "phone": "13800000000",
            "worker_type": 1,
            "work_type": 10,
            "work_status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let worker_id = body["data"]["id"].as_str().expect("worker id");
    assert_eq!(body["data"]["auth_status"], 2);
    assert_eq!(body["data"]["auth_fail_reason"], Value::Null);
    assert_eq!(
        body["data"]["entry_time"],
        chrono::Local::now().format("%Y-%m-%d").to_string()
    );

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/workers/{worker_id}"),
        &token,
        json!({
            "name": "2026-03-18",
            "native_place": null,
            "entry_time": null,
            "dormitory_id": null,
            "validity_period_end": "2040-01-01",
            "has_insurance": false
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["name"], "2026-03-18");
    assert_eq!(body["data"]["native_place"], Value::Null);
    assert_eq!(body["data"]["entry_time"], Value::Null);
    assert_eq!(body["data"]["dormitory_id"], Value::Null);
    assert_eq!(body["data"]["validity_period_end"], "2040-01-01");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/attendance-records"),
        &token,
        json!({
            "worker_id": worker_id,
            "direction": 0,
            "trigger_time": "2026-06-18T06:41:22Z",
            "equipment_id": "gate-001"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let attendance_id = body["data"]["id"].as_str().expect("attendance id");

    let (status, body) = authed_json(
        app,
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/attendance-records/{attendance_id}"),
        &token,
        json!({
            "direction": 1,
            "photo_path": "2026-03-18",
            "original_time": null
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["photo_path"], "2026-03-18");
    assert_eq!(body["data"]["original_time"], Value::Null);
}

#[tokio::test]
async fn supplemental_attendance_management_list_filters_all_queries_by_managed_projects() {
    let (app, pool, _c) = build_test_app_with_pool().await;
    let user_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO users (email, username, role, is_active, email_verified)
        VALUES ($1, $2, 'user', TRUE, TRUE)
        RETURNING id
        "#,
    )
    .bind(format!("supplemental-{}@example.com", Uuid::new_v4()))
    .bind(format!("supplemental-{}", Uuid::new_v4()))
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        r#"
        INSERT INTO role_menu_permissions (role_id, menu_key)
        SELECT id, 'supplemental_attendance' FROM role_configs WHERE code = 'user'
        ON CONFLICT DO NOTHING
        "#,
    )
    .execute(&pool)
    .await
    .unwrap();
    let (allowed_project_id, allowed_record_id) =
        insert_unassigned_managed_record(&pool, "授权补录项目").await;
    let (_denied_project_id, denied_record_id) =
        insert_unassigned_managed_record(&pool, "未授权补录项目").await;
    sqlx::query("INSERT INTO user_managed_projects (user_id, project_id) VALUES ($1, $2)")
        .bind(user_id)
        .bind(allowed_project_id)
        .execute(&pool)
        .await
        .unwrap();

    let token = user_token(user_id);
    let (status, body) = get_authed(
        app,
        "/api/v1/management/supplemental-attendance/records?month=2026-08&page=1&page_size=100",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["summary"]["total"], 1);
    assert_eq!(body["data"]["summary"]["unassigned"], 1);
    assert_eq!(
        body["data"]["items"][0]["id"],
        allowed_record_id.to_string()
    );
    assert_eq!(body["data"]["items"][0]["send_status"], "unassigned");
    assert!(body["data"]["items"][0]["device_result_status"].is_null());
    assert_ne!(body["data"]["items"][0]["id"], denied_record_id.to_string());
}

#[tokio::test]
async fn miniapp_project_routes_require_managed_project_grant() {
    let (app, pool, _c) = build_test_app_with_pool().await;

    let user_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO users (email, username, role, is_active, email_verified)
        VALUES ($1, $2, 'user', TRUE, TRUE)
        RETURNING id
        "#,
    )
    .bind(format!("miniapp-{}@example.com", Uuid::new_v4()))
    .bind(format!("miniapp-{}", Uuid::new_v4()))
    .fetch_one(&pool)
    .await
    .expect("insert miniapp user");

    let allowed_project_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_projects (name, status) VALUES ('授权项目', 5) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("insert allowed project");
    let denied_project_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_projects (name, status) VALUES ('未授权项目', 5) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("insert denied project");

    sqlx::query("INSERT INTO user_managed_projects (user_id, project_id) VALUES ($1, $2)")
        .bind(user_id)
        .bind(allowed_project_id)
        .execute(&pool)
        .await
        .expect("grant managed project");

    let token = user_token(user_id);

    let (status, body) = get_authed(app.clone(), "/api/v1/miniapp/projects/options", &token).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let projects = body["data"].as_array().expect("miniapp project options");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0]["id"], allowed_project_id.to_string());

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/miniapp/projects/{allowed_project_id}/units"),
        &token,
        json!({
            "company_name": "小程序授权单位",
            "company_type": 4
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    assert_eq!(body["data"]["company_name"], "小程序授权单位");

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/miniapp/projects/{denied_project_id}/units"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
}

#[tokio::test]
async fn miniapp_project_routes_support_construction_crud() {
    let (app, pool, _c) = build_test_app_with_pool().await;

    let user_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO users (email, username, role, is_active, email_verified)
        VALUES ($1, $2, 'user', TRUE, TRUE)
        RETURNING id
        "#,
    )
    .bind(format!("miniapp-crud-{}@example.com", Uuid::new_v4()))
    .bind(format!("miniapp-crud-{}", Uuid::new_v4()))
    .fetch_one(&pool)
    .await
    .expect("insert miniapp crud user");

    let project_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO construction_projects (name, status, address, build_unit, contractor)
        VALUES ('小程序 CRUD 项目', 5, '测试地址', '建设单位', '施工单位')
        RETURNING id
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("insert miniapp crud project");

    sqlx::query("INSERT INTO user_managed_projects (user_id, project_id) VALUES ($1, $2)")
        .bind(user_id)
        .bind(project_id)
        .execute(&pool)
        .await
        .expect("grant miniapp crud project");

    let token = user_token(user_id);
    let base = format!("/api/v1/miniapp/projects/{project_id}");

    let (status, body) = get_authed(app.clone(), &base, &token).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["name"], "小程序 CRUD 项目");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("{base}/units"),
        &token,
        json!({
            "company_name": "小程序参建单位",
            "company_credit_code": "91320800MINI0001X",
            "company_type": 4,
            "register_date": "2026-06-01",
            "register_area": "淮安市",
            "company_address": "淮安市测试路 1 号",
            "manager_name": "单位负责人",
            "manager_phone": "13800001001",
            "manager_id_card": "320800199001010001",
            "legal_person_name": "单位法人",
            "legal_person_id_card": "320800199001010002",
            "company_phone": "051700000001",
            "contract_amount": 1234,
            "attachment": "unit.zip",
            "register_area_list": "320800,320812",
            "attachment_file": [{"name": "unit.pdf", "url": "https://oss.example/unit.pdf"}],
            "timer_set_a": 1,
            "timer_set_b": 2,
            "timer_set_c": 3,
            "salary_calc_type": 1,
            "quantity_unit_type": 2,
            "seal_photo": "seal.png"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let unit_id = body["data"]["id"].as_str().expect("unit id");
    assert_eq!(body["data"]["company_name"], "小程序参建单位");
    assert_eq!(body["data"]["attachment_file"][0]["name"], "unit.pdf");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("{base}/units/{unit_id}"),
        &token,
        json!({
            "manager_name": "更新负责人",
            "contract_amount": 2345
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["manager_name"], "更新负责人");
    assert_eq!(body["data"]["contract_amount"].as_f64(), Some(2345.0));

    let (status, body) = get_authed(
        app.clone(),
        &format!("{base}/units?keyword=%E5%B0%8F%E7%A8%8B%E5%BA%8F&page=1&page_size=10"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["id"], unit_id);

    let leader_id = Uuid::new_v4();
    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("{base}/teams"),
        &token,
        json!({
            "unit_id": unit_id,
            "name": "小程序班组",
            "work_type": 10,
            "is_manage_team": false,
            "settlement_type": 7,
            "quantity_unit_type": 3,
            "remark": "小程序班组备注",
            "attendance_start_time": "06:30",
            "attendance_end_time": "18:00",
            "attendance_is_next_day": false,
            "leader_id": leader_id,
            "leader_name": "班组长",
            "leader_phone": "13800001002",
            "leader_id_card": "320800199001010003",
            "team_no": "MINI-TEAM-001"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let team_id = body["data"]["id"].as_str().expect("team id");
    assert_eq!(body["data"]["name"], "小程序班组");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("{base}/teams/{team_id}"),
        &token,
        json!({
            "name": "小程序班组更新",
            "attendance_is_next_day": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["name"], "小程序班组更新");
    assert_eq!(body["data"]["attendance_is_next_day"], true);

    let (status, body) = get_authed(app.clone(), &format!("{base}/teams/{team_id}"), &token).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["team_no"], "MINI-TEAM-001");

    let dormitory_id = Uuid::new_v4();
    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("{base}/workers"),
        &token,
        json!({
            "unit_id": unit_id,
            "team_id": team_id,
            "id_card": "320800199001019001",
            "name": "小程序工人",
            "gender": 1,
            "nation": "汉族",
            "visa_office": "淮安公安",
            "address": "身份证地址",
            "validity_period": "2020-01-01 至 2040-01-01",
            "ocr_photo": "ocr.jpg",
            "work_type": 10,
            "worker_type": 1,
            "political_status": 1,
            "education": 3,
            "settlement_type": 7,
            "quantity_unit_type": 4,
            "unit_price": 350,
            "salary_bank_card": "6222000000000000",
            "salary_bank": "中国银行",
            "has_insurance": true,
            "has_major_medical_history": false,
            "current_address": "现住址",
            "dormitory_id": dormitory_id,
            "id_card_back_file": "id-back.jpg",
            "phone": "13800001003",
            "is_manage_team": false,
            "is_key_personnel": true,
            "avatar": "avatar.jpg",
            "work_status": 1,
            "labor_contract_file": [{"name": "contract.pdf", "url": "https://oss.example/contract.pdf"}],
            "settlement_file": [{"name": "settlement.pdf", "url": "https://oss.example/settlement.pdf"}],
            "auth_status": 2,
            "manager_type": "1",
            "validity_period_end": "2040-01-01",
            "entry_time": "2026-06-02",
            "signature_photo": "signature.jpg",
            "signature_time": "2026-06-02",
            "native_place": 320800
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let worker_id = body["data"]["id"].as_str().expect("worker id");
    assert_eq!(body["data"]["name"], "小程序工人");
    assert_eq!(
        body["data"]["labor_contract_file"][0]["name"],
        "contract.pdf"
    );

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("{base}/workers/{worker_id}"),
        &token,
        json!({
            "name": "小程序工人更新",
            "phone": "13800001004",
            "work_status": 2,
            "exit_time": "2026-06-30"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["name"], "小程序工人更新");
    assert_eq!(body["data"]["work_status"], 2);
    assert_eq!(body["data"]["exit_time"], "2026-06-30");

    let (status, body) = get_authed(
        app.clone(),
        &format!("{base}/workers?keyword=%E5%B7%A5%E4%BA%BA%E6%9B%B4%E6%96%B0&work_status=2"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["id"], worker_id);

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("{base}/attendance-records"),
        &token,
        json!({
            "worker_id": worker_id,
            "direction": 0,
            "trigger_time": "2026-06-18T06:41:22Z",
            "equipment_id": "gate-001",
            "serial_number": "MINI-SN-001",
            "photo_path": "attendance.jpg",
            "overall_photo": "overall-base64",
            "closeup_photo": "closeup-base64",
            "original_time": "2026-06-18 14:41:22"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let attendance_id = body["data"]["id"].as_str().expect("attendance id");
    assert_eq!(body["data"]["serial_number"], "MINI-SN-001");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("{base}/attendance-records/{attendance_id}"),
        &token,
        json!({
            "direction": 1,
            "photo_path": "attendance-updated.jpg"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["direction"], 1);
    assert_eq!(body["data"]["photo_path"], "attendance-updated.jpg");

    let (status, body) = get_authed(
        app.clone(),
        &format!("{base}/attendance-records?attendance_date=2026-06-18&keyword=MINI-SN-001"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["id"], attendance_id);

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("{base}/attendance-devices"),
        &token,
        json!({
            "device_type": "人脸识别机",
            "serial_number": "MINI-DEVICE-001",
            "device_name": "小程序考勤机",
            "direction": 0,
            "remark": "小程序新增"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let device_id = body["data"]["id"].as_str().expect("device id");
    assert_eq!(body["data"]["device_name"], "小程序考勤机");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("{base}/attendance-devices/{device_id}"),
        &token,
        json!({
            "device_name": "小程序考勤机更新",
            "direction": 2,
            "remark": "更新备注"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["device_name"], "小程序考勤机更新");
    assert_eq!(body["data"]["direction"], 2);

    let (status, body) = get_authed(
        app.clone(),
        &format!("{base}/attendance-devices?keyword=MINI-DEVICE-001&direction=2"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["id"], device_id);

    for uri in [
        format!("{base}/attendance-records/{attendance_id}"),
        format!("{base}/attendance-devices/{device_id}"),
        format!("{base}/workers/{worker_id}"),
        format!("{base}/teams/{team_id}"),
        format!("{base}/units/{unit_id}"),
    ] {
        let (status, body) = delete_authed(app.clone(), &uri, &token).await;
        assert_eq!(status, StatusCode::OK, "{body}");
    }

    for (resource, id) in [
        ("attendance-records", attendance_id),
        ("attendance-devices", device_id),
        ("workers", worker_id),
        ("teams", team_id),
        ("units", unit_id),
    ] {
        let (status, body) =
            get_authed(app.clone(), &format!("{base}/{resource}/{id}"), &token).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
    }
}
