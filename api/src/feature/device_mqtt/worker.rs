use std::time::Duration;

use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone, Utc};
use rumqttc::{AsyncClient, Event, EventLoop, Incoming, QoS};
use serde_json::{Value, json};
use sqlx::PgPool;
use tokio::time::sleep;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::state::AppState;

use super::face_v203::{
    FaceAck, FaceTopic, build_online_ack, build_rec_push_ack, command_topic, parse_ack,
    parse_attendance_record, parse_heartbeat, parse_topic,
};
use super::issuer::auto_issue_device_workers_via_client;
use super::publisher::build_mqtt_options;

const MQTT_SUBSCRIPTION: &str = "mqtt/face/#";
const FIND_WORKER_SQL: &str = r#"
        SELECT id
        FROM construction_workers
        WHERE is_deleted = FALSE
          AND COALESCE(work_status, 1) <> 2
          AND project_id = $1
          AND (
            ($2::text IS NOT NULL AND (id::text = $2 OR id_card = $2 OR phone = $2))
            OR ($3::text IS NOT NULL AND name = $3)
          )
        ORDER BY
          CASE
            WHEN $2::text IS NOT NULL AND id::text = $2 THEN 0
            WHEN $2::text IS NOT NULL AND id_card = $2 THEN 1
            WHEN $2::text IS NOT NULL AND phone = $2 THEN 2
            ELSE 3
          END,
          updated_at DESC
        LIMIT 1
        "#;

#[derive(Debug, Clone)]
struct DeviceBinding {
    id: Uuid,
    project_id: Uuid,
    direction: i16,
}

pub fn spawn_device_mqtt_worker(state: AppState) {
    let Some(broker_url) = state.config.mqtt_broker_url.clone() else {
        info!("MQTT_BROKER_URL not configured; attendance device MQTT worker disabled");
        return;
    };

    tokio::spawn(async move {
        loop {
            match run_once(state.clone(), &broker_url).await {
                Ok(()) => warn!("attendance device MQTT worker stopped; reconnecting"),
                Err(error) => {
                    warn!(error = %error, "attendance device MQTT worker error; reconnecting")
                }
            }
            sleep(Duration::from_secs(5)).await;
        }
    });
}

async fn run_once(state: AppState, broker_url: &str) -> Result<(), String> {
    let client_id = format!("shanhuai-api-device-mqtt-{}", std::process::id());
    let options = build_mqtt_options(client_id, broker_url)?;

    let (client, mut event_loop) = AsyncClient::new(options, 10);
    client
        .subscribe(MQTT_SUBSCRIPTION, QoS::AtLeastOnce)
        .await
        .map_err(|error| error.to_string())?;
    info!(
        topic = MQTT_SUBSCRIPTION,
        "attendance device MQTT worker subscribed"
    );

    poll_messages(&state, &client, &mut event_loop).await
}

async fn poll_messages(
    state: &AppState,
    client: &AsyncClient,
    event_loop: &mut EventLoop,
) -> Result<(), String> {
    loop {
        match event_loop.poll().await.map_err(|error| error.to_string())? {
            Event::Incoming(Incoming::Publish(message)) => {
                handle_publish(
                    state.db.pool(),
                    client,
                    message.topic.as_str(),
                    message.payload.as_ref(),
                )
                .await;
            }
            Event::Incoming(Incoming::ConnAck(_)) => {
                debug!("attendance device MQTT connected");
            }
            _ => {}
        }
    }
}

