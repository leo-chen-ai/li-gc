mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use quax::feature::auth::{Role, utils::jwt::create_token_pair};
use serde_json::{Value, json};
use uuid::Uuid;

fn authed_request(method: &str, uri: &str, token: &str, body: Option<Value>) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("Authorization", format!("Bearer {token}"));
    let payload = if let Some(value) = body {
        builder = builder.header("Content-Type", "application/json");
        Body::from(value.to_string())
    } else {
        Body::empty()
    };
    builder.body(payload).unwrap()
}

#[tokio::test]
async fn attendance_geofence_is_admin_only_and_supports_polygon_crud() {
    let (app, pool, _container) = common::build_test_app_with_pool().await;
    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects(name) VALUES ('电子围栏测试项目') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let unit: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_units(project_id,company_name) VALUES ($1,'测试单位') RETURNING id",
    )
    .bind(project)
    .fetch_one(&pool)
    .await
    .unwrap();
    let team: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_teams(project_id,unit_id,name,work_type) VALUES ($1,$2,'测试班组',900) RETURNING id",
    )
    .bind(project)
    .bind(unit)
    .fetch_one(&pool)
    .await
    .unwrap();
    let worker: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_workers(project_id,unit_id,team_id,name,avatar) VALUES ($1,$2,$3,'围栏工人','avatar.jpg') RETURNING id",
    )
    .bind(project)
    .bind(unit)
    .bind(team)
    .fetch_one(&pool)
    .await
    .unwrap();
    let admin = create_token_pair(Uuid::new_v4(), "admin@example.com", &[Role::Admin])
        .unwrap()
        .access_token;
    let user_id: Uuid = sqlx::query_scalar(
        "INSERT INTO users(email,username,role,is_active,email_verified) VALUES ('fence-user@example.com','fence-user','user',TRUE,TRUE) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO user_managed_projects(user_id,project_id) VALUES ($1,$2)")
        .bind(user_id)
        .bind(project)
        .execute(&pool)
        .await
        .unwrap();
    let user = create_token_pair(user_id, "fence-user@example.com", &[Role::User])
        .unwrap()
        .access_token;
    let config_url = format!("/api/v1/management/projects/{project}/attendance-geofence-config");

    let (status, _, _) =
        common::raw_request(app.clone(), authed_request("GET", &config_url, &user, None)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let settings = json!({
        "worker_attendance_enabled": true,
        "require_location": true,
        "require_face": true
    });
    let (status, _, body) = common::raw_request(
        app.clone(),
        authed_request("PUT", &config_url, &admin, Some(settings)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["worker_attendance_enabled"], true);
    assert!(quax::feature::face::project_machine_mode_enabled(&pool, project).await);
    let revision: i64 = sqlx::query_scalar(
        "SELECT revision FROM construction_face_enrollments WHERE worker_id=$1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(worker)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE construction_workers SET avatar='avatar-new.jpg' WHERE id=$1")
        .bind(worker)
        .execute(&pool)
        .await
        .unwrap();
    let new_revision: i64 = sqlx::query_scalar(
        "SELECT revision FROM construction_face_enrollments WHERE worker_id=$1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(worker)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(new_revision > revision, "围栏启用后修改头像必须重新入队");

    let library_url = "/api/v1/management/face-library-sync?status=enabled";
    let (status, _, body) = common::raw_request(
        app.clone(),
        authed_request("GET", library_url, &admin, None),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let library = body["data"]["summary"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["id"] == project.to_string())
        .expect("围栏人脸校验开启后项目必须出现在人脸库维护列表");
    assert_eq!(library["geofence_face_enabled"], true);
    assert_eq!(library["enabled"], true);

    let undocumented_columns: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM information_schema.columns c
        LEFT JOIN pg_catalog.pg_class pc ON pc.relname = c.table_name
        LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = c.table_schema
        LEFT JOIN pg_catalog.pg_attribute pa ON pa.attrelid = pc.oid AND pa.attname = c.column_name
        LEFT JOIN pg_catalog.pg_description pd ON pd.objoid = pc.oid AND pd.objsubid = pa.attnum
        WHERE c.table_schema = 'public'
          AND c.table_name IN ('construction_project_attendance_settings', 'construction_attendance_geofences')
          AND pd.description IS NULL"#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(undocumented_columns, 0, "新增业务字段必须有中文备注");

    let areas_url = format!("/api/v1/management/projects/{project}/attendance-geofences");
    let invalid = json!({
        "name": "无效区域",
        "polygon": [
            {"longitude": 118.8, "latitude": 32.0},
            {"longitude": 118.8, "latitude": 32.0},
            {"longitude": 118.8, "latitude": 32.0}
        ],
        "is_enabled": true
    });
    let (status, _, _) = common::raw_request(
        app.clone(),
        authed_request("POST", &areas_url, &admin, Some(invalid)),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let valid = json!({
        "name": "施工区域",
        "polygon": [
            {"longitude": 118.8000, "latitude": 32.0000},
            {"longitude": 118.8010, "latitude": 32.0000},
            {"longitude": 118.8010, "latitude": 32.0010},
            {"longitude": 118.8000, "latitude": 32.0010}
        ],
        "is_enabled": true,
        "remark": "东侧工地"
    });
    let (status, _, body) = common::raw_request(
        app.clone(),
        authed_request("POST", &areas_url, &admin, Some(valid)),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let area_id = body["data"]["id"].as_str().unwrap();

    let (status, _, body) = common::raw_request(
        app.clone(),
        authed_request("GET", &config_url, &admin, None),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["areas"].as_array().unwrap().len(), 1);
    assert_eq!(
        body["data"]["areas"][0]["polygon"]
            .as_array()
            .unwrap()
            .len(),
        4
    );

    let area_url = format!("{areas_url}/{area_id}");
    let (status, _, _) =
        common::raw_request(app, authed_request("DELETE", &area_url, &admin, None)).await;
    assert_eq!(status, StatusCode::OK);
}
