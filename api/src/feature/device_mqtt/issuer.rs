use chrono::{DateTime, Duration, Utc};
use rumqttc::{AsyncClient, QoS};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::face_v203::{FacePersonPayload, build_delete_person, build_edit_person, command_topic};
use super::publisher::publish_json;

// 厂家协议 personType: 0=白名单, 1=黑名单。本项目不使用黑名单。
const FACE_PERSON_TYPE_WHITELIST: i32 = 0;
const B_VENDOR_DEVICE_TYPE: &str = "弹厂家";
const MISSING_FACE_PHOTO_MESSAGE: &str = "工人未上传人脸照片，无法下发";
const FETCH_PROJECT_WORKERS_SQL: &str = r#"
        SELECT worker.id, worker.name, worker.id_card, worker.phone, worker.avatar,
               worker.is_deleted, worker.work_status,
               (
                   SELECT identity.external_person_id
                   FROM integration_person_identities identity
                   JOIN integration_platforms platform
                     ON platform.id = identity.platform_id
                    AND platform.is_deleted = FALSE
                    AND platform.code = 'ningbo_housing'
                   WHERE identity.is_deleted = FALSE
                     AND identity.identity_type = 'id_card'
                     AND identity.identity_value = UPPER(BTRIM(worker.id_card))
                   ORDER BY identity.updated_at DESC
                   LIMIT 1
               ) AS native
        FROM construction_workers worker
        WHERE worker.is_deleted = FALSE
          AND worker.project_id = $1
          AND COALESCE(worker.work_status, 1) <> 2
        ORDER BY worker.created_at ASC
        "#;

#[derive(Debug, Clone)]
struct IssueWorkerSnapshot {
    id: Uuid,
    name: Option<String>,
    id_card: Option<String>,
    phone: Option<String>,
    avatar: Option<String>,
    is_deleted: bool,
    work_status: Option<i16>,
    native: Option<String>,
}

