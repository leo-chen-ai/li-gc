use std::time::Duration;

use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use tokio::time::sleep;
use tracing::{info, warn};
use uuid::Uuid;

use crate::state::AppState;

use super::face_v203::command_topic;
use super::publisher::publish_json;

const RETRY_INTERVAL: Duration = Duration::from_secs(30);
const RETRY_BATCH_SIZE: i64 = 20;
const INELIGIBLE_WORKER_MESSAGE: &str = "人员已离场或已删除，停止重试下发";
const ACK_TIMEOUT_MESSAGE: &str = "设备未回执，已达到最大重试次数";

const FAIL_INELIGIBLE_RETRY_REPORTS_SQL: &str = r#"
        UPDATE construction_attendance_device_issue_reports r
        SET status = 'failed',
            message = $1,
            last_error = $1,
            next_retry_at = NULL,
            retry_locked_until = NULL,
            updated_at = NOW()
        FROM construction_workers w
        WHERE r.worker_id = w.id
          AND r.is_deleted = FALSE
          AND r.acknowledged_at IS NULL
          AND r.request_payload IS NOT NULL
          AND r.mqtt_message_id IS NOT NULL
          AND COALESCE(r.device_type, '') <> 'B厂家'
          AND r.status IN ('pending', 'failed')
          AND (w.is_deleted = TRUE OR COALESCE(w.work_status, 1) = 2)
        "#;

const FAIL_EXHAUSTED_RETRY_REPORTS_SQL: &str = r#"
        UPDATE construction_attendance_device_issue_reports
        SET status = 'failed',
            message = $1,
            last_error = $1,
            next_retry_at = NULL,
            retry_locked_until = NULL,
            updated_at = NOW()
        WHERE is_deleted = FALSE
          AND acknowledged_at IS NULL
          AND request_payload IS NOT NULL
          AND mqtt_message_id IS NOT NULL
          AND COALESCE(device_type, '') <> 'B厂家'
          AND status IN ('pending', 'failed')
          AND retry_count >= max_retries
          AND next_retry_at IS NOT NULL
          AND next_retry_at <= NOW()
        "#;

