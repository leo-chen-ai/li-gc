mod common;

use std::sync::Arc;

use axum::{body::Body, http::Request};
use serde_json::Value;
use uuid::Uuid;

use common::{BodyExt, ServiceExt, build_test_app_with_pool, build_test_state_with_pool};
use quax::{infrastructure::storage::LocalStorage, routes::app_routes};

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
            'https://example.test/quality.jpg', 1
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

    let timestamp_millis = 1_785_217_408_177_i64;
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

    let (missing_ts_status, missing_ts) =
        post_quality_json(app.clone(), &failed_payload, None).await;
    assert_eq!(missing_ts_status, axum::http::StatusCode::BAD_REQUEST);
    assert_eq!(missing_ts["event"], "quality");

    let (status, failed) =
        post_quality_json(app.clone(), &failed_payload, Some(timestamp_millis)).await;
    assert_eq!(status, axum::http::StatusCode::OK, "{failed}");
    assert_eq!(failed["success"], true);
    assert_eq!(failed["event"], "quality");
    assert_eq!(failed["data"][0]["workerId"], worker_id.to_string());

    let report = sqlx::query_as::<
        _,
        (
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
        SELECT worker_id, attendance_device_id, device_type, action, status,
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
    assert_eq!(report.0, worker_id);
    assert_eq!(report.1, device_record_id);
    assert_eq!(report.2, "B厂家");
    assert_eq!(report.3, "update");
    assert_eq!(report.4, "failed");
    assert!(report.5.is_some());
    assert_eq!(report.6["data"]["code"], "5");
    assert_eq!(report.7["source"], "device_vendor_b_quality");
    assert_eq!(report.7["event"], "quality");

    let (retry_status, retry) =
        post_quality_json(app.clone(), &failed_payload, Some(timestamp_millis)).await;
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
        post_quality_json(app, &success_payload, Some(timestamp_millis + 1)).await;
    assert_eq!(success_status, axum::http::StatusCode::OK, "{success}");
    assert_eq!(success["event"], "quality");

    let statuses = sqlx::query_scalar::<_, String>(
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
    assert_eq!(statuses, vec!["success", "failed"]);

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
