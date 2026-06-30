mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use quax::feature::auth::{Role, utils::jwt::create_token_pair};
use uuid::Uuid;

use common::*;

fn admin_token() -> String {
    create_token_pair(Uuid::new_v4(), "admin@example.com", &[Role::Admin])
        .expect("admin token")
        .access_token
}

fn user_token(user_id: Uuid) -> String {
    create_token_pair(user_id, "miniapp-upload@example.com", &[Role::User])
        .expect("user token")
        .access_token
}

#[tokio::test]
async fn test_authenticated_user_can_upload_construction_file() {
    let (app, pool, _c) = build_test_app_with_pool().await;

    let user_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO users (email, username, role, is_active, email_verified)
        VALUES ($1, $2, 'user', TRUE, TRUE)
        RETURNING id
        "#,
    )
    .bind(format!("miniapp-upload-{}@example.com", Uuid::new_v4()))
    .bind(format!("mu-{}", Uuid::new_v4().simple()))
    .fetch_one(&pool)
    .await
    .expect("insert upload user");

    let biz_id = Uuid::new_v4();
    let boundary = "----shanhuai-miniapp-upload-test";
    let file_bytes = "miniapp-upload-bytes";
    let multipart = format!(
        "--{boundary}\r\n\
Content-Disposition: form-data; name=\"biz_type\"\r\n\r\n\
workers\r\n\
--{boundary}\r\n\
Content-Disposition: form-data; name=\"biz_id\"\r\n\r\n\
{biz_id}\r\n\
--{boundary}\r\n\
Content-Disposition: form-data; name=\"field_key\"\r\n\r\n\
labor_contract_file\r\n\
--{boundary}\r\n\
Content-Disposition: form-data; name=\"file\"; filename=\"miniapp-contract.jpg\"\r\n\
Content-Type: image/jpeg\r\n\r\n\
{file_bytes}\r\n\
--{boundary}--\r\n"
    );

    let req = Request::builder()
        .method("POST")
        .uri("/api/v1/uploads")
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={boundary}"),
        )
        .header(
            header::AUTHORIZATION,
            format!("Bearer {}", user_token(user_id)),
        )
        .body(Body::from(multipart))
        .unwrap();

    let (status, _, body) = raw_request(app, req).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["biz_type"], "workers");
    assert_eq!(body["data"]["biz_id"], biz_id.to_string());
    assert_eq!(body["data"]["field_key"], "labor_contract_file");
    assert_eq!(body["data"]["original_filename"], "miniapp-contract.jpg");
    assert_eq!(body["data"]["storage_driver"], "local");
    assert_eq!(body["data"]["size_bytes"], file_bytes.len() as i64);
    assert!(
        body["data"]["public_url"]
            .as_str()
            .expect("public_url")
            .contains("/uploads/workers/")
    );

    let object_key = body["data"]["object_key"].as_str().expect("object key");
    let stored = std::fs::read_to_string(std::path::Path::new("./uploads").join(object_key))
        .expect("stored upload");
    assert_eq!(stored, file_bytes);
}

#[tokio::test]
async fn test_admin_can_list_uploaded_files() {
    let (app, pool, _c) = build_test_app_with_pool().await;
    let token = admin_token();

    sqlx::query(
        r#"
        INSERT INTO upload_files (
            biz_type,
            biz_id,
            field_key,
            original_filename,
            object_key,
            bucket,
            endpoint,
            public_base_url,
            public_url,
            storage_driver,
            content_type,
            size_bytes
        )
        VALUES (
            'worker',
            '10000000-0000-4000-8000-000000000001',
            'ocr_photo',
            'worker-id-front.jpg',
            'uploads/worker/front.jpg',
            'shanhuai-gc',
            'https://s3.cn-east-2.jdcloud-oss.com',
            'https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com',
            'https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/uploads/worker/front.jpg',
            'jdcloud_oss',
            'image/jpeg',
            2048
        )
        "#,
    )
    .execute(&pool)
    .await
    .expect("insert upload file");

    let (status, body) = get_authed(app, "/api/v1/admin/uploads", &token).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["success"], true);

    let files = body["data"].as_array().expect("files array");
    assert_eq!(files.len(), 1);
    assert_eq!(files[0]["biz_type"], "worker");
    assert_eq!(files[0]["field_key"], "ocr_photo");
    assert_eq!(files[0]["original_filename"], "worker-id-front.jpg");
    assert_eq!(files[0]["storage_driver"], "jdcloud_oss");
    assert_eq!(
        files[0]["public_base_url"],
        "https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com"
    );
}
