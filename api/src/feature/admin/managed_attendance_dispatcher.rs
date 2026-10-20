use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use tokio::time::{Duration, interval};
use uuid::Uuid;

use crate::state::AppState;

const DEFAULT_PHOTO_ENDPOINT: &str = "https://gd.aibims.com/api.php/Aiot/V1/uploadAiotLogs";
const WORKER_INTERVAL_SECONDS: u64 = 10;
// Claim only the job being sent: two sequential 30s requests fit within the 2min lease.
const CLAIM_LIMIT: i64 = 1;
const PHOTO_PLATFORMS: [&str; 2] = ["danGong", "shanHuaiZhu"];

#[derive(Debug, FromRow)]
struct DispatchJob {
    id: Uuid,
    managed_attendance_record_id: Uuid,
    worker_id: Uuid,
    worker_name: String,
    device_id: String,
    direction: i16,
    photo_url: String,
    attempt_count: i32,
    max_attempts: i32,
}

#[derive(Debug, Serialize, PartialEq)]
struct AttendancePhotoRequest {
    #[serde(rename = "paramType")]
    param_type: &'static str,
    device_id: String,
    worker_id: String,
    name: String,
    photo: String,
    // The vendor contract intentionally spells this field `platfrom`.
    #[serde(rename = "platfrom")]
    platform: &'static str,
    dev_id: String,
    dir: &'static str,
}

#[derive(Debug, Deserialize)]
struct AttendancePhotoResponse {
    success: bool,
    code: i64,
    message: Option<String>,
    data: Option<Value>,
}

#[derive(Debug)]
struct DispatchAttemptError {
    message: String,
    request_payload: Option<Value>,
    response_payload: Option<Value>,
}

#[derive(Debug)]
struct DispatchAttemptSuccess {
    result: Value,
    request_payload: Value,
    response_payload: Value,
}

pub fn spawn_managed_attendance_dispatcher(state: AppState) {
    tokio::spawn(async move {
        let endpoint = std::env::var("VENDOR_B_ATTENDANCE_PHOTO_URL")
            .unwrap_or_else(|_| DEFAULT_PHOTO_ENDPOINT.to_owned());
        let client = match Client::builder().timeout(Duration::from_secs(30)).build() {
            Ok(client) => client,
            Err(error) => {
                tracing::error!(%error, "failed to create managed attendance HTTP client");
                return;
            }
        };
        let worker_id = format!("managed-attendance-{}", Uuid::new_v4());
        let mut ticker = interval(Duration::from_secs(WORKER_INTERVAL_SECONDS));
        loop {
            ticker.tick().await;
            if let Err(error) =
                dispatch_due_jobs(state.db.pool(), &client, &endpoint, &worker_id).await
            {
                tracing::error!(%error, "managed attendance dispatch cycle failed");
            }
        }
    });
}

