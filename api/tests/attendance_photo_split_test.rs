mod common;
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use quax::feature::auth::{Role, utils::jwt::create_token_pair};
use serde_json::{Value, json};
use uuid::Uuid;

#[tokio::test]
async fn photo_crud_and_migration_preserve_device_urls() {
    let (app, pool, _container) = common::build_test_app_with_pool().await;
    let token = create_token_pair(Uuid::new_v4(), "photo-admin@example.com", &[Role::Admin])
        .unwrap()
        .access_token;
    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects(name) VALUES('照片测试') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let other: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects(name) VALUES('其他项目') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let worker: Uuid = sqlx::query_scalar("WITH u AS (INSERT INTO construction_units(project_id,company_name) VALUES($1,'单位') RETURNING id), t AS (INSERT INTO construction_teams(project_id,unit_id,name,work_type) SELECT $1,id,'班组',900 FROM u RETURNING id,unit_id) INSERT INTO construction_workers(project_id,unit_id,team_id,name) SELECT $1,unit_id,id,'工人' FROM t RETURNING id").bind(project).fetch_one(&pool).await.unwrap();
    let req = |method: &str, url: &str, body: Value| {
        Request::builder()
            .method(method)
            .uri(url)
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    };
    let url = format!("/api/v1/management/projects/{project}/attendance-records");
    let (status,_,created) = common::raw_request(app.clone(),req("POST",&url,json!({"worker_id":worker,"direction":0,"trigger_time":"2026-09-05T12:00:00Z","closeup_photo":"manual-photo","photo_path":"https://example.com/vendor-b.jpg"}))).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!(created["data"]["closeup_photo"], "manual-photo");
    let id = created["data"]["id"].as_str().unwrap();
    let uuid = Uuid::parse_str(id).unwrap();
    let detail = format!("{url}/{id}");
    // Device evidence stays intact when an admin changes or clears the displayed photo.
    sqlx::query("INSERT INTO construction_attendance_record_photos(attendance_record_id,project_id,worker_id,photo_kind,photo_data,source) VALUES($1,$2,$3,'closeup','https://example.com/vendor-b.jpg','device_vendor_b_photo')").bind(uuid).bind(project).bind(worker).execute(&pool).await.unwrap();
    for photo in [json!("edited-photo"), Value::Null] {
        let (status, _, updated) = common::raw_request(
            app.clone(),
            req("PATCH", &detail, json!({"closeup_photo":photo})),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{updated}");
        assert_eq!(updated["data"]["closeup_photo"], photo);
        for path in [&detail, &url] {
            let (status, _, result) =
                common::raw_request(app.clone(), req("GET", path, Value::Null)).await;
            assert_eq!(status, StatusCode::OK, "{result}");
            let record = if path == &url {
                &result["data"]["items"][0]
            } else {
                &result["data"]
            };
            assert_eq!(record["closeup_photo"], photo);
            assert_eq!(record["photo_path"], "https://example.com/vendor-b.jpg");
        }
    }
    let (status, _, _) = common::raw_request(
        app.clone(),
        req(
            "PATCH",
            &format!("/api/v1/management/projects/{other}/attendance-records/{id}"),
            json!({"closeup_photo":"wrong-project"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let device: String = sqlx::query_scalar("SELECT photo_data FROM construction_attendance_record_photos WHERE attendance_record_id=$1 AND source='device_vendor_b_photo'").bind(uuid).fetch_one(&pool).await.unwrap();
    assert_eq!(device, "https://example.com/vendor-b.jpg");
    // Up/down migration preserves URLs and documents the restored column in Chinese.
    sqlx::raw_sql(include_str!(
        "../migrations/061_remove_attendance_closeup_column.down.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    let comment: String = sqlx::query_scalar("SELECT col_description('construction_attendance_records'::regclass,attnum) FROM pg_attribute WHERE attrelid='construction_attendance_records'::regclass AND attname='closeup_photo'").fetch_one(&pool).await.unwrap();
    assert!(comment.contains("照片"));
    sqlx::query(
        "UPDATE construction_attendance_records SET closeup_photo='legacy-photo' WHERE id=$1",
    )
    .bind(uuid)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!(
        "../migrations/061_remove_attendance_closeup_column.up.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    let legacy: String = sqlx::query_scalar("SELECT photo_data FROM construction_attendance_record_photos WHERE attendance_record_id=$1 AND source='legacy_main_column'").bind(uuid).fetch_one(&pool).await.unwrap();
    assert_eq!(legacy, "legacy-photo");
    let path: String =
        sqlx::query_scalar("SELECT photo_path FROM construction_attendance_records WHERE id=$1")
            .bind(uuid)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(path, device);
}
