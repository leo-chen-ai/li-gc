use std::time::Duration;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use chrono::{DateTime, FixedOffset, Utc};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use tokio::time::sleep;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::{feature::integration::yongxin_v2, state::AppState};

const WORKER_COUNT: usize = 2;
const POLL_INTERVAL: Duration = Duration::from_millis(500);
const LOCK_DURATION_MINUTES: i64 = 10;
const ASYNC_POLL_SECONDS: i64 = 15;
const RATE_SLOT_MILLIS: i64 = 550;
const MAX_MEDIA_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, FromRow)]
struct ClaimedJob {
    id: Uuid,
    project_id: Uuid,
    binding_id: Uuid,
    operation: String,
    local_entity_id: Option<Uuid>,
    request_payload: Value,
    attempt_count: i32,
    max_attempts: i32,
    external_request_id: Option<String>,
    expires_at: Option<DateTime<Utc>>,
    previous_status: String,
}

#[derive(Debug)]
enum JobIssue {
    WaitingData(String),
    WaitingDependency(String),
    WaitingMedia(String),
    Retryable(String),
    Permanent(String),
    DeliveryUnknown(String),
}

impl JobIssue {
    fn message(&self) -> &str {
        match self {
            Self::WaitingData(message)
            | Self::WaitingDependency(message)
            | Self::WaitingMedia(message)
            | Self::Retryable(message)
            | Self::Permanent(message)
            | Self::DeliveryUnknown(message) => message,
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum CallSafety {
    Read,
    Write,
}

pub fn spawn_yongxin_job_workers(state: AppState) {
    for worker_index in 0..WORKER_COUNT {
        let state = state.clone();
        tokio::spawn(async move {
            let worker_name = format!("yongxin-v2-job-{worker_index}");
            info!(worker = %worker_name, "Yongxin V2 integration worker started");
            loop {
                match process_one_pending(&state, &worker_name).await {
                    Ok(true) => {}
                    Ok(false) => sleep(POLL_INTERVAL).await,
                    Err(error) => {
                        error!(worker = %worker_name, error = %error, "Yongxin job claim failed");
                        sleep(Duration::from_secs(2)).await;
                    }
                }
            }
        });
    }
}

/// Process at most one due Yongxin job.
///
/// This is shared by the long-running workers and deterministic end-to-end
/// tests so the same claim, locking, retry and completion code is exercised.
pub async fn process_one_pending(state: &AppState, worker_name: &str) -> Result<bool, sqlx::Error> {
    let Some(job) = claim_job(state.db.pool(), worker_name).await? else {
        return Ok(false);
    };
    process_job(state, job).await;
    Ok(true)
}

async fn claim_job(pool: &PgPool, worker_name: &str) -> Result<Option<ClaimedJob>, sqlx::Error> {
    sqlx::query_as::<_, ClaimedJob>(
        r#"
        WITH candidate AS (
            SELECT job.id, job.status AS previous_status
            FROM integration_jobs job
            JOIN integration_project_bindings binding
              ON binding.id = job.binding_id
             AND binding.is_deleted = FALSE
            WHERE job.platform_code = 'yongxin_v2'
              AND job.status IN (
                    'pending', 'retry', 'awaiting_result',
                    'waiting_dependency', 'waiting_media', 'processing'
                  )
              AND job.next_attempt_at <= NOW()
              AND (job.locked_until IS NULL OR job.locked_until <= NOW())
              AND NOT EXISTS (
                  SELECT 1
                  FROM integration_jobs earlier
                  WHERE earlier.binding_id = job.binding_id
                    AND earlier.local_entity_id = job.local_entity_id
                    AND earlier.id <> job.id
                    AND earlier.status IN (
                          'pending', 'retry', 'awaiting_result',
                          'waiting_dependency', 'waiting_media', 'processing'
                        )
                    AND (earlier.created_at, earlier.id) < (job.created_at, job.id)
              )
            ORDER BY job.next_attempt_at, job.created_at, job.id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        UPDATE integration_jobs job
        SET status = 'processing',
            locked_by = $1,
            locked_until = NOW() + make_interval(mins => $2),
            attempt_count = job.attempt_count + 1,
            updated_at = NOW()
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING job.id, job.project_id, job.binding_id, job.operation,
                  job.local_entity_id, job.request_payload,
                  job.attempt_count, job.max_attempts, job.external_request_id,
                  job.expires_at, candidate.previous_status
        "#,
    )
    .bind(worker_name)
    .bind(LOCK_DURATION_MINUTES as i32)
    .fetch_optional(pool)
    .await
}

async fn process_job(state: &AppState, job: ClaimedJob) {
    let config = match load_binding_config(state.db.pool(), job.binding_id).await {
        Ok(Some(config)) => config,
        Ok(None) => {
            finish_status(
                state.db.pool(),
                job.id,
                "disabled",
                Some(&json!({"skipped": "binding_disabled"})),
                Some("平台绑定已停用"),
            )
            .await;
            return;
        }
        Err(error) => {
            handle_issue(
                state.db.pool(),
                &job,
                JobIssue::Retryable(error.to_string()),
            )
            .await;
            return;
        }
    };
    let credentials = match yongxin_v2::YongxinCredentials::from_config(&config) {
        Ok(credentials) => credentials,
        Err(error) => {
            handle_issue(
                state.db.pool(),
                &job,
                JobIssue::WaitingData(error.to_string()),
            )
            .await;
            return;
        }
    };

    let result = if job.previous_status == "awaiting_result" || job.external_request_id.is_some() {
        poll_async_result(state, &job, &credentials).await
    } else {
        execute_initial(state, &job, &credentials, &config).await
    };

    match result {
        Ok(()) => {}
        Err(issue) => handle_issue(state.db.pool(), &job, issue).await,
    }
}

async fn execute_initial(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &yongxin_v2::YongxinCredentials,
    config: &Value,
) -> Result<(), JobIssue> {
    match job.operation.as_str() {
        "project.query" => execute_project_query(state, job, credentials).await,
        "unit.sync" => execute_unit_sync(state, job, credentials).await,
        "team.sync" => execute_team_sync(state, job, credentials).await,
        "worker.sync" => execute_worker_sync(state, job, credentials, config).await,
        "entry_exit.sync" => execute_entry_exit_sync(state, job, credentials).await,
        "attendance.sync" => execute_attendance_sync(state, job, credentials).await,
        operation => Err(JobIssue::Permanent(format!(
            "甬薪平台不支持任务操作：{operation}"
        ))),
    }
}

async fn execute_project_query(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &yongxin_v2::YongxinCredentials,
) -> Result<(), JobIssue> {
    let payload = json!({"projectCode": credentials.project_code});
    let response = call_json(
        state,
        job,
        credentials,
        yongxin_v2::PROJECT_QUERY_PATH,
        &payload,
        CallSafety::Read,
    )
    .await?;
    complete_job(state.db.pool(), job.id, &response.body).await
}

async fn execute_unit_sync(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &yongxin_v2::YongxinCredentials,
) -> Result<(), JobIssue> {
    let unit_id = local_id(job)?;
    let operation = event_operation(job);
    if operation == "delete" {
        return complete_skipped(state.db.pool(), job.id, "文档未提供参建单位删除接口").await;
    }
    if mapping_external(state.db.pool(), job.binding_id, "unit", unit_id)
        .await?
        .is_some()
    {
        return complete_skipped(
            state.db.pool(),
            job.id,
            "参建单位已同步；文档未提供更新接口，已跳过重复下发",
        )
        .await;
    }

    let unit = load_json_row(
        state.db.pool(),
        "SELECT to_jsonb(unit) FROM construction_units unit WHERE unit.id = $1 AND unit.is_deleted = FALSE",
        unit_id,
    )
    .await?
    .ok_or_else(|| JobIssue::WaitingData("参建单位不存在或已删除".to_owned()))?;
    let corp_code = required_text(&unit, "company_credit_code", "单位统一社会信用代码")?;
    let payload = json!({
        "corpName": required_text(&unit, "company_name", "单位名称")?,
        "corpCode": corp_code,
        "corpType": company_type_code(value_i64(&unit, "company_type"))?,
        "areaCode": area_code(&unit)?,
        "registerDate": required_text(&unit, "register_date", "单位注册日期")?,
        "linkMan": required_text(&unit, "manager_name", "单位联系人")?,
        "linkPhone": required_text(&unit, "manager_phone", "单位联系人手机号")?,
    });
    let response = call_json(
        state,
        job,
        credentials,
        yongxin_v2::UNIT_ADD_PATH,
        &payload,
        CallSafety::Write,
    )
    .await?;
    if let Err(issue) = upsert_mapping(
        state.db.pool(),
        job,
        "unit",
        unit_id,
        &corp_code,
        None,
        &response.body,
    )
    .await
    {
        return Err(JobIssue::DeliveryUnknown(format!(
            "单位已被平台接收，但本地映射保存失败：{}",
            issue.message()
        )));
    }
    complete_job(state.db.pool(), job.id, &response.body).await
}

async fn execute_team_sync(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &yongxin_v2::YongxinCredentials,
) -> Result<(), JobIssue> {
    let team_id = local_id(job)?;
    let operation = event_operation(job);
    if operation == "delete" {
        return complete_skipped(state.db.pool(), job.id, "文档未提供班组删除接口").await;
    }
    if mapping_external(state.db.pool(), job.binding_id, "team", team_id)
        .await?
        .is_some()
    {
        return complete_skipped(
            state.db.pool(),
            job.id,
            "班组已同步；文档未提供更新接口，已跳过重复下发",
        )
        .await;
    }

    let team = load_json_row(
        state.db.pool(),
        r#"
        SELECT to_jsonb(team) || jsonb_build_object('unit', to_jsonb(unit))
        FROM construction_teams team
        JOIN construction_units unit ON unit.id = team.unit_id AND unit.is_deleted = FALSE
        WHERE team.id = $1 AND team.is_deleted = FALSE
        "#,
        team_id,
    )
    .await?
    .ok_or_else(|| JobIssue::WaitingData("班组不存在或关联单位已删除".to_owned()))?;
    let unit_id = required_uuid(&team, "unit_id", "班组所属单位")?;
    let corp_code = mapping_external(state.db.pool(), job.binding_id, "unit", unit_id)
        .await?
        .ok_or_else(|| JobIssue::WaitingDependency("等待所属单位同步成功".to_owned()))?;
    let payload = json!({
        "corpCode": corp_code,
        "teamName": required_text(&team, "name", "班组名称")?,
        "teamLeader": required_text(&team, "leader_name", "班组长姓名")?,
        "teamLeaderPhone": required_text(&team, "leader_phone", "班组长手机号")?,
        "entryTime": format_platform_datetime(required_text(&team, "created_at", "班组进场时间")?)?,
    });
    let response = call_json(
        state,
        job,
        credentials,
        yongxin_v2::TEAM_ADD_PATH,
        &payload,
        CallSafety::Write,
    )
    .await?;
    let team_sys_no = yongxin_v2::team_system_number(&response.body)
        .ok_or_else(|| JobIssue::Permanent("班组新增成功但未返回 teamSysNo".to_owned()))?;
    if let Err(issue) = upsert_mapping(
        state.db.pool(),
        job,
        "team",
        team_id,
        &team_sys_no,
        Some(&corp_code),
        &response.body,
    )
    .await
    {
        return Err(JobIssue::DeliveryUnknown(format!(
            "班组已被平台接收，但本地映射保存失败：{}",
            issue.message()
        )));
    }
    complete_job(state.db.pool(), job.id, &response.body).await
}

async fn execute_worker_sync(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &yongxin_v2::YongxinCredentials,
    config: &Value,
) -> Result<(), JobIssue> {
    let worker_id = local_id(job)?;
    if mapping_external(state.db.pool(), job.binding_id, "worker", worker_id)
        .await?
        .is_some()
    {
        return complete_skipped(
            state.db.pool(),
            job.id,
            "人员已同步；文档未提供更新接口，已跳过重复下发",
        )
        .await;
    }

    let worker = load_worker(state.db.pool(), worker_id).await?;
    let team_id = required_uuid(&worker, "team_id", "人员所属班组")?;
    let team_sys_no = mapping_external(state.db.pool(), job.binding_id, "team", team_id)
        .await?
        .ok_or_else(|| JobIssue::WaitingDependency("等待所属班组同步成功".to_owned()))?;

    let avatar = upload_media_from_source(
        state,
        job,
        credentials,
        "worker",
        worker_id,
        "avatar",
        &required_text(&worker, "avatar", "人员头像")?,
    )
    .await?;
    let identity_front = upload_media_from_source(
        state,
        job,
        credentials,
        "worker",
        worker_id,
        "identity_front",
        &required_text(&worker, "ocr_photo", "身份证人像面")?,
    )
    .await?;
    let identity_back = upload_media_from_source(
        state,
        job,
        credentials,
        "worker",
        worker_id,
        "identity_back",
        &required_text(&worker, "id_card_back_file", "身份证国徽面")?,
    )
    .await?;

    let id_card = required_text(&worker, "id_card", "证件号码")?;
    let work_role = if value_i64(&worker, "worker_type") == Some(1001)
        || value_i64(&worker, "work_type") == Some(1001)
    {
        10
    } else {
        20
    };
    let (valid_type, expiration) = identity_expiration(&worker)?;
    let bank_card = optional_text(&worker, "salary_bank_card")
        .map(|value| yongxin_v2::encrypt_sensitive(&credentials.app_secret, &value))
        .transpose()
        .map_err(|error| JobIssue::WaitingData(error.to_string()))?;
    let payload = json!({
        "teamSysNo": team_sys_no,
        "name": required_text(&worker, "name", "人员姓名")?,
        "avatar": avatar,
        "idCardType": "01",
        "idCardNumber": yongxin_v2::encrypt_sensitive(&credentials.app_secret, &id_card)
            .map_err(|error| JobIssue::WaitingData(error.to_string()))?,
        "workerPhone": required_text(&worker, "phone", "人员手机号")?,
        "workRole": work_role,
        "workType": work_type_code(value_i64(&worker, "work_type"))?,
        "workerJob": manager_job_code(optional_text(&worker, "manager_type").as_deref()),
        "hasLeader": if value_bool(&worker, "is_team_leader") { 1 } else { 0 },
        "nation": nation_code(optional_text(&worker, "nation").as_deref(), config),
        "birthPlace": native_place_code(value_i64(&worker, "native_place"))?,
        "identityAuthority": required_text(&worker, "visa_office", "发证机关")?,
        "domicileAddress": required_text(&worker, "address", "户籍地址")?,
        "address": optional_text(&worker, "current_address"),
        "cultureLevel": education_code(value_i64(&worker, "education")),
        "politicsType": politics_code(value_i64(&worker, "political_status")),
        "identityFront": identity_front,
        "identityBack": identity_back,
        "identityValidType": valid_type,
        "identityExpirationDate": expiration,
        "payRollBankCardNumber": bank_card,
        "payRollBankCode": bank_code(optional_text(&worker, "salary_bank").as_deref()),
        "payRollJoint": value_i64(&worker, "unit_price").map(|cents| cents as f64 / 100.0),
        "payRollTypeJoint": value_i64(&worker, "settlement_type"),
        "payRollUnitJoint": quantity_unit_label(value_i64(&worker, "quantity_unit_type")),
    });
    let response = call_json(
        state,
        job,
        credentials,
        yongxin_v2::WORKER_ADD_PATH,
        &payload,
        CallSafety::Write,
    )
    .await?;
    await_async_response(state.db.pool(), job, &response.body).await
}

async fn execute_entry_exit_sync(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &yongxin_v2::YongxinCredentials,
) -> Result<(), JobIssue> {
    let worker_id = local_id(job)?;
    let worker = match load_worker(state.db.pool(), worker_id).await {
        Ok(worker) => worker,
        Err(JobIssue::WaitingData(_)) => job
            .request_payload
            .pointer("/event/deleted_snapshot")
            .cloned()
            .ok_or_else(|| JobIssue::WaitingData("退场人员快照不存在".to_owned()))?,
        Err(issue) => return Err(issue),
    };
    let team_id = required_uuid(&worker, "team_id", "人员所属班组")?;
    let team_sys_no = mapping_external(state.db.pool(), job.binding_id, "team", team_id)
        .await?
        .ok_or_else(|| JobIssue::WaitingDependency("等待所属班组同步成功".to_owned()))?;
    let is_exit = event_operation(job) == "delete" || value_i64(&worker, "work_status") == Some(2);
    let date = if is_exit {
        optional_text(&worker, "exit_time")
            .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string())
    } else {
        required_text(&worker, "entry_time", "人员进场日期")?
    };
    let payload = json!({
        "name": required_text(&worker, "name", "人员姓名")?,
        "idCardType": "01",
        "idCardNumber": yongxin_v2::encrypt_sensitive(
            &credentials.app_secret,
            &required_text(&worker, "id_card", "证件号码")?
        ).map_err(|error| JobIssue::WaitingData(error.to_string()))?,
        "teamSysNo": team_sys_no,
        "type": if is_exit { 0 } else { 1 },
        "date": format_platform_datetime(date)?,
    });
    let response = call_json(
        state,
        job,
        credentials,
        yongxin_v2::ENTRY_EXIT_ADD_PATH,
        &payload,
        CallSafety::Write,
    )
    .await?;
    await_async_response(state.db.pool(), job, &response.body).await
}

async fn execute_attendance_sync(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &yongxin_v2::YongxinCredentials,
) -> Result<(), JobIssue> {
    let attendance_id = local_id(job)?;
    if mapping_external(state.db.pool(), job.binding_id, "attendance", attendance_id)
        .await?
        .is_some()
    {
        return complete_skipped(state.db.pool(), job.id, "该考勤记录已同步，已跳过重复下发").await;
    }
    let attendance = load_json_row(
        state.db.pool(),
        r#"
        SELECT to_jsonb(record)
               || jsonb_build_object('worker', to_jsonb(worker))
               || jsonb_build_object('photo_data', photo.photo_data)
        FROM construction_attendance_records record
        JOIN construction_workers worker ON worker.id = record.worker_id AND worker.is_deleted = FALSE
        LEFT JOIN LATERAL (
            SELECT p.photo_data
            FROM construction_attendance_record_photos p
            WHERE p.attendance_record_id = record.id
              AND p.source IN ('mqtt_rec_push', 'device_vendor_b_photo', 'qianyi_mqtt')
              AND BTRIM(p.photo_data) <> ''
            ORDER BY CASE p.photo_kind WHEN 'closeup' THEN 0 ELSE 1 END, p.created_at
            LIMIT 1
        ) photo ON TRUE
        WHERE record.id = $1 AND record.is_deleted = FALSE
        "#,
        attendance_id,
    )
    .await?
    .ok_or_else(|| JobIssue::WaitingData("考勤记录或人员不存在".to_owned()))?;
    let worker = attendance
        .get("worker")
        .ok_or_else(|| JobIssue::WaitingData("考勤人员信息不存在".to_owned()))?;
    let worker_id = required_uuid(&attendance, "worker_id", "考勤人员")?;
    if mapping_external(state.db.pool(), job.binding_id, "worker", worker_id)
        .await?
        .is_none()
    {
        return Err(JobIssue::WaitingDependency(
            "等待人员及进场信息同步成功".to_owned(),
        ));
    }
    let entry_succeeded = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM integration_jobs
            WHERE binding_id = $1
              AND local_entity_id = $2
              AND operation = 'entry_exit.sync'
              AND status IN ('success', 'completed')
        )
        "#,
    )
    .bind(job.binding_id)
    .bind(worker_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(|error| JobIssue::Retryable(error.to_string()))?;
    if !entry_succeeded {
        return Err(JobIssue::WaitingDependency(
            "等待人员进场回执成功".to_owned(),
        ));
    }

    let photo_data = required_text(&attendance, "photo_data", "设备考勤照片")?;
    let image_path = upload_media_from_source(
        state,
        job,
        credentials,
        "attendance",
        attendance_id,
        "attendance_photo",
        &photo_data,
    )
    .await?;
    let direction = match value_i64(&attendance, "direction") {
        Some(0) => 1,
        Some(1) => 2,
        _ => return Err(JobIssue::WaitingData("考勤方向必须是本地 0/1".to_owned())),
    };
    let payload = json!({
        "name": required_text(worker, "name", "人员姓名")?,
        "idCardType": "01",
        "idCardNumber": yongxin_v2::encrypt_sensitive(
            &credentials.app_secret,
            &required_text(worker, "id_card", "证件号码")?
        ).map_err(|error| JobIssue::WaitingData(error.to_string()))?,
        "direction": direction,
        "date": format_platform_datetime(required_text(&attendance, "trigger_time", "考勤时间")?)?,
        "imgUrl": image_path,
        "attendType": 0,
        "deviceKey": required_text(&attendance, "serial_number", "考勤机序列号")?,
    });
    let response = call_json(
        state,
        job,
        credentials,
        yongxin_v2::ATTENDANCE_ADD_PATH,
        &payload,
        CallSafety::Write,
    )
    .await?;
    await_async_response(state.db.pool(), job, &response.body).await
}

async fn poll_async_result(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &yongxin_v2::YongxinCredentials,
) -> Result<(), JobIssue> {
    if job
        .expires_at
        .is_some_and(|expires_at| expires_at <= Utc::now())
    {
        return Err(JobIssue::Permanent(
            "异步查询码已超过平台 6 小时有效期".to_owned(),
        ));
    }
    let serial = job
        .external_request_id
        .as_deref()
        .ok_or_else(|| JobIssue::Permanent("异步任务缺少 requestSerialCode".to_owned()))?;
    let response = call_json(
        state,
        job,
        credentials,
        yongxin_v2::ASYNC_RESULT_PATH,
        &json!({"requestSerialCode": serial}),
        CallSafety::Read,
    )
    .await?;
    let state_code = yongxin_v2::async_state(&response.body)
        .ok_or_else(|| JobIssue::Permanent("异步查询未返回 state".to_owned()))?;
    match state_code.as_str() {
        "0" | "1" => {
            sqlx::query(
                r#"
                UPDATE integration_jobs
                SET status = 'awaiting_result', remote_state = $2,
                    response_payload = $3, result_checked_at = NOW(),
                    attempt_count = 0,
                    next_attempt_at = NOW() + make_interval(secs => $4),
                    locked_by = NULL, locked_until = NULL, last_error = NULL,
                    updated_at = NOW()
                WHERE id = $1
                "#,
            )
            .bind(job.id)
            .bind(&state_code)
            .bind(&response.body)
            .bind(ASYNC_POLL_SECONDS as f64)
            .execute(state.db.pool())
            .await
            .map_err(|error| JobIssue::Retryable(error.to_string()))?;
            Ok(())
        }
        "2" => {
            handle_async_success(state.db.pool(), job, &response.body).await?;
            complete_job(state.db.pool(), job.id, &response.body).await
        }
        "9" => Err(JobIssue::Permanent(
            response
                .body
                .pointer("/data/message")
                .and_then(Value::as_str)
                .unwrap_or("平台异步处理失败")
                .to_owned(),
        )),
        other => Err(JobIssue::Permanent(format!("未知的异步处理状态：{other}"))),
    }
}

async fn handle_async_success(
    pool: &PgPool,
    job: &ClaimedJob,
    response: &Value,
) -> Result<(), JobIssue> {
    let local_id = local_id(job)?;
    match job.operation.as_str() {
        "worker.sync" => {
            upsert_mapping(
                pool,
                job,
                "worker",
                local_id,
                &local_id.to_string(),
                None,
                response,
            )
            .await?;
            sqlx::query(
                r#"
                INSERT INTO integration_jobs (
                    project_id, binding_id, platform_code, operation, entity_type,
                    local_entity_id, idempotency_key, request_payload, status,
                    attempt_count, max_attempts, next_attempt_at
                )
                VALUES ($1, $2, 'yongxin_v2', 'entry_exit.sync', 'worker', $3,
                        $4, $5, 'pending', 0, 5, NOW())
                ON CONFLICT (idempotency_key) DO NOTHING
                "#,
            )
            .bind(job.project_id)
            .bind(job.binding_id)
            .bind(local_id)
            .bind(format!("{}:{}:entry_exit.sync", job.binding_id, job.id))
            .bind(json!({
                "parent_job_id": job.id,
                "event": {"operation": "insert"}
            }))
            .execute(pool)
            .await
            .map_err(|error| JobIssue::Retryable(error.to_string()))?;
        }
        "attendance.sync" => {
            upsert_mapping(
                pool,
                job,
                "attendance",
                local_id,
                &local_id.to_string(),
                None,
                response,
            )
            .await?;
        }
        "entry_exit.sync" => {}
        _ => {}
    }
    Ok(())
}

async fn call_json(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &yongxin_v2::YongxinCredentials,
    path: &str,
    payload: &Value,
    safety: CallSafety,
) -> Result<yongxin_v2::YongxinResponse, JobIssue> {
    if credentials.is_dry_run() {
        let data = match path {
            yongxin_v2::TEAM_ADD_PATH => {
                json!({"teamSysNo": format!("dry-team-{}", job.local_entity_id.unwrap_or(job.id))})
            }
            yongxin_v2::WORKER_ADD_PATH
            | yongxin_v2::ENTRY_EXIT_ADD_PATH
            | yongxin_v2::ATTENDANCE_ADD_PATH => {
                json!({"requestSerialCode": format!("dry-request-{}", job.id)})
            }
            yongxin_v2::ASYNC_RESULT_PATH => json!({"state": "2", "message": "dry-run"}),
            _ => Value::Null,
        };
        let response = yongxin_v2::YongxinResponse {
            status: 200,
            body: json!({"code": 0, "msg": "dry-run", "data": data}),
            duration_ms: 0,
            request_url: credentials
                .endpoint(path)
                .map(|url| url.to_string())
                .unwrap_or_else(|_| path.to_owned()),
            request_headers: json!({"Content-Type": "application/json"}),
            request_body: payload.clone(),
        };
        record_attempt(
            state.db.pool(),
            job,
            credentials,
            "POST",
            path,
            payload,
            Some(&response),
            "dry_run",
            None,
        )
        .await;
        return Ok(response);
    }

    acquire_rate_slot(state.db.pool(), &credentials.app_key).await?;
    let client =
        yongxin_v2::build_client().map_err(|error| JobIssue::Retryable(error.to_string()))?;
    let result = yongxin_v2::post_json(&client, credentials, path, payload).await;
    match result {
        Ok(response) => {
            let status = if response.is_success() {
                "success"
            } else {
                "failed"
            };
            record_attempt(
                state.db.pool(),
                job,
                credentials,
                "POST",
                path,
                payload,
                Some(&response),
                status,
                (!response.is_success())
                    .then(|| response.message())
                    .as_deref(),
            )
            .await;
            if response.is_success() {
                Ok(response)
            } else if response.status == 429
                || yongxin_v2::response_code(&response.body) == Some(429)
                || response.status >= 500
            {
                Err(JobIssue::Retryable(response.message()))
            } else {
                Err(JobIssue::Permanent(response.message()))
            }
        }
        Err(error) => {
            let message = error.to_string();
            record_attempt(
                state.db.pool(),
                job,
                credentials,
                "POST",
                path,
                payload,
                None,
                "transport_error",
                Some(&message),
            )
            .await;
            match safety {
                CallSafety::Write => Err(JobIssue::DeliveryUnknown(format!(
                    "请求结果未知，未自动重发以避免平台产生重复数据：{message}"
                ))),
                CallSafety::Read => Err(JobIssue::Retryable(message)),
            }
        }
    }
}

async fn upload_media_from_source(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &yongxin_v2::YongxinCredentials,
    entity_type: &str,
    entity_id: Uuid,
    media_kind: &str,
    source: &str,
) -> Result<String, JobIssue> {
    let (bytes, file_type) = resolve_media_bytes(state, source).await?;
    let hash = hex::encode(Sha256::digest(&bytes));
    if let Some(path) = sqlx::query_scalar::<_, String>(
        r#"
        SELECT external_path
        FROM integration_media_mappings
        WHERE binding_id = $1 AND content_sha256 = $2
        "#,
    )
    .bind(job.binding_id)
    .bind(&hash)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|error| JobIssue::Retryable(error.to_string()))?
    {
        return Ok(path);
    }

    let response = if credentials.is_dry_run() {
        let response = yongxin_v2::YongxinResponse {
            status: 200,
            body: json!({"code": 0, "msg": "dry-run", "data": format!("/dry-run/{hash}.{file_type}")}),
            duration_ms: 0,
            request_url: credentials
                .endpoint(yongxin_v2::IMAGE_UPLOAD_PATH)
                .map(|url| url.to_string())
                .unwrap_or_else(|_| yongxin_v2::IMAGE_UPLOAD_PATH.to_owned()),
            request_headers: json!({"Content-Type": "application/json"}),
            request_body: json!({"fileBase": "[BINARY_OMITTED]", "fileType": file_type}),
        };
        record_attempt(
            state.db.pool(),
            job,
            credentials,
            "POST",
            yongxin_v2::IMAGE_UPLOAD_PATH,
            &json!({"fileBase": "[REDACTED]", "fileType": file_type}),
            Some(&response),
            "dry_run",
            None,
        )
        .await;
        response
    } else {
        acquire_rate_slot(state.db.pool(), &credentials.app_key).await?;
        let client =
            yongxin_v2::build_client().map_err(|error| JobIssue::Retryable(error.to_string()))?;
        let encoded = BASE64_STANDARD.encode(&bytes);
        match yongxin_v2::upload_image(&client, credentials, &encoded, &file_type).await {
            Ok(response) => {
                record_attempt(
                    state.db.pool(),
                    job,
                    credentials,
                    "POST",
                    yongxin_v2::IMAGE_UPLOAD_PATH,
                    &json!({"fileBase": "[REDACTED]", "fileType": file_type}),
                    Some(&response),
                    if response.is_success() {
                        "success"
                    } else {
                        "failed"
                    },
                    (!response.is_success())
                        .then(|| response.message())
                        .as_deref(),
                )
                .await;
                if !response.is_success() {
                    if response.status == 429
                        || yongxin_v2::response_code(&response.body) == Some(429)
                        || response.status >= 500
                    {
                        return Err(JobIssue::Retryable(response.message()));
                    }
                    return Err(JobIssue::Permanent(response.message()));
                }
                response
            }
            Err(error) => {
                let message = error.to_string();
                record_attempt(
                    state.db.pool(),
                    job,
                    credentials,
                    "POST",
                    yongxin_v2::IMAGE_UPLOAD_PATH,
                    &json!({"fileBase": "[REDACTED]", "fileType": file_type}),
                    None,
                    "transport_error",
                    Some(&message),
                )
                .await;
                return Err(JobIssue::Retryable(message));
            }
        }
    };
    let path = response
        .data()
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| JobIssue::Permanent("图片上传成功但未返回文件路径".to_owned()))?;
    sqlx::query(
        r#"
        INSERT INTO integration_media_mappings (
            binding_id, project_id, local_entity_type, local_entity_id,
            media_kind, content_sha256, external_path, external_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (binding_id, content_sha256)
        DO UPDATE SET external_path = EXCLUDED.external_path,
                      external_payload = EXCLUDED.external_payload,
                      updated_at = NOW()
        "#,
    )
    .bind(job.binding_id)
    .bind(job.project_id)
    .bind(entity_type)
    .bind(entity_id)
    .bind(media_kind)
    .bind(hash)
    .bind(&path)
    .bind(&response.body)
    .execute(state.db.pool())
    .await
    .map_err(|error| JobIssue::Retryable(error.to_string()))?;
    Ok(path)
}

async fn resolve_media_bytes(
    state: &AppState,
    source: &str,
) -> Result<(Vec<u8>, String), JobIssue> {
    let source = source.trim();
    if source.is_empty() {
        return Err(JobIssue::WaitingMedia("图片内容为空".to_owned()));
    }
    if let Some((metadata, encoded)) = source.split_once(',')
        && metadata.starts_with("data:image/")
        && metadata.ends_with(";base64")
    {
        let file_type = metadata
            .trim_start_matches("data:image/")
            .trim_end_matches(";base64")
            .replace("jpeg", "jpg");
        let bytes = BASE64_STANDARD
            .decode(encoded)
            .map_err(|_| JobIssue::WaitingMedia("图片 Base64 格式错误".to_owned()))?;
        return validate_media(bytes, file_type);
    }
    if !source.starts_with("http://")
        && !source.starts_with("https://")
        && let Ok(bytes) = BASE64_STANDARD.decode(source)
        && !bytes.is_empty()
    {
        let file_type = detect_file_type(&bytes).to_owned();
        return validate_media(bytes, file_type);
    }

    let object_key = sqlx::query_scalar::<_, String>(
        r#"
        SELECT object_key FROM upload_files
        WHERE public_url = $1 AND is_deleted = FALSE
        ORDER BY created_at DESC LIMIT 1
        "#,
    )
    .bind(source)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|error| JobIssue::Retryable(error.to_string()))?
    .ok_or_else(|| JobIssue::WaitingMedia("图片不是系统上传文件，无法安全读取原图".to_owned()))?;
    let bytes = state
        .storage
        .get(&object_key)
        .await
        .map_err(|error| JobIssue::WaitingMedia(format!("读取图片失败：{error}")))?
        .to_vec();
    let file_type = detect_file_type(&bytes).to_owned();
    validate_media(bytes, file_type)
}

