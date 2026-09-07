mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use common::*;
use quax::feature::auth::{Role, utils::jwt::create_token_pair};
use uuid::Uuid;

#[tokio::test]
async fn deleting_project_preserves_data_and_hides_project_until_restored() {
    let (app, pool, _container) = build_test_app_with_pool().await;
    let token = create_token_pair(Uuid::new_v4(), "admin@example.com", &[Role::Admin])
        .unwrap()
        .access_token;
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects (name) VALUES ('软删除回归项目') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let worker: Uuid = sqlx::query_scalar(
        "WITH u AS (INSERT INTO construction_units (project_id, company_name) VALUES ($1, '单位') RETURNING id),
         t AS (INSERT INTO construction_teams (project_id, unit_id, name, work_type) SELECT $1, id, '班组', 900 FROM u RETURNING id, unit_id)
         INSERT INTO construction_workers (project_id, unit_id, team_id, name) SELECT $1, unit_id, id, '测试人员' FROM t RETURNING id"
    ).bind(id).fetch_one(&pool).await.unwrap();
    sqlx::query("INSERT INTO construction_attendance_records (project_id, worker_id, trigger_time) VALUES ($1, $2, NOW())")
        .bind(id).bind(worker).execute(&pool).await.unwrap();
    let url = format!("/api/v1/admin/projects/{id}");
    for (target, expected) in [
        (id, StatusCode::OK),
        (id, StatusCode::NOT_FOUND),
        (Uuid::new_v4(), StatusCode::NOT_FOUND),
    ] {
        let req = Request::builder()
            .method("DELETE")
            .uri(format!("/api/v1/admin/projects/{target}"))
            .header("Authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap();
        let (status, _, body) = raw_request(app.clone(), req).await;
        assert_eq!(status, expected, "{body}");
    }
    let marked: bool = sqlx::query_scalar(
        "SELECT is_deleted AND deleted_at IS NOT NULL FROM construction_projects WHERE id=$1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(marked);
    for table in [
        "construction_units",
        "construction_teams",
        "construction_workers",
        "construction_attendance_records",
    ] {
        let count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM {table} WHERE project_id=$1 AND is_deleted=FALSE"
        ))
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1, "{table} must be preserved");
    }
    for path in [&url, &format!("{url}/workers")] {
        let (status, _) = get_authed(app.clone(), path, &token).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
    let (status, body) = get_authed(app.clone(), "/api/v1/admin/projects", &token).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !body["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["id"] == id.to_string())
    );
    sqlx::query("UPDATE construction_projects SET is_deleted=FALSE, deleted_at=NULL WHERE id=$1")
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    let (status, body) = get_authed(app, &url, &token).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["name"], "软删除回归项目");
}

#[tokio::test]
async fn device_point_and_issue_report_deletion_preserves_rows() {
    let (app, pool, _container) = build_test_app_with_pool().await;
    let token = create_token_pair(Uuid::new_v4(), "admin@example.com", &[Role::Admin])
        .unwrap()
        .access_token;
    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects (name) VALUES ('设备软删除项目') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    for (table, columns, values, path) in [
        ("construction_units", "company_name", "'测试单位'", "units"),
        (
            "construction_attendance_devices",
            "device_name",
            "'测试设备'",
            "attendance-devices",
        ),
        (
            "construction_attendance_points",
            "name",
            "'测试点位'",
            "attendance-points",
        ),
        (
            "construction_attendance_device_issue_reports",
            "status",
            "'success'",
            "attendance-device-issue-reports",
        ),
    ] {
        let id: Uuid = sqlx::query_scalar(&format!(
            "INSERT INTO {table} (project_id, {columns}) VALUES ($1, {values}) RETURNING id"
        ))
        .bind(project)
        .fetch_one(&pool)
        .await
        .unwrap();
        let uri = if path == "attendance-device-issue-reports" {
            format!("/api/v1/admin/{path}/{id}")
        } else {
            format!("/api/v1/admin/projects/{project}/{path}/{id}")
        };
        let req = Request::builder()
            .method("DELETE")
            .uri(&uri)
            .header("Authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap();
        let (status, _, body) = raw_request(app.clone(), req).await;
        assert_eq!(status, StatusCode::OK, "{table}: {body}");
        let marked: bool = sqlx::query_scalar(&format!(
            "SELECT is_deleted AND deleted_at IS NOT NULL FROM {table} WHERE id=$1"
        ))
        .bind(id)
        .fetch_one(&pool)
        .await
        .expect("deleted record must remain");
        assert!(marked);
        let (status, _) = get_authed(app.clone(), &uri, &token).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{table}");
        let req = Request::builder()
            .method("PATCH")
            .uri(&uri)
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
            .body(Body::from(
                serde_json::json!({columns: "deleted-update"}).to_string(),
            ))
            .unwrap();
        let (status, _, _) = raw_request(app.clone(), req).await;
        assert_eq!(
            status,
            StatusCode::NOT_FOUND,
            "deleted {table} must not be editable"
        );
    }
}
