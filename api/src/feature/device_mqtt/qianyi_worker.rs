use std::time::Duration;

use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone, Utc};
use rumqttc::{AsyncClient, Event, EventLoop, Incoming, QoS};
use serde_json::{Value, json};
use sqlx::PgPool;
use tokio::time::sleep;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::state::AppState;

use super::{
    issuer::auto_issue_device_workers_via_client,
    publisher::build_mqtt_options,
    qianyi::{
        DEFAULT_UPLINK_FILTER, DEVICE_TYPE, REGISTER_TOPIC, command, parse_worker_person_id,
        response, text,
    },
};

#[derive(Debug, Clone)]
struct DeviceBinding {
    id: Uuid,
    project_id: Uuid,
    direction: i16,
    serial_number: String,
    subtopic: Option<String>,
}

pub fn spawn_qianyi_mqtt_worker(state: AppState) {
    let Some(broker_url) = state.config.mqtt_broker_url.clone() else {
        return;
    };
    tokio::spawn(async move {
        loop {
            match run_once(state.clone(), &broker_url).await {
                Ok(()) => warn!("qianyi MQTT worker stopped; reconnecting"),
                Err(error) => warn!(error = %error, "qianyi MQTT worker error; reconnecting"),
            }
            sleep(Duration::from_secs(5)).await;
        }
    });
}

async fn run_once(state: AppState, broker_url: &str) -> Result<(), String> {
    let options = build_mqtt_options(
        format!("shanhuai-api-qianyi-mqtt-{}", std::process::id()),
        broker_url,
    )?;
    let (client, mut event_loop) = AsyncClient::new(options, 20);
    client
        .subscribe(REGISTER_TOPIC, QoS::AtLeastOnce)
        .await
        .map_err(|error| error.to_string())?;
    client
        .subscribe(DEFAULT_UPLINK_FILTER, QoS::AtLeastOnce)
        .await
        .map_err(|error| error.to_string())?;
    subscribe_known_topics(state.db.pool(), &client).await;
    info!("qianyi MQTT worker subscribed");
    poll_messages(state.db.pool(), &client, &mut event_loop).await
}

async fn subscribe_known_topics(pool: &PgPool, client: &AsyncClient) {
    let topics = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT qianyi_pubtopic FROM construction_attendance_devices WHERE is_deleted = FALSE AND device_type = $1 AND qianyi_pubtopic IS NOT NULL",
    )
    .bind(DEVICE_TYPE)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    for topic in topics {
        if let Err(error) = client.subscribe(&topic, QoS::AtLeastOnce).await {
            warn!(%topic, %error, "failed to subscribe qianyi device topic");
        }
    }
}

async fn poll_messages(
    pool: &PgPool,
    client: &AsyncClient,
    event_loop: &mut EventLoop,
) -> Result<(), String> {
    loop {
        match event_loop.poll().await.map_err(|error| error.to_string())? {
            Event::Incoming(Incoming::Publish(message)) => {
                handle_publish(pool, client, &message.topic, message.payload.as_ref()).await;
            }
            Event::Incoming(Incoming::ConnAck(_)) => debug!("qianyi MQTT connected"),
            _ => {}
        }
    }
}

