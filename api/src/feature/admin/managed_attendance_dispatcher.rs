use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use tokio::time::{Duration, interval};
use uuid::Uuid;

use crate::state::AppState;

const DEFAULT_PHOTO_ENDPOINT: &str = "https://gd.aibims.com/api.php/Api/V2/photo";
const WORKER_INTERVAL_SECONDS: u64 = 10;
const CLAIM_LIMIT: i64 = 20;
const VENDOR_PHOTO_MAX_BYTES: usize = 20 * 1024;

#[derive(Debug, FromRow)]
struct DispatchJob {
    id: Uuid,
    managed_attendance_record_id: Uuid,
    worker_id: Uuid,
    worker_name: String,
    device_id: String,
    planned_at: DateTime<Utc>,
    direction: i16,
    photo_url: String,
    attempt_count: i32,
    max_attempts: i32,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct AttendancePhotoRequest {
    base64: String,
    name: String,
    device_id: String,
    file_name: String,
    worker_id: String,
    time: String,
    direction: &'static str,
    #[serde(rename = "type")]
    passage_type: &'static str,
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
               r.planned_at,
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
    let photo_response = client
        .get(&job.photo_url)
        .send()
        .await
        .map_err(|error| attempt_error(format!("下载托管照片失败: {error}")))?
        .error_for_status()
        .map_err(|error| attempt_error(format!("下载托管照片失败: {error}")))?;
    let photo_bytes = photo_response
        .bytes()
        .await
        .map_err(|error| attempt_error(format!("读取托管照片失败: {error}")))?;
    if photo_bytes.is_empty() {
        return Err(attempt_error("托管照片内容为空"));
    }
    let encoded_photo = encode_photo_for_vendor(photo_bytes.to_vec())
        .await
        .map_err(attempt_error)?;
    let request = build_request(job, encoded_photo);
    let ts = Utc::now().timestamp_millis().to_string();
    let request_body = serde_json::to_value(&request).unwrap_or(Value::Null);
    let request_payload = serde_json::json!({
        "method": "POST",
        "url": endpoint,
        "headers": {"content-type": "application/json", "ts": ts},
        "body": request_body,
        "curl": build_curl(endpoint, &ts, &request),
    });
    let response = client
        .post(endpoint)
        .header("ts", ts)
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
    let path = parsed
        .data
        .as_ref()
        .and_then(|data| data.get("path"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    Ok(DispatchAttemptSuccess {
        result: serde_json::json!({"success": true, "code": parsed.code, "path": path}),
        request_payload,
        response_payload,
    })
}

fn attempt_error(message: impl Into<String>) -> DispatchAttemptError {
    DispatchAttemptError {
        message: message.into(),
        request_payload: None,
        response_payload: None,
    }
}

fn build_curl(endpoint: &str, ts: &str, request: &AttendancePhotoRequest) -> String {
    let body = serde_json::to_string(request).unwrap_or_else(|_| "{}".to_owned());
    format!(
        "curl --url '{}' -H 'content-type: application/json' -H 'ts: {}' --data-raw '{}'",
        shell_quote(endpoint),
        shell_quote(ts),
        shell_quote(&body),
    )
}

fn shell_quote(value: &str) -> String {
    value.replace('\'', "'\\''")
}

async fn encode_photo_for_vendor(photo_bytes: Vec<u8>) -> Result<String, String> {
    let compressed = crate::infrastructure::image_compression::compress_to_jpeg_below_async(
        photo_bytes,
        VENDOR_PHOTO_MAX_BYTES,
    )
    .await
    .map_err(|error| format!("托管照片压缩到20KB失败: {error}"))?;
    Ok(BASE64_STANDARD.encode(compressed))
}

fn parse_attendance_photo_response(body: &str) -> Result<AttendancePhotoResponse, String> {
    serde_json::from_str(body).map_err(|error| {
        format!(
            "弹厂家接口响应不是有效JSON: {error}; 原始响应: {}",
            truncate(body)
        )
    })
}

fn build_request(job: &DispatchJob, base64: String) -> AttendancePhotoRequest {
    let millis = job.planned_at.timestamp_millis();
    AttendancePhotoRequest {
        base64,
        name: job.worker_name.clone(),
        device_id: job.device_id.clone(),
        file_name: format!("{}-{millis}.jpg", job.worker_id),
        worker_id: job.worker_id.to_string(),
        time: millis.to_string(),
        direction: if job.direction == 0 { "in" } else { "out" },
        passage_type: "face",
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
    use image::{DynamicImage, ImageBuffer, Rgb};
    use std::io::Cursor;

    #[test]
    fn maps_managed_record_to_photo_contract() {
        let job = DispatchJob {
            id: Uuid::new_v4(),
            managed_attendance_record_id: Uuid::new_v4(),
            worker_id: Uuid::parse_str("22222222-2222-2222-2222-222222222222").unwrap(),
            worker_name: "测试人员".to_owned(),
            device_id: "DEVICE-B-001".to_owned(),
            planned_at: DateTime::from_timestamp_millis(1_783_353_600_123).unwrap(),
            direction: 1,
            photo_url: "https://example.test/photo.jpg".to_owned(),
            attempt_count: 1,
            max_attempts: 5,
        };
        let value = serde_json::to_value(build_request(&job, "aGVsbG8=".to_owned())).unwrap();
        assert_eq!(value["base64"], "aGVsbG8=");
        assert_eq!(value["deviceId"], "DEVICE-B-001");
        assert!(value.get("projectId").is_none());
        assert_eq!(value["workerId"], "22222222-2222-2222-2222-222222222222");
        assert_eq!(value["time"], "1783353600123");
        assert_eq!(value["direction"], "out");
        assert_eq!(value["type"], "face");
        assert!(
            value["base64"]
                .as_str()
                .is_some_and(|data| !data.starts_with("data:"))
        );
    }

    #[test]
    fn accepts_vendor_success_response_with_empty_data_array() {
        let parsed = parse_attendance_photo_response(
            r#"{"success":true,"code":0,"message":"success","data":[],"event":"photo"}"#,
        )
        .unwrap();
        assert!(parsed.success);
        assert_eq!(parsed.code, 0);
        assert_eq!(parsed.data, Some(serde_json::json!([])));
    }

    #[tokio::test]
    async fn compresses_vendor_photo_below_twenty_kilobytes_before_base64() {
        let source = ImageBuffer::from_fn(1200, 900, |x, y| {
            Rgb([
                ((x * 17 + y * 7) % 256) as u8,
                ((x * 3 + y * 19) % 256) as u8,
                ((x * 11 + y * 13) % 256) as u8,
            ])
        });
        let mut png = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(source)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();

        let encoded = encode_photo_for_vendor(png.into_inner()).await.unwrap();
        let compressed = BASE64_STANDARD.decode(encoded).unwrap();

        assert!(compressed.len() < VENDOR_PHOTO_MAX_BYTES);
        assert!(compressed.starts_with(&[0xff, 0xd8, 0xff]));
    }
}