#[derive(Debug, Clone)]
struct IssueDeviceSnapshot {
    id: Uuid,
    project_id: Uuid,
    device_name: Option<String>,
    serial_number: String,
    device_type: Option<String>,
    online_status: String,
    last_heartbeat_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IssueWorkersSummary {
    pub project_id: Uuid,
    pub attendance_device_id: Uuid,
    pub serial_number: String,
    pub total_workers: usize,
    pub queued: usize,
    pub skipped_without_photo: usize,
    pub failed: usize,
}

pub async fn issue_single_worker_via_broker(
    pool: &PgPool,
    broker_url: Option<&str>,
    project_id: Uuid,
    worker_id: Uuid,
    attendance_device_id: Uuid,
    action: &str,
    issued_at: Option<DateTime<Utc>>,
    remark: Option<&str>,
) -> Result<Uuid, String> {
    let worker = fetch_issue_worker(pool, project_id, worker_id).await?;
    let device = fetch_issue_device(pool, project_id, attendance_device_id).await?;
    if is_b_vendor_device(&device) {
        return Err("弹厂家设备由设备主动调用/workers拉取人员，不支持服务端下发".to_string());
    }
    if let Some(error) = issue_preflight_error(action, &worker) {
        insert_failed_issue_report(pool, project_id, &worker, &device, action, error, remark)
            .await?;
        return Err(error.to_string());
    }

    issue_worker_snapshot_via_broker(
        pool,
        require_mqtt_broker_url(broker_url)?,
        project_id,
        &worker,
        &device,
        action,
        issued_at,
        remark,
    )
    .await
}

pub async fn issue_device_workers_via_broker(
    pool: &PgPool,
    broker_url: Option<&str>,
    project_id: Uuid,
    attendance_device_id: Uuid,
    action: &str,
    remark: Option<&str>,
    require_online: bool,
) -> Result<IssueWorkersSummary, String> {
    let device = fetch_issue_device(pool, project_id, attendance_device_id).await?;
    if is_b_vendor_device(&device) {
        return Err("弹厂家设备由设备主动调用/workers拉取人员，不支持服务端下发".to_string());
    }
    if require_online && !is_device_online(&device) {
        return Err("设备未在线，暂不能下发人员".to_string());
    }
    let mqtt_broker_url = require_mqtt_broker_url(broker_url)?;

    let workers = if action == "delete" {
        fetch_device_clear_workers(pool, project_id, attendance_device_id).await?
    } else {
        fetch_project_workers(pool, project_id).await?
    };
    let total_workers = workers.len();
    let mut queued = 0usize;
    let mut skipped_without_photo = 0usize;
    let mut failed = 0usize;

    for worker in workers {
        if should_skip_worker_without_photo(action, &worker) {
            skipped_without_photo += 1;
            insert_failed_issue_report(
                pool,
                project_id,
                &worker,
                &device,
                action,
                MISSING_FACE_PHOTO_MESSAGE,
                remark,
            )
            .await?;
            continue;
        }

        match issue_worker_snapshot_via_broker(
            pool,
            mqtt_broker_url,
            project_id,
            &worker,
            &device,
            action,
            None,
            remark,
        )
        .await
        {
            Ok(_) => queued += 1,
            Err(error) => {
                failed += 1;
                insert_failed_issue_report(
                    pool, project_id, &worker, &device, action, &error, remark,
                )
                .await?;
            }
        }
    }

    Ok(IssueWorkersSummary {
        project_id,
        attendance_device_id,
        serial_number: device.serial_number,
        total_workers,
        queued,
        skipped_without_photo,
        failed,
    })
}

pub async fn auto_issue_device_workers_via_client(
    pool: &PgPool,
    client: &AsyncClient,
    serial_number: &str,
) -> Result<Option<IssueWorkersSummary>, String> {
    let Some(device) = fetch_issue_device_by_serial(pool, serial_number).await? else {
        return Ok(None);
    };
    if is_b_vendor_device(&device) {
        return Ok(None);
    }
    if has_any_issue_report(pool, device.id).await? {
        return Ok(None);
    }

    let workers = fetch_project_workers(pool, device.project_id).await?;
    let total_workers = workers.len();
    let mut queued = 0usize;
    let mut skipped_without_photo = 0usize;
    let mut failed = 0usize;

    for worker in workers {
        if should_skip_worker_without_photo("create", &worker) {
            skipped_without_photo += 1;
            insert_failed_issue_report(
                pool,
                device.project_id,
                &worker,
                &device,
                "create",
                MISSING_FACE_PHOTO_MESSAGE,
                Some("设备上线后自动下发"),
            )
            .await?;
            continue;
        }

        match issue_worker_snapshot_via_client(
            pool,
            client,
            device.project_id,
            &worker,
            &device,
            "create",
            Some("设备上线后自动下发"),
        )
        .await
        {
            Ok(_) => queued += 1,
            Err(error) => {
                failed += 1;
                insert_failed_issue_report(
                    pool,
                    device.project_id,
                    &worker,
                    &device,
                    "create",
                    &error,
                    Some("设备上线后自动下发"),
                )
                .await?;
            }
        }
    }

    Ok(Some(IssueWorkersSummary {
        project_id: device.project_id,
        attendance_device_id: device.id,
        serial_number: device.serial_number,
        total_workers,
        queued,
        skipped_without_photo,
        failed,
    }))
}

async fn issue_worker_snapshot_via_broker(
    pool: &PgPool,
    broker_url: &str,
    project_id: Uuid,
    worker: &IssueWorkerSnapshot,
    device: &IssueDeviceSnapshot,
    action: &str,
    issued_at: Option<DateTime<Utc>>,
    remark: Option<&str>,
) -> Result<Uuid, String> {
    if action != "delete" {
        ensure_worker_can_be_issued(worker)?;
    }
    let (message_id, topic, request_payload, operator) =
        build_issue_mqtt_payload(action, worker, device)?;
    let report_id = insert_attendance_device_issue_report(
        pool,
        project_id,
        worker,
        device,
        action,
        issued_at,
        &message_id,
        &request_payload,
        remark,
    )
    .await?;

    let publish_result = publish_json(broker_url, &topic, &request_payload).await;
    let (status, message, error_message) = match publish_result {
        Ok(()) => ("pending", "已发送到设备，等待设备回执".to_string(), None),
        Err(error) => ("failed", format!("MQTT发送失败：{error}"), Some(error)),
    };
    update_issue_publish_result(pool, report_id, status, &message).await?;
    insert_outbound_mqtt_message(
        pool,
        project_id,
        device.id,
        &device.serial_number,
        &topic,
        operator,
        &message_id,
        &request_payload,
        if error_message.is_some() {
            "failed"
        } else {
            "sent"
        },
        error_message.as_deref(),
    )
    .await?;

    Ok(report_id)
}

async fn issue_worker_snapshot_via_client(
    pool: &PgPool,
    client: &AsyncClient,
    project_id: Uuid,
    worker: &IssueWorkerSnapshot,
    device: &IssueDeviceSnapshot,
    action: &str,
    remark: Option<&str>,
) -> Result<Uuid, String> {
    if action != "delete" {
        ensure_worker_can_be_issued(worker)?;
    }
    let (message_id, topic, request_payload, operator) =
        build_issue_mqtt_payload(action, worker, device)?;
    let report_id = insert_attendance_device_issue_report(
        pool,
        project_id,
        worker,
        device,
        action,
        None,
        &message_id,
        &request_payload,
        remark,
    )
    .await?;

    let payload_bytes = serde_json::to_vec(&request_payload).map_err(|error| error.to_string())?;
    let publish_result = client
        .publish(&topic, QoS::AtLeastOnce, false, payload_bytes)
        .await
        .map_err(|error| error.to_string());
    let (status, message, error_message) = match publish_result {
        Ok(()) => (
            "pending",
            "已加入设备下发队列，等待设备回执".to_string(),
            None,
        ),
        Err(error) => ("failed", format!("MQTT发送失败：{error}"), Some(error)),
    };
    update_issue_publish_result(pool, report_id, status, &message).await?;
    insert_outbound_mqtt_message(
        pool,
        project_id,
        device.id,
        &device.serial_number,
        &topic,
        operator,
        &message_id,
        &request_payload,
        if error_message.is_some() {
            "failed"
        } else {
            "queued"
        },
        error_message.as_deref(),
    )
    .await?;

    Ok(report_id)
}

async fn fetch_issue_worker(
    pool: &PgPool,
    project_id: Uuid,
    worker_id: Uuid,
) -> Result<IssueWorkerSnapshot, String> {
    sqlx::query_as::<
        _,
        (
            Uuid,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            bool,
            Option<i16>,
            Option<String>,
        ),
    >(
        r#"
        SELECT worker.id, worker.name, worker.id_card, worker.phone, worker.avatar,
               worker.is_deleted, worker.work_status,
               (
                   SELECT identity.external_person_id
                   FROM integration_person_identities identity
                   JOIN integration_platforms platform
                     ON platform.id = identity.platform_id
                    AND platform.is_deleted = FALSE
                    AND platform.code = 'ningbo_housing'
                   WHERE identity.is_deleted = FALSE
                     AND identity.identity_type = 'id_card'
                     AND identity.identity_value = UPPER(BTRIM(worker.id_card))
                   ORDER BY identity.updated_at DESC
                   LIMIT 1
               ) AS native
        FROM construction_workers worker
        WHERE worker.project_id = $1
          AND worker.id = $2
        "#,
    )
    .bind(project_id)
    .bind(worker_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| error.to_string())?
    .map(
        |(id, name, id_card, phone, avatar, is_deleted, work_status, native)| IssueWorkerSnapshot {
            id,
            name,
            id_card,
            phone,
            avatar,
            is_deleted,
            work_status,
            native,
        },
    )
    .ok_or_else(|| "所选工人不属于该项目".to_string())
}

async fn fetch_project_workers(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<Vec<IssueWorkerSnapshot>, String> {
    sqlx::query_as::<
        _,
        (
            Uuid,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            bool,
            Option<i16>,
            Option<String>,
        ),
    >(FETCH_PROJECT_WORKERS_SQL)
    .bind(project_id)
    .fetch_all(pool)
    .await
    .map_err(|error| error.to_string())
    .map(|rows| {
        rows.into_iter()
            .map(
                |(id, name, id_card, phone, avatar, is_deleted, work_status, native)| {
                    IssueWorkerSnapshot {
                        id,
                        name,
                        id_card,
                        phone,
                        avatar,
                        is_deleted,
                        work_status,
                        native,
                    }
                },
            )
            .collect()
    })
}

async fn fetch_device_clear_workers(
    pool: &PgPool,
    project_id: Uuid,
    attendance_device_id: Uuid,
) -> Result<Vec<IssueWorkerSnapshot>, String> {
    sqlx::query_as::<
        _,
        (
            Uuid,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            bool,
            Option<i16>,
        ),
    >(
        r#"
        SELECT DISTINCT ON (source.worker_id)
            source.worker_id,
            source.name,
            source.id_card,
            source.phone,
            source.avatar,
            source.is_deleted,
            source.work_status
        FROM (
            SELECT id AS worker_id, name, id_card, phone, avatar, is_deleted, work_status, updated_at AS sort_time
            FROM construction_workers
            WHERE project_id = $1
              AND is_deleted = FALSE
              AND COALESCE(work_status, 1) <> 2

            UNION ALL

            SELECT r.worker_id, COALESCE(r.worker_name, w.name) AS name,
                   COALESCE(r.worker_id_card, w.id_card) AS id_card,
                   COALESCE(r.worker_phone, w.phone) AS phone,
                   COALESCE(r.avatar_url, w.avatar) AS avatar,
                   w.is_deleted,
                   w.work_status,
                   r.updated_at AS sort_time
            FROM construction_attendance_device_issue_reports r
            JOIN construction_workers w
              ON w.id = r.worker_id
             AND w.project_id = r.project_id
             AND w.is_deleted = FALSE
             AND COALESCE(w.work_status, 1) <> 2
            WHERE r.is_deleted = FALSE
              AND r.project_id = $1
              AND r.attendance_device_id = $2
              AND r.worker_id IS NOT NULL
        ) source
        ORDER BY source.worker_id, source.sort_time DESC
        "#,
    )
    .bind(project_id)
    .bind(attendance_device_id)
    .fetch_all(pool)
    .await
    .map_err(|error| error.to_string())
    .map(|rows| {
        rows.into_iter()
            .map(|(id, name, id_card, phone, avatar, is_deleted, work_status)| IssueWorkerSnapshot {
                id,
                name,
                id_card,
                phone,
                avatar,
                is_deleted,
                work_status,
                native: None,
            })
            .collect()
    })
}

async fn fetch_issue_device(
    pool: &PgPool,
    project_id: Uuid,
    attendance_device_id: Uuid,
) -> Result<IssueDeviceSnapshot, String> {
    sqlx::query_as::<
        _,
        (
            Uuid,
            Uuid,
            Option<String>,
            Option<String>,
            Option<String>,
            String,
            Option<DateTime<Utc>>,
        ),
    >(
        r#"
        SELECT id, project_id, device_name, serial_number, device_type, online_status, last_heartbeat_at
        FROM construction_attendance_devices
        WHERE is_deleted = FALSE
          AND project_id = $1
          AND id = $2
        "#,
    )
    .bind(project_id)
    .bind(attendance_device_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| error.to_string())?
    .and_then(
        |(
            id,
            project_id,
            device_name,
            serial_number,
            device_type,
            online_status,
            last_heartbeat_at,
        )| {
            serial_number
                .filter(|value| !value.trim().is_empty())
                .map(|serial_number| IssueDeviceSnapshot {
                    id,
                    project_id,
                    device_name,
                    serial_number,
                    device_type,
                    online_status,
                    last_heartbeat_at,
                })
        },
    )
    .ok_or_else(|| "所选考勤机不属于该项目或序列号为空".to_string())
}

async fn fetch_issue_device_by_serial(
    pool: &PgPool,
    serial_number: &str,
) -> Result<Option<IssueDeviceSnapshot>, String> {
    sqlx::query_as::<
        _,
        (
            Uuid,
            Uuid,
            Option<String>,
            String,
            Option<String>,
            String,
            Option<DateTime<Utc>>,
        ),
    >(
        r#"
        SELECT id, project_id, device_name, serial_number, device_type, online_status, last_heartbeat_at
        FROM construction_attendance_devices
        WHERE is_deleted = FALSE
          AND serial_number = $1
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
    )
    .bind(serial_number)
    .fetch_optional(pool)
    .await
    .map_err(|error| error.to_string())
    .map(|row| {
        row.map(
            |(
                id,
                project_id,
                device_name,
                serial_number,
                device_type,
                online_status,
                last_heartbeat_at,
            )| IssueDeviceSnapshot {
                id,
                project_id,
                device_name,
                serial_number,
                device_type,
                online_status,
                last_heartbeat_at,
            },
        )
    })
}

async fn has_any_issue_report(pool: &PgPool, attendance_device_id: Uuid) -> Result<bool, String> {
    sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM construction_attendance_device_issue_reports
            WHERE is_deleted = FALSE
              AND attendance_device_id = $1
        )
        "#,
    )
    .bind(attendance_device_id)
    .fetch_one(pool)
    .await
    .map_err(|error| error.to_string())
}