fn validate_media(bytes: Vec<u8>, file_type: String) -> Result<(Vec<u8>, String), JobIssue> {
    if bytes.is_empty() {
        return Err(JobIssue::WaitingMedia("图片内容为空".to_owned()));
    }
    if bytes.len() > MAX_MEDIA_BYTES {
        return Err(JobIssue::WaitingMedia("图片超过 5 MiB 限制".to_owned()));
    }
    Ok((bytes, file_type))
}

fn detect_file_type(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "png"
    } else if bytes.starts_with(b"GIF8") {
        "gif"
    } else {
        "jpg"
    }
}

async fn acquire_rate_slot(pool: &PgPool, app_key: &str) -> Result<(), JobIssue> {
    let reserved_at = sqlx::query_scalar::<_, DateTime<Utc>>(
        r#"
        INSERT INTO integration_rate_limits (
            platform_code, rate_key, next_allowed_at, updated_at
        )
        VALUES ('yongxin_v2', $1, NOW() + make_interval(secs => $2), NOW())
        ON CONFLICT (platform_code, rate_key)
        DO UPDATE SET
            next_allowed_at = GREATEST(integration_rate_limits.next_allowed_at, NOW())
                              + make_interval(secs => $2),
            updated_at = NOW()
        RETURNING next_allowed_at - make_interval(secs => $2)
        "#,
    )
    .bind(app_key)
    .bind(RATE_SLOT_MILLIS as f64 / 1000.0)
    .fetch_one(pool)
    .await
    .map_err(|error| JobIssue::Retryable(error.to_string()))?;
    let wait = reserved_at.signed_duration_since(Utc::now());
    if let Ok(duration) = wait.to_std()
        && !duration.is_zero()
    {
        sleep(duration).await;
    }
    Ok(())
}