async fn handle_publish(pool: &PgPool, client: &AsyncClient, topic: &str, payload: &[u8]) {
    let payload_text = String::from_utf8_lossy(payload).to_string();
    let payload_json =
        serde_json::from_slice::<Value>(payload).unwrap_or_else(|_| json!({ "raw": payload_text }));
    let operator = text_field(&payload_json, "operator");
    let message_id = text_field(&payload_json, "messageId");

    let parsed_topic = parse_topic(topic);
    let device_sn = resolve_device_sn(parsed_topic.as_ref().ok(), &payload_json);
    let binding = match device_sn.as_deref() {
        Some(sn) => fetch_device_binding(pool, sn).await,
        None => None,
    };

    let mut status = "received".to_string();
    let mut error_message: Option<String> = None;

    match parsed_topic {
        Ok(FaceTopic::Heartbeat) => {
            if let Some(sn) = device_sn.as_deref() {
                update_device_status(pool, sn, "online", true, topic, &payload_json).await;
                auto_issue_device_workers(pool, client, sn).await;
            }
        }
        Ok(FaceTopic::Basic) => {
            if let Some(sn) = device_sn.as_deref() {
                let status_text = online_status_from_operator(operator.as_deref());
                update_device_status(pool, sn, status_text, false, topic, &payload_json).await;
                if status_text == "online" {
                    let ack = build_online_ack(sn);
                    if let Ok(bytes) = serde_json::to_vec(&ack) {
                        let _ = client
                            .publish(command_topic(sn), QoS::AtLeastOnce, false, bytes)
                            .await;
                    }
                    auto_issue_device_workers(pool, client, sn).await;
                }
            }
        }
        Ok(FaceTopic::Rec { serial_number }) => {
            update_device_seen(pool, &serial_number, topic, &payload_json).await;
            match process_attendance_record(pool, &serial_number, binding.as_ref(), &payload_text)
                .await
            {
                Ok(true) => {
                    status = "processed".to_string();
                    publish_rec_push_ack(
                        client,
                        &serial_number,
                        message_id.as_deref(),
                        &payload_text,
                    )
                    .await;
                }
                Ok(false) => {
                    status = "unmatched_worker".to_string();
                    publish_rec_push_ack(
                        client,
                        &serial_number,
                        message_id.as_deref(),
                        &payload_text,
                    )
                    .await;
                }
                Err(error) => {
                    status = "failed".to_string();
                    error_message = Some(error);
                }
            }
        }
        Ok(FaceTopic::Ack { serial_number }) => {
            update_device_seen(pool, &serial_number, topic, &payload_json).await;
            match parse_ack(&payload_text) {
                Ok(ack) => {
                    apply_issue_ack(pool, &ack, &payload_json).await;
                    status = "processed".to_string();
                }
                Err(error) => {
                    status = "failed".to_string();
                    error_message = Some(error.to_string());
                }
            }
        }
        Ok(FaceTopic::Snap { serial_number })
        | Ok(FaceTopic::Command { serial_number })
        | Ok(FaceTopic::Other { serial_number, .. }) => {
            update_device_seen(pool, &serial_number, topic, &payload_json).await;
        }
        Err(error) => {
            status = "invalid_topic".to_string();
            error_message = Some(error.to_string());
        }
    }

    if let Err(error) = insert_mqtt_message(
        pool,
        binding.as_ref(),
        device_sn.as_deref(),
        topic,
        operator.as_deref(),
        message_id.as_deref(),
        &payload_json,
        &status,
        error_message.as_deref(),
    )
    .await
    {
        warn!(error = %error, topic, "failed to persist MQTT message");
    }
}

async fn publish_rec_push_ack(
    client: &AsyncClient,
    serial_number: &str,
    inbound_message_id: Option<&str>,
    payload: &str,
) {
    let record = match parse_attendance_record(payload) {
        Ok(record) => record,
        Err(error) => {
            warn!(error = %error, serial_number, "failed to parse attendance record for PushAck");
            return;
        }
    };
    let Some(record_id) = record.record_id.as_deref().filter(|id| !id.is_empty()) else {
        warn!(
            serial_number,
            "attendance record missing RecordID; skip PushAck"
        );
        return;
    };
    let message_id = inbound_message_id
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("push-ack-{serial_number}-{record_id}-{}", Uuid::new_v4()));
    let ack = build_rec_push_ack(&message_id, record_id);
    let Ok(bytes) = serde_json::to_vec(&ack) else {
        warn!(serial_number, record_id, "failed to encode PushAck");
        return;
    };

    if let Err(error) = client
        .publish(command_topic(serial_number), QoS::AtLeastOnce, false, bytes)
        .await
    {
        warn!(error = %error, serial_number, record_id, "failed to publish PushAck");
    }
}

