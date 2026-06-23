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
    let units = body["data"].as_array().expect("units array");
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
    let teams = body["data"].as_array().expect("teams array");
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
    let workers = body["data"].as_array().expect("workers array");
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
    let attendance_records = body["data"].as_array().expect("attendance records array");
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
    let devices = body["data"].as_array().expect("attendance devices array");
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
        body["data"]
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
            "name": "表单空值工人",
            "id_card": "320800199001019999",
            "gender": 1,
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
