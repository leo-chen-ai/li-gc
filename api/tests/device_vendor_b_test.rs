mod common;

use axum::{body::Body, http::Request};
use serde_json::Value;
use uuid::Uuid;

use common::{BodyExt, ServiceExt, build_test_app_with_pool};

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
        "INSERT INTO construction_teams (project_id, unit_id, name) VALUES ($1, $2, '测试班组') RETURNING id",
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