const CLAIM_RETRY_REPORTS_SQL: &str = r#"
        UPDATE construction_attendance_device_issue_reports r
        SET retry_locked_until = NOW() + INTERVAL '2 minutes',
            updated_at = NOW()
        WHERE r.id IN (
            SELECT due.id
            FROM construction_attendance_device_issue_reports due
            JOIN construction_attendance_devices d
              ON d.id = due.attendance_device_id
             AND d.is_deleted = FALSE
             AND d.online_status <> 'offline'
            JOIN construction_workers w
              ON w.id = due.worker_id
             AND w.is_deleted = FALSE
             AND COALESCE(w.work_status, 1) <> 2
            WHERE due.is_deleted = FALSE
              AND due.acknowledged_at IS NULL
              AND due.request_payload IS NOT NULL
              AND due.mqtt_message_id IS NOT NULL
              AND COALESCE(due.device_type, d.device_type, '') <> 'B厂家'
              AND due.serial_number IS NOT NULL
              AND due.status IN ('pending', 'failed')
              AND due.retry_count < due.max_retries
              AND COALESCE(due.next_retry_at, due.issued_at + INTERVAL '1 minute') <= NOW()
              AND (due.retry_locked_until IS NULL OR due.retry_locked_until < NOW())
            ORDER BY COALESCE(due.next_retry_at, due.issued_at), due.issued_at, due.id
            LIMIT $1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING
            r.id,
            r.project_id,
            r.attendance_device_id,
            r.serial_number,
            r.action,
            r.mqtt_message_id,
            r.request_payload,
            r.retry_count,
            r.max_retries
        "#;

#[derive(Debug, FromRow)]
struct RetryIssueReport {
    id: Uuid,
    project_id: Uuid,
    attendance_device_id: Option<Uuid>,
    serial_number: Option<String>,
    action: String,
    mqtt_message_id: Option<String>,
    request_payload: Option<Value>,
    retry_count: i32,
    max_retries: i32,
}

pub fn spawn_device_issue_retry_worker(state: AppState) {
    let Some(broker_url) = state.config.mqtt_broker_url.clone() else {
        info!("MQTT_BROKER_URL not configured; attendance device issue retry worker disabled");
        return;
    };

    tokio::spawn(async move {
        loop {
            if let Err(error) = retry_due_issue_reports(state.db.pool(), &broker_url).await {
                warn!(error = %error, "attendance device issue retry worker failed");
            }
            sleep(RETRY_INTERVAL).await;
        }
    });
}

async fn retry_due_issue_reports(pool: &PgPool, broker_url: &str) -> Result<(), String> {
    mark_ineligible_reports(pool).await?;
    mark_exhausted_reports(pool).await?;
    let reports = claim_retry_reports(pool, RETRY_BATCH_SIZE).await?;

    for report in reports {
        retry_issue_report(pool, broker_url, report).await?;
    }

    Ok(())
}

async fn mark_ineligible_reports(pool: &PgPool) -> Result<(), String> {
    sqlx::query(FAIL_INELIGIBLE_RETRY_REPORTS_SQL)
        .bind(INELIGIBLE_WORKER_MESSAGE)
        .execute(pool)
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn mark_exhausted_reports(pool: &PgPool) -> Result<(), String> {
    sqlx::query(FAIL_EXHAUSTED_RETRY_REPORTS_SQL)
        .bind(ACK_TIMEOUT_MESSAGE)
        .execute(pool)
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn claim_retry_reports(
    pool: &PgPool,
    batch_size: i64,
) -> Result<Vec<RetryIssueReport>, String> {
    sqlx::query_as::<_, RetryIssueReport>(CLAIM_RETRY_REPORTS_SQL)
        .bind(batch_size)
        .fetch_all(pool)
        .await
        .map_err(|error| error.to_string())
}

async fn retry_issue_report(
    pool: &PgPool,
    broker_url: &str,
    report: RetryIssueReport,
) -> Result<(), String> {
    let Some(serial_number) = report
        .serial_number
        .as_deref()
        .map(str::trim)
        .filter(|sn| !sn.is_empty())
    else {
        return mark_retry_exhausted(
            pool,
            report.id,
            report.retry_count,
            "考勤机序列号为空，无法重试下发",
        )
        .await;
    };
    let Some(message_id) = report.mqtt_message_id.as_deref() else {
        return mark_retry_exhausted(
            pool,
            report.id,
            report.retry_count,
            "MQTT messageId 缺失，无法重试下发",
        )
        .await;
    };
    let Some(payload) = report.request_payload.as_ref() else {
        return mark_retry_exhausted(
            pool,
            report.id,
            report.retry_count,
            "MQTT 下发内容缺失，无法重试下发",
        )
        .await;
    };

    let topic = command_topic(serial_number);
    let next_retry_count = report.retry_count + 1;
    let result = publish_json(broker_url, &topic, payload).await;
    let delay = retry_delay_seconds(next_retry_count);
    let next_retry_at = Utc::now() + chrono::Duration::seconds(delay);

    match result {
        Ok(()) => {
            update_retry_success(pool, &report, next_retry_count, next_retry_at).await?;
            insert_retry_mqtt_message(
                pool,
                &report,
                serial_number,
                &topic,
                message_id,
                payload,
                "resent",
                None,
            )
            .await?;
        }
        Err(error) => {
            let exhausted = next_retry_count >= report.max_retries;
            update_retry_failure(
                pool,
                &report,
                next_retry_count,
                if exhausted { None } else { Some(next_retry_at) },
                &error,
                exhausted,
            )
            .await?;
            insert_retry_mqtt_message(
                pool,
                &report,
                serial_number,
                &topic,
                message_id,
                payload,
                "failed",
                Some(&error),
            )
            .await?;
        }
    }

    Ok(())
}

async fn update_retry_success(
    pool: &PgPool,
    report: &RetryIssueReport,
    retry_count: i32,
    next_retry_at: DateTime<Utc>,
) -> Result<(), String> {
    let message = format!("已重试下发第 {retry_count} 次，等待设备回执");
    sqlx::query(
        r#"
        UPDATE construction_attendance_device_issue_reports
        SET status = 'pending',
            message = $2,
            retry_count = $3,
            last_retry_at = NOW(),
            next_retry_at = $4,
            retry_locked_until = NULL,
            last_error = NULL,
            updated_at = NOW()
        WHERE id = $1
          AND acknowledged_at IS NULL
        "#,
    )
    .bind(report.id)
    .bind(message)
    .bind(retry_count)
    .bind(next_retry_at)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

async fn update_retry_failure(
    pool: &PgPool,
    report: &RetryIssueReport,
    retry_count: i32,
    next_retry_at: Option<DateTime<Utc>>,
    error: &str,
    exhausted: bool,
) -> Result<(), String> {
    let message = if exhausted {
        format!("MQTT重试发送失败，已达到最大重试次数：{error}")
    } else {
        format!("MQTT重试发送失败，将继续重试：{error}")
    };
    sqlx::query(
        r#"
        UPDATE construction_attendance_device_issue_reports
        SET status = 'failed',
            message = $2,
            retry_count = $3,
            last_retry_at = NOW(),
            next_retry_at = $4,
            retry_locked_until = NULL,
            last_error = $5,
            updated_at = NOW()
        WHERE id = $1
          AND acknowledged_at IS NULL
        "#,
    )
    .bind(report.id)
    .bind(message)
    .bind(retry_count)
    .bind(next_retry_at)
    .bind(error)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

async fn mark_retry_exhausted(
    pool: &PgPool,
    report_id: Uuid,
    retry_count: i32,
    error: &str,
) -> Result<(), String> {
    sqlx::query(
        r#"
        UPDATE construction_attendance_device_issue_reports
        SET status = 'failed',
            message = $2,
            retry_count = $3,
            next_retry_at = NULL,
            retry_locked_until = NULL,
            last_error = $2,
            updated_at = NOW()
        WHERE id = $1
          AND acknowledged_at IS NULL
        "#,
    )
    .bind(report_id)
    .bind(error)
    .bind(retry_count)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

async fn insert_retry_mqtt_message(
    pool: &PgPool,
    report: &RetryIssueReport,
    serial_number: &str,
    topic: &str,
    message_id: &str,
    payload: &Value,
    status: &str,
    error_message: Option<&str>,
) -> Result<(), String> {
    sqlx::query(
        r#"
        INSERT INTO device_mqtt_messages (
            project_id, attendance_device_id, device_sn, direction, topic,
            operator, message_id, payload, processing_status, error_message,
            processed_at
        )
        VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $9, NOW())
        "#,
    )
    .bind(report.project_id)
    .bind(report.attendance_device_id)
    .bind(serial_number)
    .bind(topic)
    .bind(operator_from_action(&report.action))
    .bind(message_id)
    .bind(payload)
    .bind(status)
    .bind(error_message)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn operator_from_action(action: &str) -> &'static str {
    if action == "delete" {
        "DelPerson"
    } else {
        "EditPerson"
    }
}

fn retry_delay_seconds(retry_count: i32) -> i64 {
    match retry_count {
        count if count <= 1 => 30,
        2 => 60,
        3 => 120,
        4 => 240,
        _ => 300,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_delay_caps_at_five_minutes() {
        assert_eq!(retry_delay_seconds(1), 30);
        assert_eq!(retry_delay_seconds(2), 60);
        assert_eq!(retry_delay_seconds(3), 120);
        assert_eq!(retry_delay_seconds(4), 240);
        assert_eq!(retry_delay_seconds(5), 300);
        assert_eq!(retry_delay_seconds(20), 300);
    }

    #[test]
    fn retry_claim_requires_active_worker_and_missing_ack() {
        assert!(CLAIM_RETRY_REPORTS_SQL.contains("due.acknowledged_at IS NULL"));
        assert!(CLAIM_RETRY_REPORTS_SQL.contains("due.retry_count < due.max_retries"));
        assert!(CLAIM_RETRY_REPORTS_SQL.contains("w.is_deleted = FALSE"));
        assert!(CLAIM_RETRY_REPORTS_SQL.contains("COALESCE(w.work_status, 1) <> 2"));
        assert!(FAIL_INELIGIBLE_RETRY_REPORTS_SQL.contains("w.is_deleted = TRUE"));
        assert!(FAIL_INELIGIBLE_RETRY_REPORTS_SQL.contains("COALESCE(w.work_status, 1) = 2"));
        assert!(CLAIM_RETRY_REPORTS_SQL.contains("<> 'B厂家'"));
        assert!(FAIL_INELIGIBLE_RETRY_REPORTS_SQL.contains("<> 'B厂家'"));
    }

    #[test]
    fn exhausted_reports_fail_after_final_ack_window() {
        assert!(FAIL_EXHAUSTED_RETRY_REPORTS_SQL.contains("acknowledged_at IS NULL"));
        assert!(FAIL_EXHAUSTED_RETRY_REPORTS_SQL.contains("retry_count >= max_retries"));
        assert!(FAIL_EXHAUSTED_RETRY_REPORTS_SQL.contains("next_retry_at <= NOW()"));
        assert!(FAIL_EXHAUSTED_RETRY_REPORTS_SQL.contains("<> 'B厂家'"));
        assert_eq!(ACK_TIMEOUT_MESSAGE, "设备未回执，已达到最大重试次数");
    }
}
