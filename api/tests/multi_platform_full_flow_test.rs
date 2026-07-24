mod common;

use std::{
    collections::HashMap,
    io::Cursor,
    sync::{
        Arc,
        atomic::{AtomicI64, Ordering},
    },
};

use axum::{
    Json, Router,
    body::Bytes,
    extract::State,
    http::{HeaderMap, Method, StatusCode, Uri},
    routing::any,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use serde_json::{Value, json};
use sqlx::PgPool;
use tokio::{net::TcpListener, sync::Mutex, task::JoinHandle};
use uuid::Uuid;

use quax::{
    feature::integration::{outbox_worker, yongxin_job_worker},
    state::AppState,
};

#[derive(Clone, Copy)]
enum MockKind {
    Ningbo,
    Yongxin,
}

#[derive(Clone, Debug)]
struct ReceivedRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Value,
}

#[derive(Clone)]
struct MockState {
    kind: MockKind,
    sequence: Arc<AtomicI64>,
    received: Arc<Mutex<Vec<ReceivedRequest>>>,
    fail_remaining: Arc<Mutex<HashMap<String, usize>>>,
}

struct MockServer {
    base_url: String,
    state: MockState,
    task: JoinHandle<()>,
}

impl MockServer {
    async fn start(kind: MockKind) -> Self {
        Self::start_with_failures(kind, HashMap::new()).await
    }

    async fn start_with_failures(kind: MockKind, fail_remaining: HashMap<String, usize>) -> Self {
        let state = MockState {
            kind,
            sequence: Arc::new(AtomicI64::new(10_000)),
            received: Arc::new(Mutex::new(Vec::new())),
            fail_remaining: Arc::new(Mutex::new(fail_remaining)),
        };
        let app = Router::new()
            .fallback(any(mock_receiver))
            .with_state(state.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let task = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        Self {
            base_url: format!("http://localhost:{port}/"),
            state,
            task,
        }
    }

    async fn requests(&self) -> Vec<ReceivedRequest> {
        self.state.received.lock().await.clone()
    }
}

impl Drop for MockServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn mock_receiver(
    State(state): State<MockState>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    bytes: Bytes,
) -> (StatusCode, Json<Value>) {
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).into_owned()))
    };
    let path = uri.path().to_owned();
    let recorded_headers = headers
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.as_str().to_owned(), value.to_owned()))
        })
        .collect();
    state.received.lock().await.push(ReceivedRequest {
        method: method.to_string(),
        path: path.clone(),
        headers: recorded_headers,
        body: body.clone(),
    });

    let should_fail = {
        let mut failures = state.fail_remaining.lock().await;
        match failures.get_mut(&path) {
            Some(remaining) if *remaining > 0 => {
                *remaining -= 1;
                true
            }
            _ => false,
        }
    };
    if should_fail {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"code": 503, "msg": "mock transient failure"})),
        );
    }

    let id = state.sequence.fetch_add(1, Ordering::Relaxed);
    let response = match state.kind {
        MockKind::Ningbo => match path.as_str() {
            "/Project/AddTeam" => json!({"TeamId": id, "Message": "mock accepted"}),
            "/Project/ListTeams" => json!({"Data": {"List": [], "TotalCount": 0}}),
            "/EnterpriseWorker/GetWorkerCode" => json!({"Data": null}),
            "/EnterpriseWorker/AddOrUpdateWorker" => {
                json!({"WorkerCode": format!("MOCK-WORKER-{id}")})
            }
            "/EnterpriseWorker/AddEnterpriseOfWorker" => json!({"Success": true}),
            "/Project/AddWorkerV2" => json!({"ProjectWorkerId": id}),
            "/Project/EditWorker" | "/Project/ProjectWorkerExit" | "/Project/TeamExit" => {
                json!({"Success": true})
            }
            _ => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({"Message": "unknown mock path"})),
                );
            }
        },
        MockKind::Yongxin => match path.as_str() {
            "/project/v1/query" => json!({
                "code": 0,
                "msg": "mock accepted",
                "data": {"projectCode": headers.get("projectCode").and_then(|v| v.to_str().ok())}
            }),
            "/projectCorp/v2/add" => json!({"code": 0, "msg": "mock accepted", "data": null}),
            "/team/v2/add" => json!({
                "code": 0,
                "msg": "mock accepted",
                "data": {"teamSysNo": format!("MOCK-TEAM-{id}")}
            }),
            "/worker/v2/add" | "/entryExit/v2/add" | "/attend/v2/add" => json!({
                "code": 0,
                "msg": "mock queued",
                "data": {"requestSerialCode": format!("MOCK-ASYNC-{id}")}
            }),
            "/asyncHandleResult/v1/query" => json!({
                "code": 0,
                "msg": "mock completed",
                "data": {
                    "requestSerialCode": body.get("requestSerialCode"),
                    "state": "2",
                    "message": "mock completed"
                }
            }),
            "/sysFile/v1/uploadImg" => json!({
                "code": 0,
                "msg": "mock accepted",
                "data": format!("/mock/{id}.png")
            }),
            _ => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({"code": 404, "msg": "unknown mock path"})),
                );
            }
        },
    };
    (StatusCode::OK, Json(response))
}