async fn fetch_device_binding(pool: &PgPool, serial_number: &str) -> Option<DeviceBinding> {
    sqlx::query_as::<_, (Uuid, Uuid, i16)>(
        r#"
        SELECT id, project_id, direction
        FROM construction_attendance_devices
        WHERE is_deleted = FALSE AND serial_number = $1
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
    )
    .bind(serial_number)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .map(|(id, project_id, direction)| DeviceBinding {
        id,
        project_id,
        direction,
    })
}

async fn update_device_status(
    pool: &PgPool,
    serial_number: &str,
    status: &str,
    is_heartbeat: bool,
    topic: &str,
    payload: &Value,
) {
    let query = if is_heartbeat {
        r#"
        UPDATE construction_attendance_devices
        SET online_status = $2,
            last_seen_at = NOW(),
            last_heartbeat_at = NOW(),
            last_online_at = CASE WHEN $2 = 'online' THEN NOW() ELSE last_online_at END,
            last_offline_at = CASE WHEN $2 = 'offline' THEN NOW() ELSE last_offline_at END,
            last_mqtt_topic = $3,
            last_mqtt_payload = $4,
            updated_at = NOW()
        WHERE is_deleted = FALSE AND serial_number = $1
        "#
    } else {
        r#"
        UPDATE construction_attendance_devices
        SET online_status = $2,
            last_seen_at = NOW(),
            last_online_at = CASE WHEN $2 = 'online' THEN NOW() ELSE last_online_at END,
            last_offline_at = CASE WHEN $2 = 'offline' THEN NOW() ELSE last_offline_at END,
            last_mqtt_topic = $3,
            last_mqtt_payload = $4,
            updated_at = NOW()
        WHERE is_deleted = FALSE AND serial_number = $1
        "#
    };

    if let Err(error) = sqlx::query(query)
        .bind(serial_number)
        .bind(status)
        .bind(topic)
        .bind(payload)
        .execute(pool)
        .await
    {
        warn!(error = %error, serial_number, "failed to update attendance device status");
    }
}

async fn update_device_seen(pool: &PgPool, serial_number: &str, topic: &str, payload: &Value) {
    if let Err(error) = sqlx::query(
        r#"
        UPDATE construction_attendance_devices
        SET last_seen_at = NOW(),
            last_mqtt_topic = $2,
            last_mqtt_payload = $3,
            updated_at = NOW()
        WHERE is_deleted = FALSE AND serial_number = $1
        "#,
    )
    .bind(serial_number)
    .bind(topic)
    .bind(payload)
    .execute(pool)
    .await
    {
        warn!(error = %error, serial_number, "failed to update attendance device seen time");
    }
}

