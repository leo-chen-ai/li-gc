mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use quax::feature::auth::{Role, utils::jwt::create_token_pair};
use serde_json::{Value, json};
use uuid::Uuid;

use common::*;

fn admin_token(user_id: Uuid) -> String {
    create_token_pair(user_id, "report-admin@example.com", &[Role::Admin])
        .expect("admin token")
        .access_token
}

fn user_token(user_id: Uuid, email: &str) -> String {
    create_token_pair(user_id, email, &[Role::User])
        .expect("user token")
        .access_token
}

async fn request_json(
    app: axum::Router,
    method: &str,
    uri: &str,
    token: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"));
    let body = if let Some(value) = body {
        builder = builder.header(header::CONTENT_TYPE, "application/json");
        Body::from(value.to_string())
    } else {
        Body::empty()
    };
    let (status, _, json) = raw_request(app, builder.body(body).unwrap()).await;
    (status, json)
}

fn config_payload(lifecycle_status: &str, is_enabled: bool) -> Value {
    json!({
        "name": "宁波日报送",
        "source_base_url": "http://tg.91jtg.com/path-is-normalized",
        "source_username": "  source-account  ",
        "source_password": "  source-secret  ",
        "project_mode": "all",
        "include_projects": [],
        "exclude_projects": ["排除项目"],
        "target_base_url": "https://www.zjzwfw.gov.cn/ignored-path",
        "target_username": "  13800000000  ",
        "target_password": "  target-secret  ",
        "verification_type": "feishu",
        "verification_config": {
            "app_id": "cli_test",
            "app_secret": "  feishu-secret  ",
            "chat_id": "oc_test"
        },
        "schedule_time": "23:00",
        "schedule_timezone": "Asia/Shanghai",
        "lifecycle_status": lifecycle_status,
        "is_enabled": is_enabled,
        "settings": {
            "headless": true,
            "upload_timeout_minutes": 15,
            "label": "  daily report  "
        },
        "remark": "  integration test  "
    })
}