#[derive(Debug)]
struct SeededProject {
    project_id: Uuid,
    team_ids: Vec<Uuid>,
    worker_ids: Vec<Uuid>,
    attendance_ids: Vec<Uuid>,
    identity_cards: Vec<String>,
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn three_project_platform_matrix_pushes_every_supported_entity_without_cross_talk() {
    unsafe {
        std::env::set_var("NINGBO_HOUSING_ALLOWED_HOSTS", "localhost");
    }
    let ningbo = MockServer::start(MockKind::Ningbo).await;
    let yongxin = MockServer::start_with_failures(
        MockKind::Yongxin,
        HashMap::from([("/worker/v2/add".to_owned(), 1)]),
    )
    .await;
    let (state, pool, _container) = common::build_test_state_with_pool().await;

    let yongxin_only = create_project(&pool, "模拟-仅甬薪").await;
    let both = create_project(&pool, "模拟-双平台").await;
    let no_platform = create_project(&pool, "模拟-零配置").await;

    insert_yongxin_config(
        &pool,
        yongxin_only,
        &yongxin.base_url,
        "YX-ONE",
        "yx-one-key",
    )
    .await;
    insert_yongxin_config(&pool, both, &yongxin.base_url, "YX-BOTH", "yx-both-key").await;
    insert_ningbo_config(&pool, both, &ningbo.base_url).await;

    let (image_data_uri, image_base64) = generated_test_image();
    let yongxin_only =
        seed_complete_project(&pool, yongxin_only, 1, &image_data_uri, &image_base64).await;
    let both = seed_complete_project(&pool, both, 2, &image_data_uri, &image_base64).await;
    let no_platform =
        seed_complete_project(&pool, no_platform, 3, &image_data_uri, &image_base64).await;

    for team_id in &both.team_ids {
        outbox_worker::enqueue_team_sync(&pool, both.project_id, *team_id)
            .await
            .unwrap();
    }
    for worker_id in &both.worker_ids {
        outbox_worker::enqueue_worker_reconcile(&pool, both.project_id, *worker_id, false)
            .await
            .unwrap();
    }
    // Enqueueing legacy city events for projects without a city configuration
    // must still be harmless and must not create city jobs or HTTP requests.
    for project in [&yongxin_only, &no_platform] {
        for team_id in &project.team_ids {
            outbox_worker::enqueue_team_sync(&pool, project.project_id, *team_id)
                .await
                .unwrap();
        }
        for worker_id in &project.worker_ids {
            outbox_worker::enqueue_worker_reconcile(&pool, project.project_id, *worker_id, false)
                .await
                .unwrap();
        }
    }

    drain_outbox(&state).await;
    drain_yongxin(&state, &pool).await;

    assert_no_failed_runtime_rows(&pool).await;
    assert_project_platforms(&pool, yongxin_only.project_id, &["yongxin_v2"]).await;
    assert_project_platforms(&pool, both.project_id, &["ningbo_housing", "yongxin_v2"]).await;
    assert_project_platforms(&pool, no_platform.project_id, &[]).await;

    assert_mapping_count(&pool, yongxin_only.project_id, 8).await;
    assert_mapping_count(&pool, both.project_id, 12).await;
    assert_mapping_count(&pool, no_platform.project_id, 0).await;
    assert_eq!(yongxin_only.attendance_ids.len(), 2);
    assert_eq!(both.attendance_ids.len(), 2);
    assert_eq!(no_platform.attendance_ids.len(), 2);

    let yongxin_requests = yongxin.requests().await;
    assert_path_count(&yongxin_requests, "/project/v1/query", 2);
    assert_path_count(&yongxin_requests, "/projectCorp/v2/add", 4);
    assert_path_count(&yongxin_requests, "/team/v2/add", 4);
    assert_path_count(&yongxin_requests, "/worker/v2/add", 5);
    assert_path_count(&yongxin_requests, "/entryExit/v2/add", 4);
    assert_path_count(&yongxin_requests, "/attend/v2/add", 4);
    // All seeded photos intentionally share the same bytes. The media cache is
    // scoped per platform binding, so each Yongxin project uploads it once.
    assert_path_count(&yongxin_requests, "/sysFile/v1/uploadImg", 2);
    assert_path_count(&yongxin_requests, "/asyncHandleResult/v1/query", 12);
    assert!(
        yongxin_requests
            .iter()
            .all(|request| request.method == "POST")
    );

    let project_codes = yongxin_requests
        .iter()
        .filter(|request| request.path != "/sysFile/v1/uploadImg")
        .filter_map(|request| request.headers.get("projectcode"))
        .cloned()
        .collect::<Vec<_>>();
    assert!(project_codes.iter().any(|value| value == "YX-ONE"));
    assert!(project_codes.iter().any(|value| value == "YX-BOTH"));
    assert!(project_codes.iter().all(|value| value != "模拟-零配置"));
    for identity_card in yongxin_only
        .identity_cards
        .iter()
        .chain(&both.identity_cards)
    {
        assert!(
            !yongxin_requests
                .iter()
                .any(|request| request.body.to_string().contains(identity_card)),
            "Yongxin request leaked plaintext identity card"
        );
    }

    let ningbo_requests = ningbo.requests().await;
    assert_path_count(&ningbo_requests, "/Project/AddTeam", 2);
    assert_path_count(&ningbo_requests, "/EnterpriseWorker/GetWorkerCode", 2);
    assert_path_count(&ningbo_requests, "/EnterpriseWorker/AddOrUpdateWorker", 2);
    assert_path_count(
        &ningbo_requests,
        "/EnterpriseWorker/AddEnterpriseOfWorker",
        2,
    );
    assert_path_count(&ningbo_requests, "/Project/AddWorkerV2", 2);
    assert!(ningbo_requests.iter().all(|request| {
        request.headers.get("appkey").is_some()
            && request.headers.get("curtime").is_some()
            && request.headers.get("checksum").is_some()
    }));

    let yongxin_attempts = attempt_count(&pool, "yongxin_v2").await;
    assert_eq!(yongxin_attempts, yongxin_requests.len() as i64);
    assert_eq!(attempt_status_count(&pool, "yongxin_v2", "failed").await, 1);
    let ningbo_attempts = attempt_count(&pool, "ningbo_housing").await;
    assert_eq!(
        ningbo_attempts,
        ningbo_requests.len() as i64,
        "every municipal platform HTTP call must have an integration_attempts ledger row"
    );
    let ningbo_attempt_bodies = attempt_request_bodies(&pool, "ningbo_housing").await;
    assert!(
        ningbo_attempt_bodies
            .iter()
            .any(|body| body.to_string().contains("[REDACTED]"))
    );
    for identity_card in &both.identity_cards {
        assert!(
            !ningbo_attempt_bodies
                .iter()
                .any(|body| body.to_string().contains(identity_card)),
            "municipal platform attempt log leaked plaintext identity card"
        );
    }
}

async fn create_project(pool: &PgPool, name: &str) -> Uuid {
    sqlx::query_scalar("INSERT INTO construction_projects (name) VALUES ($1) RETURNING id")
        .bind(name)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn insert_yongxin_config(
    pool: &PgPool,
    project_id: Uuid,
    base_url: &str,
    project_code: &str,
    app_key: &str,
) {
    sqlx::query(
        r#"
        INSERT INTO construction_platform_configs (
            project_id, platform_name, platform_type, config, is_enabled
        )
        VALUES ($1, '甬薪精管开放平台 V2', 'yongxin_v2', $2, TRUE)
        "#,
    )
    .bind(project_id)
    .bind(json!({
        "base_url": base_url,
        "project_code": project_code,
        "app_key": app_key,
        "app_secret": "1234567890abcdef",
        "mode": "production",
        "modules": {
            "sync_units": true,
            "sync_teams": true,
            "sync_workers": true,
            "sync_attendance": true
        },
        "attendance_backfill_from": "2020-01-01T00:00:00+08:00"
    }))
    .execute(pool)
    .await
    .unwrap();
}

async fn insert_ningbo_config(pool: &PgPool, project_id: Uuid, base_url: &str) {
    sqlx::query(
        r#"
        INSERT INTO construction_platform_configs (
            project_id, platform_name, platform_type, config, is_enabled
        )
        VALUES ($1, '宁波市住建', 'ningbo_housing', $2, TRUE)
        "#,
    )
    .bind(project_id)
    .bind(json!({
        "base_url": base_url,
        "app_key": "city-mock-key",
        "app_secret": "city-mock-secret",
        "project_id": 2202,
        "project_guid": "00000000-0000-0000-0000-000000002202"
    }))
    .execute(pool)
    .await
    .unwrap();
}

fn generated_test_image() -> (String, String) {
    let image = RgbImage::from_pixel(4, 4, Rgb([32, 128, 224]));
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(image)
        .write_to(&mut bytes, ImageFormat::Png)
        .unwrap();
    let encoded = BASE64_STANDARD.encode(bytes.into_inner());
    (format!("data:image/png;base64,{encoded}"), encoded)
}

async fn seed_complete_project(
    pool: &PgPool,
    project_id: Uuid,
    project_index: i32,
    image_data_uri: &str,
    image_base64: &str,
) -> SeededProject {
    let mut team_ids = Vec::new();
    let mut worker_ids = Vec::new();
    let mut attendance_ids = Vec::new();
    let mut identity_cards = Vec::new();

    for entity_index in 1..=2 {
        let credit_code = format!("91330200MA2CLPX{project_index}{entity_index}N");
        let unit_id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO construction_units (
                project_id, company_name, company_credit_code, company_type,
                register_date, register_area, manager_name, manager_phone
            )
            VALUES ($1, $2, $3, 1, DATE '2026-01-01', '浙江省宁波市330200', $4, $5)
            RETURNING id
            "#,
        )
        .bind(project_id)
        .bind(format!("模拟单位-{project_index}-{entity_index}"))
        .bind(&credit_code)
        .bind(format!("联系人{project_index}{entity_index}"))
        .bind(format!("1380000{project_index:02}{entity_index:02}"))
        .fetch_one(pool)
        .await
        .unwrap();

        let team_id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO construction_teams (
                project_id, unit_id, name, work_type, leader_name, leader_phone, remark
            )
            VALUES ($1, $2, $3, 1, $4, $5, '全流程模拟')
            RETURNING id
            "#,
        )
        .bind(project_id)
        .bind(unit_id)
        .bind(format!("模拟钢筋班组-{project_index}-{entity_index}"))
        .bind(format!("班组长{project_index}{entity_index}"))
        .bind(format!("1390000{project_index:02}{entity_index:02}"))
        .fetch_one(pool)
        .await
        .unwrap();
        team_ids.push(team_id);

        let identity_card = format!("33020319900101{project_index:02}{entity_index:02}");
        let worker_id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO construction_workers (
                project_id, unit_id, team_id, id_card, name, gender, nation,
                visa_office, address, validity_period, validity_period_end,
                ocr_photo, id_card_back_file, avatar, work_type, worker_type,
                political_status, education, settlement_type, phone, work_status,
                entry_time, native_place
            )
            VALUES (
                $1, $2, $3, $4, $5, 1, '汉族', '宁波市公安局', '浙江省宁波市模拟地址',
                '2020-01-01', '2030-01-01', $6, $6, $6, 1, 1, 1, 6, 2, $7, 1,
                DATE '2026-01-02', 330200
            )
            RETURNING id
            "#,
        )
        .bind(project_id)
        .bind(unit_id)
        .bind(team_id)
        .bind(&identity_card)
        .bind(format!("模拟工人-{project_index}-{entity_index}"))
        .bind(image_data_uri)
        .bind(format!("1370000{project_index:02}{entity_index:02}"))
        .fetch_one(pool)
        .await
        .unwrap();
        worker_ids.push(worker_id);
        identity_cards.push(identity_card);