fn build_issue_mqtt_payload(
    action: &str,
    worker: &IssueWorkerSnapshot,
    device: &IssueDeviceSnapshot,
) -> Result<(String, String, Value, &'static str), String> {
    let message_id = format!("issue-{}", Uuid::new_v4());
    let custom_id = issue_worker_custom_id(worker);
    let topic = command_topic(&device.serial_number);
    if action == "delete" {
        return Ok((
            message_id.clone(),
            topic,
            build_delete_person(&message_id, &custom_id),
            "DelPerson",
        ));
    }

    let name = worker
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "工人姓名不能为空".to_string())?
        .to_string();
    let avatar = worker
        .avatar
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| MISSING_FACE_PHOTO_MESSAGE.to_string())?
        .to_string();
    let person = FacePersonPayload {
        custom_id,
        name,
        id_card: worker
            .id_card
            .clone()
            .filter(|value| !value.trim().is_empty()),
        phone: worker
            .phone
            .clone()
            .filter(|value| !value.trim().is_empty()),
        notes: worker
            .native
            .clone()
            .filter(|value| !value.trim().is_empty()),
        photo_uri: Some(avatar),
        photo_base64: None,
        person_type: FACE_PERSON_TYPE_WHITELIST,
        temp_card_type: 0,
    };

    Ok((
        message_id.clone(),
        topic,
        build_edit_person(&message_id, &person),
        "EditPerson",
    ))
}