async fn load_binding_config(
    pool: &PgPool,
    binding_id: Uuid,
) -> Result<Option<Value>, sqlx::Error> {
    sqlx::query_scalar::<_, Value>(
        r#"
        SELECT binding.credentials || binding.config
        FROM integration_project_bindings binding
        JOIN integration_platforms platform
          ON platform.id = binding.platform_id
         AND platform.code = 'yongxin_v2'
         AND platform.is_deleted = FALSE
        WHERE binding.id = $1
          AND binding.is_deleted = FALSE
          AND binding.is_enabled = TRUE
        "#,
    )
    .bind(binding_id)
    .fetch_optional(pool)
    .await
}

async fn load_worker(pool: &PgPool, worker_id: Uuid) -> Result<Value, JobIssue> {
    load_json_row(
        pool,
        r#"
        SELECT to_jsonb(worker)
               || jsonb_build_object('team', to_jsonb(team))
               || jsonb_build_object('unit', to_jsonb(unit))
               || jsonb_build_object(
                    'is_team_leader', COALESCE(team.leader_id = worker.id, FALSE)
                  )
        FROM construction_workers worker
        JOIN construction_teams team ON team.id = worker.team_id AND team.is_deleted = FALSE
        JOIN construction_units unit ON unit.id = worker.unit_id AND unit.is_deleted = FALSE
        WHERE worker.id = $1 AND worker.is_deleted = FALSE
        "#,
        worker_id,
    )
    .await?
    .ok_or_else(|| JobIssue::WaitingData("人员不存在或关联班组、单位已删除".to_owned()))
}