        let mut tx = pool.begin().await.unwrap();
        let attendance_id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO construction_attendance_records (
                worker_id, project_id, direction, trigger_time, serial_number, original_time
            )
            VALUES ($1, $2, $3, NOW(), $4, '2026-07-24 08:00:00')
            RETURNING id
            "#,
        )
        .bind(worker_id)
        .bind(project_id)
        .bind((entity_index - 1) as i16)
        .bind(format!("MOCK-DEVICE-{project_index}-{entity_index}"))
        .fetch_one(&mut *tx)
        .await
        .unwrap();
        sqlx::query(
            r#"
            INSERT INTO construction_attendance_record_photos (
                attendance_record_id, project_id, worker_id, photo_kind,
                photo_data, content_type, source
            )
            VALUES ($1, $2, $3, 'closeup', $4, 'image/png', 'mqtt_rec_push')
            "#,
        )
        .bind(attendance_id)
        .bind(project_id)
        .bind(worker_id)
        .bind(image_base64)
        .execute(&mut *tx)
        .await
        .unwrap();
        outbox_worker::enqueue_domain_event_tx(
            &mut tx,
            project_id,
            "construction.attendance.created",
            "attendance",
            attendance_id,
            json!({
                "operation": "insert",
                "source": "mqtt_rec_push",
                "has_photo": true
            }),
            &format!("test:mqtt:{attendance_id}"),
        )
        .await
        .unwrap();
        tx.commit().await.unwrap();
        attendance_ids.push(attendance_id);
    }

    SeededProject {
        project_id,
        team_ids,
        worker_ids,
        attendance_ids,
        identity_cards,
    }
}

