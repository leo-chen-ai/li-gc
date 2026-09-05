mod common;
use axum::{
    Json, Router,
    body::Body,
    http::{Request, StatusCode},
    routing::post,
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use quax::{
    feature::{
        auth::{Role, utils::jwt::create_token_pair},
        face::logs,
    },
    routes::app_routes,
};
use serde_json::{Value, json};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[tokio::test]
async fn logs_capture_outcomes_and_protect_photos() {
    let (mut state, pool, _container) = common::build_test_state_with_pool().await;
    let response = Arc::new(RwLock::new(
        json!({"ok":true,"matched":false,"reason":"no_face","threshold":0.45,"diagnostics":{"detection_threshold":0.35,"detection_peak_score":0.2,"face_count":0}}),
    ));
    let mock_response = response.clone();
    let mock = Router::new().route(
        "/api/recognize",
        post(move || {
            let r = mock_response.clone();
            async move { Json(r.read().await.clone()) }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut config = (*state.config).clone();
    config.face.face_service_url = format!("http://{}", listener.local_addr().unwrap());
    state.config = Arc::new(config);
    let server = tokio::spawn(async move {
        axum::serve(listener, mock).await.unwrap();
    });
    let app = app_routes(state);
    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects(name) VALUES('日志测试项目') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let other: Uuid = sqlx::query_scalar(
        "INSERT INTO construction_projects(name) VALUES('隔离项目') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let point:Uuid=sqlx::query_scalar("INSERT INTO construction_attendance_points(project_id,name,machine_mode_enabled) VALUES($1,'入口',TRUE) RETURNING id").bind(project).fetch_one(&pool).await.unwrap();
    let admin = create_token_pair(Uuid::new_v4(), "admin@example.com", &[Role::Admin])
        .unwrap()
        .access_token;
    let user_id:Uuid=sqlx::query_scalar("INSERT INTO users(email,username,role,is_active,email_verified) VALUES('logs@example.com','logs-test','user',TRUE,TRUE) RETURNING id").fetch_one(&pool).await.unwrap();
    sqlx::query("INSERT INTO user_managed_projects(user_id,project_id) VALUES($1,$2)")
        .bind(user_id)
        .bind(project)
        .execute(&pool)
        .await
        .unwrap();
    let user = create_token_pair(user_id, "logs@example.com", &[Role::User])
        .unwrap()
        .access_token;
    let mut encoded = std::io::Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(20, 20)
        .write_to(&mut encoded, image::ImageFormat::Png)
        .unwrap();
    let image = STANDARD.encode(encoded.into_inner());
    let body = json!({"image":format!("data:image/png;base64,{image}"),"camera_position":"front","camera_zoom":1,"location":{"latitude":30.123456,"longitude":120.654321,"accuracy":12.0,"captured_at":chrono::Utc::now().to_rfc3339()}});
    let uri = format!("/api/v1/miniapp/projects/{project}/attendance-points/{point}/recognize");
    let request = |method: &str, url: &str, token: &str, body: Value| {
        Request::builder()
            .method(method)
            .uri(url)
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    };
    let (status, _, answer) =
        common::raw_request(app.clone(), request("POST", &uri, &admin, body.clone())).await;
    assert_eq!(status, StatusCode::OK, "{answer}");
    let id = Uuid::parse_str(answer["data"]["log_id"].as_str().unwrap()).unwrap();
    let list_url = "/api/v1/management/face-recognition-logs";
    // 菜单与项目授权分别验证。
    assert_eq!(
        common::raw_request(app.clone(), request("GET", list_url, &user, json!(null)))
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        common::raw_request(
            app.clone(),
            request(
                "GET",
                &format!("{list_url}/{id}/photos"),
                &user,
                json!(null)
            )
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    sqlx::query("INSERT INTO role_menu_permissions(role_id,menu_key) SELECT id,'face_recognition_logs' FROM role_configs WHERE code='user'").execute(&pool).await.unwrap();
    // Even assigned menu + project access cannot grant access to face logs.
    for url in [list_url.to_string(), format!("{list_url}/{id}/photos")] {
        assert_eq!(
            common::raw_request(app.clone(), request("GET", &url, &user, json!(null)))
                .await
                .0,
            StatusCode::FORBIDDEN
        );
    }
    let (status, _, answer) =
        common::raw_request(app.clone(), request("GET", list_url, &admin, json!(null))).await;
    assert_eq!(status, StatusCode::OK, "{answer}");
    assert_eq!(answer["data"]["total"], 1);
    assert_eq!(answer["data"]["items"][0]["status"], "not_matched");
    let photos_url = format!("{list_url}/{id}/photos");
    let (status, headers, photos) = common::raw_request(
        app.clone(),
        request("GET", &photos_url, &admin, json!(null)),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers["cache-control"], "no-store");
    assert!(
        photos["data"]["photo"]
            .as_str()
            .unwrap()
            .starts_with("data:image/jpeg;base64,")
    );

    let candidates = json!([
        {"person_id":Uuid::new_v4(),"name":"候选甲","score":0.3},
        {"person_id":Uuid::new_v4(),"name":"候选乙","score":0.2},
        {"person_id":Uuid::new_v4(),"name":"候选丙","score":0.1}
    ]);
    *response.write().await = json!({"ok":true,"matched":false,"reason":"low_score","score":0.3,"threshold":0.45,"candidates":candidates,"diagnostics":{"face_count":1,"detection_score":0.8,"crop_image":image}});
    let (_, _, answer) =
        common::raw_request(app.clone(), request("POST", &uri, &admin, body.clone())).await;
    let crop_id = Uuid::parse_str(answer["data"]["log_id"].as_str().unwrap()).unwrap();
    let (details, has_crop): (Value, bool) = sqlx::query_as(
        "SELECT details,crop_photo IS NOT NULL FROM construction_face_recognition_logs WHERE id=$1",
    )
    .bind(crop_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(has_crop);
    assert_eq!(details["recognition"]["candidates"], candidates);
    let (_, _, listed) =
        common::raw_request(app.clone(), request("GET", list_url, &admin, json!(null))).await;
    let listed_log = listed["data"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"] == crop_id.to_string())
        .unwrap();
    assert_eq!(
        listed_log["details"]["recognition"]["candidates"],
        candidates
    );
    assert!(
        details["recognition"]["diagnostics"]
            .get("crop_image")
            .is_none(),
        "列表不能泄漏照片内容"
    );

    let worker:Uuid=sqlx::query_scalar("WITH u AS (INSERT INTO construction_units(project_id,company_name) VALUES($1,'测试单位') RETURNING id), t AS (INSERT INTO construction_teams(project_id,unit_id,name,work_type) SELECT $1,id,'测试班组',900 FROM u RETURNING id,unit_id) INSERT INTO construction_workers(project_id,unit_id,team_id,name) SELECT $1,unit_id,id,'测试工人' FROM t RETURNING id").bind(project).fetch_one(&pool).await.unwrap();
    *response.write().await = json!({"ok":true,"matched":true,"person_id":worker,"name":"测试工人","score":0.8,"threshold":0.45});
    let (status, _, answer) =
        common::raw_request(app.clone(), request("POST", &uri, &admin, body.clone())).await;
    assert_eq!(status, StatusCode::OK, "{answer}");
    assert_eq!(answer["data"]["matched"], true);
    let record_id = answer["data"]["record_id"].as_str().unwrap();
    let stored: Value =
        sqlx::query_scalar("SELECT location FROM construction_attendance_records WHERE id=$1")
            .bind(Uuid::parse_str(record_id).unwrap())
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(stored["latitude"], body["location"]["latitude"]);
    assert_eq!(stored["longitude"], body["location"]["longitude"]);
    assert_eq!(stored["accuracy"], 12.0);
    assert_eq!(stored["point_name"], "入口");
    assert_eq!(stored["point_id"], point.to_string());
    assert_eq!(stored["coordinate_system"], "gcj02");
    let (_, _, records) = common::raw_request(
        app.clone(),
        request(
            "GET",
            &format!("/api/v1/management/projects/{project}/attendance-records"),
            &admin,
            json!(null),
        ),
    )
    .await;
    assert_eq!(records["data"]["items"][0]["location"], stored, "{records}");
    let (_, _, today) = common::raw_request(
        app.clone(),
        request(
            "GET",
            &format!("/api/v1/miniapp/projects/{project}/attendance-points/{point}/records/today"),
            &admin,
            json!(null),
        ),
    )
    .await;
    assert_eq!(today["data"][0]["location"], stored);
    let saved_photo: String = sqlx::query_scalar("SELECT photo_data FROM construction_attendance_record_photos WHERE attendance_record_id=$1 AND source='miniapp_face' AND photo_kind='closeup'")
        .bind(Uuid::parse_str(record_id).unwrap()).fetch_one(&pool).await.unwrap();
    assert!(saved_photo.starts_with("data:image/jpeg;base64,"));
    assert_eq!(today["data"][0]["closeup_photo"], saved_photo);
    assert_eq!(records["data"]["items"][0]["closeup_photo"], saved_photo);
    let has_column: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='construction_attendance_records' AND column_name='closeup_photo')").fetch_one(&pool).await.unwrap();
    assert!(!has_column, "主表不能继续存特写照片");

    let comment: Option<String> = sqlx::query_scalar("SELECT col_description('construction_attendance_records'::regclass, attnum) FROM pg_attribute WHERE attrelid='construction_attendance_records'::regclass AND attname='location'").fetch_one(&pool).await.unwrap();
    assert!(comment.unwrap().contains("定位"));
    // Failed photo persistence must roll back the attendance insert as well.
    let before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM construction_attendance_records")
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::raw_sql("CREATE FUNCTION reject_miniapp_photo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test photo failure'; END $$; CREATE TRIGGER reject_miniapp_photo BEFORE INSERT ON construction_attendance_record_photos FOR EACH ROW EXECUTE FUNCTION reject_miniapp_photo();").execute(&pool).await.unwrap();
    assert_eq!(
        common::raw_request(app.clone(), request("POST", &uri, &admin, body.clone()))
            .await
            .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    let after: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM construction_attendance_records")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(before, after);
    sqlx::raw_sql("DROP TRIGGER reject_miniapp_photo ON construction_attendance_record_photos; DROP FUNCTION reject_miniapp_photo();").execute(&pool).await.unwrap();
    let mut invalid = body.clone();
    invalid["location"]["latitude"] = json!(91);
    assert_eq!(
        common::raw_request(app.clone(), request("POST", &uri, &admin, invalid))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    let mut missing = body.clone();
    missing.as_object_mut().unwrap().remove("location");
    for payload in [missing, {
        let mut v = body.clone();
        v["location"] = Value::Null;
        v
    }] {
        let (status, _, result) =
            common::raw_request(app.clone(), request("POST", &uri, &admin, payload)).await;
        assert_eq!(status, StatusCode::OK, "{result}");
        assert_eq!(result["data"]["matched"], true);
        let id = Uuid::parse_str(result["data"]["record_id"].as_str().unwrap()).unwrap();
        let saved: (bool, Uuid) = sqlx::query_as("SELECT location IS NULL, attendance_point_id FROM construction_attendance_records WHERE id=$1").bind(id).fetch_one(&pool).await.unwrap();
        assert!(saved.0);
        assert_eq!(saved.1, point);
    }
    let (_, _, denied) = common::raw_request(
        app.clone(),
        request(
            "GET",
            &format!("/api/v1/management/projects/{other}/attendance-records"),
            &user,
            json!(null),
        ),
    )
    .await;
    assert!(denied["data"].is_null());

    *response.write().await = json!({"ok":false,"error":"模型测试异常"});
    assert_eq!(
        common::raw_request(app.clone(), request("POST", &uri, &admin, body.clone()))
            .await
            .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    let statuses:Vec<String>=sqlx::query_scalar("SELECT status FROM construction_face_recognition_logs WHERE project_id=$1 ORDER BY created_at").bind(project).fetch_all(&pool).await.unwrap();
    assert_eq!(
        statuses,
        vec![
            "not_matched",
            "not_matched",
            "success",
            "error",
            "success",
            "success",
            "error"
        ]
    );

    sqlx::query("UPDATE construction_face_recognition_logs SET created_at=NOW()-INTERVAL '8 days' WHERE id=$1").bind(id).execute(&pool).await.unwrap();
    assert_eq!(
        common::raw_request(
            app.clone(),
            request("GET", &photos_url, &admin, json!(null))
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    logs::cleanup(&pool).await.unwrap();
    let retained: bool = sqlx::query_scalar(
        "SELECT photo IS NULL FROM construction_face_recognition_logs WHERE id=$1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(retained);
    sqlx::query("UPDATE construction_face_recognition_logs SET created_at=NOW()-INTERVAL '31 days' WHERE id=$1").bind(id).execute(&pool).await.unwrap();
    logs::cleanup(&pool).await.unwrap();
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM construction_face_recognition_logs WHERE id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
    let missing:i64=sqlx::query_scalar("SELECT COUNT(*) FROM pg_attribute WHERE attrelid='construction_face_recognition_logs'::regclass AND attnum>0 AND NOT attisdropped AND col_description(attrelid,attnum) IS NULL").fetch_one(&pool).await.unwrap();
    assert_eq!(missing, 0);
    sqlx::raw_sql(include_str!(
        "../migrations/059_face_recognition_logs.down.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!(
        "../migrations/059_face_recognition_logs.up.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    server.abort();
}
