mod common;

use std::sync::Arc;

use axum::{body::Body, http::Request};
use serde_json::Value;
use uuid::Uuid;

use common::{BodyExt, ServiceExt, build_test_app_with_pool, build_test_state_with_pool};
use quax::{
    feature::device_mqtt::issuer::issue_single_worker_via_broker,
    infrastructure::storage::LocalStorage, routes::app_routes,
};

async fn get_json(app: axum::Router, uri: &str) -> (axum::http::StatusCode, Value) {
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(uri)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}

async fn post_photo_json(
    app: axum::Router,
    payload: &Value,
    ts: Option<i64>,
) -> (axum::http::StatusCode, Value) {
    let mut request = Request::builder()
        .method("POST")
        .uri("/photo")
        .header("content-type", "application/json");
    if let Some(ts) = ts {
        request = request.header("ts", ts.to_string());
    }
    let response = app
        .oneshot(request.body(Body::from(payload.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}

async fn post_quality_json(
    app: axum::Router,
    payload: &Value,
    ts: Option<i64>,
) -> (axum::http::StatusCode, Value) {
    let mut request = Request::builder()
        .method("POST")
        .uri("/quality")
        .header("content-type", "application/json");
    if let Some(ts) = ts {
        request = request.header("ts", ts.to_string());
    }
    let response = app
        .oneshot(request.body(Body::from(payload.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}

async fn post_attendance_results_json(
    app: axum::Router,
    payload: &Value,
) -> (axum::http::StatusCode, Value) {
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/attendance-results")
                .header("content-type", "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
async fn b_vendor_workers_support_registered_device_full_and_incremental_downloads() {
    let (app, pool, _container) = build_test_app_with_pool().await;

    let project_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_projects (name, status) VALUES ('B厂家测试项目', 1) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let unit_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_units (project_id, company_name) VALUES ($1, '测试单位') RETURNING id",
    )
    .bind(project_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let team_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_teams (project_id, unit_id, name, work_type) VALUES ($1, $2, '测试班组', 900) RETURNING id",
    )
    .bind(project_id)
    .bind(unit_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    sqlx::query(
        r#"
        INSERT INTO construction_attendance_devices (project_id, device_type, serial_number)
        VALUES ($1, 'B厂家', 'B-DEVICE-001'), ($1, 'A厂家', 'A-DEVICE-001')
        "#,
    )
    .bind(project_id)
    .execute(&pool)
    .await
    .unwrap();

    let active_worker_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO construction_workers (
            project_id, unit_id, team_id, name, id_card, avatar, work_status, updated_at
        ) VALUES (
            $1, $2, $3, '在场人员', '330200199001010011',
            'https://example.test/active.jpg', 1, to_timestamp(1000)
        )
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(unit_id)
    .bind(team_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let exited_worker_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO construction_workers (
            project_id, unit_id, team_id, name, id_card, work_status, updated_at
        ) VALUES (
            $1, $2, $3, '退场人员', '330200199001010022', 2, to_timestamp(2000)
        )
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(unit_id)
    .bind(team_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let deleted_worker_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO construction_workers (
            project_id, unit_id, team_id, name, id_card, work_status, updated_at
        ) VALUES (
            $1, $2, $3, '已删除人员', '330200199001010033', 1, to_timestamp(1200)
        )
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(unit_id)
    .bind(team_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("DELETE FROM construction_workers WHERE id = $1")
        .bind(deleted_worker_id)
        .execute(&pool)
        .await
        .unwrap();

    for (platform_code, external_id) in [
        ("zhenhai", "ZH-USER-001"),
        ("ningbo_housing", "NB-WORKER-001"),
    ] {
        sqlx::query(
            r#"
            INSERT INTO integration_person_identities (
                platform_id, identity_type, identity_value, external_person_id, updated_at
            )
            SELECT id, 'id_card', '330200199001010011', $2, to_timestamp(1100)
            FROM integration_platforms
            WHERE code = $1 AND is_deleted = FALSE
            "#,
        )
        .bind(platform_code)
        .bind(external_id)
        .execute(&pool)
        .await
        .unwrap();
    }

    let (status, full) = get_json(
        app.clone(),
        "/workers?deviceId=B-DEVICE-001&productId=1&update=0",
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "{full}");
    assert_eq!(full["success"], true);
    assert_eq!(full["event"], "workers");
    assert_eq!(full["data"].as_array().unwrap().len(), 1);
    assert_eq!(full["data"][0]["workerId"], active_worker_id.to_string());
    assert_eq!(full["data"][0]["userId"], "ZH-USER-001");
    assert_eq!(full["data"][0]["workerCode"], "NB-WORKER-001");
    assert!(full["data"][0].get("del").is_none());

    let pull_report = sqlx::query_as::<_, (String, String, String, String)>(
        r#"
        SELECT report.status, report.action, report.serial_number, report.remark
        FROM construction_attendance_device_issue_reports report
        WHERE report.worker_id = $1 AND report.is_deleted = FALSE
        "#,
    )
    .bind(active_worker_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(pull_report.0, "success");
    assert_eq!(pull_report.1, "update");
    assert_eq!(pull_report.2, "B-DEVICE-001");
    assert_eq!(pull_report.3, "B厂家设备主动拉取人员");

    let device_presence = sqlx::query_as::<
        _,
        (
            String,
            Option<chrono::DateTime<chrono::Utc>>,
            Option<chrono::DateTime<chrono::Utc>>,
            Option<chrono::DateTime<chrono::Utc>>,
        ),
    >(
        r#"
        SELECT online_status, last_seen_at, last_online_at, last_heartbeat_at
        FROM construction_attendance_devices
        WHERE serial_number = 'B-DEVICE-001'
        "#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(device_presence.0, "online");
    assert!(
        device_presence.1.is_some(),
        "/workers应更新B厂家最后通信时间"
    );
    assert!(
        device_presence.2.is_some(),
        "/workers应更新B厂家最后在线时间"
    );
    assert!(
        device_presence.3.is_none(),
        "B厂家不应写入A厂家的MQTT心跳时间"
    );

    sqlx::query("UPDATE construction_workers SET name = '在场人员已修改' WHERE id = $1")
        .bind(active_worker_id)
        .execute(&pool)
        .await
        .unwrap();

    let (status, incremental) =
        get_json(app.clone(), "/workers?deviceId=B-DEVICE-001&update=1500").await;
    assert_eq!(status, axum::http::StatusCode::OK, "{incremental}");
    let incremental_rows = incremental["data"].as_array().unwrap();
    assert_eq!(incremental_rows.len(), 3);
    assert!(incremental_rows.iter().any(|worker| {
        worker["workerId"] == active_worker_id.to_string()
            && worker["name"] == "在场人员已修改"
            && worker["del"] == "0"
    }));
    assert!(incremental_rows.iter().any(|worker| {
        worker["workerId"] == exited_worker_id.to_string() && worker["del"] == "1"
    }));
    assert!(incremental_rows.iter().any(|worker| {
        worker["workerId"] == deleted_worker_id.to_string()
            && worker["name"] == "已删除人员"
            && worker["del"] == "1"
    }));

    let (status, unknown_device) = get_json(app.clone(), "/workers?deviceId=A-DEVICE-001").await;
    assert_eq!(status, axum::http::StatusCode::NOT_FOUND);
    assert_eq!(unknown_device["success"], false);

    let (status, invalid_update) = get_json(app, "/workers?deviceId=B-DEVICE-001&update=bad").await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST);
    assert_eq!(invalid_update["success"], false);
}

#[tokio::test]
async fn b_vendor_quality_feedback_is_visible_as_idempotent_issue_reports() {
    let (app, pool, _container) = build_test_app_with_pool().await;

    let project_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_projects (name, status) VALUES ('B厂家照片质量项目', 1) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let unit_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_units (project_id, company_name) VALUES ($1, '照片质量单位') RETURNING id",
    )
    .bind(project_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let team_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_teams (project_id, unit_id, name, work_type) VALUES ($1, $2, '照片质量班组', 900) RETURNING id",
    )
    .bind(project_id)
    .bind(unit_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let device_record_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO construction_attendance_devices (
            project_id, device_type, serial_number, device_name, direction
        ) VALUES ($1, 'B厂家', 'B-QUALITY-001', 'B厂家质量测试机', 0)
        RETURNING id
        "#,
    )
    .bind(project_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let worker_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO construction_workers (
            project_id, unit_id, team_id, name, id_card, phone, avatar, work_status
        ) VALUES (
            $1, $2, $3, '照片质量人员', '330200199001010044', '13800000000',
            NULL, 1
        )
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(unit_id)
    .bind(team_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let issue_error = issue_single_worker_via_broker(
        &pool,
        None,
        project_id,
        worker_id,
        device_record_id,
        "create",
        None,
        Some("人员新增后自动下发"),
    )
    .await
    .unwrap_err();
    assert!(issue_error.contains("不支持服务端下发"));

    let report_count_before_pull = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM construction_attendance_device_issue_reports WHERE worker_id = $1",
    )
    .bind(worker_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(report_count_before_pull, 0, "设备拉取前不应提前显示成功");

    let (workers_status, workers) = get_json(
        app.clone(),
        "/workers?deviceId=B-QUALITY-001&productId=1&update=0",
    )
    .await;
    assert_eq!(workers_status, axum::http::StatusCode::OK, "{workers}");
    assert_eq!(workers["data"][0]["workerId"], worker_id.to_string());

    let default_report_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM construction_attendance_device_issue_reports WHERE worker_id = $1 AND attendance_device_id = $2 AND is_deleted = FALSE",
    )
    .bind(worker_id)
    .bind(device_record_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let default_report = sqlx::query_as::<_, (String, Option<String>, Option<Value>)>(
        r#"
        SELECT status, mqtt_message_id, request_payload
        FROM construction_attendance_device_issue_reports
        WHERE id = $1
        "#,
    )
    .bind(default_report_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(default_report.0, "success");
    assert!(default_report.1.is_none());
    assert!(default_report.2.is_none());
    let mqtt_message_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM device_mqtt_messages WHERE attendance_device_id = $1",
    )
    .bind(device_record_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(mqtt_message_count, 0, "B厂家下发记录不应产生MQTT消息");

    let failed_payload = serde_json::json!({
        "productId": "1",
        "deviceId": "B-QUALITY-001",
        "data": [{
            "workerId": worker_id,
            "name": "照片质量人员",
            "plat": "face",
            "msg": "image exceeds limit",
            "code": "5"
        }]
    });

    let (status, failed) = post_quality_json(app.clone(), &failed_payload, None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "{failed}");
    assert_eq!(failed["success"], true);
    assert_eq!(failed["event"], "quality");
    assert_eq!(failed["data"][0]["workerId"], worker_id.to_string());

    let report = sqlx::query_as::<
        _,
        (
            Uuid,
            Uuid,
            Uuid,
            String,
            String,
            String,
            Option<chrono::DateTime<chrono::Utc>>,
            Value,
            Value,
        ),
    >(
        r#"
        SELECT id, worker_id, attendance_device_id, device_type, action, status,
               acknowledged_at, request_payload, response_payload
        FROM construction_attendance_device_issue_reports
        WHERE worker_id = $1 AND attendance_device_id = $2 AND is_deleted = FALSE
        "#,
    )
    .bind(worker_id)
    .bind(device_record_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(report.0, default_report_id);
    assert_eq!(report.1, worker_id);
    assert_eq!(report.2, device_record_id);
    assert_eq!(report.3, "B厂家");
    assert_eq!(report.4, "update");
    assert_eq!(report.5, "failed");
    assert!(report.6.is_some());
    assert_eq!(report.7["data"]["code"], "5");
    assert_eq!(report.8["source"], "device_vendor_b_quality");
    assert_eq!(report.8["event"], "quality");
    let fallback_timestamp_millis = report.7["ts"].as_str().unwrap().parse::<i64>().unwrap();

    sqlx::query(
        r#"
        INSERT INTO construction_attendance_device_issue_reports (
            project_id, worker_id, attendance_device_id,
            worker_name, device_name, serial_number, device_type,
            action, status, issued_at, message, remark,
            request_payload, response_payload, acknowledged_at
        )
        SELECT project_id, worker_id, attendance_device_id,
               worker_name, device_name, serial_number, device_type,
               'update', status, NOW(), message, 'B厂家设备拉取人员后的照片质量反馈',
               request_payload, response_payload, NOW()
        FROM construction_attendance_device_issue_reports
        WHERE id = $1
        "#,
    )
    .bind(default_report_id)
    .execute(&pool)
    .await
    .unwrap();
    let duplicate_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM construction_attendance_device_issue_reports WHERE worker_id = $1 AND attendance_device_id = $2 AND is_deleted = FALSE",
    )
    .bind(worker_id)
    .bind(device_record_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(duplicate_count, 2);

    let (retry_status, retry) = post_quality_json(app.clone(), &failed_payload, None).await;
    assert_eq!(retry_status, axum::http::StatusCode::OK, "{retry}");
    let report_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM construction_attendance_device_issue_reports WHERE worker_id = $1 AND attendance_device_id = $2 AND is_deleted = FALSE",
    )
    .bind(worker_id)
    .bind(device_record_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(report_count, 1, "同一时间戳的设备重试不应产生重复记录");

    let success_payload = serde_json::json!({
        "productId": 1,
        "deviceId": "B-QUALITY-001",
        "data": {
            "workerId": worker_id,
            "name": "照片质量人员",
            "plat": "face",
            "msg": "",
            "code": 0
        }
    });
    let (success_status, success) =
        post_quality_json(app, &success_payload, Some(fallback_timestamp_millis + 1)).await;
    assert_eq!(success_status, axum::http::StatusCode::OK, "{success}");
    assert_eq!(success["event"], "quality");

    let mut statuses = sqlx::query_scalar::<_, String>(
        r#"
        SELECT status
        FROM construction_attendance_device_issue_reports
        WHERE worker_id = $1 AND attendance_device_id = $2 AND is_deleted = FALSE
        ORDER BY issued_at DESC
        "#,
    )
    .bind(worker_id)
    .bind(device_record_id)
    .fetch_all(&pool)
    .await
    .unwrap();
    statuses.sort();
    assert_eq!(statuses, vec!["success"]);

    let device_seen = sqlx::query_scalar::<_, bool>(
        "SELECT last_seen_at IS NOT NULL AND online_status = 'online' FROM construction_attendance_devices WHERE id = $1",
    )
    .bind(device_record_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(device_seen);
}

#[tokio::test]
async fn b_vendor_photo_upload_persists_business_attendance_and_is_idempotent() {
    let (mut state, pool, _container) = build_test_state_with_pool().await;
    let upload_dir = std::env::temp_dir().join(format!("shanhuai-b-photo-{}", Uuid::new_v4()));
    state.storage = Arc::new(LocalStorage::new(
        &upload_dir,
        "http://storage.example.test/media",
    ));
    let app = app_routes(state);

    let project_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_projects (name, status) VALUES ('B厂家考勤项目', 1) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let unit_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_units (project_id, company_name) VALUES ($1, '考勤单位') RETURNING id",
    )
    .bind(project_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let team_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_teams (project_id, unit_id, name, work_type) VALUES ($1, $2, '考勤班组', 900) RETURNING id",
    )
    .bind(project_id)
    .bind(unit_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let device_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO construction_attendance_devices (
            project_id, device_type, serial_number, direction
        ) VALUES ($1, 'B厂家', '123', 0)
        RETURNING id
        "#,
    )
    .bind(project_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let worker_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO construction_workers (
            project_id, unit_id, team_id, name, id_card, work_status
        ) VALUES ($1, $2, $3, '测试考勤人员', '330200199001010011', 1)
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(unit_id)
    .bind(team_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let time_millis = 1_785_217_408_177_i64;
    let payload = serde_json::json!({
        "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=",
        "projectId": project_id,
        "name": "测试考勤人员",
        "deviceId": 123,
        "fileName": "attendance-test.png",
        "workerId": worker_id,
        "time": time_millis,
        "direction": "in",
        "type": "face"
    });

    let (missing_ts_status, missing_ts) = post_photo_json(app.clone(), &payload, None).await;
    assert_eq!(missing_ts_status, axum::http::StatusCode::BAD_REQUEST);
    assert_eq!(missing_ts["event"], "photo");

    let (status, first) = post_photo_json(app.clone(), &payload, Some(time_millis)).await;
    assert_eq!(status, axum::http::StatusCode::OK, "{first}");
    assert_eq!(first["success"], true);
    assert_eq!(first["event"], "photo");
    let path = first["data"]["path"].as_str().unwrap();
    assert!(path.starts_with("http://storage.example.test/media/uploads/attendance/"));

    let record = sqlx::query_as::<_, (Uuid, Uuid, i16, String, Option<String>)>(
        r#"
        SELECT worker_id, project_id, direction, original_time, photo_path
        FROM construction_attendance_records
        WHERE serial_number = '123' AND is_deleted = FALSE
        "#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(record.0, worker_id);
    assert_eq!(record.1, project_id);
    assert_eq!(record.2, 0);
    assert_eq!(record.3, format!("b-photo:{time_millis}"));
    assert_eq!(record.4.as_deref(), Some(path));

    let photo = sqlx::query_as::<_, (String, String, Option<String>)>(
        r#"
        SELECT photo_data, source, content_type
        FROM construction_attendance_record_photos
        "#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(photo.0, path);
    assert_eq!(photo.1, "device_vendor_b_photo");
    assert_eq!(photo.2.as_deref(), Some("image/png"));

    let uploaded_file = sqlx::query_as::<_, (String, Option<Uuid>, String)>(
        "SELECT biz_type, biz_id, public_url FROM upload_files",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(uploaded_file.0, "attendance_record");
    assert!(uploaded_file.1.is_some());
    assert_eq!(uploaded_file.2, path);

    let device_seen = sqlx::query_scalar::<_, bool>(
        "SELECT last_seen_at IS NOT NULL AND online_status = 'online' FROM construction_attendance_devices WHERE id = $1",
    )
    .bind(device_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(device_seen);

    let (retry_status, retry) = post_photo_json(app, &payload, Some(time_millis)).await;
    assert_eq!(retry_status, axum::http::StatusCode::OK, "{retry}");
    assert_eq!(retry["data"]["path"], path);
    let record_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM construction_attendance_records WHERE serial_number = '123'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(record_count, 1);

    let _ = tokio::fs::remove_dir_all(upload_dir).await;
}

#[tokio::test]
async fn supplemental_attendance_pull_and_callbacks_enforce_due_lease_ownership_and_transitions() {
    let (app, pool, _container) = build_test_app_with_pool().await;
    let project_id: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects (name, status) VALUES ('补录考勤项目', 1) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let unit_id: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_units (project_id, company_name) VALUES ($1, '补录单位') RETURNING id",
    )
    .bind(project_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let team_id: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_teams (project_id, unit_id, name, work_type) VALUES ($1, $2, '补录班组', 900) RETURNING id",
    )
    .bind(project_id)
    .bind(unit_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let worker_id: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_workers (project_id, unit_id, team_id, name) VALUES ($1, $2, $3, '补录人员') RETURNING id",
    )
    .bind(project_id)
    .bind(unit_id)
    .bind(team_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let devices = sqlx::query_as::<_, (Uuid, String)>(
        r#"
        INSERT INTO construction_attendance_devices (project_id, device_type, serial_number, device_name)
        VALUES
            ($1, 'B厂家', 'SUPPLEMENTAL-B-001', '补录一号机'),
            ($1, 'B厂家', 'SUPPLEMENTAL-B-002', '补录二号机')
        RETURNING id, serial_number
        "#,
    )
    .bind(project_id)
    .fetch_all(&pool)
    .await
    .unwrap();
    let device_one_id = devices
        .iter()
        .find(|device| device.1 == "SUPPLEMENTAL-B-001")
        .unwrap()
        .0;
    let device_two_id = devices
        .iter()
        .find(|device| device.1 == "SUPPLEMENTAL-B-002")
        .unwrap()
        .0;
    let config_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO construction_managed_attendance_configs (
            project_id, worker_id, attendance_device_id, monthly_attendance_days,
            shift, check_in_time, check_out_time
        ) VALUES ($1, $2, $3, 3, 'day', '08:00', '18:00')
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(worker_id)
    .bind(device_one_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let now = chrono::Utc::now();
    let today = now.date_naive();
    let record_sql = r#"
        INSERT INTO construction_managed_attendance_records (
            config_id, project_id, worker_id, worker_name, attendance_date,
            direction, shift, planned_at, photo_url
        ) VALUES ($1, $2, $3, '补录人员', $4, $5, 'day', $6, $7)
        RETURNING id
    "#;
    let due_record_id: Uuid = sqlx::query_scalar(record_sql)
        .bind(config_id)
        .bind(project_id)
        .bind(worker_id)
        .bind(today)
        .bind(0_i16)
        .bind(now - chrono::Duration::minutes(1))
        .bind("https://example.test/supplemental-in.jpg")
        .fetch_one(&pool)
        .await
        .unwrap();
    let future_record_id: Uuid = sqlx::query_scalar(record_sql)
        .bind(config_id)
        .bind(project_id)
        .bind(worker_id)
        .bind(today.succ_opt().unwrap())
        .bind(1_i16)
        .bind(now + chrono::Duration::hours(1))
        .bind(Option::<String>::None)
        .fetch_one(&pool)
        .await
        .unwrap();
    let other_device_record_id: Uuid = sqlx::query_scalar(record_sql)
        .bind(config_id)
        .bind(project_id)
        .bind(worker_id)
        .bind(today.succ_opt().unwrap().succ_opt().unwrap())
        .bind(1_i16)
        .bind(now - chrono::Duration::minutes(1))
        .bind(Option::<String>::None)
        .fetch_one(&pool)
        .await
        .unwrap();

    for (record_id, device_id, serial_number) in [
        (due_record_id, device_one_id, "SUPPLEMENTAL-B-001"),
        (future_record_id, device_one_id, "SUPPLEMENTAL-B-001"),
        (other_device_record_id, device_two_id, "SUPPLEMENTAL-B-002"),
    ] {
        sqlx::query(
            r#"
            INSERT INTO device_dispatch_jobs (
                project_id, worker_id, attendance_device_id, device_sn, action,
                message_id, payload, job_type, adapter_code, transport,
                managed_attendance_record_id
            ) VALUES (
                $1, $2, $3, $4, 'supplemental_attendance', $5, '{}'::jsonb,
                'supplemental_attendance', 'vendor_b', 'http_pull', $6
            )
            "#,
        )
        .bind(project_id)
        .bind(worker_id)
        .bind(device_id)
        .bind(serial_number)
        .bind(format!("supplemental-{record_id}-{device_id}"))
        .bind(record_id)
        .execute(&pool)
        .await
        .unwrap();
    }

    let future_job_id: Uuid = sqlx::query_scalar(
        "SELECT id FROM device_dispatch_jobs WHERE managed_attendance_record_id = $1",
    )
    .bind(future_record_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let (status, unclaimed_error) = post_attendance_results_json(
        app.clone(),
        &serde_json::json!({
            "deviceId": "SUPPLEMENTAL-B-001",
            "data": {"jobId": future_job_id, "status": "success"}
        }),
    )
    .await;
    assert_eq!(
        status,
        axum::http::StatusCode::NOT_FOUND,
        "{unclaimed_error}"
    );

    let (status, first_pull) = get_json(
        app.clone(),
        &format!(
            "/attendance-jobs?deviceId=SUPPLEMENTAL-B-001&update={}",
            now.timestamp()
        ),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "{first_pull}");
    assert_eq!(first_pull["event"], "attendanceJobs");
    assert_eq!(first_pull["data"].as_array().unwrap().len(), 1);
    let job_id = first_pull["data"][0]["jobId"].as_str().unwrap().to_owned();
    let message_id = first_pull["data"][0]["messageId"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(first_pull["data"][0]["direction"], "in");
    assert_eq!(first_pull["data"][0]["attemptCount"], 1);
    assert!(first_pull["time"].as_i64().unwrap() >= now.timestamp());

    let (_, active_lease_pull) =
        get_json(app.clone(), "/attendance-jobs?deviceId=SUPPLEMENTAL-B-001").await;
    assert!(active_lease_pull["data"].as_array().unwrap().is_empty());
    sqlx::query(
        "UPDATE device_dispatch_jobs SET locked_until = NOW() - INTERVAL '1 second' WHERE id = $1",
    )
    .bind(Uuid::parse_str(&job_id).unwrap())
    .execute(&pool)
    .await
    .unwrap();
    let (_, expired_lease_pull) =
        get_json(app.clone(), "/attendance-jobs?deviceId=SUPPLEMENTAL-B-001").await;
    assert_eq!(expired_lease_pull["data"][0]["jobId"], job_id);
    assert_eq!(expired_lease_pull["data"][0]["messageId"], message_id);
    assert_eq!(expired_lease_pull["data"][0]["attemptCount"], 2);

    sqlx::query(
        "UPDATE construction_managed_attendance_configs SET is_enabled = FALSE WHERE id = $1",
    )
    .bind(config_id)
    .execute(&pool)
    .await
    .unwrap();

    let (status, ownership_error) = post_attendance_results_json(
        app.clone(),
        &serde_json::json!({
            "deviceId": "SUPPLEMENTAL-B-002",
            "data": {"jobId": job_id, "status": "success"}
        }),
    )
    .await;
    assert_eq!(
        status,
        axum::http::StatusCode::NOT_FOUND,
        "{ownership_error}"
    );
    assert_eq!(ownership_error["event"], "attendanceResults");

    for (payload, expected_status) in [
        (
            serde_json::json!({"jobId": job_id, "status": "processing", "code": 0, "message": "已排队"}),
            "accepted",
        ),
        (
            serde_json::json!({"jobId": job_id, "status": "processing", "code": 0, "message": "已排队"}),
            "accepted",
        ),
        (
            serde_json::json!({"jobId": job_id, "status": "failed", "code": 42, "message": "临时失败"}),
            "failed",
        ),
        (
            serde_json::json!({"jobId": job_id, "success": true, "code": 0, "message": "补录成功"}),
            "success",
        ),
        (
            serde_json::json!({"jobId": job_id, "success": false, "code": 99, "message": "迟到失败"}),
            "success",
        ),
    ] {
        let (status, response) = post_attendance_results_json(
            app.clone(),
            &serde_json::json!({
                "deviceId": "SUPPLEMENTAL-B-001",
                "data": payload
            }),
        )
        .await;
        assert_eq!(status, axum::http::StatusCode::OK, "{response}");
        assert_eq!(response["event"], "attendanceResults");
        assert_eq!(response["data"][0]["status"], expected_status);
    }

    let persisted = sqlx::query_as::<_, (String, String, String)>(
        r#"
        SELECT j.status, j.device_result_status, r.dispatch_status
        FROM device_dispatch_jobs j
        JOIN construction_managed_attendance_records r ON r.id = j.managed_attendance_record_id
        WHERE j.id = $1
        "#,
    )
    .bind(Uuid::parse_str(&job_id).unwrap())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(persisted.0, "delivered");
    assert_eq!(persisted.1, "success");
    assert_eq!(persisted.2, "success");
    let event_types: Vec<String> = sqlx::query_scalar(
        "SELECT event_type FROM device_dispatch_events WHERE job_id = $1 ORDER BY created_at",
    )
    .bind(Uuid::parse_str(&job_id).unwrap())
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(
        event_types
            .iter()
            .any(|event| event == "attendance_result_duplicate")
    );
    assert!(
        event_types
            .iter()
            .any(|event| event == "attendance_result_ignored")
    );
}