async fn drain_outbox(state: &AppState) {
    for index in 0..500 {
        if outbox_worker::process_one_pending(state, "e2e-outbox")
            .await
            .unwrap()
        {
            continue;
        }
        let remaining = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM integration_outbox_events WHERE status IN ('pending', 'processing')",
        )
        .fetch_one(state.db.pool())
        .await
        .unwrap();
        if remaining == 0 {
            return;
        }
        sqlx::query(
            "UPDATE integration_outbox_events SET locked_by = NULL, locked_until = NULL WHERE status IN ('pending', 'processing')",
        )
        .execute(state.db.pool())
        .await
        .unwrap();
        assert!(index < 499, "outbox did not drain");
    }
}

async fn drain_yongxin(state: &AppState, pool: &PgPool) {
    for index in 0..1_000 {
        if yongxin_job_worker::process_one_pending(state, "e2e-yongxin")
            .await
            .unwrap()
        {
            continue;
        }
        let remaining = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*) FROM integration_jobs
            WHERE platform_code = 'yongxin_v2'
              AND status IN (
                    'pending', 'retry', 'awaiting_result',
                    'waiting_dependency', 'waiting_media', 'processing'
                  )
            "#,
        )
        .fetch_one(pool)
        .await
        .unwrap();
        if remaining == 0 {
            return;
        }
        sqlx::query(
            r#"
            UPDATE integration_jobs
            SET next_attempt_at = NOW(), locked_by = NULL, locked_until = NULL
            WHERE platform_code = 'yongxin_v2'
              AND status IN (
                    'pending', 'retry', 'awaiting_result',
                    'waiting_dependency', 'waiting_media', 'processing'
                  )
            "#,
        )
        .execute(pool)
        .await
        .unwrap();
        sqlx::query("UPDATE integration_rate_limits SET next_allowed_at = NOW()")
            .execute(pool)
            .await
            .unwrap();
        assert!(index < 999, "Yongxin jobs did not drain");
    }
}