async fn process_attendance_record(
    pool: &PgPool,
    serial_number: &str,
    binding: Option<&DeviceBinding>,
    payload: &str,
) -> Result<bool, String> {
    let Some(binding) = binding else {
        return Ok(false);
    };
    let record = parse_attendance_record(payload).map_err(|error| error.to_string())?;
    let worker_id = find_worker(
        pool,
        binding.project_id,
        record.custom_id.as_deref(),
        record.person_name.as_deref(),
    )
    .await
    .map_err(|error| error.to_string())?;
    let Some(worker_id) = worker_id else {
        return Ok(false);
    };

    let payload_direction = record.direction.as_deref().and_then(parse_direction);
    let trigger_time = record
        .record_time
        .as_deref()
        .and_then(parse_device_time)
        .unwrap_or_else(Utc::now);
    let should_recalculate_generic_direction =
        binding.direction == 2 && fixed_direction(payload_direction).is_none();
    let direction = if let Some(direction) = fixed_direction(payload_direction) {
        direction
    } else if let Some(direction) = fixed_direction(Some(binding.direction)) {
        direction
    } else {
        infer_generic_direction(pool, worker_id, serial_number, trigger_time)
            .await
            .map_err(|error| error.to_string())?
    };
    let original_time = record
        .record_id
        .clone()
        .or(record.record_time.clone())
        .unwrap_or_else(|| trigger_time.to_rfc3339());
    let photo_base64 = record
        .photo_base64
        .as_deref()
        .map(str::trim)
        .filter(|photo| !photo.is_empty());

    let dedupe_key = format!("attendance-rec:{worker_id}:{serial_number}:{original_time}");
    let mut tx = pool.begin().await.map_err(|error| error.to_string())?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)")
        .bind(&dedupe_key)
        .execute(&mut *tx)
        .await
        .map_err(|error| error.to_string())?;

    let attendance_record_id = match sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT id
        FROM construction_attendance_records
        WHERE is_deleted = FALSE
          AND worker_id = $1
          AND serial_number = $2
          AND original_time = $3
        ORDER BY trigger_time ASC, created_at ASC
        LIMIT 1
        "#,
    )
    .bind(worker_id)
    .bind(serial_number)
    .bind(&original_time)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| error.to_string())?
    {
        Some(id) => id,
        None => sqlx::query_scalar::<_, Uuid>(
            r#"
                INSERT INTO construction_attendance_records (
                    worker_id, project_id, direction, trigger_time, equipment_id,
                    serial_number, original_time
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
                "#,
        )
        .bind(worker_id)
        .bind(binding.project_id)
        .bind(direction)
        .bind(trigger_time)
        .bind(record.facesluice_id.as_deref().unwrap_or(serial_number))
        .bind(serial_number)
        .bind(&original_time)
        .fetch_one(&mut *tx)
        .await
        .map_err(|error| error.to_string())?,
    };

    if let Some(photo_base64) = photo_base64 {
        sqlx::query(
            r#"
            INSERT INTO construction_attendance_record_photos (
                attendance_record_id, project_id, worker_id, photo_kind,
                photo_data, content_type, source
            )
            SELECT $1, $2, $3, 'closeup', $4, 'image/jpeg', 'mqtt_rec_push'
            WHERE NOT EXISTS (
                SELECT 1
                FROM construction_attendance_record_photos
                WHERE attendance_record_id = $1
                  AND photo_kind = 'closeup'
                  AND source = 'mqtt_rec_push'
            )
            "#,
        )
        .bind(attendance_record_id)
        .bind(binding.project_id)
        .bind(worker_id)
        .bind(photo_base64)
        .execute(&mut *tx)
        .await
        .map_err(|error| error.to_string())?;
    }

    crate::feature::integration::outbox_worker::enqueue_domain_event_tx(
        &mut tx,
        binding.project_id,
        "construction.attendance.created",
        "attendance",
        attendance_record_id,
        serde_json::json!({
            "operation": "insert",
            "source": "mqtt_rec_push",
            "has_photo": photo_base64.is_some(),
            "occurred_at": chrono::Utc::now(),
        }),
        &format!("attendance:mqtt_rec_push:{attendance_record_id}"),
    )
    .await
    .map_err(|error| error.to_string())?;

    tx.commit().await.map_err(|error| error.to_string())?;

    if should_recalculate_generic_direction {
        recalculate_generic_day_directions(pool, worker_id, serial_number, trigger_time)
            .await
            .map_err(|error| error.to_string())?;
    }

    Ok(true)
}