fn issue_worker_custom_id(worker: &IssueWorkerSnapshot) -> String {
    worker.id.to_string()
}

fn is_b_vendor_device(device: &IssueDeviceSnapshot) -> bool {
    device.device_type.as_deref() == Some(B_VENDOR_DEVICE_TYPE)
}

fn require_mqtt_broker_url(broker_url: Option<&str>) -> Result<&str, String> {
    broker_url.ok_or_else(|| "MQTT_BROKER_URL 未配置，无法向 A 厂家设备下发人员".to_string())
}

fn should_skip_worker_without_photo(action: &str, worker: &IssueWorkerSnapshot) -> bool {
    action != "delete"
        && worker
            .avatar
            .as_deref()
            .map(str::trim)
            .unwrap_or("")
            .is_empty()
}

fn issue_preflight_error(action: &str, worker: &IssueWorkerSnapshot) -> Option<&'static str> {
    if action == "delete" {
        return None;
    }

    if worker.is_deleted || worker.work_status == Some(2) {
        return Some("人员已离场或已删除，禁止下发考勤机");
    }

    if worker
        .name
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .is_empty()
    {
        return Some("工人姓名不能为空");
    }

    if should_skip_worker_without_photo(action, worker) {
        return Some(MISSING_FACE_PHOTO_MESSAGE);
    }

    None
}