async fn load_json_row(
    pool: &PgPool,
    statement: &str,
    id: Uuid,
) -> Result<Option<Value>, JobIssue> {
    sqlx::query_scalar::<_, Value>(statement)
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|error| JobIssue::Retryable(error.to_string()))
}

async fn mapping_external(
    pool: &PgPool,
    binding_id: Uuid,
    entity_type: &str,
    local_id: Uuid,
) -> Result<Option<String>, JobIssue> {
    sqlx::query_scalar::<_, String>(
        r#"
        SELECT external_entity_id FROM integration_entity_mappings
        WHERE binding_id = $1 AND entity_type = $2 AND local_entity_id = $3
          AND is_deleted = FALSE
        "#,
    )
    .bind(binding_id)
    .bind(entity_type)
    .bind(local_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| JobIssue::Retryable(error.to_string()))
}

#[allow(clippy::too_many_arguments)]
async fn upsert_mapping(
    pool: &PgPool,
    job: &ClaimedJob,
    entity_type: &str,
    local_id: Uuid,
    external_id: &str,
    external_parent_id: Option<&str>,
    payload: &Value,
) -> Result<(), JobIssue> {
    sqlx::query(
        r#"
        INSERT INTO integration_entity_mappings (
            binding_id, project_id, entity_type, local_entity_id,
            external_entity_id, external_parent_id, external_payload,
            last_pushed_at, is_deleted, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), FALSE, NULL)
        ON CONFLICT (binding_id, entity_type, local_entity_id) WHERE is_deleted = FALSE
        DO UPDATE SET
            external_entity_id = EXCLUDED.external_entity_id,
            external_parent_id = EXCLUDED.external_parent_id,
            external_payload = EXCLUDED.external_payload,
            last_pushed_at = NOW(),
            updated_at = NOW()
        "#,
    )
    .bind(job.binding_id)
    .bind(job.project_id)
    .bind(entity_type)
    .bind(local_id)
    .bind(external_id)
    .bind(external_parent_id)
    .bind(payload)
    .execute(pool)
    .await
    .map_err(|error| JobIssue::Retryable(error.to_string()))?;
    Ok(())
}

