use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use tokio::time::{Duration, interval};
use uuid::Uuid;

use crate::state::AppState;

const DEFAULT_PHOTO_ENDPOINT: &str = "https://gd.aibims.com/api.php/Aiot/V1/uploadAiotLogs";
const WORKER_INTERVAL_SECONDS: u64 = 10;
const CLAIM_LIMIT: i64 = 20;

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
        match send_attendance_photo(client, endpoint, &job).await {
            Ok(attempt) => mark_success(pool, &job, attempt).await?,
            Err(error) => mark_failure(pool, &job, &error).await?,
        }
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

async fn send_attendance_photo(
    client: &Client,
    endpoint: &str,
    job: &DispatchJob,
) -> Result<DispatchAttemptSuccess, DispatchAttemptError> {
    let request = build_request(job);
    let request_body = serde_json::to_value(&request).unwrap_or(Value::Null);
    let request_payload = serde_json::json!({
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

fn build_request(job: &DispatchJob) -> AttendancePhotoRequest {
    AttendancePhotoRequest {
        param_type: "check_port",
        device_id: job.device_id.clone(),
        worker_id: job.worker_id.to_string(),
        name: job.worker_name.clone(),
        photo: job.photo_url.clone(),
        platform: "danGong",
        dev_id: job.device_id.clone(),
        dir: if job.direction == 0 { "in" } else { "out" },
    }
}

async fn mark_success(
    pool: &PgPool,
    job: &DispatchJob,
    attempt: DispatchAttemptSuccess,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
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
    .bind(attempt.result.clone())
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO device_dispatch_events (job_id, event_type, message, payload, response_payload) VALUES ($1, 'attendance_photo_pushed', '弹厂家考勤照片接口接收成功', $2, $3)",
    )
    .bind(job.id)
    .bind(attempt.request_payload)
    .bind(attempt.response_payload)
    .execute(&mut *tx)
    .await?;
    refresh_record_status(&mut tx, job.managed_attendance_record_id).await?;
    tx.commit().await
}

async fn mark_failure(
    pool: &PgPool,
    job: &DispatchJob,
    error: &DispatchAttemptError,
) -> Result<(), sqlx::Error> {
    let exhausted = job.attempt_count >= job.max_attempts;
    let retry_seconds = 30_i64 * 2_i64.pow(job.attempt_count.saturating_sub(1).min(6) as u32);
    let mut tx = pool.begin().await?;
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
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO device_dispatch_events (job_id, event_type, message, payload, response_payload) VALUES ($1, 'attendance_photo_push_failed', $2, $3, $4)",
    )
    .bind(job.id)
    .bind(&error.message)
    .bind(&error.request_payload)
    .bind(&error.response_payload)
    .execute(&mut *tx)
    .await?;
    refresh_record_status(&mut tx, job.managed_attendance_record_id).await?;
    tx.commit().await
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
        let value = serde_json::to_value(build_request(&job)).unwrap();
        assert_eq!(value["paramType"], "check_port");
        assert_eq!(value["platform"], "danGong");
        assert_eq!(value["device_id"], "DEVICE-B-001");
        assert_eq!(value["dev_id"], "DEVICE-B-001");
        assert!(value.get("projectId").is_none());
        assert_eq!(value["worker_id"], "22222222-2222-2222-2222-222222222222");
        assert_eq!(value["photo"], "https://example.test/photo.jpg");
        assert_eq!(value["dir"], "out");
        assert!(value.get("base64").is_none());
        assert!(value.get("time").is_none());
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