fn ensure_worker_can_be_issued(worker: &IssueWorkerSnapshot) -> Result<(), String> {
    if worker.is_deleted || worker.work_status == Some(2) {
        return Err("人员已离场或已删除，禁止下发考勤机".to_string());
    }
    Ok(())
}

async fn insert_attendance_device_issue_report(
    pool: &PgPool,
    project_id: Uuid,
    worker: &IssueWorkerSnapshot,
    device: &IssueDeviceSnapshot,
    action: &str,
    issued_at: Option<DateTime<Utc>>,
    message_id: &str,
    request_payload: &Value,
    remark: Option<&str>,
) -> Result<Uuid, String> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO construction_attendance_device_issue_reports (
            project_id, worker_id, attendance_device_id,
            worker_name, worker_id_card, worker_phone, avatar_url,
            device_name, serial_number, device_type,
            action, status, issued_at, message, remark,
            mqtt_message_id, request_payload
        )
        VALUES (
            $1, $2, $3,
            $4, $5, $6, $7,
            $8, $9, $10,
            $11, 'pending', COALESCE($12, NOW()), '正在发送到设备', $13,
            $14, $15
        )
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(worker.id)
    .bind(device.id)
    .bind(&worker.name)
    .bind(&worker.id_card)
    .bind(&worker.phone)
    .bind(&worker.avatar)
    .bind(&device.device_name)
    .bind(&device.serial_number)
    .bind(&device.device_type)
    .bind(action)
    .bind(issued_at)
    .bind(remark)
    .bind(message_id)
    .bind(request_payload)
    .fetch_one(pool)
    .await
    .map_err(|error| error.to_string())
}

