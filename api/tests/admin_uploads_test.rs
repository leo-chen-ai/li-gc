mod common;

use axum::http::StatusCode;
use quax::feature::auth::{Role, utils::jwt::create_token_pair};
use uuid::Uuid;

use common::*;

fn admin_token() -> String {
    create_token_pair(Uuid::new_v4(), "admin@example.com", &[Role::Admin])
        .expect("admin token")
        .access_token
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