async fn await_async_response(
    pool: &PgPool,
    job: &ClaimedJob,
    response: &Value,
) -> Result<(), JobIssue> {
    let serial = yongxin_v2::request_serial_code(response)
        .ok_or_else(|| JobIssue::Permanent("平台未返回 requestSerialCode".to_owned()))?;
    sqlx::query(
        r#"
        UPDATE integration_jobs
        SET status = 'awaiting_result', external_request_id = $2,
            remote_state = '0', response_payload = $3,
            expires_at = NOW() + INTERVAL '6 hours',
            next_attempt_at = NOW() + INTERVAL '5 seconds',
            locked_by = NULL, locked_until = NULL, last_error = NULL,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(job.id)
    .bind(serial)
    .bind(response)
    .execute(pool)
    .await
    .map_err(|error| {
        JobIssue::DeliveryUnknown(format!("平台已返回异步查询码，但本地状态保存失败：{error}"))
    })?;
    Ok(())
}

async fn complete_job(pool: &PgPool, job_id: Uuid, response: &Value) -> Result<(), JobIssue> {
    sqlx::query(
        r#"
        UPDATE integration_jobs
        SET status = 'success', response_payload = $2,
            remote_state = COALESCE(remote_state, '2'),
            completed_at = NOW(), next_attempt_at = NOW(),
            locked_by = NULL, locked_until = NULL, last_error = NULL,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(job_id)
    .bind(response)
    .execute(pool)
    .await
    .map_err(|error| JobIssue::Retryable(error.to_string()))?;
    Ok(())
}

async fn complete_skipped(pool: &PgPool, job_id: Uuid, reason: &str) -> Result<(), JobIssue> {
    complete_job(pool, job_id, &json!({"skipped": true, "reason": reason})).await
}

async fn handle_issue(pool: &PgPool, job: &ClaimedJob, issue: JobIssue) {
    let (status, retry_after, completed) = match issue {
        JobIssue::WaitingData(_) => ("waiting_data", None, false),
        JobIssue::WaitingDependency(_) => ("waiting_dependency", Some(15_i64), false),
        JobIssue::WaitingMedia(_) => ("waiting_media", Some(30_i64), false),
        JobIssue::Retryable(_) if job.attempt_count < job.max_attempts => {
            let exponent = job.attempt_count.clamp(1, 6) as u32;
            ("retry", Some(2_i64.pow(exponent)), false)
        }
        JobIssue::Retryable(_) | JobIssue::Permanent(_) => ("failed", None, true),
        JobIssue::DeliveryUnknown(_) => ("delivery_unknown", None, true),
    };
    let next_attempt_at =
        retry_after.map(|seconds| Utc::now() + chrono::Duration::seconds(seconds));
    if let Err(error) = sqlx::query(
        r#"
        UPDATE integration_jobs
        SET status = $2, next_attempt_at = COALESCE($3, next_attempt_at),
            attempt_count = CASE
                WHEN $2 IN ('waiting_dependency', 'waiting_media')
                    THEN GREATEST(attempt_count - 1, 0)
                ELSE attempt_count
            END,
            locked_by = NULL, locked_until = NULL, last_error = $4,
            completed_at = CASE WHEN $5 THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(job.id)
    .bind(status)
    .bind(next_attempt_at)
    .bind(issue.message())
    .bind(completed)
    .execute(pool)
    .await
    {
        error!(job_id = %job.id, error = %error, "failed to persist Yongxin job failure");
    } else {
        warn!(job_id = %job.id, operation = %job.operation, status, error = %issue.message(), "Yongxin job did not complete");
    }
}

async fn finish_status(
    pool: &PgPool,
    job_id: Uuid,
    status: &str,
    response: Option<&Value>,
    error: Option<&str>,
) {
    if let Err(db_error) = sqlx::query(
        r#"
        UPDATE integration_jobs
        SET status = $2, response_payload = $3, last_error = $4,
            completed_at = NOW(), locked_by = NULL, locked_until = NULL,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(job_id)
    .bind(status)
    .bind(response)
    .bind(error)
    .execute(pool)
    .await
    {
        error!(%job_id, error = %db_error, "failed to finish disabled Yongxin job");
    }
}

#[allow(clippy::too_many_arguments)]
async fn record_attempt(
    pool: &PgPool,
    job: &ClaimedJob,
    credentials: &yongxin_v2::YongxinCredentials,
    method: &str,
    path: &str,
    request_body: &Value,
    response: Option<&yongxin_v2::YongxinResponse>,
    status: &str,
    error_message: Option<&str>,
) {
    let attempt_no = match sqlx::query_scalar::<_, i32>(
        "SELECT COALESCE(MAX(attempt_no), 0) + 1 FROM integration_attempts WHERE job_id = $1",
    )
    .bind(job.id)
    .fetch_one(pool)
    .await
    {
        Ok(value) => value,
        Err(error) => {
            warn!(job_id = %job.id, error = %error, "failed to allocate integration attempt number");
            return;
        }
    };
    let request_url = response
        .map(|value| value.request_url.clone())
        .unwrap_or_else(|| {
            credentials
                .endpoint(path)
                .map(|url| url.to_string())
                .unwrap_or_else(|_| path.to_owned())
        });
    let request_headers = response
        .map(|value| value.request_headers.clone())
        .unwrap_or_else(|| {
            json!({
                "Content-Type": "application/json",
                "projectCode": credentials.project_code,
                "appKey": credentials.app_key,
                "timestamp": "[REQUEST_NOT_SENT]",
                "sign": "[REQUEST_NOT_SENT]"
            })
        });
    let logged_request_body = response
        .map(|value| value.request_body.clone())
        .unwrap_or_else(|| request_body.clone());
    if let Err(error) = sqlx::query(
        r#"
        INSERT INTO integration_attempts (
            job_id, project_id, binding_id, attempt_no, transport,
            request_method, request_url, request_headers, request_body,
            response_status, response_body, duration_ms, status, error_message
        )
        VALUES ($1, $2, $3, $4, 'http', $5, $6, $7, $8,
                $9, $10, $11, $12, $13)
        "#,
    )
    .bind(job.id)
    .bind(job.project_id)
    .bind(job.binding_id)
    .bind(attempt_no)
    .bind(method)
    .bind(request_url)
    .bind(request_headers)
    .bind(logged_request_body)
    .bind(response.map(|value| value.status as i32))
    .bind(response.map(|value| &value.body))
    .bind(response.map(|value| value.duration_ms))
    .bind(status)
    .bind(error_message)
    .execute(pool)
    .await
    {
        warn!(job_id = %job.id, error = %error, "failed to record integration attempt");
    }
}

fn local_id(job: &ClaimedJob) -> Result<Uuid, JobIssue> {
    job.local_entity_id
        .ok_or_else(|| JobIssue::Permanent("任务缺少本地实体 ID".to_owned()))
}

fn event_operation(job: &ClaimedJob) -> &str {
    job.request_payload
        .pointer("/event/operation")
        .and_then(Value::as_str)
        .unwrap_or("insert")
}

fn required_text(value: &Value, key: &str, label: &str) -> Result<String, JobIssue> {
    optional_text(value, key).ok_or_else(|| JobIssue::WaitingData(format!("缺少{label}")))
}

fn optional_text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|item| {
            item.as_str()
                .map(ToOwned::to_owned)
                .or_else(|| item.as_i64().map(|number| number.to_string()))
        })
        .map(|item| item.trim().to_owned())
        .filter(|item| !item.is_empty())
}

fn value_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|item| {
        item.as_i64()
            .or_else(|| item.as_str().and_then(|raw| raw.trim().parse().ok()))
    })
}