async fn infer_generic_direction(
    pool: &PgPool,
    worker_id: Uuid,
    serial_number: &str,
    trigger_time: DateTime<Utc>,
) -> Result<i16, sqlx::Error> {
    let previous_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM construction_attendance_records
        WHERE is_deleted = FALSE
          AND worker_id = $1
          AND serial_number = $2
          AND (trigger_time AT TIME ZONE 'Asia/Shanghai')::date =
              ($3::timestamptz AT TIME ZONE 'Asia/Shanghai')::date
          AND trigger_time < $3
        "#,
    )
    .bind(worker_id)
    .bind(serial_number)
    .bind(trigger_time)
    .fetch_one(pool)
    .await?;

    Ok(if previous_count == 0 { 0 } else { 1 })
}

async fn recalculate_generic_day_directions(
    pool: &PgPool,
    worker_id: Uuid,
    serial_number: &str,
    trigger_time: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        WITH ordered AS (
            SELECT
                id,
                CASE
                    WHEN ROW_NUMBER() OVER (ORDER BY trigger_time ASC, created_at ASC, id ASC) = 1 THEN 0::smallint
                    ELSE 1::smallint
                END AS inferred_direction
            FROM construction_attendance_records
            WHERE is_deleted = FALSE
              AND worker_id = $1
              AND serial_number = $2
              AND (trigger_time AT TIME ZONE 'Asia/Shanghai')::date =
                  ($3::timestamptz AT TIME ZONE 'Asia/Shanghai')::date
        )
        UPDATE construction_attendance_records record
        SET direction = ordered.inferred_direction,
            updated_at = NOW()
        FROM ordered
        WHERE record.id = ordered.id
          AND record.direction IS DISTINCT FROM ordered.inferred_direction
        "#,
    )
    .bind(worker_id)
    .bind(serial_number)
    .bind(trigger_time)
    .execute(pool)
    .await?;

    Ok(())
}

async fn find_worker(
    pool: &PgPool,
    project_id: Uuid,
    custom_id: Option<&str>,
    person_name: Option<&str>,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar::<_, Uuid>(FIND_WORKER_SQL)
        .bind(project_id)
        .bind(custom_id)
        .bind(person_name)
        .fetch_optional(pool)
        .await
}

async fn insert_mqtt_message(
    pool: &PgPool,
    binding: Option<&DeviceBinding>,
    device_sn: Option<&str>,
    topic: &str,
    operator: Option<&str>,
    message_id: Option<&str>,
    payload: &Value,
    status: &str,
    error_message: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO device_mqtt_messages (
            project_id, attendance_device_id, device_sn, direction, topic,
            operator, message_id, payload, processing_status, error_message,
            processed_at
        )
        VALUES ($1, $2, $3, 'inbound', $4, $5, $6, $7, $8, $9, NOW())
        "#,
    )
    .bind(binding.map(|binding| binding.project_id))
    .bind(binding.map(|binding| binding.id))
    .bind(device_sn)
    .bind(topic)
    .bind(operator)
    .bind(message_id)
    .bind(payload)
    .bind(status)
    .bind(error_message)
    .execute(pool)
    .await?;

    Ok(())
}

async fn auto_issue_device_workers(pool: &PgPool, client: &AsyncClient, serial_number: &str) {
    match auto_issue_device_workers_via_client(pool, client, serial_number).await {
        Ok(Some(summary)) => {
            info!(
                serial_number = summary.serial_number,
                queued = summary.queued,
                skipped_without_photo = summary.skipped_without_photo,
                failed = summary.failed,
                "auto issued workers to online attendance device"
            );
        }
        Ok(None) => {}
        Err(error) => {
            warn!(error = %error, serial_number, "failed to auto issue workers to attendance device");
        }
    }
}