async fn handle_publish(pool: &PgPool, client: &AsyncClient, topic: &str, bytes: &[u8]) {
    let payload = match serde_json::from_slice::<Value>(bytes) {
        Ok(payload) => payload,
        Err(error) => {
            warn!(%topic, %error, "invalid qianyi MQTT JSON");
            return;
        }
    };
    let Some(cmd) = command(&payload).map(str::to_owned) else {
        return;
    };
    // Avoid consuming our own downlink messages when a device is configured with
    // overlapping topics.
    if matches!(cmd.as_str(), "person_add" | "person_delete") {
        return;
    }

    let device_sn = text(&payload, "sn").or_else(|| text(&payload, "device_name"));
    let mut binding = match device_sn.as_deref() {
        Some(sn) => fetch_binding(pool, sn).await,
        None => fetch_binding_by_topic(pool, topic).await,
    };
    let result = match cmd.as_str() {
        "camera_register" => {
            let result = handle_register(pool, client, &payload).await;
            if let Some(sn) = device_sn.as_deref() {
                binding = fetch_binding(pool, sn).await;
            }
            result
        }
        "mqtt_herat" | "heart_beat" => {
            update_presence(pool, binding.as_ref(), true, topic, &payload).await
        }
        "offline" => update_presence(pool, binding.as_ref(), false, topic, &payload).await,
        "fac_init" => handle_fac_init(pool, client, binding.as_ref(), &payload).await,
        "person_pass" => handle_person_pass(pool, client, binding.as_ref(), &payload).await,
        "person_add_rsp" | "person_delete_rsp" => handle_issue_response(pool, &payload).await,
        _ => Ok(()),
    };
    let (processing_status, error_message) = match result {
        Ok(()) => ("processed", None),
        Err(error) => ("failed", Some(error)),
    };
    if let Err(error) = log_message(
        pool,
        binding.as_ref(),
        device_sn.as_deref(),
        topic,
        &cmd,
        text(&payload, "msg_id").as_deref(),
        &payload,
        processing_status,
        error_message.as_deref(),
    )
    .await
    {
        warn!(%error, "failed to log qianyi MQTT message");
    }
}

async fn handle_register(
    pool: &PgPool,
    client: &AsyncClient,
    payload: &Value,
) -> Result<(), String> {
    let sn = text(payload, "sn").ok_or_else(|| "camera_register missing sn".to_string())?;
    let subtopic =
        text(payload, "subtopic").ok_or_else(|| "camera_register missing subtopic".to_string())?;
    let pubtopic =
        text(payload, "pubtopic").ok_or_else(|| "camera_register missing pubtopic".to_string())?;
    let updated = sqlx::query(
        r#"UPDATE construction_attendance_devices
           SET qianyi_subtopic = $2, qianyi_pubtopic = $3,
               online_status = 'online', last_seen_at = NOW(), last_online_at = NOW(),
               last_mqtt_topic = $4, last_mqtt_payload = $5, updated_at = NOW()
           WHERE is_deleted = FALSE AND device_type = $1 AND BTRIM(serial_number) = $6"#,
    )
    .bind(DEVICE_TYPE)
    .bind(&subtopic)
    .bind(&pubtopic)
    .bind(REGISTER_TOPIC)
    .bind(payload)
    .bind(&sn)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    if updated.rows_affected() == 0 {
        return Err(format!("unbound qianyi device: {sn}"));
    }
    client
        .subscribe(&pubtopic, QoS::AtLeastOnce)
        .await
        .map_err(|error| error.to_string())?;
    publish(
        client,
        &subtopic,
        &response("camera_register", text(payload, "msg_id").as_deref()),
    )
    .await
}

async fn handle_fac_init(
    pool: &PgPool,
    client: &AsyncClient,
    binding: Option<&DeviceBinding>,
    payload: &Value,
) -> Result<(), String> {
    let binding = binding.ok_or_else(|| "unbound qianyi device".to_string())?;
    let topic = binding
        .subtopic
        .as_deref()
        .ok_or_else(|| "qianyi subtopic is unknown".to_string())?;
    let reply = json!({
        "cmd": "fac_init_rsp",
        "status": "ok",
        "msg_id": text(payload, "msg_id").unwrap_or_default(),
        "featureSupported": false,
        "snapPicturePushType": 0
    });
    publish(client, topic, &reply).await?;
    auto_issue_device_workers_via_client(pool, client, &binding.serial_number).await?;
    Ok(())
}