async fn insert_failed_issue_report(
    pool: &PgPool,
    project_id: Uuid,
    worker: &IssueWorkerSnapshot,
    device: &IssueDeviceSnapshot,
    action: &str,
    message: &str,
    remark: Option<&str>,
) -> Result<Uuid, String> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO construction_attendance_device_issue_reports (
            project_id, worker_id, attendance_device_id,
            worker_name, worker_id_card, worker_phone, avatar_url,
            device_name, serial_number, device_type,
            action, status, issued_at, message, remark
        )
        VALUES (
            $1, $2, $3,
            $4, $5, $6, $7,
            $8, $9, $10,
            $11, 'failed', NOW(), $12, $13
        )
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(worker.id)
    .bind(device.id)
    .bind(&worker.name)
    .bind(&worker.id_card)
    .bind(&worker.phone)
    .bind(&worker.avatar)
    .bind(&device.device_name)
    .bind(&device.serial_number)
    .bind(&device.device_type)
    .bind(action)
    .bind(message)
    .bind(remark)
    .fetch_one(pool)
    .await
    .map_err(|error| error.to_string())
}

async fn update_issue_publish_result(
    pool: &PgPool,
    report_id: Uuid,
    status: &str,
    message: &str,
) -> Result<(), String> {
    sqlx::query(
        r#"
        UPDATE construction_attendance_device_issue_reports
        SET status = $2,
            message = $3,
            last_error = CASE WHEN $2 = 'failed' THEN $3 ELSE NULL END,
            updated_at = NOW()
        WHERE id = $1
          AND is_deleted = FALSE
        "#,
    )
    .bind(report_id)
    .bind(status)
    .bind(message)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

async fn insert_outbound_mqtt_message(
    pool: &PgPool,
    project_id: Uuid,
    attendance_device_id: Uuid,
    serial_number: &str,
    topic: &str,
    operator: &str,
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
    .bind(project_id)
    .bind(attendance_device_id)
    .bind(serial_number)
    .bind(topic)
    .bind(operator)
    .bind(message_id)
    .bind(payload)
    .bind(status)
    .bind(error_message)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn is_device_online(device: &IssueDeviceSnapshot) -> bool {
    if device.online_status == "offline" {
        return false;
    }
    let Some(last_heartbeat_at) = device.last_heartbeat_at else {
        return device.online_status == "online";
    };
    Utc::now() - last_heartbeat_at <= Duration::minutes(3)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_worker_custom_id_uses_worker_uuid() {
        let worker_id = Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
        let worker = IssueWorkerSnapshot {
            id: worker_id,
            name: Some("leo".to_string()),
            id_card: Some("321183199611224410".to_string()),
            phone: Some("13245234123".to_string()),
            avatar: Some("https://example.test/avatar.jpg".to_string()),
            is_deleted: false,
            work_status: Some(1),
            native: None,
        };

        assert_eq!(issue_worker_custom_id(&worker), worker_id.to_string());
    }

    #[test]
    fn issue_worker_mqtt_payload_always_uses_whitelist_person_type() {
        let worker_id = Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
        let device_id = Uuid::parse_str("00000000-0000-0000-0000-000000000002").unwrap();
        let project_id = Uuid::parse_str("00000000-0000-0000-0000-000000000003").unwrap();
        let worker = IssueWorkerSnapshot {
            id: worker_id,
            name: Some("leo".to_string()),
            id_card: Some("321183199611224410".to_string()),
            phone: Some("13245234123".to_string()),
            avatar: Some("https://example.test/avatar.jpg".to_string()),
            is_deleted: false,
            work_status: Some(1),
            native: Some("E6F2C98F834949EB88299E9266759343".to_string()),
        };
        let device = IssueDeviceSnapshot {
            id: device_id,
            project_id,
            device_name: Some("南门考勤机".to_string()),
            serial_number: "1306612".to_string(),
            device_type: Some("海厂家".to_string()),
            online_status: "online".to_string(),
            last_heartbeat_at: Some(Utc::now()),
        };

        let (_, _, payload, operator) =
            build_issue_mqtt_payload("update", &worker, &device).unwrap();

        assert_eq!(operator, "EditPerson");
        assert_eq!(payload["operator"], "EditPerson");
        assert_eq!(payload["info"]["personType"], FACE_PERSON_TYPE_WHITELIST);
        assert_eq!(payload["info"]["notes"], "E6F2C98F834949EB88299E9266759343");
        assert!(payload["info"].get("native").is_none());
    }

    #[test]
    fn delete_issue_payload_does_not_require_worker_photo() {
        let worker_id = Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
        let device_id = Uuid::parse_str("00000000-0000-0000-0000-000000000002").unwrap();
        let project_id = Uuid::parse_str("00000000-0000-0000-0000-000000000003").unwrap();
        let worker = IssueWorkerSnapshot {
            id: worker_id,
            name: Some("leo".to_string()),
            id_card: None,
            phone: None,
            avatar: None,
            is_deleted: false,
            work_status: Some(1),
            native: Some("YJM-330200-001".to_string()),
        };
        let device = IssueDeviceSnapshot {
            id: device_id,
            project_id,
            device_name: Some("南门考勤机".to_string()),
            serial_number: "1306612".to_string(),
            device_type: Some("海厂家".to_string()),
            online_status: "online".to_string(),
            last_heartbeat_at: Some(Utc::now()),
        };

        let (_, _, payload, operator) =
            build_issue_mqtt_payload("delete", &worker, &device).unwrap();

        assert_eq!(operator, "DelPerson");
        assert_eq!(payload["operator"], "DelPerson");
        assert_eq!(payload["info"]["customId"], worker_id.to_string());
        assert!(payload["info"].get("notes").is_none());
        assert!(!should_skip_worker_without_photo("delete", &worker));
        assert!(should_skip_worker_without_photo("update", &worker));
    }

    #[test]
    fn update_issue_payload_reports_missing_face_photo() {
        let worker_id = Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
        let device_id = Uuid::parse_str("00000000-0000-0000-0000-000000000002").unwrap();
        let project_id = Uuid::parse_str("00000000-0000-0000-0000-000000000003").unwrap();
        let worker = IssueWorkerSnapshot {
            id: worker_id,
            name: Some("leo".to_string()),
            id_card: None,
            phone: None,
            avatar: None,
            is_deleted: false,
            work_status: Some(1),
            native: None,
        };
        let device = IssueDeviceSnapshot {
            id: device_id,
            project_id,
            device_name: Some("南门考勤机".to_string()),
            serial_number: "1306612".to_string(),
            device_type: Some("海厂家".to_string()),
            online_status: "online".to_string(),
            last_heartbeat_at: Some(Utc::now()),
        };

        let error = build_issue_mqtt_payload("update", &worker, &device).unwrap_err();

        assert_eq!(error, MISSING_FACE_PHOTO_MESSAGE);
    }

    #[test]
    fn single_worker_preflight_failure_is_reportable() {
        let worker_id = Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
        let worker = IssueWorkerSnapshot {
            id: worker_id,
            name: Some("leo".to_string()),
            id_card: None,
            phone: None,
            avatar: None,
            is_deleted: false,
            work_status: Some(1),
            native: None,
        };

        assert_eq!(
            issue_preflight_error("update", &worker),
            Some(MISSING_FACE_PHOTO_MESSAGE)
        );
        assert_eq!(issue_preflight_error("delete", &worker), None);

        let left_site_worker = IssueWorkerSnapshot {
            work_status: Some(2),
            avatar: Some("https://example.test/avatar.jpg".to_string()),
            ..worker
        };
        assert_eq!(
            issue_preflight_error("update", &left_site_worker),
            Some("人员已离场或已删除，禁止下发考勤机")
        );
        assert_eq!(issue_preflight_error("delete", &left_site_worker), None);
    }

    #[test]
    fn project_worker_issue_query_excludes_left_site_workers() {
        assert!(FETCH_PROJECT_WORKERS_SQL.contains("COALESCE(worker.work_status, 1) <> 2"));
        assert!(FETCH_PROJECT_WORKERS_SQL.contains("platform.code = 'ningbo_housing'"));
    }

    #[test]
    fn only_b_vendor_bypasses_the_mqtt_issue_path() {
        let project_id = Uuid::parse_str("00000000-0000-0000-0000-000000000003").unwrap();
        let mut device = IssueDeviceSnapshot {
            id: Uuid::parse_str("00000000-0000-0000-0000-000000000002").unwrap(),
            project_id,
            device_name: Some("测试考勤机".to_string()),
            serial_number: "1306612".to_string(),
            device_type: Some("海厂家".to_string()),
            online_status: "online".to_string(),
            last_heartbeat_at: Some(Utc::now()),
        };

        assert!(!is_b_vendor_device(&device));
        assert!(require_mqtt_broker_url(None).is_err());

        device.device_type = Some(B_VENDOR_DEVICE_TYPE.to_string());
        assert!(is_b_vendor_device(&device));
    }
}
