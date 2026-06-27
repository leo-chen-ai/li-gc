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
use tower::ServiceExt;
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

async fn create_enterprise_project(app: axum::Router, token: &str, name: &str) -> String {
    let (status, body) = authed_json(
        app,
        "POST",
        "/api/v1/admin/enterprise-projects",
        token,
        json!({
            "project_code": format!("EP-{}", Uuid::new_v4().simple()),
            "name": name,
            "customer_name": "江苏山淮建设集团",
            "contract_amount": "1000000.00",
            "owner_name": "张经营",
            "status": "active",
            "planned_start_date": "2026-06-01",
            "planned_end_date": "2026-12-31",
            "remark": "经营项目测试"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    body["data"]["id"].as_str().expect("project id").to_owned()
}

async fn create_enterprise_customer(app: axum::Router, token: &str, name: &str) -> String {
    let (status, body) = authed_json(
        app,
        "POST",
        "/api/v1/admin/enterprise-customers",
        token,
        json!({
            "name": name,
            "credit_code": format!("9132{}", Uuid::new_v4().simple()),
            "contact_name": "王总",
            "contact_phone": "13900000000",
            "status": "active",
            "remark": "客户主数据测试"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    body["data"]["id"].as_str().expect("customer id").to_owned()
}

async fn create_enterprise_own_entity(app: axum::Router, token: &str, name: &str) -> String {
    let (status, body) = authed_json(
        app,
        "POST",
        "/api/v1/admin/enterprise-own-entities",
        token,
        json!({
            "name": name,
            "credit_code": format!("9132{}", Uuid::new_v4().simple()),
            "bank_name": "建设银行南京分行",
            "bank_account": "320000000000001",
            "contact_name": "财务负责人",
            "contact_phone": "13800000000",
            "status": "active",
            "is_default": false,
            "remark": "我方主体测试"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    body["data"]["id"]
        .as_str()
        .expect("own entity id")
        .to_owned()
}

async fn create_customer_project(
    app: axum::Router,
    token: &str,
    customer_id: &str,
    name: &str,
    amount: &str,
) -> String {
    let (status, body) = authed_json(
        app,
        "POST",
        "/api/v1/admin/enterprise-projects",
        token,
        json!({
            "project_code": format!("EP-{}", Uuid::new_v4().simple()),
            "name": name,
            "customer_id": customer_id,
            "contract_amount": amount,
            "owner_name": "张经营",
            "status": "active",
            "planned_start_date": "2026-01-01",
            "planned_end_date": "2026-12-31"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    assert_eq!(body["data"]["customer_id"], customer_id);
    body["data"]["id"].as_str().expect("project id").to_owned()
}

async fn create_customer_project_with_own_entity(
    app: axum::Router,
    token: &str,
    customer_id: &str,
    own_entity_id: &str,
    name: &str,
    amount: &str,
) -> String {
    let (status, body) = authed_json(
        app,
        "POST",
        "/api/v1/admin/enterprise-projects",
        token,
        json!({
            "project_code": format!("EP-{}", Uuid::new_v4().simple()),
            "name": name,
            "customer_id": customer_id,
            "own_entity_id": own_entity_id,
            "contract_amount": amount,
            "owner_name": "张经营",
            "status": "active",
            "planned_start_date": "2026-01-01",
            "planned_end_date": "2026-12-31"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    assert_eq!(body["data"]["customer_id"], customer_id);
    assert_eq!(body["data"]["own_entity_id"], own_entity_id);
    body["data"]["id"].as_str().expect("project id").to_owned()
}

#[tokio::test]
async fn admin_can_crud_search_paginate_and_delete_enterprise_own_entities() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let first_id = create_enterprise_own_entity(app.clone(), &token, "山淮建设有限公司").await;
    let second_id = create_enterprise_own_entity(app.clone(), &token, "山淮劳务有限公司").await;

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/enterprise-own-entities/{first_id}"),
        &token,
        json!({
            "bank_account": "320000000000099",
            "is_default": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["bank_account"], "320000000000099");
    assert_eq!(body["data"]["is_default"], true);

    let (status, body) = get_authed(
        app.clone(),
        "/api/v1/admin/enterprise-own-entities?page=1&page_size=1&keyword=山淮",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["page"], 1);
    assert_eq!(body["data"]["page_size"], 1);
    assert_eq!(body["data"]["total"], 2);
    assert_eq!(body["data"]["items"].as_array().unwrap().len(), 1);

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/enterprise-own-entities/{second_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = get_authed(
        app,
        "/api/v1/admin/enterprise-own-entities?page=1&page_size=10&keyword=劳务",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 0);
}

#[tokio::test]
async fn admin_can_crud_search_paginate_and_export_enterprise_projects() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let first_id = create_enterprise_project(app.clone(), &token, "湖州长田漾经营项目").await;
    let second_id = create_enterprise_project(app.clone(), &token, "南京江北经营项目").await;

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/enterprise-projects/{first_id}"),
        &token,
        json!({ "owner_name": "李经营", "status": "paused" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["owner_name"], "李经营");
    assert_eq!(body["data"]["status"], "paused");

    let (status, body) = get_authed(
        app.clone(),
        "/api/v1/admin/enterprise-projects?page=1&page_size=1&keyword=经营项目",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["page"], 1);
    assert_eq!(body["data"]["page_size"], 1);
    assert_eq!(body["data"]["total"], 2);
    assert_eq!(body["data"]["items"].as_array().unwrap().len(), 1);

    let (status, body) = get_authed(
        app.clone(),
        "/api/v1/admin/enterprise-projects?page=1&page_size=10&status=paused",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["id"], first_id);

    let (status, headers, bytes) = get_authed_bytes(
        app.clone(),
        "/api/v1/admin/enterprise-projects/export?keyword=经营项目",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()),
        Some("text/csv; charset=utf-8")
    );
    let csv = String::from_utf8(bytes.to_vec()).expect("csv utf8");
    assert!(csv.contains("湖州长田漾经营项目"), "{csv}");
    assert!(csv.contains("南京江北经营项目"), "{csv}");

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/enterprise-projects/{second_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = get_authed(
        app,
        "/api/v1/admin/enterprise-projects?page=1&page_size=10&keyword=南京江北",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 0);
}

#[tokio::test]
async fn customer_management_ignores_type_and_filters_by_created_date_range() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/enterprise-customers",
        &token,
        json!({
            "name": "南京城投客户",
            "customer_type": "政府平台",
            "status": "active"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        "/api/v1/admin/enterprise-customers",
        &token,
        json!({
            "name": "民营建设客户",
            "customer_type": "民营企业",
            "status": "active"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = get_authed(
        app.clone(),
        "/api/v1/admin/enterprise-customers?page=1&page_size=10&customer_type=政府平台",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 2);

    let (status, body) = get_authed(
        app,
        "/api/v1/admin/enterprise-customers?page=1&page_size=10&date_from=2999-01-01",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 0);
}

#[tokio::test]
async fn customer_summary_groups_projects_and_financial_records_by_year() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();
    let customer_id = create_enterprise_customer(app.clone(), &token, "南京江北城投集团").await;
    let first_project = create_customer_project(
        app.clone(),
        &token,
        &customer_id,
        "江北商业配套一期",
        "1000000.00",
    )
    .await;
    let second_project = create_customer_project(
        app.clone(),
        &token,
        &customer_id,
        "江北商业配套二期",
        "2000000.00",
    )
    .await;

    let (status, issued) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{first_project}/issued-invoices"),
        &token,
        json!({
            "invoice_no": "OUT-2026-001",
            "invoice_date": "2026-03-01",
            "amount": "500000.00",
            "status": "issued"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{issued}");
    let issued_id = issued["data"]["id"].as_str().expect("issued id");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{second_project}/issued-invoices"),
        &token,
        json!({
            "invoice_no": "OUT-2026-VOID",
            "invoice_date": "2026-05-01",
            "amount": "900000.00",
            "status": "voided"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{first_project}/received-invoices"),
        &token,
        json!({
            "supplier_name": "分包单位",
            "invoice_date": "2026-03-05",
            "amount": "200000.00",
            "status": "received"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{first_project}/collections"),
        &token,
        json!({
            "issued_invoice_id": issued_id,
            "collection_date": "2026-03-20",
            "amount": "350000.00",
            "status": "confirmed"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{first_project}/payments"),
        &token,
        json!({
            "payment_date": "2026-03-22",
            "amount": "120000.00",
            "status": "confirmed"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let (status, body) = get_authed(
        app.clone(),
        "/api/v1/admin/enterprise-customers?page=1&page_size=10&keyword=江北城投",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["project_count"], 2);
    assert_eq!(
        body["data"]["items"][0]["contract_amount_cents"],
        300_000_000
    );
    assert_eq!(
        body["data"]["items"][0]["collection_amount_cents"],
        35_000_000
    );

    let (status, body) = get_authed(
        app,
        &format!("/api/v1/admin/enterprise-customers/{customer_id}/summary?year=2026"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let summary = &body["data"];
    assert_eq!(summary["customer_id"], customer_id);
    assert_eq!(summary["year"], 2026);
    assert_eq!(summary["project_count"], 2);
    assert_eq!(summary["contract_amount_cents"], 300_000_000);
    assert_eq!(summary["issued_invoice_amount_cents"], 50_000_000);
    assert_eq!(summary["received_invoice_amount_cents"], 20_000_000);
    assert_eq!(summary["collection_amount_cents"], 35_000_000);
    assert_eq!(summary["payment_amount_cents"], 12_000_000);
    assert_eq!(summary["receivable_balance_cents"], 15_000_000);
    assert_eq!(summary["cash_profit_cents"], 23_000_000);
    assert_eq!(summary["accounting_profit_cents"], 30_000_000);
}

#[tokio::test]
async fn project_financial_records_update_backend_summary_formulas() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();
    let project_id = create_enterprise_project(app.clone(), &token, "金融街经营项目").await;

    let (status, issued) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{project_id}/issued-invoices"),
        &token,
        json!({
            "customer_name": "金融街建设单位",
            "invoice_no": "INV-OUT-001",
            "invoice_date": "2026-06-10",
            "amount": "500000.00",
            "tax_rate": "0.09",
            "status": "issued",
            "attachments": [
                { "name": "开票扫描件.pdf", "url": "https://example.test/invoice.pdf" }
            ],
            "remark": "首期开票"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{issued}");
    let issued_id = issued["data"]["id"].as_str().expect("issued id");

    let (status, received) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{project_id}/received-invoices"),
        &token,
        json!({
            "supplier_name": "劳务分包单位",
            "invoice_no": "INV-IN-001",
            "invoice_date": "2026-06-11",
            "amount": "180000.00",
            "tax_rate": "0.03",
            "expense_type": "劳务成本",
            "status": "received",
            "remark": "劳务成本票"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{received}");
    let received_id = received["data"]["id"].as_str().expect("received id");

    let (status, collection) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{project_id}/collections"),
        &token,
        json!({
            "payer_name": "金融街建设单位",
            "issued_invoice_id": issued_id,
            "collection_date": "2026-06-20",
            "amount": "300000.00",
            "account_name": "基本户",
            "status": "confirmed",
            "remark": "首笔回款"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{collection}");

    let (status, payment) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{project_id}/payments"),
        &token,
        json!({
            "payee_name": "劳务分包单位",
            "received_invoice_id": received_id,
            "payment_date": "2026-06-22",
            "amount": "120000.00",
            "account_name": "基本户",
            "status": "confirmed",
            "remark": "劳务付款"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{payment}");

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/enterprise-projects/{project_id}/summary"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let summary = &body["data"];
    assert_eq!(summary["issued_invoice_amount_cents"], 50_000_000);
    assert_eq!(summary["received_invoice_amount_cents"], 18_000_000);
    assert_eq!(summary["collection_amount_cents"], 30_000_000);
    assert_eq!(summary["payment_amount_cents"], 12_000_000);
    assert_eq!(summary["cash_profit_cents"], 18_000_000);
    assert_eq!(summary["accounting_profit_cents"], 32_000_000);
    assert_eq!(summary["receivable_balance_cents"], 20_000_000);
    assert_eq!(summary["payable_balance_cents"], 6_000_000);

    for (module, expected_name) in [
        ("issued-invoices", "INV-OUT-001"),
        ("received-invoices", "INV-IN-001"),
        ("collections", "首笔回款"),
        ("payments", "劳务付款"),
    ] {
        let (status, body) = get_authed(
            app.clone(),
            &format!("/api/v1/admin/enterprise-projects/{project_id}/{module}?page=1&page_size=10"),
            &token,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["total"], 1);
        assert!(
            body["data"]["items"][0].to_string().contains(expected_name),
            "{body}"
        );
        if module == "issued-invoices" {
            assert_eq!(
                body["data"]["items"][0]["attachments"][0]["name"],
                "开票扫描件.pdf"
            );
        }

        let (status, _headers, bytes) = get_authed_bytes(
            app.clone(),
            &format!("/api/v1/admin/enterprise-projects/{project_id}/{module}/export"),
            &token,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let csv = String::from_utf8(bytes.to_vec()).expect("csv utf8");
        assert!(csv.contains(expected_name), "{csv}");
    }
}

#[tokio::test]
async fn financial_records_resolve_counterparty_and_own_entity_names_from_ids() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();
    let project_customer_id =
        create_enterprise_customer(app.clone(), &token, "南京江北建设集团").await;
    let supplier_id =
        create_enterprise_customer(app.clone(), &token, "江苏安源机械租赁有限公司").await;
    let owner_entity_id =
        create_enterprise_own_entity(app.clone(), &token, "山淮建设南京有限公司").await;
    let project_id = create_customer_project(
        app.clone(),
        &token,
        &project_customer_id,
        "主体关联经营项目",
        "100000.00",
    )
    .await;

    let (status, issued) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{project_id}/issued-invoices"),
        &token,
        json!({
            "counterparty_id": project_customer_id,
            "own_entity_id": owner_entity_id,
            "invoice_no": "OUT-LINK-001",
            "invoice_date": "2026-06-01",
            "amount": "10000.00",
            "status": "issued"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{issued}");
    assert_eq!(issued["data"]["counterparty_id"], project_customer_id);
    assert_eq!(issued["data"]["customer_name"], "南京江北建设集团");
    assert_eq!(issued["data"]["own_entity_id"], owner_entity_id);
    assert_eq!(issued["data"]["own_entity_name"], "山淮建设南京有限公司");
    let issued_id = issued["data"]["id"].as_str().expect("issued id");

    let (status, received) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{project_id}/received-invoices"),
        &token,
        json!({
            "counterparty_id": supplier_id,
            "own_entity_id": owner_entity_id,
            "invoice_no": "IN-LINK-001",
            "invoice_date": "2026-06-02",
            "amount": "3000.00",
            "status": "received"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{received}");
    assert_eq!(received["data"]["counterparty_id"], supplier_id);
    assert_eq!(
        received["data"]["supplier_name"],
        "江苏安源机械租赁有限公司"
    );
    assert_eq!(received["data"]["own_entity_name"], "山淮建设南京有限公司");
    let received_id = received["data"]["id"].as_str().expect("received id");

    let (status, collection) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{project_id}/collections"),
        &token,
        json!({
            "counterparty_id": project_customer_id,
            "own_entity_id": owner_entity_id,
            "issued_invoice_id": issued_id,
            "collection_date": "2026-06-10",
            "amount": "8000.00",
            "status": "confirmed"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{collection}");
    assert_eq!(collection["data"]["payer_name"], "南京江北建设集团");
    assert_eq!(
        collection["data"]["own_entity_name"],
        "山淮建设南京有限公司"
    );

    let (status, payment) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{project_id}/payments"),
        &token,
        json!({
            "counterparty_id": supplier_id,
            "own_entity_id": owner_entity_id,
            "received_invoice_id": received_id,
            "payment_date": "2026-06-12",
            "amount": "2000.00",
            "status": "confirmed"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{payment}");
    assert_eq!(payment["data"]["payee_name"], "江苏安源机械租赁有限公司");
    assert_eq!(payment["data"]["own_entity_name"], "山淮建设南京有限公司");

    let (status, body) = get_authed(
        app,
        &format!("/api/v1/admin/enterprise-projects/{project_id}/payments?keyword=安源"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["counterparty_id"], supplier_id);
}

#[tokio::test]
async fn enterprise_business_modules_keep_customer_supplier_and_own_entity_relationships() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();

    let buyer_id = create_enterprise_customer(app.clone(), &token, "南京江北建设集团").await;
    let supplier_id =
        create_enterprise_customer(app.clone(), &token, "杭州筑诚机械租赁有限公司").await;
    let own_entity_id =
        create_enterprise_own_entity(app.clone(), &token, "山淮建设南京分公司").await;
    let project_id = create_customer_project_with_own_entity(
        app.clone(),
        &token,
        &buyer_id,
        &own_entity_id,
        "南京江北商业配套改造",
        "100000.00",
    )
    .await;

    let (status, issued) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{project_id}/issued-invoices"),
        &token,
        json!({
            "counterparty_id": buyer_id,
            "own_entity_id": own_entity_id,
            "invoice_no": "OUT-FLOW-001",
            "invoice_date": "2026-06-01",
            "amount": "60000.00",
            "status": "issued"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{issued}");
    let issued_id = issued["data"]["id"].as_str().expect("issued id").to_owned();

    let (status, received) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{project_id}/received-invoices"),
        &token,
        json!({
            "counterparty_id": supplier_id,
            "own_entity_id": own_entity_id,
            "invoice_no": "IN-FLOW-001",
            "invoice_date": "2026-06-02",
            "expense_type": "机械租赁",
            "amount": "30000.00",
            "status": "received"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{received}");
    let received_id = received["data"]["id"]
        .as_str()
        .expect("received id")
        .to_owned();

    let (status, collection) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{project_id}/collections"),
        &token,
        json!({
            "counterparty_id": buyer_id,
            "own_entity_id": own_entity_id,
            "issued_invoice_id": issued_id,
            "collection_date": "2026-06-10",
            "amount": "50000.00",
            "account_name": "建设银行南京分行基本户",
            "status": "confirmed"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{collection}");
    let collection_id = collection["data"]["id"]
        .as_str()
        .expect("collection id")
        .to_owned();

    let (status, payment) = authed_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/enterprise-projects/{project_id}/payments"),
        &token,
        json!({
            "counterparty_id": supplier_id,
            "own_entity_id": own_entity_id,
            "received_invoice_id": received_id,
            "payment_date": "2026-06-12",
            "amount": "20000.00",
            "account_name": "建设银行南京分行基本户",
            "status": "confirmed"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{payment}");
    let payment_id = payment["data"]["id"]
        .as_str()
        .expect("payment id")
        .to_owned();

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/enterprise-projects?page=1&page_size=10&customer_id={buyer_id}&own_entity_id={own_entity_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["id"], project_id);

    for (module, counterparty_id, expected_no) in [
        ("issued-invoices", buyer_id.as_str(), "OUT-FLOW-001"),
        ("received-invoices", supplier_id.as_str(), "IN-FLOW-001"),
        ("collections", buyer_id.as_str(), "建设银行南京分行基本户"),
        ("payments", supplier_id.as_str(), "建设银行南京分行基本户"),
    ] {
        let (status, body) = get_authed(
            app.clone(),
            &format!("/api/v1/admin/enterprise-projects/{project_id}/{module}?page=1&page_size=10&customer_id={counterparty_id}&own_entity_id={own_entity_id}"),
            &token,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["total"], 1);
        assert!(
            body["data"]["items"][0].to_string().contains(expected_no),
            "{body}"
        );
    }

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/enterprise-customers/{buyer_id}/summary?year=2026"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["project_count"], 1);
    assert_eq!(body["data"]["contract_amount_cents"], 10_000_000);
    assert_eq!(body["data"]["issued_invoice_amount_cents"], 6_000_000);
    assert_eq!(body["data"]["collection_amount_cents"], 5_000_000);
    assert_eq!(body["data"]["received_invoice_amount_cents"], 0);
    assert_eq!(body["data"]["payment_amount_cents"], 0);

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/enterprise-customers/{supplier_id}/summary?year=2026"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["project_count"], 0);
    assert_eq!(body["data"]["received_invoice_amount_cents"], 3_000_000);
    assert_eq!(body["data"]["payment_amount_cents"], 2_000_000);

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/enterprise-customers/{supplier_id}"),
        &token,
        json!({ "name": "杭州筑诚设备服务有限公司" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = authed_json(
        app.clone(),
        "PATCH",
        &format!("/api/v1/admin/enterprise-own-entities/{own_entity_id}"),
        &token,
        json!({ "name": "山淮建设华东有限公司" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/enterprise-projects/{project_id}/received-invoices?page=1&page_size=10&customer_id={supplier_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body["data"]["items"][0]["supplier_name"],
        "杭州筑诚设备服务有限公司"
    );
    assert_eq!(
        body["data"]["items"][0]["own_entity_name"],
        "山淮建设华东有限公司"
    );

    let (status, body) = get_authed(
        app.clone(),
        &format!(
            "/api/v1/admin/enterprise-projects?page=1&page_size=10&own_entity_id={own_entity_id}"
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body["data"]["items"][0]["own_entity_name"],
        "山淮建设华东有限公司"
    );

    let (status, _headers, bytes) = get_authed_bytes(
        app.clone(),
        "/api/v1/admin/enterprise-customers/export?keyword=筑诚",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let csv = String::from_utf8(bytes.to_vec()).expect("csv utf8");
    assert!(csv.contains("杭州筑诚设备服务有限公司"), "{csv}");

    let (status, _headers, bytes) = get_authed_bytes(
        app.clone(),
        "/api/v1/admin/enterprise-own-entities/export?keyword=华东",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let csv = String::from_utf8(bytes.to_vec()).expect("csv utf8");
    assert!(csv.contains("山淮建设华东有限公司"), "{csv}");

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/enterprise-projects/{project_id}/payments/{payment_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = get_authed(
        app.clone(),
        &format!("/api/v1/admin/enterprise-projects/{project_id}/payments?page=1&page_size=10"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 0);

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/enterprise-projects/{project_id}/collections/{collection_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = delete_authed(
        app.clone(),
        &format!("/api/v1/admin/enterprise-customers/{supplier_id}"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = get_authed(
        app,
        "/api/v1/admin/enterprise-customers?page=1&page_size=10&keyword=筑诚",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 0);
}

#[tokio::test]
async fn project_financial_records_filter_and_export_by_business_date_range() {
    let (app, _c) = build_test_app().await;
    let token = admin_token();
    let project_id = create_enterprise_project(app.clone(), &token, "日期筛选经营项目").await;

    for (invoice_no, invoice_date, amount) in [
        ("INV-RANGE-OLD", "2026-05-31", "1000.00"),
        ("INV-RANGE-IN", "2026-06-10", "2000.00"),
        ("INV-RANGE-LATE", "2026-07-01", "3000.00"),
    ] {
        let (status, body) = authed_json(
            app.clone(),
            "POST",
            &format!("/api/v1/admin/enterprise-projects/{project_id}/issued-invoices"),
            &token,
            json!({
                "customer_name": "日期筛选客户",
                "invoice_no": invoice_no,
                "invoice_date": invoice_date,
                "amount": amount,
                "status": "issued"
            }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
    }

    let filtered_uri = format!(
        "/api/v1/admin/enterprise-projects/{project_id}/issued-invoices?page=1&page_size=10&date_from=2026-06-01&date_to=2026-06-30"
    );
    let (status, body) = get_authed(app.clone(), &filtered_uri, &token).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 1);
    assert_eq!(body["data"]["items"][0]["invoice_no"], "INV-RANGE-IN");

    let export_uri = format!(
        "/api/v1/admin/enterprise-projects/{project_id}/issued-invoices/export?date_from=2026-06-01&date_to=2026-06-30"
    );
    let (status, _headers, bytes) = get_authed_bytes(app, &export_uri, &token).await;
    assert_eq!(status, StatusCode::OK);
    let csv = String::from_utf8(bytes.to_vec()).expect("csv utf8");
    assert!(csv.contains("INV-RANGE-IN"), "{csv}");
    assert!(!csv.contains("INV-RANGE-OLD"), "{csv}");
    assert!(!csv.contains("INV-RANGE-LATE"), "{csv}");
}