async fn handle_person_pass(
    pool: &PgPool,
    client: &AsyncClient,
    binding: Option<&DeviceBinding>,
    payload: &Value,
) -> Result<(), String> {
    let binding = binding.ok_or_else(|| "unbound qianyi device".to_string())?;
    let message_id =
        text(payload, "msg_id").ok_or_else(|| "person_pass missing msg_id".to_string())?;
    let match_result = payload
        .get("matchResult")
        .and_then(Value::as_i64)
        .unwrap_or(1);
    if match_result != 1 {
        let topic = binding
            .subtopic
            .as_deref()
            .ok_or_else(|| "qianyi subtopic is unknown".to_string())?;
        return publish(client, topic, &response("person_pass", Some(&message_id))).await;
    }

    let person_id = text(payload, "personId")
        .ok_or_else(|| "successful person_pass missing personId".to_string())?;
    let worker_id =
        parse_worker_person_id(&person_id).ok_or_else(|| "invalid qianyi personId".to_string())?;
    let worker_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM construction_workers WHERE id = $1 AND project_id = $2 AND is_deleted = FALSE)",
    )
    .bind(worker_id)
    .bind(binding.project_id)
    .fetch_one(pool)
    .await
    .map_err(|error| error.to_string())?;
    if !worker_exists {
        return Err("qianyi personId does not belong to bound project".to_string());
    }

    let snap_time = text(payload, "snapTime").and_then(|value| parse_device_time(&value));
    let trigger_time = snap_time.unwrap_or_else(Utc::now);
    let direction = fixed_direction(binding.direction).unwrap_or(0);
    let mut tx = pool.begin().await.map_err(|error| error.to_string())?;
    let dedupe_key = format!("qianyi-person-pass:{}:{message_id}", binding.serial_number);
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)")
        .bind(&dedupe_key)
        .execute(&mut *tx)
        .await
        .map_err(|error| error.to_string())?;

    let record_id = sqlx::query_scalar::<_, Uuid>(
            r#"INSERT INTO construction_attendance_records
               (worker_id, project_id, direction, trigger_time, equipment_id, serial_number, original_time)
               SELECT $1, $2, $3, $4, $5, $5, $6
               WHERE NOT EXISTS (
                   SELECT 1 FROM construction_attendance_records
                   WHERE is_deleted = FALSE AND serial_number = $5 AND original_time = $6
               )
               RETURNING id"#,
        )
        .bind(worker_id)
        .bind(binding.project_id)
        .bind(direction)
        .bind(trigger_time)
        .bind(&binding.serial_number)
        .bind(&message_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| error.to_string())?;
    let photo = text(payload, "snapPicture");
    let has_photo = photo.as_ref().is_some_and(|value| !value.trim().is_empty());
    if let (Some(record_id), Some(photo)) = (record_id, photo.as_deref())
        && !photo.trim().is_empty()
    {
        sqlx::query(
            r#"INSERT INTO construction_attendance_record_photos
                       (attendance_record_id, project_id, worker_id, photo_kind, photo_data, source)
                       VALUES ($1, $2, $3, 'snapshot', $4, 'qianyi_mqtt')"#,
        )
        .bind(record_id)
        .bind(binding.project_id)
        .bind(worker_id)
        .bind(photo)
        .execute(&mut *tx)
        .await
        .map_err(|error| error.to_string())?;
    }
    if let Some(record_id) = record_id {
        crate::feature::integration::outbox_worker::enqueue_domain_event_tx(
            &mut tx,
            binding.project_id,
            "construction.attendance.created",
            "attendance",
            record_id,
            json!({
                "operation": "insert",
                "source": "qianyi_mqtt",
                "has_photo": has_photo,
                "occurred_at": Utc::now(),
            }),
            &format!("attendance:qianyi_mqtt:{record_id}"),
        )
        .await
        .map_err(|error| error.to_string())?;
    }
    tx.commit().await.map_err(|error| error.to_string())?;
    let topic = binding
        .subtopic
        .as_deref()
        .ok_or_else(|| "qianyi subtopic is unknown".to_string())?;
    publish(client, topic, &response("person_pass", Some(&message_id))).await
}