#[tokio::test]
async fn custom_role_menu_controls_report_forward_access() {
    let (app, pool, _container) = build_test_app_with_pool().await;
    let role_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO role_configs (code,name,description) VALUES ('shujubaosong','数据报送','报送角色') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("create custom role");
    sqlx::query(
        "INSERT INTO role_menu_permissions (role_id,menu_key) VALUES ($1,'data_reporting')",
    )
    .bind(role_id)
    .execute(&pool)
    .await
    .expect("grant report forwarding menu");

    let permitted_user_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO users (email,username,role,is_active,email_verified) VALUES ('bao1@example.com','bao1','shujubaosong',TRUE,TRUE) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("create permitted user");
    let permitted_token = user_token(permitted_user_id, "bao1@example.com");

    let (status, permissions) = request_json(
        app.clone(),
        "GET",
        "/api/v1/management/role-permissions",
        &permitted_token,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{permissions}");
    assert_eq!(permissions["data"]["code"], "shujubaosong");
    assert_eq!(permissions["data"]["menu_keys"], json!(["data_reporting"]));

    let (status, summary) = request_json(
        app.clone(),
        "GET",
        "/api/v1/management/report-forward/summary",
        &permitted_token,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{summary}");

    let (status, projects) = request_json(
        app.clone(),
        "GET",
        "/api/v1/management/projects",
        &permitted_token,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{projects}");

    let denied_user_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO users (email,username,role,is_active,email_verified) VALUES ('plain@example.com','plain','user',TRUE,TRUE) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("create unpermitted user");
    let denied_token = user_token(denied_user_id, "plain@example.com");
    let (status, denied) = request_json(
        app,
        "GET",
        "/api/v1/management/report-forward/summary",
        &denied_token,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{denied}");
}

#[tokio::test]
async fn report_forward_config_secrets_and_run_guards_work() {
    let (app, pool, _container) = build_test_app_with_pool().await;
    let user_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO users (email, username, role, is_active, email_verified) VALUES ('report-admin@example.com','report_admin','admin',TRUE,TRUE) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("create report admin");
    let token = admin_token(user_id);

    let (status, created) = request_json(
        app.clone(),
        "POST",
        "/api/v1/admin/report-forward/configs",
        &token,
        Some(config_payload("testing", false)),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let config = &created["data"];
    let config_id = config["id"].as_str().expect("config id");
    assert_eq!(config["source_base_url"], "http://tg.91jtg.com");
    assert_eq!(config["target_base_url"], "https://www.zjzwfw.gov.cn");
    assert_eq!(config["source_username"], "source-account");
    assert_eq!(config["target_username"], "13800000000");
    assert_eq!(config["settings"]["label"], "daily report");
    assert_eq!(config["remark"], "integration test");
    assert_eq!(config["source_password_configured"], true);
    assert_eq!(config["target_password_configured"], true);
    assert!(config.get("source_password_cipher").is_none());
    assert!(config.get("target_password_cipher").is_none());
    assert!(config.get("verification_config_cipher").is_none());

    let (status, detail) = request_json(
        app.clone(),
        "GET",
        &format!("/api/v1/admin/report-forward/configs/{config_id}"),
        &token,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{detail}");
    assert_eq!(detail["data"]["source_password"], "source-secret");
    assert_eq!(detail["data"]["target_password"], "target-secret");
    assert_eq!(
        detail["data"]["verification_config"]["app_secret"],
        "feishu-secret"
    );
    assert!(detail["data"].get("source_password_cipher").is_none());
    assert!(detail["data"].get("target_password_cipher").is_none());
    assert!(detail["data"].get("verification_config_cipher").is_none());

    let decrypted = sqlx::query_as::<_, (String, String, String)>(
        "SELECT pgp_sym_decrypt(source_password_cipher,$2), pgp_sym_decrypt(target_password_cipher,$2), pgp_sym_decrypt(verification_config_cipher,$2) FROM report_forward_configs WHERE id=$1",
    )
    .bind(Uuid::parse_str(config_id).unwrap())
    .bind("test-report-forward-credential-key-32-chars")
    .fetch_one(&pool)
    .await
    .expect("decrypt stored credentials");
    assert_eq!(decrypted.0, "source-secret");
    assert_eq!(decrypted.1, "target-secret");
    assert!(decrypted.2.contains("feishu-secret"));

    let (status, production_denied) = request_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/report-forward/configs/{config_id}/runs"),
        &token,
        Some(json!({"run_mode": "production", "options": {}})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{production_denied}");

    let (status, test_run) = request_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/report-forward/configs/{config_id}/runs"),
        &token,
        Some(json!({"run_mode": "test_source_login", "options": {}})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{test_run}");
    assert_eq!(test_run["data"]["status"], "pending");
    assert_eq!(test_run["data"]["trigger_type"], "test");
    assert_eq!(test_run["data"]["options"]["worker_target"], "k3s");
    let data_time_from = test_run["data"]["data_time_from_beijing"]
        .as_str()
        .expect("Beijing data range start");
    let data_time_to = test_run["data"]["data_time_to_beijing"]
        .as_str()
        .expect("Beijing data range end");
    assert_eq!(data_time_from.len(), 10);
    assert_eq!(data_time_to.len(), 10);
    assert_eq!(
        test_run["data"]["options"]["data_time_from_beijing"],
        data_time_from
    );
    assert_eq!(
        test_run["data"]["options"]["data_time_to_beijing"],
        data_time_to
    );
    let run_id = Uuid::parse_str(test_run["data"]["id"].as_str().unwrap()).unwrap();
    let project_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO report_forward_run_projects(run_id,external_project_name) VALUES($1,'测试项目') RETURNING id",
    )
    .bind(run_id)
    .fetch_one(&pool)
    .await
    .expect("create run project");
    for (index, (name, status)) in [
        ("成功人员", "submitted"),
        ("失败人员", "failed"),
        ("未知人员", "result_unknown"),
    ]
    .into_iter()
    .enumerate()
    {
        sqlx::query(
            r#"INSERT INTO report_forward_items
               (run_id,run_project_id,source_row_no,person_name,gender,identity_cipher,identity_fingerprint,phone_cipher,status,last_error)
               VALUES($1,$2,$3,$4,'男',pgp_sym_encrypt($5,$6,'cipher-algo=aes256'),$7,
                      pgp_sym_encrypt($8,$6,'cipher-algo=aes256'),$9,$10)"#,
        )
        .bind(run_id)
        .bind(project_id)
        .bind(index as i32 + 3)
        .bind(name)
        .bind(format!("3300001990010100{index}"))
        .bind("test-report-forward-credential-key-32-chars")
        .bind(format!("fingerprint-{index}"))
        .bind(format!("1380000000{index}"))
        .bind(status)
        .bind(if status == "failed" { Some("字段校验失败") } else { None })
        .execute(&pool)
        .await
        .expect("create report item");
    }
    sqlx::query(
        "UPDATE report_forward_runs SET success_count=1,failure_count=3,item_count=4 WHERE id=$1",
    )
    .bind(run_id)
    .execute(&pool)
    .await
    .expect("set run result counts");
    sqlx::query(
        r#"INSERT INTO report_forward_items
           (run_id,run_project_id,source_row_no,person_name,identity_fingerprint,status,target_result)
           VALUES($1,$2,6,'已存在人员','fingerprint-already','failed',jsonb_build_object('already_exists',TRUE))"#,
    )
        .bind(run_id)
        .bind(project_id)
        .execute(&pool)
        .await
        .expect("mark already reported item");
    sqlx::query("UPDATE report_forward_items SET last_error='备案日期晚于允许的最后时间' WHERE run_id=$1 AND person_name='未知人员'")
        .bind(run_id)
        .execute(&pool)
        .await
        .expect("mark record time skip");

    let (status, run_list) = request_json(
        app.clone(),
        "GET",
        "/api/v1/admin/report-forward/runs?page=1&page_size=10",
        &token,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{run_list}");
    assert_eq!(run_list["data"]["items"][0]["reported_success_count"], 1);
    assert_eq!(run_list["data"]["items"][0]["skipped_count"], 3);
    assert_eq!(run_list["data"]["items"][0]["already_reported_count"], 1);
    assert_eq!(run_list["data"]["items"][0]["record_time_skipped_count"], 1);
    assert_eq!(run_list["data"]["items"][0]["other_skipped_count"], 1);
    assert_eq!(
        run_list["data"]["items"][0]["data_time_from_beijing"],
        data_time_from
    );
    assert_eq!(
        run_list["data"]["items"][0]["data_time_to_beijing"],
        data_time_to
    );

    let (status, result) = request_json(
        app.clone(),
        "GET",
        &format!("/api/v1/admin/report-forward/items?run_id={run_id}&outcome=success&page_size=50"),
        &token,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(result["data"]["total"], 1);
    assert_eq!(result["data"]["counts"]["all"], 4);
    assert_eq!(result["data"]["counts"]["success"], 1);
    assert_eq!(result["data"]["counts"]["failed"], 2);
    assert_eq!(result["data"]["counts"]["unknown"], 1);
    assert_eq!(result["data"]["items"][0]["person_name"], "成功人员");
    assert_eq!(
        result["data"]["items"][0]["identity_masked"],
        "330000*******1000"
    );

    let export_request = Request::builder()
        .method("GET")
        .uri(format!(
            "/api/v1/admin/report-forward/runs/{run_id}/items/export?outcome=failed"
        ))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let (status, headers, _) = raw_request(app.clone(), export_request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers.get(header::CONTENT_TYPE).unwrap(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    assert!(
        headers
            .get(header::CONTENT_DISPOSITION)
            .unwrap()
            .to_str()
            .unwrap()
            .contains("%2Exlsx")
    );

    let (status, transform_denied) = request_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/report-forward/configs/{config_id}/runs"),
        &token,
        Some(json!({"run_mode": "test_transform", "options": {}})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{transform_denied}");

    let mut production = config_payload("production", true);
    production["source_password"] = Value::Null;
    production["target_password"] = Value::Null;
    production["verification_config"] = Value::Null;
    let (status, updated) = request_json(
        app.clone(),
        "PUT",
        &format!("/api/v1/admin/report-forward/configs/{config_id}"),
        &token,
        Some(production),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["data"]["is_enabled"], true);
    assert!(!updated["data"]["next_run_at"].is_null());

    let (status, summary) = request_json(
        app,
        "GET",
        "/api/v1/admin/report-forward/summary",
        &token,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{summary}");
    assert_eq!(summary["data"]["config_count"], 1);
    assert_eq!(summary["data"]["enabled_config_count"], 1);
    assert_eq!(summary["data"]["queued_count"], 1);
}

#[tokio::test]
async fn huaxing_manual_configuration_and_verification_lifecycle() {
    let (app, pool, _container) = build_test_app_with_pool().await;
    let owner = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO users(email,username,role,is_active) VALUES('manual@example.com','manual_owner','admin',TRUE) RETURNING id",
    ).fetch_one(&pool).await.unwrap();
    let token = admin_token(owner);
    let mut payload = config_payload("production", true);
    payload["adapter"] = json!("huaxing_zjzwfw");
    payload["source_base_url"] = json!("https://hx99.xin/login?redirect=/");
    payload["verification_type"] = json!("manual");
    payload["verification_config"] = Value::Null;
    let (status, created) = request_json(
        app.clone(),
        "POST",
        "/api/v1/admin/report-forward/configs",
        &token,
        Some(payload.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!(created["data"]["adapter"], "huaxing_zjzwfw");
    assert_eq!(created["data"]["is_enabled"], false);
    assert!(created["data"]["next_run_at"].is_null());
    let config_id = created["data"]["id"].as_str().unwrap();
    let (status, run) = request_json(
        app.clone(),
        "POST",
        &format!("/api/v1/admin/report-forward/configs/{config_id}/runs"),
        &token,
        Some(json!({"run_mode":"production"})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{run}");
    let run_id = Uuid::parse_str(run["data"]["id"].as_str().unwrap()).unwrap();
    sqlx::query("UPDATE report_forward_runs SET status='running',current_stage='waiting_verification' WHERE id=$1")
        .bind(run_id).execute(&pool).await.unwrap();
    let request_id = sqlx::query_scalar::<_, Uuid>("INSERT INTO report_forward_verifications(run_id,expires_at) VALUES($1,NOW()+INTERVAL '2 minutes') RETURNING id")
        .bind(run_id).fetch_one(&pool).await.unwrap();
    let endpoint = format!("/api/v1/admin/report-forward/runs/{run_id}/verification");
    for code in ["123", "12a456", "1234567"] {
        let (status, _) = request_json(
            app.clone(),
            "POST",
            &endpoint,
            &token,
            Some(json!({"request_id":request_id,"code":code})),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }
    let (status, _) = request_json(
        app.clone(),
        "POST",
        &endpoint,
        &token,
        Some(json!({"request_id":Uuid::new_v4(),"code":"123456"})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = request_json(
        app.clone(),
        "POST",
        &endpoint,
        &token,
        Some(json!({"request_id":request_id,"code":"123456"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = request_json(
        app.clone(),
        "POST",
        &endpoint,
        &token,
        Some(json!({"request_id":request_id,"code":"654321"})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (_, detail) = request_json(
        app.clone(),
        "GET",
        &format!("/api/v1/admin/report-forward/runs/{run_id}"),
        &token,
        None,
    )
    .await;
    assert_eq!(detail["data"]["verification_request"]["submitted"], true);
    assert!(!detail.to_string().contains("123456"));
    assert!(!detail.to_string().contains("code_cipher"));
    // Another permitted account cannot submit a code for this user's task.
    let other = sqlx::query_scalar::<_, Uuid>("INSERT INTO users(email,username,role,is_active) VALUES('other-manual@example.com','other_manual','admin',TRUE) RETURNING id")
        .fetch_one(&pool).await.unwrap();
    sqlx::query("UPDATE report_forward_verifications SET code_cipher=NULL WHERE run_id=$1")
        .bind(run_id)
        .execute(&pool)
        .await
        .unwrap();
    let (status, _) = request_json(
        app.clone(),
        "POST",
        &endpoint,
        &admin_token(other),
        Some(json!({"request_id":request_id,"code":"123456"})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    sqlx::query("UPDATE report_forward_verifications SET expires_at=NOW()-INTERVAL '1 second' WHERE run_id=$1").bind(run_id).execute(&pool).await.unwrap();
    let (status, _) = request_json(
        app.clone(),
        "POST",
        &endpoint,
        &token,
        Some(json!({"request_id":request_id,"code":"123456"})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    sqlx::query("UPDATE report_forward_verifications SET expires_at=NOW()+INTERVAL '2 minutes' WHERE run_id=$1").bind(run_id).execute(&pool).await.unwrap();
    sqlx::query("UPDATE report_forward_runs SET cancel_requested=TRUE WHERE id=$1")
        .bind(run_id)
        .execute(&pool)
        .await
        .unwrap();
    let (status, _) = request_json(
        app.clone(),
        "POST",
        &endpoint,
        &token,
        Some(json!({"request_id":request_id,"code":"123456"})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    sqlx::query("UPDATE report_forward_runs SET cancel_requested=FALSE WHERE id=$1")
        .bind(run_id)
        .execute(&pool)
        .await
        .unwrap();
    let (status, _) = request_json(
        app.clone(),
        "POST",
        &endpoint,
        &token,
        Some(json!({"request_id":request_id,"code":"123456"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let stored: String = sqlx::query_scalar(
        "SELECT pgp_sym_decrypt(code_cipher,$2) FROM report_forward_verifications WHERE run_id=$1",
    )
    .bind(run_id)
    .bind(std::env::var("REPORT_FORWARD_CREDENTIAL_KEY").unwrap())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(stored, "123456");
    let missing_comments: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pg_attribute WHERE attrelid='report_forward_verifications'::regclass AND attnum>0 AND NOT attisdropped AND col_description(attrelid,attnum) IS NULL")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(missing_comments, 0);
    let comment: Option<String> =
        sqlx::query_scalar("SELECT obj_description('report_forward_verifications'::regclass)")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(comment.is_some());
    sqlx::raw_sql(include_str!(
        "../migrations/065_report_manual_verification.down.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!(
        "../migrations/065_report_manual_verification.up.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();

    // The source URL cannot be pointed at arbitrary hosts.
    payload["name"] = json!("invalid-source");
    payload["source_base_url"] = json!("http://127.0.0.1");
    let (status, _) = request_json(
        app,
        "POST",
        "/api/v1/admin/report-forward/configs",
        &token,
        Some(payload),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