fn value_bool(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn required_uuid(value: &Value, key: &str, label: &str) -> Result<Uuid, JobIssue> {
    required_text(value, key, label)?
        .parse()
        .map_err(|_| JobIssue::WaitingData(format!("{label}格式错误")))
}

fn company_type_code(value: Option<i64>) -> Result<&'static str, JobIssue> {
    match value {
        Some(1) => Ok("009"),
        Some(2) => Ok("007"),
        Some(3) => Ok("006"),
        Some(4) => Ok("008"),
        Some(5) => Ok("001"),
        Some(6) => Ok("002"),
        Some(7) => Ok("003"),
        Some(8) => Ok("004"),
        Some(9) => Ok("005"),
        Some(10) => Ok("010"),
        Some(11) => Ok("011"),
        Some(12) => Ok("012"),
        _ => Err(JobIssue::WaitingData(
            "单位类型无法映射到甬薪字典".to_owned(),
        )),
    }
}

fn area_code(unit: &Value) -> Result<String, JobIssue> {
    let raw = optional_text(unit, "register_area")
        .or_else(|| optional_text(unit, "register_area_list"))
        .ok_or_else(|| JobIssue::WaitingData("缺少单位注册区域".to_owned()))?;
    let digits = raw.chars().filter(char::is_ascii_digit).collect::<String>();
    if digits.len() >= 6 {
        Ok(digits[digits.len() - 6..].to_owned())
    } else {
        Err(JobIssue::WaitingData(
            "单位注册区域缺少 6 位行政区划码".to_owned(),
        ))
    }
}

