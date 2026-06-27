#![recursion_limit = "256"]

mod common;

use axum::{
    body::Body,
    http::{HeaderMap, Request, StatusCode, header},
};
use bytes::Bytes;
use http_body_util::BodyExt;
use quax::feature::auth::{Role, utils::jwt::create_token_pair};
use serde_json::{Value, json};
use std::io::{Cursor, Read, Write};
use tower::ServiceExt;
use uuid::Uuid;
use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

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

async fn delete_authed(app: axum::Router, uri: &str, token: &str) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("DELETE")
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let (status, _, json) = raw_request(app, req).await;
    (status, json)
}

async fn get_authed_raw(
    app: axum::Router,
    uri: &str,
    token: &str,
) -> (StatusCode, header::HeaderMap, Value) {
    let req = Request::builder()
        .method("GET")
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    raw_request(app, req).await
}

async fn get_authed_bytes(
    app: axum::Router,
    uri: &str,
    token: &str,
) -> (StatusCode, HeaderMap, Bytes) {
    let req = Request::builder()
        .method("GET")
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.oneshot(req).await.unwrap();
    let status = res.status();
    let headers = res.headers().clone();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, headers, bytes)
}

async fn create_project_unit_team_worker(
    app: axum::Router,
    token: &str,
) -> (String, String, String, String) {
    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/projects",
        token,
        json!({
            "name": "合同模板测试项目",
            "status": 1,
            "address": "淮安市清江浦区示范路 88 号",
            "contractor": "山淮建设工程有限公司",
            "manager": "陈经理"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let project_id = body["data"]["id"].as_str().expect("project id").to_string();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/units"),
        token,
        json!({
            "company_name": "浙江东诚建设有限公司",
            "company_type": 1,
            "manager_name": "梁国华"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let unit_id = body["data"]["id"].as_str().expect("unit id").to_string();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/teams"),
        token,
        json!({
            "unit_id": unit_id,
            "name": "钢筋班组",
            "leader_name": "梁国华"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let team_id = body["data"]["id"].as_str().expect("team id").to_string();

    let (status, body) = authed_json(
        app,
        "POST",
        &format!("/api/v1/admin/projects/{project_id}/workers"),
        token,
        json!({
            "unit_id": unit_id,
            "team_id": team_id,
            "id_card": "33010619881016301X",
            "name": "洪林飞",
            "gender": 1,
            "phone": "13900001111",
            "work_status": 1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let worker_id = body["data"]["id"].as_str().expect("worker id").to_string();

    (project_id, unit_id, team_id, worker_id)
}

fn minimal_docx_template() -> Vec<u8> {
    let mut buffer = Cursor::new(Vec::new());
    {
        let mut zip = ZipWriter::new(&mut buffer);
        let options = SimpleFileOptions::default();
        zip.start_file("[Content_Types].xml", options).unwrap();
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#,
        )
        .unwrap();
        zip.start_file("_rels/.rels", options).unwrap();
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#,
        )
        .unwrap();
        zip.start_file("word/document.xml", options).unwrap();
        zip.write_all(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>项目：</w:t></w:r>
      <w:r><w:t>{{项目名称}}</w:t></w:r>
      <w:r><w:t>；工人：</w:t></w:r>
      <w:r><w:t>{{</w:t></w:r>
      <w:r><w:t>工人姓名</w:t></w:r>
      <w:r><w:t>}}</w:t></w:r>
      <w:r><w:t>；未知：</w:t></w:r>
      <w:r><w:t>{{未知变量}}</w:t></w:r>
      <w:r><w:t>；签字：</w:t></w:r>
      <w:r><w:t>{{工人签字}}</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:p><w:r><w:t>表格项目：</w:t></w:r><w:r><w:t>{{项目名称}}</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>表格班组：</w:t></w:r><w:r><w:t>{{班组名称}}</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>"#
                .as_bytes(),
        )
        .unwrap();
        zip.finish().unwrap();
    }
    buffer.into_inner()
}

fn docx_document_xml_text(bytes: &[u8]) -> String {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).expect("valid docx zip");
    let mut file = archive.by_name("word/document.xml").expect("document.xml");
    let mut xml = String::new();
    std::io::Read::read_to_string(&mut file, &mut xml).unwrap();
    xml
}

#[tokio::test]
async fn admin_can_crud_contract_templates_configure_project_default_and_download_worker_contract()
{
    let (app, _c) = build_test_app().await;
    let token = admin_token();
    let (project_id, _unit_id, _team_id, worker_id) =
        create_project_unit_team_worker(app.clone(), &token).await;

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/contract-templates",
        &token,
        json!({
            "name": "标准劳动合同",
            "code": "default-labor",
            "content": "项目：{{project.name}}；工人：{{worker.name}}；班组：{{team.name}}；单位：{{unit.company_name}}；身份证：{{worker.id_card}}",
            "is_enabled": true,
            "is_default": true,
            "remark": "默认模板"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let template_id = body["data"]["id"].as_str().expect("template id");
    assert_eq!(body["data"]["name"], "标准劳动合同");
    assert_eq!(body["data"]["is_default"], true);

    let (status, body) = get_authed(
        app.clone(),
        "/api/v1/admin/contract-templates?page=1&page_size=10",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["id"], template_id);

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/contract-templates/{template_id}"),
        &token,
        json!({
            "name": "标准劳动合同-修订",
            "remark": "修订版"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["name"], "标准劳动合同-修订");

    let (status, body) = authed_json(
        app.clone(),
        "PUT",
        &format!("/api/v1/admin/projects/{project_id}/contract-template"),
        &token,
        json!({ "template_id": template_id }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["project_id"], project_id);
    assert_eq!(body["data"]["template_id"], template_id);

    let (status, headers, body) = get_authed_raw(
        app.clone(),
        &format!("/api/v1/admin/projects/{project_id}/workers/{worker_id}/contract-download"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(
        headers
            .get(header::CONTENT_DISPOSITION)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .contains("attachment")
    );
    let rendered = body["raw"].as_str().expect("raw html response");
    assert!(rendered.contains("合同模板测试项目"));
    assert!(rendered.contains("洪林飞"));
    assert!(rendered.contains("钢筋班组"));
    assert!(rendered.contains("浙江东诚建设有限公司"));

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/contract-templates/{template_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["success"], true);

    let (status, body) = get_authed(app, "/api/v1/admin/contract-templates", &token).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 0);
}

#[tokio::test]
async fn worker_contract_download_renders_uploaded_docx_template_and_keeps_unknown_variables() {
    let (app, pool, _c) = build_test_app_with_pool().await;
    let token = admin_token();
    let (project_id, _unit_id, _team_id, worker_id) =
        create_project_unit_team_worker(app.clone(), &token).await;
    let signature_data_uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/projects/{project_id}/workers/{worker_id}"),
        &token,
        json!({ "signature_photo": signature_data_uri }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let object_key = format!("tests/contract-template-{}.docx", Uuid::new_v4());
    let path = std::path::Path::new("./uploads").join(&object_key);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.unwrap();
    }
    tokio::fs::write(&path, minimal_docx_template())
        .await
        .unwrap();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/contract-templates",
        &token,
        json!({
            "name": "上传 Word 劳动合同",
            "code": "docx-labor",
            "content": "",
            "template_file": {
                "object_key": object_key,
                "original_filename": "模板.docx",
                "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            },
            "template_file_object_key": object_key,
            "template_file_name": "模板.docx",
            "template_file_content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "is_enabled": true,
            "is_default": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let template_id = body["data"]["id"].as_str().expect("template id");

    let (status, body) = authed_json(
        app.clone(),
        "PUT",
        &format!("/api/v1/admin/projects/{project_id}/contract-template"),
        &token,
        json!({ "template_id": template_id }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, headers, bytes) = get_authed_bytes(
        app,
        &format!("/api/v1/admin/projects/{project_id}/workers/{worker_id}/contract-download"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()),
        Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    );

    let text = docx_document_xml_text(&bytes);
    assert!(text.contains("合同模板测试项目"), "{text}");
    assert!(text.contains("洪林飞"), "{text}");
    assert!(text.contains("<w:tbl>"), "{text}");
    assert!(text.contains("表格班组："), "{text}");
    assert!(text.contains("钢筋班组"), "{text}");
    assert!(!text.contains("&lt;w:tc"), "{text}");
    assert!(text.contains("{{未知变量}}"), "{text}");
    assert!(!text.contains("{{工人姓名}}"), "{text}");
    assert!(!text.contains("{{工人签字}}"), "{text}");
    assert!(text.contains("<w:drawing>"), "{text}");

    let mut archive = ZipArchive::new(Cursor::new(bytes)).expect("valid docx zip");
    assert!(archive.by_name("word/media/contract-image-1.png").is_ok());
    let mut rels = String::new();
    archive
        .by_name("word/_rels/document.xml.rels")
        .expect("document rels")
        .read_to_string(&mut rels)
        .unwrap();
    assert!(rels.contains("rIdContractImage1"), "{rels}");
    assert!(rels.contains("media/contract-image-1.png"), "{rels}");

    let _ = tokio::fs::remove_file(path).await;
    drop(pool);
}

#[tokio::test]
async fn admin_can_crud_work_hour_configs() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();
    let (project_id, _, _, _) = create_project_unit_team_worker(app.clone(), &token).await;

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/work-hour-configs",
        &token,
        json!({
            "project_id": project_id,
            "name": "标准工时算法",
            "algorithm_type": "standard",
            "rules": {
                "dayHours": 8,
                "overtimeAfterHours": 9,
                "nightShift": { "start": "22:00", "end": "06:00", "ratio": 1.5 }
            },
            "is_enabled": true,
            "remark": "项目默认算法"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let config_id = body["data"]["id"].as_str().expect("config id");
    assert_eq!(body["data"]["rules"]["dayHours"], 8);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/work-hour-configs?project_id={project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/work-hour-configs/{config_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["name"], "标准工时算法");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/work-hour-configs/{config_id}"),
        &token,
        json!({
            "algorithm_type": "comprehensive",
            "rules": { "monthHours": 176, "overtimeRatio": 1.5 }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["algorithm_type"], "comprehensive");
    assert_eq!(body["data"]["rules"]["monthHours"], 176);

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/work-hour-configs/{config_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = get_authed(
        app,
        &format!("/api/v1/admin/work-hour-configs?project_id={project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 0);
}

#[tokio::test]
async fn attendance_calendar_returns_working_hours_and_work_point_from_project_rules() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();
    let (project_id, _unit_id, _team_id, worker_id) =
        create_project_unit_team_worker(app.clone(), &token).await;

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/work-hour-configs",
        &token,
        json!({
            "project_id": project_id,
            "name": "分段记工",
            "algorithm_type": "tiered_duration",
            "rules": {
                "algorithm": "tiered_duration",
                "maxHours": 24,
                "segments": [
                    { "fromHours": 0, "toHours": 8, "rate": 1 },
                    { "fromHours": 8, "toHours": 15, "rate": 1.5 }
                ]
            },
            "is_enabled": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    for payload in [
        json!({
            "worker_id": worker_id,
            "direction": 0,
            "trigger_time": "2026-06-18T00:00:00Z",
            "equipment_id": "gate-in"
        }),
        json!({
            "worker_id": worker_id,
            "direction": 0,
            "trigger_time": "2026-06-18T01:00:00Z",
            "equipment_id": "gate-in-late"
        }),
        json!({
            "worker_id": worker_id,
            "direction": 1,
            "trigger_time": "2026-06-18T09:00:00Z",
            "equipment_id": "gate-out-early"
        }),
        json!({
            "worker_id": worker_id,
            "direction": 1,
            "trigger_time": "2026-06-18T10:00:00Z",
            "equipment_id": "gate-out"
        }),
        json!({
            "worker_id": worker_id,
            "direction": 0,
            "trigger_time": "2026-06-19T00:00:00Z",
            "equipment_id": "gate-in-2"
        }),
        json!({
            "worker_id": worker_id,
            "direction": 1,
            "trigger_time": "2026-06-19T05:00:00Z",
            "equipment_id": "gate-out-2"
        }),
        json!({
            "worker_id": worker_id,
            "direction": 0,
            "trigger_time": "2026-06-20T00:00:00Z",
            "equipment_id": "gate-in-without-out"
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
        app,
        &format!(
            "/api/v1/admin/projects/{project_id}/attendance-records?view=calendar&month=2026-06"
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let row = &body["data"]["items"][0];
    let day = &row["days"][0];
    assert_eq!(day["first_in_time"], "08:00");
    assert_eq!(day["last_out_time"], "18:00");
    assert_eq!(day["working_hours"], 10.0);
    assert_eq!(day["work_point"], 1.5);
    assert_eq!(day["work_hour_algorithm"], "tiered_duration");
    let incomplete_day = row["days"]
        .as_array()
        .expect("days array")
        .iter()
        .find(|day| day["day"] == 20)
        .expect("incomplete day");
    assert_eq!(incomplete_day["working_hours"], 0.0);
    assert_eq!(incomplete_day["work_point"], 0.0);
    assert_eq!(row["total_working_hours"], 15.0);
    assert_eq!(row["total_work_point"], 2.5);
}

#[tokio::test]
async fn attendance_calendar_maps_legacy_work_hour_rules_to_work_point_segments() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();
    let (project_id, _unit_id, _team_id, worker_id) =
        create_project_unit_team_worker(app.clone(), &token).await;

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/work-hour-configs",
        &token,
        json!({
            "project_id": project_id,
            "name": "旧结构标准工时",
            "algorithm_type": "standard",
            "rules": {
                "dayHours": 8,
                "overtimeAfterHours": 9,
                "nightShift": { "ratio": 1.5 }
            },
            "is_enabled": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    for payload in [
        json!({
            "worker_id": worker_id,
            "direction": 0,
            "trigger_time": "2026-06-18T00:00:00Z",
            "equipment_id": "gate-in"
        }),
        json!({
            "worker_id": worker_id,
            "direction": 1,
            "trigger_time": "2026-06-18T10:00:00Z",
            "equipment_id": "gate-out"
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
        app,
        &format!(
            "/api/v1/admin/projects/{project_id}/attendance-records?view=calendar&month=2026-06"
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let day = &body["data"]["items"][0]["days"][0];
    assert_eq!(day["working_hours"], 10.0);
    assert_eq!(day["work_point"], 1.5);
    assert_eq!(day["work_hour_algorithm"], "standard");
}

#[tokio::test]
async fn admin_can_crud_platform_configs_and_logs_with_today_summary() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();
    let (project_id, _, _, _) = create_project_unit_team_worker(app.clone(), &token).await;

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/platform-configs",
        &token,
        json!({
            "project_id": project_id,
            "platform_name": "实名制监管平台",
            "platform_type": "real_name",
            "config": { "endpoint": "https://example.test/api", "appKey": "demo-key" },
            "is_enabled": true,
            "remark": "测试配置"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let config_id = body["data"]["id"].as_str().expect("config id");
    assert_eq!(body["data"]["config"]["appKey"], "demo-key");

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/platform-configs?project_id={project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/platform-configs/{config_id}"),
        &token,
        json!({
            "platform_name": "实名制监管平台-修订",
            "config": { "endpoint": "https://example.test/v2", "appKey": "demo-key-v2" }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["platform_name"], "实名制监管平台-修订");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/platform-logs",
        &token,
        json!({
            "project_id": project_id,
            "platform_config_id": config_id,
            "platform_name": "实名制监管平台-修订",
            "operation": "人员上传",
            "direction": "push",
            "status": "success",
            "request_count": 12,
            "success_count": 12,
            "failure_count": 0,
            "message": "人员上传成功"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let log_id = body["data"]["id"].as_str().expect("log id");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/platform-logs/{log_id}"),
        &token,
        json!({
            "operation": "班组上传",
            "request_count": 16,
            "success_count": 15,
            "failure_count": 1,
            "status": "failed"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["operation"], "班组上传");
    assert_eq!(body["data"]["failure_count"], 1);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/platform-logs?project_id={project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["summary"]["today_request_count"], 16);
    assert_eq!(body["data"]["summary"]["today_failure_count"], 1);
    assert_eq!(body["data"]["items"][0]["id"], log_id);

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/platform-logs/{log_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/platform-configs/{config_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = get_authed(
        app,
        &format!("/api/v1/admin/platform-configs?project_id={project_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 0);
}

#[tokio::test]
async fn admin_overview_returns_construction_metrics_and_chart_data() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();
    let (project_id, _, _, _) = create_project_unit_team_worker(app.clone(), &token).await;

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/work-hour-configs",
        &token,
        json!({
            "project_id": project_id,
            "name": "总览工时算法",
            "algorithm_type": "standard",
            "rules": { "dayHours": 8 },
            "is_enabled": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/platform-configs",
        &token,
        json!({
            "project_id": project_id,
            "platform_name": "省实名制平台",
            "platform_type": "real_name",
            "config": { "endpoint": "https://example.test/api" },
            "is_enabled": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let config_id = body["data"]["id"].as_str().expect("config id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/platform-logs",
        &token,
        json!({
            "project_id": project_id,
            "platform_config_id": config_id,
            "platform_name": "省实名制平台",
            "operation": "人员上传",
            "direction": "push",
            "status": "success",
            "request_count": 9,
            "success_count": 9,
            "failure_count": 0
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = get_authed(app, "/api/v1/admin/construction-overview", &token).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["data"]["project_count"].as_i64().unwrap_or_default() >= 1);
    assert!(body["data"]["worker_count"].as_i64().unwrap_or_default() >= 1);
    assert!(
        body["data"]["work_hour_config_count"]
            .as_i64()
            .unwrap_or_default()
            >= 1
    );
    assert!(
        body["data"]["platform_config_count"]
            .as_i64()
            .unwrap_or_default()
            >= 1
    );
    assert!(
        body["data"]["platform_today_request_count"]
            .as_i64()
            .unwrap_or_default()
            >= 9
    );
    assert!(body["data"]["wage_unpaid_amount_cents"].as_i64().is_some());
    assert!(
        body["data"]["wage_paid_rate_basis_points"]
            .as_i64()
            .is_some()
    );
    assert!(body["data"]["attendance_7day_count"].as_i64().is_some());
    assert!(
        body["data"]["platform_success_rate_basis_points"]
            .as_i64()
            .is_some()
    );
    assert!(
        body["data"]["project_status_distribution"]
            .as_array()
            .unwrap()
            .len()
            >= 1
    );
    assert!(
        body["data"]["platform_status_distribution"]
            .as_array()
            .unwrap()
            .len()
            >= 1
    );
}