async fn assert_no_failed_runtime_rows(pool: &PgPool) {
    let outbox_failures = sqlx::query_as::<_, (String, String, Option<String>)>(
        "SELECT event_type, status, last_error FROM integration_outbox_events WHERE status NOT IN ('success', 'completed') ORDER BY created_at",
    )
    .fetch_all(pool)
    .await
    .unwrap();
    assert!(
        outbox_failures.is_empty(),
        "all outbox events must complete: {outbox_failures:#?}"
    );

    let failed_jobs = sqlx::query_as::<_, (String, String, String, Option<String>)>(
        r#"
        SELECT platform_code, operation, status, last_error FROM integration_jobs
        WHERE status NOT IN ('success', 'completed', 'disabled')
        ORDER BY created_at
        "#,
    )
    .fetch_all(pool)
    .await
    .unwrap();
    assert!(
        failed_jobs.is_empty(),
        "all configured-platform jobs must complete: {failed_jobs:#?}"
    );
}

async fn assert_project_platforms(pool: &PgPool, project_id: Uuid, expected: &[&str]) {
    let mut actual = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT platform_code FROM integration_jobs WHERE project_id = $1 ORDER BY platform_code",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await
    .unwrap();
    actual.sort();
    let mut expected = expected
        .iter()
        .map(|item| item.to_string())
        .collect::<Vec<_>>();
    expected.sort();
    assert_eq!(actual, expected);
}