fn work_type_code(value: Option<i64>) -> Result<&'static str, JobIssue> {
    match value {
        Some(1) => Ok("020"),
        Some(2) => Ok("240"),
        Some(3) => Ok("060"),
        Some(4) => Ok("030"),
        Some(5) => Ok("040"),
        Some(6) => Ok("010"),
        Some(7) => Ok("130"),
        Some(8) => Ok("270"),
        Some(9) => Ok("110"),
        Some(10) => Ok("300"),
        Some(11 | 12) => Ok("190"),
        Some(13) => Ok("230"),
        Some(14) => Ok("150"),
        Some(15) => Ok("050"),
        Some(16) => Ok("070"),
        Some(17) => Ok("080"),
        Some(18) => Ok("090"),
        Some(19) => Ok("100"),
        Some(20) => Ok("120"),
        Some(21) => Ok("140"),
        Some(22) => Ok("160"),
        Some(23) => Ok("170"),
        Some(24) => Ok("180"),
        Some(25) => Ok("200"),
        Some(26) => Ok("210"),
        Some(27) => Ok("220"),
        Some(28) => Ok("250"),
        Some(29) => Ok("290"),
        Some(30) => Ok("280"),
        Some(31) => Ok("310"),
        Some(32) => Ok("320"),
        Some(33) => Ok("330"),
        Some(34) => Ok("340"),
        Some(35) => Ok("350"),
        Some(36) => Ok("360"),
        Some(37) => Ok("380"),
        Some(38) => Ok("390"),
        Some(900) => Ok("1000"),
        Some(1001) => Ok("900"),
        _ => Err(JobIssue::WaitingData("工种无法映射到甬薪字典".to_owned())),
    }
}

