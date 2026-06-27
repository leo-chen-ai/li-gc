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

    let (status, _) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{target_project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{other_project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn admin_can_manage_project_nested_resources_and_fake_attendance() {
    let (app, _c) = build_test_app().await;
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
    assert_eq!(body["data"]["labor_cost"], 8420);

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
            "work_status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let worker_id = body["data"]["id"].as_str().expect("worker id");

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

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/attendance-records/{attendance_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["serial_number"], "SN-001-UPDATED");

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
                "work_type": if index == 11 { 77 } else { 10 },
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
            "/api/v1/admin/projects/{project_id}/teams?unit_id={target_unit_id}&keyword=TEAM-PAGE-11&work_type=77&attendance_configured=true"
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
                "work_type": if index == 11 { 88 } else { 10 },
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
            "/api/v1/admin/projects/{project_id}/workers?team_id={target_team_id}&keyword=13930000011&work_type=88&work_status=2"
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
        app,
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
    assert_eq!(body["data"]["device_type"], "A厂家");
    assert_eq!(body["data"]["serial_number"], "A-DEVICE-001");
    assert_eq!(body["data"]["direction"], 0);

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/attendance-devices/{device_id}"),
        &token,
        json!({
            "device_type": "B厂家",
            "device_name": "南门通用考勤机",
            "direction": 2,
            "remark": "调整为通用设备"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["device_type"], "B厂家");
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
                "device_type": if index == 11 { "分页厂家" } else { "A厂家" },
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
    let (app, _c) = build_test_app().await;
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
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let report_id = body["data"]["id"].as_str().expect("report id");
    assert_eq!(body["data"]["project_id"], project_id);
    assert_eq!(body["data"]["worker_name"], "人员下发工人");
    assert_eq!(body["data"]["device_name"], "南门下发考勤机");
    assert_eq!(body["data"]["serial_number"], "ISSUE-DEVICE-001");

    for index in 0..11 {
        let (status, body) = authed_json(
            app.clone(),
            "POST",
            "/api/v1/admin/attendance-device-issue-reports",
            &token,
            json!({
                "project_id": project_id,
                "worker_id": worker_id,
                "attendance_device_id": device_id,
                "action": if index % 2 == 0 { "update" } else { "delete" },
                "status": "success",
                "issued_at": format!("2026-06-20T09:{index:02}:00Z"),
                "message": format!("批量下发{index:02}")
            }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
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

    let (status, _) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
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
    assert_eq!(body["data"]["work_type"], Value::Null);
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
            "worker_type": 1001
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
