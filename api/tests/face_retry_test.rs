mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use quax::feature::{
    auth::{Role, utils::jwt::create_token_pair},
    face,
};
use uuid::Uuid;

#[tokio::test]
async fn face_retry_and_avatar_revision_are_transactional() {
    let (app, pool, _container) = common::build_test_app_with_pool().await;
    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects(name) VALUES ('人脸重试测试') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let unit: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_units(project_id,company_name) VALUES ($1,'单位') RETURNING id",
    )
    .bind(project)
    .fetch_one(&pool)
    .await
    .unwrap();
    let team: Uuid = sqlx::query_scalar("INSERT INTO construction_teams(project_id,unit_id,name,work_type) VALUES ($1,$2,'班组',900) RETURNING id")
        .bind(project).bind(unit).fetch_one(&pool).await.unwrap();
    let worker: Uuid = sqlx::query_scalar("INSERT INTO construction_workers(project_id,unit_id,team_id,name,avatar) VALUES ($1,$2,$3,'测试人员','old.jpg') RETURNING id")
        .bind(project).bind(unit).bind(team).fetch_one(&pool).await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM construction_face_enrollments")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0, "未开启项目不能自动入队");

    let token = create_token_pair(Uuid::new_v4(), "admin@example.com", &[Role::Admin])
        .unwrap()
        .access_token;
    let url = format!("/api/v1/management/projects/{project}/attendance-face-retry");
    let request = |token: &str| {
        Request::builder()
            .method("POST")
            .uri(&url)
            .header("Authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap()
    };
    let (status, _, _) = common::raw_request(app.clone(), request(&token)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    sqlx::query("INSERT INTO construction_attendance_points(project_id,name,machine_mode_enabled) VALUES ($1,'入口',TRUE)")
        .bind(project).execute(&pool).await.unwrap();
    let (status, _, body) = common::raw_request(app.clone(), request(&token)).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["queued"], 1);
    let (_, _, body) = common::raw_request(app.clone(), request(&token)).await;
    assert_eq!(body["data"]["queued"], 0, "重复点击不新增活跃任务");

    let user_id: Uuid = sqlx::query_scalar("INSERT INTO users(email,username,role,is_active,email_verified) VALUES ('face-test@example.com','face-test','user',TRUE,TRUE) RETURNING id")
        .fetch_one(&pool).await.unwrap();
    let user = create_token_pair(user_id, "face-test@example.com", &[Role::User])
        .unwrap()
        .access_token;
    let (status, _, _) = common::raw_request(app.clone(), request(&user)).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "禁止未授权项目重试");
    sqlx::query("INSERT INTO user_managed_projects(user_id,project_id) VALUES ($1,$2)")
        .bind(user_id)
        .bind(project)
        .execute(&pool)
        .await
        .unwrap();
    let (status, _, _) = common::raw_request(app.clone(), request(&user)).await;
    assert_eq!(status, StatusCode::OK, "授权项目允许异步重试");

    let (task, revision): (Uuid, i64) = sqlx::query_as("UPDATE construction_face_enrollments SET status='processing' WHERE worker_id=$1 RETURNING id,revision")
        .bind(worker).fetch_one(&pool).await.unwrap();
    sqlx::query("UPDATE construction_workers SET avatar='new.jpg' WHERE id=$1")
        .bind(worker)
        .execute(&pool)
        .await
        .unwrap();
    face::finish_enrollment(&pool, task, revision, None)
        .await
        .unwrap();
    let (status, new_revision, attempts): (String, i64, i32) = sqlx::query_as(
        "SELECT status,revision,attempt_count FROM construction_face_enrollments WHERE id=$1",
    )
    .bind(task)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(status, "pending", "旧照片的成功不能覆盖新照片请求");
    assert!(new_revision > revision);
    assert_eq!(attempts, 0);
    sqlx::query("UPDATE construction_face_enrollments SET status='processing' WHERE id=$1")
        .bind(task)
        .execute(&pool)
        .await
        .unwrap();
    face::finish_enrollment(&pool, task, revision, Some("旧照片失败".into()))
        .await
        .unwrap();
    let stale_error: Option<String> =
        sqlx::query_scalar("SELECT last_error FROM construction_face_enrollments WHERE id=$1")
            .bind(task)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(stale_error, None, "旧失败不能覆盖新头像状态");

    // 人员修改回滚时队列版本也回滚。
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("UPDATE construction_workers SET avatar='rolled-back.jpg' WHERE id=$1")
        .bind(worker)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.rollback().await.unwrap();
    let after_rollback: i64 =
        sqlx::query_scalar("SELECT revision FROM construction_face_enrollments WHERE id=$1")
            .bind(task)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(after_rollback, new_revision);

    sqlx::query(
        "UPDATE construction_face_enrollments SET status='processing',attempt_count=4 WHERE id=$1",
    )
    .bind(task)
    .execute(&pool)
    .await
    .unwrap();
    face::finish_enrollment(&pool, task, new_revision, Some("超时".into()))
        .await
        .unwrap();
    let status: String =
        sqlx::query_scalar("SELECT status FROM construction_face_enrollments WHERE id=$1")
            .bind(task)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(status, "failed");
    let (first, second) = tokio::join!(
        common::raw_request(app.clone(), request(&token)),
        common::raw_request(app.clone(), request(&token)),
    );
    assert_eq!(first.0, StatusCode::OK);
    assert_eq!(second.0, StatusCode::OK);
    assert_eq!(
        first.2["data"]["queued"].as_u64().unwrap() + second.2["data"]["queued"].as_u64().unwrap(),
        1,
        "耗尽次数后并发点击也只创建一个任务"
    );

    let (fresh_task, fresh_revision): (Uuid, i64) = sqlx::query_as(
        "UPDATE construction_face_enrollments SET status='processing' WHERE worker_id=$1 AND status='pending' RETURNING id,revision"
    ).bind(worker).fetch_one(&pool).await.unwrap();
    face::finish_enrollment(&pool, fresh_task, fresh_revision, None)
        .await
        .unwrap();
    let status: String =
        sqlx::query_scalar("SELECT status FROM construction_face_enrollments WHERE id=$1")
            .bind(fresh_task)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(status, "synced", "最新版成功后标记入库成功");

    sqlx::query("UPDATE construction_workers SET avatar=NULL WHERE id=$1")
        .bind(worker)
        .execute(&pool)
        .await
        .unwrap();
    let deletes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM construction_face_enrollments WHERE worker_id=$1 AND action='delete' AND status='pending'")
        .bind(worker).fetch_one(&pool).await.unwrap();
    assert_eq!(deletes, 1, "清空头像异步删除人脸");
    let new_worker: Uuid = sqlx::query_scalar("INSERT INTO construction_workers(project_id,unit_id,team_id,name,avatar) VALUES ($1,$2,$3,'新增人员','new-person.jpg') RETURNING id")
        .bind(project).bind(unit).bind(team).fetch_one(&pool).await.unwrap();
    let inserts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM construction_face_enrollments WHERE worker_id=$1 AND action='upsert' AND status='pending'")
        .bind(new_worker).fetch_one(&pool).await.unwrap();
    assert_eq!(inserts, 1, "开启后新增头像自动入队");
    sqlx::query("UPDATE construction_workers SET is_deleted=TRUE WHERE id=$1")
        .bind(new_worker)
        .execute(&pool)
        .await
        .unwrap();
    let deletes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM construction_face_enrollments WHERE worker_id=$1 AND action='delete' AND status='pending'")
        .bind(new_worker).fetch_one(&pool).await.unwrap();
    assert_eq!(deletes, 1, "删除人员自动排队清理人脸");
    let comment: Option<String> = sqlx::query_scalar("SELECT col_description('construction_face_enrollments'::regclass,attnum) FROM pg_attribute WHERE attrelid='construction_face_enrollments'::regclass AND attname='revision'")
        .fetch_one(&pool).await.unwrap();
    assert!(comment.is_some_and(|v| !v.is_empty()));

    sqlx::raw_sql(include_str!(
        "../migrations/058_face_enrollment_revision.down.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!(
        "../migrations/058_face_enrollment_revision.up.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
}