fn manager_job_code(value: Option<&str>) -> String {
    match value.unwrap_or("").trim() {
        "1" => "5",
        "2" => "2",
        "3" => "99",
        "4" => "8",
        "5" => "7",
        "6" => "99",
        "7" => "9",
        "8" => "13",
        "9" => "12",
        "99" => "99",
        value if value.chars().all(|char| char.is_ascii_digit()) && !value.is_empty() => value,
        _ => "99",
    }
    .to_owned()
}

fn education_code(value: Option<i64>) -> &'static str {
    match value {
        Some(1) => "01",
        Some(2) => "02",
        Some(3) => "03",
        Some(4) => "04",
        Some(5) => "05",
        Some(6) => "06",
        Some(7) => "07",
        _ => "99",
    }
}

fn politics_code(value: Option<i64>) -> &'static str {
    match value {
        Some(2) => "01",
        Some(3) => "02",
        Some(4) => "03",
        Some(1) => "13",
        _ => "13",
    }
}

fn nation_code(value: Option<&str>, config: &Value) -> String {
    if let Some(value) = value
        && let Some(mapped) = config
            .pointer(&format!("/dictionary_maps/nation/{value}"))
            .and_then(Value::as_str)
    {
        return mapped.to_owned();
    }
    let value = value.unwrap_or("").trim().trim_end_matches('族');
    const NATIONS: &[&str] = &[
        "汉",
        "蒙古",
        "回",
        "藏",
        "维吾尔",
        "苗",
        "彝",
        "壮",
        "布依",
        "朝鲜",
        "满",
        "侗",
        "瑶",
        "白",
        "土家",
        "哈尼",
        "哈萨克",
        "傣",
        "黎",
        "傈僳",
        "佤",
        "畲",
        "高山",
        "拉祜",
        "水",
        "东乡",
        "纳西",
        "景颇",
        "柯尔克孜",
        "土",
        "达斡尔",
        "仫佬",
        "羌",
        "布朗",
        "撒拉",
        "毛南",
        "仡佬",
        "锡伯",
        "阿昌",
        "普米",
        "塔吉克",
        "怒",
        "乌孜别克",
        "俄罗斯",
        "鄂温克",
        "德昂",
        "保安",
        "裕固",
        "京",
        "塔塔尔",
        "独龙",
        "鄂伦春",
        "赫哲",
        "门巴",
        "珞巴",
        "基诺",
    ];
    NATIONS
        .iter()
        .position(|nation| *nation == value)
        .map(|index| (index + 1).to_string())
        .unwrap_or_else(|| "57".to_owned())
}

fn native_place_code(value: Option<i64>) -> Result<&'static str, JobIssue> {
    let code = match value.unwrap_or_default() / 10_000 {
        11 => "1",
        12 => "2",
        31 => "3",
        50 => "4",
        34 => "5",
        62 => "6",
        35 => "7",
        44 => "8",
        52 => "9",
        46 => "10",
        41 => "11",
        13 => "12",
        23 => "13",
        42 => "14",
        43 => "15",
        32 => "16",
        36 => "17",
        22 => "18",
        21 => "19",
        63 => "20",
        61 => "21",
        37 => "22",
        14 => "23",
        71 => "24",
        51 => "25",
        53 => "26",
        33 => "27",
        81 => "28",
        82 => "29",
        45 => "30",
        15 => "31",
        64 => "32",
        54 => "33",
        65 => "34",
        _ => return Err(JobIssue::WaitingData("籍贯无法映射到甬薪字典".to_owned())),
    };
    Ok(code)
}

fn identity_expiration(worker: &Value) -> Result<(i32, String), JobIssue> {
    let start = required_text(worker, "validity_period", "身份证有效期开始日期")?;
    let end = required_text(worker, "validity_period_end", "身份证有效期结束日期")?;
    let long_term = end.contains("长期");
    Ok((if long_term { 1 } else { 0 }, format!("{start},{end}")))
}

fn bank_code(value: Option<&str>) -> Option<&'static str> {
    let value = value?.trim();
    if value.contains("工商") {
        Some("01")
    } else if value == "中国银行" {
        Some("02")
    } else if value.contains("建设") {
        Some("03")
    } else if value.contains("农业") {
        Some("04")
    } else if value.contains("交通") {
        Some("05")
    } else if value.contains("招商") {
        Some("06")
    } else if value.contains("中信") {
        Some("08")
    } else if value.contains("邮政") {
        Some("12")
    } else if value.contains("江苏") {
        Some("19")
    } else if value.contains("南京") {
        Some("21")
    } else {
        None
    }
}

fn quantity_unit_label(value: Option<i64>) -> Option<&'static str> {
    match value {
        Some(1) => Some("元/平方米"),
        Some(2) => Some("元/米"),
        Some(3) => Some("元/吨"),
        Some(4) => Some("元/件"),
        Some(5) => Some("元/套"),
        Some(6) => Some("元/立方米"),
        _ => None,
    }
}

fn format_platform_datetime(value: String) -> Result<String, JobIssue> {
    if value.len() == 10 {
        return Ok(format!("{value} 00:00:00"));
    }
    if let Ok(parsed) = DateTime::parse_from_rfc3339(&value) {
        let shanghai = FixedOffset::east_opt(8 * 3600)
            .ok_or_else(|| JobIssue::Permanent("UTC+8 时区不可用".to_owned()))?;
        return Ok(parsed
            .with_timezone(&shanghai)
            .format("%Y-%m-%d %H:%M:%S")
            .to_string());
    }
    let normalized = value.replace('T', " ");
    if normalized.len() >= 19 {
        Ok(normalized[..19].to_owned())
    } else {
        Err(JobIssue::WaitingData(format!("时间格式错误：{value}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_attendance_and_dictionary_values_are_explicitly_mapped() {
        assert_eq!(work_type_code(Some(1)).unwrap(), "020");
        assert_eq!(work_type_code(Some(38)).unwrap(), "390");
        assert_eq!(company_type_code(Some(1)).unwrap(), "009");
        assert_eq!(native_place_code(Some(330200)).unwrap(), "27");
    }
}