async fn dispatch_due_jobs(
    pool: &PgPool,
    client: &Client,
    endpoint: &str,
    worker_instance: &str,
) -> Result<(), sqlx::Error> {
    let jobs = claim_due_jobs(pool, worker_instance).await?;
    for job in jobs {
        let attempts = send_to_platforms(client, endpoint, &job).await;
        let mut tx = pool.begin().await?;
        for (platform, attempt) in &attempts {
            let (event_type, message, request, response) = match attempt {
                Ok(attempt) => (
                    "attendance_photo_pushed",
                    format!("弹厂家考勤照片接口接收成功(platfrom={platform})"),
                    Some(&attempt.request_payload),
                    Some(&attempt.response_payload),
                ),
                Err(error) => (
                    "attendance_photo_push_failed",
                    format!("platfrom={platform}: {}", error.message),
                    error.request_payload.as_ref(),
                    error.response_payload.as_ref(),
                ),
            };
            sqlx::query(
                "INSERT INTO device_dispatch_events (job_id, event_type, message, payload, response_payload) VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(job.id)
            .bind(event_type)
            .bind(message)
            .bind(request)
            .bind(response)
            .execute(&mut *tx)
            .await?;
        }
        if any_platform_succeeded(&attempts) {
            let results: serde_json::Map<String, Value> = attempts
                .iter()
                .map(|(platform, attempt)| {
                    let result = match attempt {
                        Ok(attempt) => attempt.result.clone(),
                        Err(error) => {
                            serde_json::json!({"success": false, "message": error.message})
                        }
                    };
                    (platform.to_string(), result)
                })
                .collect();
            mark_success(
                &mut tx,
                &job,
                serde_json::json!({"success": true, "platforms": results}),
            )
            .await?;
        } else {
            let message = attempts
                .iter()
                .filter_map(|(platform, attempt)| {
                    attempt
                        .as_ref()
                        .err()
                        .map(|error| format!("{platform}: {}", error.message))
                })
                .collect::<Vec<_>>()
                .join("; ");
            mark_failure(
                &mut tx,
                &job,
                &DispatchAttemptError {
                    message,
                    request_payload: None,
                    response_payload: None,
                },
            )
            .await?;
        }
        tx.commit().await?;
    }
    Ok(())
}

async fn claim_due_jobs(
    pool: &PgPool,
    worker_instance: &str,
) -> Result<Vec<DispatchJob>, sqlx::Error> {
    sqlx::query_as::<_, DispatchJob>(
        r#"
        WITH claimable AS (
            SELECT j.id
            FROM device_dispatch_jobs j
            JOIN construction_managed_attendance_records r
              ON r.id = j.managed_attendance_record_id AND r.is_deleted = FALSE
            JOIN construction_managed_attendance_configs c
              ON c.id = r.config_id AND c.is_deleted = FALSE AND c.is_enabled = TRUE
            WHERE j.job_type = 'supplemental_attendance'
              AND j.adapter_code = 'vendor_b'
              AND j.transport = 'http_push'
              AND r.planned_at <= NOW()
              AND r.photo_url IS NOT NULL
              AND BTRIM(r.photo_url) <> ''
              AND j.attempt_count < j.max_attempts
              AND (
                    (j.status = 'pending' AND j.next_attempt_at <= NOW())
                    OR (j.status = 'processing' AND j.locked_until <= NOW())
              )
            ORDER BY r.planned_at, j.id
            FOR UPDATE OF j SKIP LOCKED
            LIMIT $1
        ), claimed AS (
            UPDATE device_dispatch_jobs j
            SET status = 'processing',
                attempt_count = j.attempt_count + 1,
                sent_at = NOW(),
                locked_by = $2,
                locked_until = NOW() + INTERVAL '2 minutes',
                last_error = NULL,
                updated_at = NOW()
            FROM claimable
            WHERE j.id = claimable.id
            RETURNING j.*
        )
        SELECT c.id,
               c.managed_attendance_record_id,
               r.worker_id,
               COALESCE(r.worker_name, '') AS worker_name,
               c.device_sn AS device_id,
               r.direction,
               r.photo_url,
               c.attempt_count,
               c.max_attempts
        FROM claimed c
        JOIN construction_managed_attendance_records r
          ON r.id = c.managed_attendance_record_id
        ORDER BY r.planned_at, c.id
        "#,
    )
    .bind(CLAIM_LIMIT)
    .bind(worker_instance)
    .fetch_all(pool)
    .await
}

async fn send_to_platforms(
    client: &Client,
    endpoint: &str,
    job: &DispatchJob,
) -> Vec<(
    &'static str,
    Result<DispatchAttemptSuccess, DispatchAttemptError>,
)> {
    let mut attempts = Vec::with_capacity(PHOTO_PLATFORMS.len());
    // Always send both, even when the first request fails or succeeds.
    for platform in PHOTO_PLATFORMS {
        attempts.push((
            platform,
            send_attendance_photo(client, endpoint, job, platform).await,
        ));
    }
    attempts
}

fn any_platform_succeeded(
    attempts: &[(&str, Result<DispatchAttemptSuccess, DispatchAttemptError>)],
) -> bool {
    attempts.iter().any(|(_, attempt)| attempt.is_ok())
}

async fn send_attendance_photo(
    client: &Client,
    endpoint: &str,
    job: &DispatchJob,
    platform: &'static str,
) -> Result<DispatchAttemptSuccess, DispatchAttemptError> {
    let request = build_request(job, platform);
    let request_body = serde_json::to_value(&request).unwrap_or(Value::Null);
    let request_payload = serde_json::json!({
        "sent_at": chrono::Utc::now(),
        "method": "POST",
        "url": endpoint,
        "headers": {"content-type": "application/json"},
        "body": request_body,
        "curl": build_curl(endpoint, &request),
    });
    let response = client
        .post(endpoint)
        .json(&request)
        .send()
        .await
        .map_err(|error| DispatchAttemptError {
            message: format!("调用弹厂家考勤照片接口失败: {error}"),
            request_payload: Some(request_payload.clone()),
            response_payload: None,
        })?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| DispatchAttemptError {
            message: format!("读取弹厂家接口响应失败: {error}"),
            request_payload: Some(request_payload.clone()),
            response_payload: Some(serde_json::json!({"http_status": status.as_u16()})),
        })?;
    let response_payload = serde_json::json!({
        "received_at": chrono::Utc::now(),
        "http_status": status.as_u16(),
        "body": body,
    });
    if !status.is_success() {
        return Err(DispatchAttemptError {
            message: format!("弹厂家接口HTTP {status}: {}", truncate(&body)),
            request_payload: Some(request_payload),
            response_payload: Some(response_payload),
        });
    }
    let parsed =
        parse_attendance_photo_response(&body).map_err(|message| DispatchAttemptError {
            message,
            request_payload: Some(request_payload.clone()),
            response_payload: Some(response_payload.clone()),
        })?;
    if !parsed.success || parsed.code != 0 {
        return Err(DispatchAttemptError {
            message: format!(
                "弹厂家接口返回失败(code={}): {}",
                parsed.code,
                parsed.message.unwrap_or_else(|| "未知错误".to_owned())
            ),
            request_payload: Some(request_payload),
            response_payload: Some(response_payload),
        });
    }
    Ok(DispatchAttemptSuccess {
        result: serde_json::json!({"success": true, "code": parsed.code, "data": parsed.data}),
        request_payload,
        response_payload,
    })
}

