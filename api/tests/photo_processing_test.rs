mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use quax::feature::auth::{Role, utils::jwt::create_token_pair};
use serde_json::{Value, json};
use uuid::Uuid;

/// 一张 8x12 的红色 PNG，足够走通 data URI → JPEG → 存储这条链路。
const TINY_PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x0c, 0x08, 0x02, 0x00, 0x00, 0x00, 0xd0, 0xfc, 0x6b,
    0xca, 0x00, 0x00, 0x00, 0x12, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0xf8, 0xcf, 0xc0, 0x80,
    0x15, 0x31, 0x8c, 0x4a, 0xa0, 0x23, 0x00, 0x6b, 0xd4, 0x5f, 0xa1, 0xf3, 0xe8, 0x95, 0x11, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

fn data_uri() -> String {
    use base64::{Engine as _, engine::general_purpose};
    format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(TINY_PNG)
    )
}

#[tokio::test]
async fn photo_processing_group_lifecycle_syncs_composited_pairs() {
    let (app, pool, _container) = common::build_test_app_with_pool().await;
    // 组表 created_by 外键到 users，先用一个真实管理员身份发令牌。
    let admin_id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO users (email, username, role, is_active, email_verified)
           VALUES ('photo-admin@example.com', 'photo_admin', 'admin', TRUE, TRUE)
           RETURNING id"#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let token = create_token_pair(admin_id, "photo-admin@example.com", &[Role::Admin])
        .unwrap()
        .access_token;

    // 一个项目 + 一名工人 + 同日一进一出两条设备打卡，照片走 data URI（MQTT 常见格式）。
    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects(name) VALUES('照片处理项目') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let worker: Uuid = sqlx::query_scalar(
        r#"WITH u AS (INSERT INTO construction_units(project_id,company_name) VALUES($1,'单位') RETURNING id),
               t AS (INSERT INTO construction_teams(project_id,unit_id,name,work_type) SELECT $1,id,'班组',900 FROM u RETURNING id,unit_id)
           INSERT INTO construction_workers(project_id,unit_id,team_id,name) SELECT $1,unit_id,id,'照片工人' FROM t RETURNING id"#,
    )
    .bind(project)
    .fetch_one(&pool)
    .await
    .unwrap();

    // 一天一进一出两条设备打卡，照片挂在 construction_attendance_record_photos 上
    // （MQTT 来源常见 data URI 格式）。
    for (direction, hour) in [(0_i16, 8_i32), (1_i16, 18_i32)] {
        let record_id: Uuid = sqlx::query_scalar(
            r#"INSERT INTO construction_attendance_records
               (project_id, worker_id, direction, trigger_time, record_type, serial_number)
               VALUES ($1,$2,$3,
                       (TIMESTAMPTZ '2026-09-05 00:00:00+08' + make_interval(hours => $4)),'device','SN-PHOTO-001')
               RETURNING id"#,
        )
        .bind(project)
        .bind(worker)
        .bind(direction)
        .bind(hour)
        .fetch_one(&pool)
        .await
        .unwrap();
        sqlx::query(
            r#"INSERT INTO construction_attendance_record_photos
               (attendance_record_id, project_id, worker_id, photo_kind, photo_data, source)
               VALUES ($1,$2,$3,'closeup',$4,'mqtt_device_photo')"#,
        )
        .bind(record_id)
        .bind(project)
        .bind(worker)
        .bind(data_uri())
        .execute(&pool)
        .await
        .unwrap();
    }

    let req = |method: &str, url: &str, body: Value| {
        Request::builder()
            .method(method)
            .uri(url)
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    };

    // 建组
    let (status, _, created) = common::raw_request(
        app.clone(),
        req(
            "POST",
            "/api/v1/admin/photo-processing/groups",
            json!({"name": "照片工人 9 月"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let group_id = created["data"]["id"].as_str().unwrap().to_string();

    // 拉取考勤照片：同一工人两条，方向分别是 0/1。
    let (status, _, photos) = common::raw_request(
        app.clone(),
        req(
            "GET",
            &format!(
                "/api/v1/admin/photo-processing/attendance-photos?project_id={project}&worker_id={worker}"
            ),
            Value::Null,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{photos}");
    let items = photos["data"]["items"].as_array().unwrap();
    assert_eq!(items.len(), 2, "{photos}");
    for item in items {
        assert!(item["preview_photo"].as_str().unwrap().starts_with("data:image/jpeg;base64,"), "{item}");
        assert!(["0", "1"].contains(&item["direction"].to_string().as_str()));
    }

    // 加入组内（用原始 data URI，验证归一化存储不会把原始地址原样落库）。
    let payload = json!({
        "photos": items
            .iter()
            .map(|item| json!({
                "attendance_record_id": item["attendance_record_id"],
                "project_id": item["project_id"],
                "worker_id": item["worker_id"],
                "worker_name": item["worker_name"],
                "attendance_date": item["attendance_date"],
                "direction": item["direction"],
                "photo_url": data_uri(),
            }))
            .collect::<Vec<_>>()
    });
    let (status, _, added) = common::raw_request(
        app.clone(),
        req(
            "POST",
            &format!("/api/v1/admin/photo-processing/groups/{group_id}/photos"),
            payload.clone(),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{added}");
    assert_eq!(added["data"]["added"], 2, "{added}");

    // 重复加入同一批不会产生重复行。
    let (status, _, again) = common::raw_request(
        app.clone(),
        req(
            "POST",
            &format!("/api/v1/admin/photo-processing/groups/{group_id}/photos"),
            payload.clone(),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{again}");
    assert_eq!(again["data"]["added"], 0, "{again}");

    // 组详情：两张照片 + 方向分布。
    let (status, _, detail) = common::raw_request(
        app.clone(),
        req(
            "GET",
            &format!("/api/v1/admin/photo-processing/groups/{group_id}"),
            Value::Null,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{detail}");
    let group_photos = detail["data"]["photos"].as_array().unwrap();
    assert_eq!(group_photos.len(), 2, "{detail}");
    assert!(
        group_photos
            .iter()
            .all(|photo| !photo["photo_url"].as_str().unwrap().starts_with("data:"))
    );

    // 背景图按方向各一张：先只放进场，确认缺场被跳过。
    let (status, _, _) = common::raw_request(
        app.clone(),
        req(
            "PUT",
            &format!("/api/v1/admin/photo-processing/groups/{group_id}/backgrounds/0"),
            json!({"photo_url": "https://example.com/in-background.jpg"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // 发起合成：没有 worker 在场时应返回 pending 任务，total=2。
    let (status, _, task) = common::raw_request(
        app.clone(),
        req(
            "POST",
            &format!("/api/v1/admin/photo-processing/groups/{group_id}/composite"),
            json!({"output_size": "1024x1536"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{task}");
    assert_eq!(task["data"]["status"], "pending", "{task}");
    assert_eq!(task["data"]["total_count"], 2, "{task}");
    let task_id = task["data"]["id"].as_str().unwrap().to_string();

    // 任务查询 + 取消接口存在（worker 不在场时仅落库状态）。
    let (status, _, fetched) = common::raw_request(
        app.clone(),
        req(
            "GET",
            &format!("/api/v1/admin/photo-processing/composite-tasks/{task_id}"),
            Value::Null,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{fetched}");
    assert_eq!(fetched["data"]["id"], task_id);

    // 同步预览：还没有合成成功的照片，返回空；未配对计数只统计已成功的，所以是 0。
    let (status, _, pairs) = common::raw_request(
        app.clone(),
        req(
            "GET",
            &format!(
                "/api/v1/admin/photo-processing/groups/{group_id}/composited-pairs?worker_id={worker}"
            ),
            Value::Null,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{pairs}");
    assert_eq!(pairs["data"]["unpaired_count"], 0, "{pairs}");
    assert!(pairs["data"]["items"].as_array().unwrap().is_empty());

    // 伪造两张合成成功结果，确认按 worker + 同日进/出配成一对。
    let photo_ids: Vec<Uuid> =
        sqlx::query_scalar("SELECT id FROM photo_processing_group_photos WHERE group_id = $1::uuid")
            .bind(group_id.as_str())
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(photo_ids.len(), 2);
    for (index, photo_id) in photo_ids.iter().enumerate() {
        sqlx::query(
            r#"UPDATE photo_processing_group_photos
               SET composite_status='success',
                   composite_photo_url=$2,
                   composited_at=NOW()
               WHERE id=$1"#,
        )
        .bind(photo_id)
        .bind(format!("https://example.com/composite-{index}.jpg"))
        .execute(&pool)
        .await
        .unwrap();
    }

    let (status, _, pairs) = common::raw_request(
        app.clone(),
        req(
            "GET",
            &format!(
                "/api/v1/admin/photo-processing/groups/{group_id}/composited-pairs?worker_id={worker}"
            ),
            Value::Null,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{pairs}");
    let pair_items = pairs["data"]["items"].as_array().unwrap();
    assert_eq!(pair_items.len(), 1, "{pairs}");
    assert_eq!(pair_items[0]["attendance_date"], "2026-09-05");
    assert_ne!(pair_items[0]["in_photo"], pair_items[0]["out_photo"]);
    assert_eq!(pairs["data"]["unpaired_count"], 0, "{pairs}");

    // 换一个 worker 查询时拿不到别人的照片（权限隔离）。
    let other_worker = Uuid::new_v4();
    let (status, _, pairs) = common::raw_request(
        app.clone(),
        req(
            "GET",
            &format!(
                "/api/v1/admin/photo-processing/groups/{group_id}/composited-pairs?worker_id={other_worker}"
            ),
            Value::Null,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{pairs}");
    assert!(pairs["data"]["items"].as_array().unwrap().is_empty());

    // 回归：组内另一名工人同一天只有出场照时，不能把两个人的照片配成一对。
    let other_worker: Uuid = sqlx::query_scalar(
        r#"INSERT INTO construction_workers(project_id,unit_id,team_id,name)
           SELECT $1,unit_id,team_id,'照片工人乙' FROM construction_workers WHERE id=$2 RETURNING id"#,
    )
    .bind(project)
    .bind(worker)
    .fetch_one(&pool)
    .await
    .unwrap();
    let other_record: Uuid = sqlx::query_scalar(
        r#"INSERT INTO construction_attendance_records
           (project_id, worker_id, direction, trigger_time, record_type, serial_number)
           VALUES ($1,$2,1,(TIMESTAMPTZ '2026-09-05 00:00:00+08' + make_interval(hours => 19)),'device','SN-PHOTO-002')
           RETURNING id"#,
    )
    .bind(project)
    .bind(other_worker)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        r#"INSERT INTO construction_attendance_record_photos
           (attendance_record_id, project_id, worker_id, photo_kind, photo_data, source)
           VALUES ($1,$2,$3,'closeup',$4,'mqtt_device_photo')"#,
    )
    .bind(other_record)
    .bind(project)
    .bind(other_worker)
    .bind(data_uri())
    .execute(&pool)
    .await
    .unwrap();
    let (status, _, other_photos) = common::raw_request(
        app.clone(),
        req(
            "GET",
            &format!(
                "/api/v1/admin/photo-processing/attendance-photos?project_id={project}&worker_id={other_worker}"
            ),
            Value::Null,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{other_photos}");
    let other_items = other_photos["data"]["items"].as_array().unwrap();
    assert_eq!(other_items.len(), 1, "{other_photos}");
    let (status, _, other_added) = common::raw_request(
        app.clone(),
        req(
            "POST",
            &format!("/api/v1/admin/photo-processing/groups/{group_id}/photos"),
            json!({
                "photos": other_items.iter().map(|item| json!({
                    "attendance_record_id": item["attendance_record_id"],
                    "project_id": item["project_id"],
                    "worker_id": item["worker_id"],
                    "worker_name": item["worker_name"],
                    "attendance_date": item["attendance_date"],
                    "direction": item["direction"],
                    "photo_url": data_uri(),
                })).collect::<Vec<_>>()
            }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{other_added}");
    assert_eq!(other_added["data"]["added"], 1, "{other_added}");
    sqlx::query(
        r#"UPDATE photo_processing_group_photos
           SET composite_status='success', composite_photo_url='https://example.com/other-out.jpg'
           WHERE group_id=$1 AND worker_id=$2"#,
    )
    .bind(Uuid::parse_str(&group_id).unwrap())
    .bind(other_worker)
    .execute(&pool)
    .await
    .unwrap();

    // 原工人的一对仍然是原工人自己的照片。
    let (status, _, pairs) = common::raw_request(
        app.clone(),
        req(
            "GET",
            &format!(
                "/api/v1/admin/photo-processing/groups/{group_id}/composited-pairs?worker_id={worker}"
            ),
            Value::Null,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{pairs}");
    let pair_items = pairs["data"]["items"].as_array().unwrap();
    assert_eq!(pair_items.len(), 1, "{pairs}");
    assert_eq!(pair_items[0]["in_count"], 1, "{pairs}");
    assert_eq!(pair_items[0]["out_count"], 1, "{pairs}");
    for key in ["in_photo", "out_photo"] {
        assert_ne!(
            pair_items[0][key], "https://example.com/other-out.jpg",
            "{key} 混进了别人的出场照"
        );
    }
    assert_eq!(pairs["data"]["unpaired_count"], 0, "{pairs}");

    // 出场单独的工人没配上对，不计入 items，但要在未配对提示里体现。
    let (status, _, pairs) = common::raw_request(
        app.clone(),
        req(
            "GET",
            &format!(
                "/api/v1/admin/photo-processing/groups/{group_id}/composited-pairs?worker_id={other_worker}"
            ),
            Value::Null,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{pairs}");
    assert!(pairs["data"]["items"].as_array().unwrap().is_empty(), "{pairs}");
    assert_eq!(pairs["data"]["unpaired_count"], 1, "{pairs}");
}

/// worker 的落库路径：合成完成后要把 URL/对象键/任务 ID 一并写回照片行。
/// 回归 mark_photo_success 的 `$n` 编号与 bind 个数不匹配导致写入失败的问题。
#[tokio::test]
async fn mark_photo_success_writes_composite_result_fields() {
    use quax::feature::admin::photo::repository::{PhotoRepository, PhotoRepositoryImpl};

    let (_app, pool, _container) = common::build_test_app_with_pool().await;
    let admin_id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO users (email, username, role, is_active, email_verified)
           VALUES ('photo-write@example.com', 'photo_write', 'admin', TRUE, TRUE)
           RETURNING id"#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects(name) VALUES('照片写入项目') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let group_id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO photo_processing_groups(name, created_by) VALUES('写入组', $1) RETURNING id"#,
    )
    .bind(admin_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let task_id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO photo_composite_tasks(group_id, status, total_count, output_size)
           VALUES ($1, 'running', 1, '1024x1536') RETURNING id"#,
    )
    .bind(group_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let photo_id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO photo_processing_group_photos
           (group_id, project_id, worker_name, attendance_date, direction, photo_url)
           VALUES ($1, $2, '写入工人', '2026-09-20', 0, 'https://example.invalid/a.jpg')
           RETURNING id"#,
    )
    .bind(group_id)
    .bind(project)
    .fetch_one(&pool)
    .await
    .unwrap();

    let repository = PhotoRepositoryImpl;
    repository
        .mark_photo_success(
            &pool,
            photo_id,
            task_id,
            "https://example.invalid/composite.png",
            "uploads/photo-composite/key.png",
            Some("gen-123"),
        )
        .await
        .expect("mark_photo_success 必须写入成功");

    let row = sqlx::query_as::<_, (String, String, String, Option<String>, Uuid)>(
        r#"SELECT composite_status, composite_photo_url, composite_object_key,
                  composite_generation_id, composite_task_id
           FROM photo_processing_group_photos WHERE id = $1"#,
    )
    .bind(photo_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(row.0, "success");
    assert_eq!(row.1, "https://example.invalid/composite.png");
    assert_eq!(row.2, "uploads/photo-composite/key.png");
    assert_eq!(row.3.as_deref(), Some("gen-123"));
    assert_eq!(row.4, task_id);

    // 非 pending 状态不会被重复覆盖（重复进入时保留第一次的结果）。
    let skipped = repository
        .mark_photo_success(
            &pool,
            photo_id,
            task_id,
            "https://example.invalid/second.png",
            "uploads/photo-composite/second.png",
            None,
        )
        .await;
    assert!(skipped.is_ok());
    let url: String = sqlx::query_scalar(
        "SELECT composite_photo_url FROM photo_processing_group_photos WHERE id = $1",
    )
    .bind(photo_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(url, "https://example.invalid/composite.png");

    // find_task 必须按 id 精确命中：多个任务并存时不能返回同组另一个任务，
    // 否则前端轮询看到的是别人的进度。
    let second_task: Uuid = sqlx::query_scalar(
        r#"INSERT INTO photo_composite_tasks(group_id, status, total_count, output_size)
           VALUES ($1, 'pending', 1, '1024x1536') RETURNING id"#,
    )
    .bind(group_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_ne!(second_task, task_id);
    for expected in [task_id, second_task] {
        let found = repository
            .find_task(&pool, expected)
            .await
            .expect("find_task 查询失败")
            .expect("任务必须存在");
        assert_eq!(found.id, expected);
    }
}