async fn apply_issue_ack(pool: &PgPool, ack: &FaceAck, payload: &Value) {
    let Some(message_id) = ack.message_id.as_deref() else {
        return;
    };
    let is_success = ack_success(ack);
    let status = if is_success { "success" } else { "failed" };
    let message = ack_message(ack);

    if let Err(error) = sqlx::query(
        r#"
        UPDATE construction_attendance_device_issue_reports
        SET status = $2,
            message = $3,
            response_payload = $4,
            acknowledged_at = NOW(),
            next_retry_at = NULL,
            retry_locked_until = NULL,
            last_error = CASE WHEN $2 = 'success' THEN NULL ELSE $3 END,
            updated_at = NOW()
        WHERE is_deleted = FALSE
          AND mqtt_message_id = $1
        "#,
    )
    .bind(message_id)
    .bind(status)
    .bind(message)
    .bind(payload)
    .execute(pool)
    .await
    {
        warn!(error = %error, message_id, "failed to update attendance device issue ack");
    }
}

fn ack_success(ack: &FaceAck) -> bool {
    let code = ack.code.as_deref().unwrap_or_default();
    let result = ack.result.as_deref().unwrap_or_default().to_lowercase();
    code == "200" || code == "0" || result == "ok" || result == "success" || result.contains("成功")
}

fn ack_message(ack: &FaceAck) -> String {
    let mut parts = vec![format!("设备回执：{}", ack.operator)];
    if let Some(code) = &ack.code {
        parts.push(format!("code={code}"));
    }
    if let Some(result) = &ack.result {
        parts.push(format!("result={result}"));
    }
    if let Some(detail) = &ack.detail {
        parts.push(detail.clone());
    }
    parts.join("，")
}

fn resolve_device_sn(topic: Option<&FaceTopic>, payload: &Value) -> Option<String> {
    match topic {
        Some(FaceTopic::Ack { serial_number })
        | Some(FaceTopic::Rec { serial_number })
        | Some(FaceTopic::Snap { serial_number })
        | Some(FaceTopic::Command { serial_number })
        | Some(FaceTopic::Other { serial_number, .. }) => Some(serial_number.clone()),
        Some(FaceTopic::Heartbeat) => parse_heartbeat(payload.to_string().as_str())
            .ok()
            .map(|heartbeat| heartbeat.facesluice_id),
        Some(FaceTopic::Basic) | None => payload
            .get("info")
            .and_then(|info| text_field(info, "facesluiceId"))
            .or_else(|| text_field(payload, "facesluiceId")),
    }
}

fn online_status_from_operator(operator: Option<&str>) -> &'static str {
    let normalized = operator.unwrap_or_default().to_lowercase();
    if normalized.contains("offline")
        || normalized.contains("logout")
        || normalized.contains("down")
    {
        "offline"
    } else {
        "online"
    }
}

fn parse_direction(value: &str) -> Option<i16> {
    match value.to_lowercase().as_str() {
        "entr" | "entry" | "in" | "入口" | "进场" => Some(0),
        "exit" | "out" | "出口" | "出场" => Some(1),
        "unknow" | "unknown" | "none" | "无方向" | "通用" => Some(2),
        _ => None,
    }
}

fn fixed_direction(value: Option<i16>) -> Option<i16> {
    match value {
        Some(0) => Some(0),
        Some(1) => Some(1),
        _ => None,
    }
}

fn parse_device_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|time| time.with_timezone(&Utc))
        .ok()
        .or_else(|| {
            let naive = NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S").ok()?;
            let offset = FixedOffset::east_opt(8 * 3600)?;
            offset
                .from_local_datetime(&naive)
                .single()
                .map(|time| time.with_timezone(&Utc))
        })
}

fn text_field(value: &Value, key: &str) -> Option<String> {
    match value.get(key)? {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(boolean) => Some(boolean.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worker_lookup_query_excludes_left_site_workers() {
        assert!(FIND_WORKER_SQL.contains("COALESCE(work_status, 1) <> 2"));
        assert!(FIND_WORKER_SQL.contains("id::text = $2 THEN 0"));
    }
}