fn build_curl(endpoint: &str, request: &AttendancePhotoRequest) -> String {
    let body = serde_json::to_string(request).unwrap_or_else(|_| "{}".to_owned());
    format!(
        "curl --url '{}' -H 'content-type: application/json' --data-raw '{}'",
        shell_quote(endpoint),
        shell_quote(&body),
    )
}

fn shell_quote(value: &str) -> String {
    value.replace('\'', "'\\''")
}

fn parse_attendance_photo_response(body: &str) -> Result<AttendancePhotoResponse, String> {
    serde_json::from_str(body).map_err(|error| {
        format!(
            "弹厂家接口响应不是有效JSON: {error}; 原始响应: {}",
            truncate(body)
        )
    })
}

fn build_request(job: &DispatchJob, platform: &'static str) -> AttendancePhotoRequest {
    AttendancePhotoRequest {
        param_type: "check_port",
        device_id: job.device_id.clone(),
        worker_id: job.worker_id.to_string(),
        name: job.worker_name.clone(),
        photo: job.photo_url.clone(),
        platform,
        dev_id: job.device_id.clone(),
        dir: if job.direction == 0 { "in" } else { "out" },
    }
}

async fn mark_success(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    job: &DispatchJob,
    result: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE device_dispatch_jobs
        SET status = 'delivered', device_result_status = 'success',
            device_result_message = '弹厂家考勤照片接口接收成功',
            device_reported_at = NOW(), ack_at = NOW(), ack_code = '0',
            ack_payload = $2, locked_by = NULL, locked_until = NULL,
            last_error = NULL, updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(job.id)
    .bind(result)
    .execute(&mut **tx)
    .await?;
    refresh_record_status(tx, job.managed_attendance_record_id).await?;
    Ok(())
}