async fn assert_mapping_count(pool: &PgPool, project_id: Uuid, expected: i64) {
    let actual = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM integration_entity_mappings WHERE project_id = $1 AND is_deleted = FALSE",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await
    .unwrap();
    assert_eq!(actual, expected, "unexpected entity mapping count");
}

fn assert_path_count(requests: &[ReceivedRequest], path: &str, expected: usize) {
    let actual = requests
        .iter()
        .filter(|request| request.path == path)
        .count();
    assert_eq!(actual, expected, "unexpected request count for {path}");
}

async fn attempt_count(pool: &PgPool, platform_code: &str) -> i64 {
    sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM integration_attempts attempt
        JOIN integration_jobs job ON job.id = attempt.job_id
        WHERE job.platform_code = $1
        "#,
    )
    .bind(platform_code)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn attempt_request_bodies(pool: &PgPool, platform_code: &str) -> Vec<Value> {
    sqlx::query_scalar(
        r#"
        SELECT COALESCE(attempt.request_body, '{}'::jsonb)
        FROM integration_attempts attempt
        JOIN integration_jobs job ON job.id = attempt.job_id
        WHERE job.platform_code = $1
        ORDER BY attempt.created_at, attempt.id
        "#,
    )
    .bind(platform_code)
    .fetch_all(pool)
    .await
    .unwrap()
}

async fn attempt_status_count(pool: &PgPool, platform_code: &str, status: &str) -> i64 {
    sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM integration_attempts attempt
        JOIN integration_jobs job ON job.id = attempt.job_id
        WHERE job.platform_code = $1
          AND attempt.status = $2
        "#,
    )
    .bind(platform_code)
    .bind(status)
    .fetch_one(pool)
    .await
    .unwrap()
}