async fn handle_issue_response(pool: &PgPool, payload: &Value) -> Result<(), String> {
    let message_id =
        text(payload, "msg_id").ok_or_else(|| "issue response missing msg_id".to_string())?;
    let success = text(payload, "status").is_some_and(|status| status.eq_ignore_ascii_case("ok"));
    let status = if success { "success" } else { "failed" };
    let message = if success {
        "芊熠设备下发成功"
    } else {
        "芊熠设备下发失败"
    };
    sqlx::query(
        r#"UPDATE construction_attendance_device_issue_reports
           SET status = $2, message = $3, response_payload = $4,
               acknowledged_at = NOW(), next_retry_at = NULL, retry_locked_until = NULL,
               last_error = CASE WHEN $2 = 'success' THEN NULL ELSE COALESCE($4->>'msgString', $3) END,
               updated_at = NOW()
           WHERE is_deleted = FALSE AND mqtt_message_id = $1"#,
    )
    .bind(message_id)
    .bind(status)
    .bind(message)
    .bind(payload)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

async fn update_presence(
    pool: &PgPool,
    binding: Option<&DeviceBinding>,
    online: bool,
    topic: &str,
    payload: &Value,
) -> Result<(), String> {
    let Some(binding) = binding else {
        return Ok(());
    };
    sqlx::query(
        r#"UPDATE construction_attendance_devices
           SET online_status = CASE WHEN $2 THEN 'online' ELSE 'offline' END,
               last_seen_at = NOW(), last_heartbeat_at = CASE WHEN $2 THEN NOW() ELSE last_heartbeat_at END,
               last_online_at = CASE WHEN $2 THEN NOW() ELSE last_online_at END,
               last_offline_at = CASE WHEN $2 THEN last_offline_at ELSE NOW() END,
               last_mqtt_topic = $3, last_mqtt_payload = $4, updated_at = NOW()
           WHERE id = $1"#,
    )
    .bind(binding.id)
    .bind(online)
    .bind(topic)
    .bind(payload)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

async fn fetch_binding(pool: &PgPool, sn: &str) -> Option<DeviceBinding> {
    sqlx::query_as::<_, (Uuid, Uuid, i16, String, Option<String>)>(
        "SELECT id, project_id, direction, serial_number, qianyi_subtopic FROM construction_attendance_devices WHERE is_deleted = FALSE AND device_type = $1 AND BTRIM(serial_number) = $2 LIMIT 1",
    )
    .bind(DEVICE_TYPE)
    .bind(sn.trim())
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .map(|row| DeviceBinding { id: row.0, project_id: row.1, direction: row.2, serial_number: row.3, subtopic: row.4 })
}

async fn fetch_binding_by_topic(pool: &PgPool, topic: &str) -> Option<DeviceBinding> {
    sqlx::query_as::<_, (Uuid, Uuid, i16, String, Option<String>)>(
        "SELECT id, project_id, direction, serial_number, qianyi_subtopic FROM construction_attendance_devices WHERE is_deleted = FALSE AND device_type = $1 AND qianyi_pubtopic = $2 LIMIT 1",
    )
    .bind(DEVICE_TYPE)
    .bind(topic)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .map(|row| DeviceBinding { id: row.0, project_id: row.1, direction: row.2, serial_number: row.3, subtopic: row.4 })
}

async fn publish(client: &AsyncClient, topic: &str, payload: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec(payload).map_err(|error| error.to_string())?;
    client
        .publish(topic, QoS::AtLeastOnce, false, bytes)
        .await
        .map_err(|error| error.to_string())
}

#[allow(clippy::too_many_arguments)]
async fn log_message(
    pool: &PgPool,
    binding: Option<&DeviceBinding>,
    device_sn: Option<&str>,
    topic: &str,
    cmd: &str,
    message_id: Option<&str>,
    payload: &Value,
    status: &str,
    error_message: Option<&str>,
) -> Result<(), String> {
    sqlx::query(
        r#"INSERT INTO device_mqtt_messages
           (project_id, attendance_device_id, device_sn, direction, topic, operator,
            message_id, payload, processed_at, processing_status, error_message)
           VALUES ($1, $2, $3, 'inbound', $4, $5, $6, $7, NOW(), $8, $9)"#,
    )
    .bind(binding.map(|value| value.project_id))
    .bind(binding.map(|value| value.id))
    .bind(device_sn.or_else(|| binding.map(|value| value.serial_number.as_str())))
    .bind(topic)
    .bind(cmd)
    .bind(message_id)
    .bind(payload)
    .bind(status)
    .bind(error_message)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn parse_device_time(value: &str) -> Option<DateTime<Utc>> {
    if let Ok(value) = DateTime::parse_from_rfc3339(value) {
        return Some(value.with_timezone(&Utc));
    }
    let naive = NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S").ok()?;
    FixedOffset::east_opt(8 * 3600)?
        .from_local_datetime(&naive)
        .single()
        .map(|value| value.with_timezone(&Utc))
}

fn fixed_direction(value: i16) -> Option<i16> {
    matches!(value, 0 | 1).then_some(value)
}