async fn mark_failure(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    job: &DispatchJob,
    error: &DispatchAttemptError,
) -> Result<(), sqlx::Error> {
    let exhausted = job.attempt_count >= job.max_attempts;
    let retry_seconds = 30_i64 * 2_i64.pow(job.attempt_count.saturating_sub(1).min(6) as u32);
    sqlx::query(
        r#"
        UPDATE device_dispatch_jobs
        SET status = CASE WHEN $2 THEN 'failed' ELSE 'pending' END,
            device_result_status = CASE WHEN $2 THEN 'failed' ELSE 'pending' END,
            device_result_message = $3, last_error = $3,
            next_attempt_at = NOW() + make_interval(secs => $4),
            locked_by = NULL, locked_until = NULL, updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(job.id)
    .bind(exhausted)
    .bind(&error.message)
    .bind(retry_seconds)
    .execute(&mut **tx)
    .await?;
    refresh_record_status(tx, job.managed_attendance_record_id).await?;
    Ok(())
}

async fn refresh_record_status(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    record_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE construction_managed_attendance_records r
        SET dispatch_status = summary.status,
            dispatched_at = CASE WHEN summary.status IN ('success', 'failed') THEN NOW() ELSE NULL END,
            dispatch_message = summary.message,
            updated_at = NOW()
        FROM (
            SELECT CASE
                     WHEN BOOL_AND(j.device_result_status = 'success') THEN 'success'
                     WHEN BOOL_OR(j.status IN ('pending', 'processing')) THEN 'processing'
                     WHEN BOOL_OR(j.device_result_status = 'failed') THEN 'failed'
                     ELSE 'pending'
                   END AS status,
                   MAX(COALESCE(j.device_result_message, j.last_error)) AS message
            FROM device_dispatch_jobs j
            WHERE j.managed_attendance_record_id = $1
              AND j.job_type = 'supplemental_attendance'
        ) summary
        WHERE r.id = $1
        "#,
    )
    .bind(record_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

fn truncate(value: &str) -> String {
    value.chars().take(500).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_managed_record_to_photo_contract() {
        let job = DispatchJob {
            id: Uuid::new_v4(),
            managed_attendance_record_id: Uuid::new_v4(),
            worker_id: Uuid::parse_str("22222222-2222-2222-2222-222222222222").unwrap(),
            worker_name: "测试人员".to_owned(),
            device_id: "DEVICE-B-001".to_owned(),
            direction: 1,
            photo_url: "https://example.test/photo.jpg".to_owned(),
            attempt_count: 1,
            max_attempts: 5,
        };
        let value = serde_json::to_value(build_request(&job, "danGong")).unwrap();
        assert_eq!(value["paramType"], "check_port");
        assert_eq!(value["platfrom"], "danGong");
        assert!(value.get("platform").is_none());
        assert_eq!(value["device_id"], "DEVICE-B-001");
        assert_eq!(value["dev_id"], "DEVICE-B-001");
        assert!(value.get("projectId").is_none());
        assert_eq!(value["worker_id"], "22222222-2222-2222-2222-222222222222");
        assert_eq!(value["photo"], "https://example.test/photo.jpg");
        assert_eq!(value["dir"], "out");
        assert!(value.get("base64").is_none());
        assert!(value.get("time").is_none());
    }

    #[tokio::test]
    async fn sends_both_platforms_and_accepts_either_success() {
        use axum::{Json, Router, routing::post};
        use std::sync::{Arc, Mutex};

        // Cover success/failure in either order, both successes and both failures.
        for outcomes in [[true, false], [false, true], [true, true], [false, false]] {
            let received = Arc::new(Mutex::new(Vec::<Value>::new()));
            let captured = received.clone();
            let app = Router::new().route(
                "/",
                post(move |Json(body): Json<Value>| {
                    let captured = captured.clone();
                    async move {
                        let index = if body["platfrom"] == "danGong" { 0 } else { 1 };
                        captured.lock().unwrap().push(body);
                        Json(serde_json::json!({
                            "success": outcomes[index],
                            "code": if outcomes[index] { 0 } else { 1 },
                            "message": "test response",
                            "data": [],
                        }))
                    }
                }),
            );
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let endpoint = format!("http://{}/", listener.local_addr().unwrap());
            let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
            let job = DispatchJob {
                id: Uuid::new_v4(),
                managed_attendance_record_id: Uuid::new_v4(),
                worker_id: Uuid::new_v4(),
                worker_name: "测试人员".to_owned(),
                device_id: "DEVICE-B-001".to_owned(),
                direction: 0,
                photo_url: "https://example.test/photo.jpg".to_owned(),
                attempt_count: 1,
                max_attempts: 5,
            };
            let client = Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(2))
                .build()
                .unwrap();
            let attempts = send_to_platforms(&client, &endpoint, &job).await;
            assert_eq!(attempts.len(), 2);
            assert_eq!(attempts[0].1.is_ok(), outcomes[0]);
            assert_eq!(attempts[1].1.is_ok(), outcomes[1]);
            assert_eq!(
                any_platform_succeeded(&attempts),
                outcomes[0] || outcomes[1]
            );
            let bodies = received.lock().unwrap();
            assert_eq!(bodies.len(), 2);
            assert!(bodies.iter().all(|body| body.get("platform").is_none()));
            assert_eq!(bodies[0]["platfrom"], "danGong");
            assert_eq!(bodies[1]["platfrom"], "shanHuaiZhu");
            let mut first = bodies[0].clone();
            first["platfrom"] = serde_json::json!("shanHuaiZhu");
            assert_eq!(first, bodies[1]);
            server.abort();
        }
    }

    #[test]
    fn accepts_vendor_success_response_with_empty_data_array() {
        let parsed = parse_attendance_photo_response(
            r#"{"success":true,"code":0,"message":"上传成功","data":[],"event":"getparam"}"#,
        )
        .unwrap();
        assert!(parsed.success);
        assert_eq!(parsed.code, 0);
        assert_eq!(parsed.data, Some(serde_json::json!([])));
    }
}
