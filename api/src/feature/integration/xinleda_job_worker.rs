use std::time::Duration;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use chrono::{DateTime, Utc};
use serde_json::{Map, Value, json};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use tokio::time::sleep;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::{feature::integration::xinleda, state::AppState};

const WORKER_COUNT: usize = 2;
const POLL_INTERVAL: Duration = Duration::from_millis(500);
const LOCK_DURATION_MINUTES: i32 = 10;
const ASYNC_POLL_SECONDS: f64 = 15.0;
const RATE_SLOT_SECONDS: f64 = 1.1;
const MAX_UPLOAD_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug, FromRow)]
struct ClaimedJob {
    id: Uuid,
    project_id: Uuid,
    binding_id: Uuid,
    outbox_event_id: Option<Uuid>,
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
    Retryable(String),
    Permanent(String),
    DeliveryUnknown(String),
}

impl JobIssue {
    fn message(&self) -> &str {
        match self {
            Self::WaitingData(message)
            | Self::WaitingDependency(message)
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

pub fn spawn_xinleda_job_workers(state: AppState) {
    for worker_index in 0..WORKER_COUNT {
        let state = state.clone();
        tokio::spawn(async move {
            let worker_name = format!("xinleda-job-{worker_index}");
            info!(worker = %worker_name, "Xinleda integration worker started");
            loop {
                match process_one_pending(&state, &worker_name).await {
                    Ok(true) => {}
                    Ok(false) => sleep(POLL_INTERVAL).await,
                    Err(error) => {
                        error!(worker = %worker_name, error = %error, "Xinleda job claim failed");
                        sleep(Duration::from_secs(2)).await;
                    }
                }
            }
        });
    }
}

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
             AND binding.is_enabled = TRUE
            WHERE job.platform_code = 'xinleda'
              AND job.status IN (
                    'pending', 'retry', 'awaiting_result',
                    'waiting_dependency', 'processing'
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
                          'waiting_dependency', 'processing'
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
        RETURNING job.id, job.project_id, job.binding_id, job.outbox_event_id,
                  job.operation, job.local_entity_id, job.request_payload,
                  job.attempt_count, job.max_attempts, job.external_request_id,
                  job.expires_at, candidate.previous_status
        "#,
    )
    .bind(worker_name)
    .bind(LOCK_DURATION_MINUTES)
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
                Some("薪乐达平台配置已停用"),
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
    let credentials = match xinleda::XinledaCredentials::from_config(&config) {
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
    if let Err(issue) = result {
        handle_issue(state.db.pool(), &job, issue).await;
    }
}

async fn execute_initial(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &xinleda::XinledaCredentials,
    config: &Value,
) -> Result<(), JobIssue> {
    match job.operation.as_str() {
        "project.sync" => execute_project_sync(state, job, credentials).await,
        "unit.sync" => execute_unit_sync(state, job, credentials).await,
        "team.sync" => execute_team_sync(state, job).await,
        "worker.sync" => execute_worker_sync(state, job, credentials, config).await,
        "entry_exit.sync" => execute_entry_exit_sync(state, job, credentials).await,
        "attendance.sync" => execute_attendance_sync(state, job, credentials).await,
        "safeguard.sync" => execute_safeguard_sync(state, job, credentials, config).await,
        operation => Err(JobIssue::Permanent(format!(
            "薪乐达平台不支持任务操作：{operation}"
        ))),
    }
}

async fn execute_project_sync(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &xinleda::XinledaCredentials,
) -> Result<(), JobIssue> {
    if event_operation(job) != "update"
        && mapping_external(state.db.pool(), job.binding_id, "project", job.project_id)
            .await?
            .is_some()
    {
        return complete_skipped(state.db.pool(), job.id, "项目基本信息已同步").await;
    }
    let project = load_json_row(
        state.db.pool(),
        "SELECT to_jsonb(project) FROM construction_projects project WHERE id = $1 AND is_deleted = FALSE",
        job.project_id,
    )
    .await?
    .ok_or_else(|| JobIssue::WaitingData("项目不存在或已删除".to_owned()))?;
    let (province_code, city_code, county_code) = area_codes(
        optional_text(&project, "address_code")
            .or_else(|| optional_text(&project, "address_code_list"))
            .as_deref(),
    )?;
    let payload = json!([{
        "project_code": credentials.project_code,
        "project_name": required_text(&project, "name", "项目名称")?,
        "industry_type": value_i64(&project, "industry").unwrap_or(1),
        "project_type": value_i64(&project, "category").unwrap_or(1),
        "principal_name": required_text(&project, "manager", "项目经理")?,
        "principal_phone": required_text(&project, "manager_phone", "项目经理手机号")?,
        "province_code": province_code,
        "city_code": city_code,
        "county_code": county_code,
        "address": optional_text(&project, "address").or_else(|| optional_text(&project, "street")),
        "start_time": optional_text(&project, "start_date"),
        "end_time": optional_text(&project, "finish_date"),
        "build_properties": value_i64(&project, "build_nature"),
        "build_area": money_or_number(&project, "acreage"),
        "construct_cost": money_or_number(&project, "invest_total"),
        "build_length": money_or_number(&project, "length"),
        "status": value_i64(&project, "status").unwrap_or(3),
        "lng": optional_text(&project, "longitude"),
        "lat": optional_text(&project, "latitude"),
        "project_size": value_i64(&project, "build_scale"),
        "project_num": value_i64(&project, "purpose"),
        "nation_num": optional_text(&project, "nationality"),
        "investment_nature": value_i64(&project, "investment_nature"),
        "build_permit_no": optional_text(&project, "work_permit"),
        "contractor_company_name": required_text(&project, "contractor", "总承包单位名称")?,
        "contractor_organization_code": required_text(&project, "contractor_credit_code", "总承包单位统一社会信用代码")?,
        "build_company_name": optional_text(&project, "build_unit"),
        "build_organization_code": optional_text(&project, "build_unit_credit_code"),
        "third_party_project_code": job.project_id,
        "is_join_platform": 1,
        "project_step_type": value_i64(&project, "progress_type"),
        "sign_amt": money_or_number(&project, "contract_amount")
    }]);
    let response = call_api(
        state,
        job,
        credentials,
        xinleda::PROJECT_IMPORT,
        &payload,
        CallSafety::Write,
    )
    .await?;
    accept_or_complete(
        state.db.pool(),
        job,
        xinleda::PROJECT_IMPORT,
        &response,
        Some(("project", job.project_id, &credentials.project_code)),
    )
    .await
}

async fn execute_unit_sync(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &xinleda::XinledaCredentials,
) -> Result<(), JobIssue> {
    let unit_id = local_id(job)?;
    if event_operation(job) == "delete" {
        return complete_skipped(state.db.pool(), job.id, "薪乐达文档未提供企业删除接口").await;
    }
    if event_operation(job) != "update"
        && mapping_external(state.db.pool(), job.binding_id, "unit", unit_id)
            .await?
            .is_some()
    {
        return complete_skipped(state.db.pool(), job.id, "企业基础信息已同步").await;
    }
    let unit = load_json_row(
        state.db.pool(),
        "SELECT to_jsonb(unit) FROM construction_units unit WHERE id = $1 AND is_deleted = FALSE",
        unit_id,
    )
    .await?
    .ok_or_else(|| JobIssue::WaitingData("参建单位不存在或已删除".to_owned()))?;
    let (province_code, city_code, county_code) = area_codes(
        optional_text(&unit, "register_area")
            .or_else(|| optional_text(&unit, "register_area_list"))
            .as_deref(),
    )?;
    let company_code = required_text(&unit, "company_credit_code", "统一社会信用代码")?;
    let payload = json!([{
        "organization_code": company_code,
        "company_name": required_text(&unit, "company_name", "企业名称")?,
        "company_type": company_type(value_i64(&unit, "company_type"))?,
        "register_time": optional_text(&unit, "register_date"),
        "province_code": province_code,
        "city_code": city_code,
        "county_code": county_code,
        "address": optional_text(&unit, "company_address"),
        "manage_province_code": province_code,
        "manage_city_code": city_code,
        "manage_county_code": county_code,
        "manage_address": optional_text(&unit, "company_address"),
        "owner": optional_text(&unit, "legal_person_name")
            .or_else(|| optional_text(&unit, "manager_name"))
            .ok_or_else(|| JobIssue::WaitingData("缺少企业法定代表人".to_owned()))?,
        "owner_certificate_type": 1,
        "owner_cardid": optional_text(&unit, "legal_person_id_card")
            .map(|value| xinleda::encrypt_sensitive(&credentials.app_secret, &value))
            .transpose().map_err(|error| JobIssue::WaitingData(error.to_string()))?,
        "owner_phone": optional_text(&unit, "manager_phone"),
        "contact": optional_text(&unit, "manager_name"),
        "contact_phone": optional_text(&unit, "manager_phone"),
        "company_phone": optional_text(&unit, "company_phone")
    }]);
    let response = call_api(
        state,
        job,
        credentials,
        xinleda::COMPANY_IMPORT,
        &payload,
        CallSafety::Write,
    )
    .await?;
    accept_or_complete(
        state.db.pool(),
        job,
        xinleda::COMPANY_IMPORT,
        &response,
        Some(("unit", unit_id, &company_code)),
    )
    .await
}

async fn execute_team_sync(state: &AppState, job: &ClaimedJob) -> Result<(), JobIssue> {
    let team_id = local_id(job)?;
    if event_operation(job) == "delete" {
        return complete_skipped(state.db.pool(), job.id, "薪乐达没有独立班组删除接口").await;
    }
    let team = load_json_row(
        state.db.pool(),
        "SELECT to_jsonb(team) FROM construction_teams team WHERE id = $1 AND is_deleted = FALSE",
        team_id,
    )
    .await?
    .ok_or_else(|| JobIssue::WaitingData("班组不存在或已删除".to_owned()))?;
    let name = required_text(&team, "name", "班组名称")?;
    upsert_mapping(
        state.db.pool(),
        job,
        "team",
        team_id,
        &name,
        &json!({"local_only": true}),
    )
    .await?;
    complete_job(
        state.db.pool(),
        job.id,
        &json!({"skipped": true, "reason": "班组随人员进退场接口上报"}),
    )
    .await
}

async fn execute_worker_sync(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &xinleda::XinledaCredentials,
    config: &Value,
) -> Result<(), JobIssue> {
    let worker_id = local_id(job)?;
    if event_operation(job) == "delete" {
        return complete_skipped(state.db.pool(), job.id, "删除事件由人员退场接口处理").await;
    }
    if event_operation(job) != "update"
        && mapping_external(state.db.pool(), job.binding_id, "worker", worker_id)
            .await?
            .is_some()
    {
        return complete_skipped(state.db.pool(), job.id, "实名人员信息已同步").await;
    }
    let worker = load_worker(state.db.pool(), worker_id).await?;
    let id_card = required_text(&worker, "id_card", "身份证号码")?;
    let encrypted_id = xinleda::encrypt_sensitive(&credentials.app_secret, &id_card)
        .map_err(|error| JobIssue::WaitingData(error.to_string()))?;
    let (birthday, gender) = identity_profile(&id_card, value_i64(&worker, "gender"))?;
    let (start_date, expiry_date, is_long) = identity_validity(&worker)?;
    let bank_no = optional_text(&worker, "salary_bank_card")
        .map(|value| xinleda::encrypt_sensitive(&credentials.app_secret, &value))
        .transpose()
        .map_err(|error| JobIssue::WaitingData(error.to_string()))?;
    let payload = json!([{
        "real_name": required_text(&worker, "name", "人员姓名")?,
        "user_photo": optional_text(&worker, "avatar"),
        "gender": gender,
        "birthday": birthday,
        "id_card_no": encrypted_id,
        "start_date": start_date,
        "expiry_date": expiry_date,
        "is_id_card_long": is_long,
        "grant_org": required_text(&worker, "visa_office", "身份证签发机关")?,
        "mobilephone": optional_text(&worker, "phone"),
        "address": required_text(&worker, "address", "户籍地址")?,
        "current_address": optional_text(&worker, "current_address"),
        "nation": nation_code(optional_text(&worker, "nation").as_deref(), config),
        "nativeplace": native_place_code(value_i64(&worker, "native_place"))?,
        "politics_type": politics_code(value_i64(&worker, "political_status")),
        "culture_level_type": education_code(value_i64(&worker, "education")),
        "is_medical_record": if value_bool(&worker, "has_major_medical_history") { 1 } else { 0 },
        "bank_code": bank_code(optional_text(&worker, "salary_bank").as_deref()),
        "bank_no": bank_no
    }]);
    let response = call_api(
        state,
        job,
        credentials,
        xinleda::LABOURER_IMPORT,
        &payload,
        CallSafety::Write,
    )
    .await?;
    accept_or_complete(
        state.db.pool(),
        job,
        xinleda::LABOURER_IMPORT,
        &response,
        None,
    )
    .await
}

async fn execute_entry_exit_sync(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &xinleda::XinledaCredentials,
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
    let id_card = xinleda::encrypt_sensitive(
        &credentials.app_secret,
        &required_text(&worker, "id_card", "身份证号码")?,
    )
    .map_err(|error| JobIssue::WaitingData(error.to_string()))?;
    let is_exit = event_operation(job) == "delete" || value_i64(&worker, "work_status") == Some(2);
    let date = if is_exit {
        optional_text(&worker, "exit_time")
            .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string())
    } else {
        required_text(&worker, "entry_time", "进场日期")?
    };
    let is_manager = value_bool(&worker, "is_manage_team")
        || value_i64(&worker, "work_type") == Some(1001)
        || value_i64(&worker, "worker_type") == Some(1001);
    let (method, payload) = if is_manager {
        let unit = worker
            .get("unit")
            .ok_or_else(|| JobIssue::WaitingData("管理人员所属单位不存在".to_owned()))?;
        (
            xinleda::MANAGER_ENTRY,
            json!([{
                "project_code": credentials.project_code,
                "real_name": required_text(&worker, "name", "管理人员姓名")?,
                "id_card_no": id_card,
                "position_no": manager_position(optional_text(&worker, "manager_type").as_deref())?,
                "company_type": company_type(value_i64(unit, "company_type"))?,
                "company_name": required_text(unit, "company_name", "管理人员所属单位名称")?,
                "organization_code": required_text(unit, "company_credit_code", "管理人员所属单位信用代码")?,
                "type": if is_exit { 2 } else { 1 },
                "date": date
            }]),
        )
    } else {
        let team = worker
            .get("team")
            .ok_or_else(|| JobIssue::WaitingData("人员所属班组不存在".to_owned()))?;
        (
            xinleda::LABOURER_ENTRY,
            json!([{
                "project_code": credentials.project_code,
                "real_name": required_text(&worker, "name", "人员姓名")?,
                "id_card_no": id_card,
                "group_name": required_text(team, "name", "班组名称")?,
                "is_leader": if value_bool(&worker, "is_team_leader") { 1 } else { 0 },
                "worktype_no": work_type_code(value_i64(&worker, "work_type"))?,
                "type": if is_exit { 2 } else { 1 },
                "date": date
            }]),
        )
    };
    let response = call_api(state, job, credentials, method, &payload, CallSafety::Write).await?;
    accept_or_complete(state.db.pool(), job, method, &response, None).await
}

async fn execute_attendance_sync(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &xinleda::XinledaCredentials,
) -> Result<(), JobIssue> {
    let attendance_id = local_id(job)?;
    if mapping_external(state.db.pool(), job.binding_id, "attendance", attendance_id)
        .await?
        .is_some()
    {
        return complete_skipped(state.db.pool(), job.id, "该考勤记录已同步").await;
    }
    let attendance = load_json_row(
        state.db.pool(),
        r#"
        SELECT to_jsonb(record)
               || jsonb_build_object('worker', to_jsonb(worker))
               || jsonb_build_object('photo_data', photo.photo_data, 'photo_content_type', photo.content_type)
        FROM construction_attendance_records record
        JOIN construction_workers worker ON worker.id = record.worker_id AND worker.is_deleted = FALSE
        LEFT JOIN LATERAL (
            SELECT p.photo_data, p.content_type
            FROM construction_attendance_record_photos p
            WHERE p.attendance_record_id = record.id
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
        .ok_or_else(|| JobIssue::WaitingData("考勤人员不存在".to_owned()))?;
    let worker_id = required_uuid(&attendance, "worker_id", "考勤人员")?;
    if mapping_external(state.db.pool(), job.binding_id, "worker", worker_id)
        .await?
        .is_none()
    {
        return Err(JobIssue::WaitingDependency(
            "等待实名人员信息同步成功".to_owned(),
        ));
    }
    let photo_url = if let Some(photo) = optional_text(&attendance, "photo_data") {
        upload_attendance_photo(
            state,
            job,
            credentials,
            attendance_id,
            &photo,
            optional_text(&attendance, "photo_content_type")
                .as_deref()
                .unwrap_or("image/jpeg"),
        )
        .await?
    } else {
        None
    };
    let payload = json!([{
        "project_code": credentials.project_code,
        "machine_sn": optional_text(&attendance, "serial_number"),
        "record_time": format_datetime(required_text(&attendance, "trigger_time", "考勤时间")?),
        "inorout": match value_i64(&attendance, "direction") { Some(0) => "I", Some(1) => "O", _ => return Err(JobIssue::WaitingData("考勤方向必须为 0 或 1".to_owned())) },
        "fullname": required_text(worker, "name", "考勤人员姓名")?,
        "id_card_no": xinleda::encrypt_sensitive(&credentials.app_secret, &required_text(worker, "id_card", "身份证号码")?)
            .map_err(|error| JobIssue::WaitingData(error.to_string()))?,
        "shot_photo": photo_url
    }]);
    let response = call_api(
        state,
        job,
        credentials,
        xinleda::ATTENDANCE_IMPORT,
        &payload,
        CallSafety::Write,
    )
    .await?;
    accept_or_complete(
        state.db.pool(),
        job,
        xinleda::ATTENDANCE_IMPORT,
        &response,
        None,
    )
    .await
}

async fn execute_safeguard_sync(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &xinleda::XinledaCredentials,
    config: &Value,
) -> Result<(), JobIssue> {
    let Some(value) = config.get("company_safeguard_payload") else {
        return complete_skipped(state.db.pool(), job.id, "未配置企业保证金接口数据").await;
    };
    let rows = normalize_rows(value)?;
    if rows.is_empty() {
        return complete_skipped(state.db.pool(), job.id, "企业保证金接口数据为空").await;
    }
    let payload = Value::Array(rows.into_iter().map(Value::Object).collect());
    let response = call_api(
        state,
        job,
        credentials,
        xinleda::COMPANY_SAFEGUARD,
        &payload,
        CallSafety::Write,
    )
    .await?;
    accept_or_complete(
        state.db.pool(),
        job,
        xinleda::COMPANY_SAFEGUARD,
        &response,
        None,
    )
    .await
}

async fn poll_async_result(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &xinleda::XinledaCredentials,
) -> Result<(), JobIssue> {
    if job
        .expires_at
        .is_some_and(|expires_at| expires_at <= Utc::now())
    {
        return Err(JobIssue::Permanent(
            "薪乐达异步任务查询已超过 24 小时".to_owned(),
        ));
    }
    let token = job
        .external_request_id
        .as_deref()
        .ok_or_else(|| JobIssue::Permanent("异步任务缺少日志查询 token".to_owned()))?;
    let response = call_api(
        state,
        job,
        credentials,
        xinleda::LOG_GET,
        &Value::String(token.to_owned()),
        CallSafety::Read,
    )
    .await?;
    match xinleda::log_status(&response.body) {
        Some(1 | 2) => {
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
            .bind(xinleda::log_status(&response.body).unwrap().to_string())
            .bind(&response.body)
            .bind(ASYNC_POLL_SECONDS)
            .execute(state.db.pool())
            .await
            .map_err(|error| JobIssue::Retryable(error.to_string()))?;
            Ok(())
        }
        Some(3) => {
            handle_async_success(state.db.pool(), job, &response.body).await?;
            complete_job(state.db.pool(), job.id, &response.body).await
        }
        Some(4) => Err(JobIssue::Permanent(
            response
                .body
                .pointer("/data/reason")
                .and_then(Value::as_str)
                .unwrap_or("薪乐达异步任务执行失败")
                .to_owned(),
        )),
        Some(status) => Err(JobIssue::Permanent(format!(
            "未知的薪乐达日志状态：{status}"
        ))),
        None => Err(JobIssue::Permanent(
            "薪乐达日志查询未返回 status".to_owned(),
        )),
    }
}

async fn accept_or_complete<'a>(
    pool: &PgPool,
    job: &ClaimedJob,
    method: &str,
    response: &xinleda::XinledaResponse,
    immediate_mapping: Option<(&'a str, Uuid, &'a str)>,
) -> Result<(), JobIssue> {
    if let Some(token) = xinleda::async_token(method, &response.body) {
        sqlx::query(
            r#"
            UPDATE integration_jobs
            SET status = 'awaiting_result', external_request_id = $2,
                remote_state = '1', response_payload = $3,
                expires_at = NOW() + INTERVAL '24 hours',
                next_attempt_at = NOW() + INTERVAL '5 seconds',
                locked_by = NULL, locked_until = NULL, last_error = NULL,
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(job.id)
        .bind(token)
        .bind(&response.body)
        .execute(pool)
        .await
        .map_err(|error| {
            JobIssue::DeliveryUnknown(format!(
                "平台已接收任务，但本地保存查询 token 失败：{error}"
            ))
        })?;
        return Ok(());
    }
    if let Some((entity_type, local_id, external_id)) = immediate_mapping {
        upsert_mapping(
            pool,
            job,
            entity_type,
            local_id,
            external_id,
            &response.body,
        )
        .await?;
    }
    handle_async_success(pool, job, &response.body).await?;
    complete_job(pool, job.id, &response.body).await
}

async fn handle_async_success(
    pool: &PgPool,
    job: &ClaimedJob,
    response: &Value,
) -> Result<(), JobIssue> {
    let local_id = local_id(job)?;
    match job.operation.as_str() {
        "project.sync" => {
            let external = sqlx::query_scalar::<_, String>(
                "SELECT external_project_id FROM integration_project_bindings WHERE id = $1",
            )
            .bind(job.binding_id)
            .fetch_optional(pool)
            .await
            .map_err(|error| JobIssue::Retryable(error.to_string()))?
            .unwrap_or_else(|| job.project_id.to_string());
            upsert_mapping(pool, job, "project", local_id, &external, response).await?;
        }
        "unit.sync" => {
            let external = load_json_row(
                pool,
                "SELECT to_jsonb(unit) FROM construction_units unit WHERE id = $1",
                local_id,
            )
            .await?
            .and_then(|unit| optional_text(&unit, "company_credit_code"))
            .unwrap_or_else(|| local_id.to_string());
            upsert_mapping(pool, job, "unit", local_id, &external, response).await?;
        }
        "worker.sync" => {
            upsert_mapping(
                pool,
                job,
                "worker",
                local_id,
                &local_id.to_string(),
                response,
            )
            .await?;
            let event_key = job.outbox_event_id.unwrap_or(job.id);
            sqlx::query(
                r#"
                INSERT INTO integration_jobs (
                    project_id, binding_id, outbox_event_id, platform_code,
                    operation, entity_type, local_entity_id, idempotency_key,
                    request_payload, status, attempt_count, max_attempts, next_attempt_at
                )
                VALUES ($1, $2, $3, 'xinleda', 'entry_exit.sync', 'worker', $4,
                        $5, $6, 'pending', 0, 5, NOW())
                ON CONFLICT (idempotency_key) DO NOTHING
                "#,
            )
            .bind(job.project_id)
            .bind(job.binding_id)
            .bind(job.outbox_event_id)
            .bind(local_id)
            .bind(format!("{}:{}:entry_exit.sync", job.binding_id, event_key))
            .bind(json!({"parent_job_id": job.id, "event": {"operation": event_operation(job)}}))
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
                response,
            )
            .await?
        }
        _ => {}
    }
    Ok(())
}

async fn call_api(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &xinleda::XinledaCredentials,
    method: &str,
    payload: &Value,
    safety: CallSafety,
) -> Result<xinleda::XinledaResponse, JobIssue> {
    if credentials.is_dry_run() {
        let body = if method == xinleda::LOG_GET {
            json!({"code": 0, "message": "dry-run", "data": {"status": 3, "method": "dry-run", "version": "1.0", "reason": ""}})
        } else {
            json!({"code": 0, "message": "dry-run", "data": format!("{method}_1.0_dry-run")})
        };
        let response = xinleda::XinledaResponse {
            status: 200,
            body,
            duration_ms: 0,
        };
        record_attempt(
            state.db.pool(),
            job,
            method,
            payload,
            Some(&response),
            "dry_run",
            None,
        )
        .await;
        return Ok(response);
    }
    let method_guard = acquire_method_guard(state.db.pool(), &credentials.app_id, method).await?;
    acquire_rate_slot(state.db.pool(), &credentials.app_id, method).await?;
    let client = xinleda::build_client().map_err(|error| JobIssue::Retryable(error.to_string()))?;
    let result = xinleda::call(&client, credentials, method, payload).await;
    method_guard.commit().await.map_err(|error| match safety {
        CallSafety::Read => JobIssue::Retryable(error.to_string()),
        CallSafety::Write => {
            JobIssue::DeliveryUnknown(format!("请求已发出，但释放薪乐达接口串行锁失败：{error}"))
        }
    })?;
    match result {
        Ok(response) => {
            let accepted = response.is_success() || response.is_pending();
            record_attempt(
                state.db.pool(),
                job,
                method,
                payload,
                Some(&response),
                if accepted { "success" } else { "failed" },
                (!accepted).then(|| response.message()).as_deref(),
            )
            .await;
            if accepted {
                Ok(response)
            } else if response.status == 429
                || response.status >= 500
                || matches!(response.code(), Some(-5))
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
                method,
                payload,
                None,
                "transport_error",
                Some(&message),
            )
            .await;
            match safety {
                CallSafety::Read => Err(JobIssue::Retryable(message)),
                CallSafety::Write => Err(JobIssue::DeliveryUnknown(format!(
                    "请求结果未知，为避免平台产生重复数据未自动重发：{message}"
                ))),
            }
        }
    }
}

async fn upload_attendance_photo(
    state: &AppState,
    job: &ClaimedJob,
    credentials: &xinleda::XinledaCredentials,
    attendance_id: Uuid,
    source: &str,
    content_type: &str,
) -> Result<Option<String>, JobIssue> {
    if source.starts_with("http://") || source.starts_with("https://") {
        return Ok(Some(source.to_owned()));
    }
    let encoded = source
        .split_once(',')
        .map(|(_, data)| data)
        .unwrap_or(source);
    let bytes = BASE64_STANDARD
        .decode(encoded)
        .map_err(|_| JobIssue::WaitingData("考勤照片 Base64 格式错误".to_owned()))?;
    if bytes.is_empty() || bytes.len() > MAX_UPLOAD_BYTES {
        return Err(JobIssue::WaitingData(
            "考勤照片为空或超过 10 MiB".to_owned(),
        ));
    }
    let response = if credentials.is_dry_run() {
        xinleda::XinledaResponse {
            status: 200,
            body: json!({"code": 0, "message": "dry-run", "data": [format!("/dry-run/{attendance_id}.jpg")]}),
            duration_ms: 0,
        }
    } else {
        let method_guard =
            acquire_method_guard(state.db.pool(), &credentials.app_id, "upfiles").await?;
        acquire_rate_slot(state.db.pool(), &credentials.app_id, "upfiles").await?;
        let client =
            xinleda::build_client().map_err(|error| JobIssue::Retryable(error.to_string()))?;
        let result = xinleda::upload_file(
            &client,
            credentials,
            &format!("{attendance_id}.jpg"),
            content_type,
            bytes,
        )
        .await;
        method_guard.commit().await.map_err(|error| {
            JobIssue::DeliveryUnknown(format!(
                "文件请求已发出，但释放薪乐达接口串行锁失败：{error}"
            ))
        })?;
        result.map_err(|error| JobIssue::Retryable(error.to_string()))?
    };
    record_attempt(
        state.db.pool(),
        job,
        "upfiles",
        &json!({"files": "[REDACTED]"}),
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
        return Err(JobIssue::Permanent(response.message()));
    }
    let url = response.body.get("data").and_then(|data| {
        data.as_str()
            .map(ToOwned::to_owned)
            .or_else(|| data.as_array()?.first()?.as_str().map(ToOwned::to_owned))
    });
    Ok(url)
}

async fn acquire_rate_slot(pool: &PgPool, app_id: &str, method: &str) -> Result<(), JobIssue> {
    let rate_key = format!("{app_id}:{method}");
    let reserved_at = sqlx::query_scalar::<_, DateTime<Utc>>(
        r#"
        INSERT INTO integration_rate_limits (platform_code, rate_key, next_allowed_at, updated_at)
        VALUES ('xinleda', $1, NOW() + make_interval(secs => $2), NOW())
        ON CONFLICT (platform_code, rate_key)
        DO UPDATE SET
            next_allowed_at = GREATEST(integration_rate_limits.next_allowed_at, NOW()) + make_interval(secs => $2),
            updated_at = NOW()
        RETURNING next_allowed_at - make_interval(secs => $2)
        "#,
    )
    .bind(rate_key)
    .bind(RATE_SLOT_SECONDS)
    .fetch_one(pool)
    .await
    .map_err(|error| JobIssue::Retryable(error.to_string()))?;
    if let Ok(duration) = reserved_at.signed_duration_since(Utc::now()).to_std()
        && !duration.is_zero()
    {
        sleep(duration).await;
    }
    Ok(())
}

async fn acquire_method_guard<'a>(
    pool: &'a PgPool,
    app_id: &str,
    method: &str,
) -> Result<Transaction<'a, Postgres>, JobIssue> {
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| JobIssue::Retryable(error.to_string()))?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(format!("xinleda:{app_id}:{method}"))
        .execute(&mut *transaction)
        .await
        .map_err(|error| JobIssue::Retryable(error.to_string()))?;
    Ok(transaction)
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
         AND platform.code = 'xinleda'
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
               || jsonb_build_object('team', to_jsonb(team), 'unit', to_jsonb(unit),
                    'is_team_leader', COALESCE(team.leader_id = worker.id, FALSE))
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
    sqlx::query_scalar(
        "SELECT external_entity_id FROM integration_entity_mappings WHERE binding_id = $1 AND entity_type = $2 AND local_entity_id = $3 AND is_deleted = FALSE",
    )
    .bind(binding_id)
    .bind(entity_type)
    .bind(local_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| JobIssue::Retryable(error.to_string()))
}

async fn upsert_mapping(
    pool: &PgPool,
    job: &ClaimedJob,
    entity_type: &str,
    local_id: Uuid,
    external_id: &str,
    payload: &Value,
) -> Result<(), JobIssue> {
    sqlx::query(
        r#"
        INSERT INTO integration_entity_mappings (
            binding_id, project_id, entity_type, local_entity_id,
            external_entity_id, external_payload, last_pushed_at, is_deleted, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), FALSE, NULL)
        ON CONFLICT (binding_id, entity_type, local_entity_id) WHERE is_deleted = FALSE
        DO UPDATE SET external_entity_id = EXCLUDED.external_entity_id,
                      external_payload = EXCLUDED.external_payload,
                      last_pushed_at = NOW(), updated_at = NOW()
        "#,
    )
    .bind(job.binding_id)
    .bind(job.project_id)
    .bind(entity_type)
    .bind(local_id)
    .bind(external_id)
    .bind(payload)
    .execute(pool)
    .await
    .map_err(|error| JobIssue::Retryable(error.to_string()))?;
    Ok(())
}

async fn complete_job(pool: &PgPool, job_id: Uuid, response: &Value) -> Result<(), JobIssue> {
    sqlx::query(
        r#"
        UPDATE integration_jobs
        SET status = 'success', response_payload = $2, remote_state = COALESCE(remote_state, '3'),
            completed_at = NOW(), next_attempt_at = NOW(), locked_by = NULL,
            locked_until = NULL, last_error = NULL, updated_at = NOW()
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
        JobIssue::Retryable(_) if job.attempt_count < job.max_attempts => (
            "retry",
            Some(2_i64.pow(job.attempt_count.clamp(1, 6) as u32)),
            false,
        ),
        JobIssue::Retryable(_) | JobIssue::Permanent(_) => ("failed", None, true),
        JobIssue::DeliveryUnknown(_) => ("delivery_unknown", None, true),
    };
    let next_attempt_at =
        retry_after.map(|seconds| Utc::now() + chrono::Duration::seconds(seconds));
    if let Err(error) = sqlx::query(
        r#"
        UPDATE integration_jobs
        SET status = $2, next_attempt_at = COALESCE($3, next_attempt_at),
            attempt_count = CASE WHEN $2 = 'waiting_dependency' THEN GREATEST(attempt_count - 1, 0) ELSE attempt_count END,
            locked_by = NULL, locked_until = NULL, last_error = $4,
            completed_at = CASE WHEN $5 THEN NOW() ELSE NULL END, updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(job.id).bind(status).bind(next_attempt_at).bind(issue.message()).bind(completed)
    .execute(pool).await {
        error!(job_id = %job.id, error = %error, "failed to persist Xinleda job failure");
    } else {
        warn!(job_id = %job.id, operation = %job.operation, status, error = %issue.message(), "Xinleda job did not complete");
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
        "UPDATE integration_jobs SET status = $2, response_payload = $3, last_error = $4, completed_at = NOW(), locked_by = NULL, locked_until = NULL, updated_at = NOW() WHERE id = $1",
    )
    .bind(job_id).bind(status).bind(response).bind(error).execute(pool).await {
        error!(%job_id, error = %db_error, "failed to finish disabled Xinleda job");
    }
}

async fn record_attempt(
    pool: &PgPool,
    job: &ClaimedJob,
    method: &str,
    request_body: &Value,
    response: Option<&xinleda::XinledaResponse>,
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
            warn!(job_id = %job.id, error = %error, "failed to allocate Xinleda attempt number");
            return;
        }
    };
    if let Err(error) = sqlx::query(
        r#"
        INSERT INTO integration_attempts (
            job_id, project_id, binding_id, attempt_no, transport,
            request_method, request_url, request_headers, request_body,
            response_status, response_body, duration_ms, status, error_message
        )
        VALUES ($1, $2, $3, $4, 'http', 'POST', $5, $6, $7, $8, $9, $10, $11, $12)
        "#,
    )
    .bind(job.id).bind(job.project_id).bind(job.binding_id).bind(attempt_no)
    .bind(if method == "upfiles" { "/upfiles".to_owned() } else { format!("/openapi#{method}") })
    .bind(json!({"appid": "[REDACTED]", "timestamp": "[GENERATED]", "nonce": "[GENERATED]", "sign": "[REDACTED]"}))
    .bind(sanitize_payload(request_body))
    .bind(response.map(|value| value.status as i32)).bind(response.map(|value| &value.body))
    .bind(response.map(|value| value.duration_ms)).bind(status).bind(error_message)
    .execute(pool).await {
        warn!(job_id = %job.id, error = %error, "failed to record Xinleda attempt");
    }
}

fn sanitize_payload(value: &Value) -> Value {
    match value {
        Value::Object(object) => Value::Object(
            object
                .iter()
                .map(|(key, value)| {
                    let sensitive = matches!(
                        key.as_str(),
                        "id_card_no" | "bank_no" | "owner_cardid" | "files"
                    );
                    (
                        key.clone(),
                        if sensitive {
                            Value::String("[REDACTED]".to_owned())
                        } else {
                            sanitize_payload(value)
                        },
                    )
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(sanitize_payload).collect()),
        _ => value.clone(),
    }
}

fn normalize_rows(value: &Value) -> Result<Vec<Map<String, Value>>, JobIssue> {
    match value {
        Value::Object(row) => Ok(vec![row.clone()]),
        Value::Array(rows) => rows
            .iter()
            .map(|row| {
                row.as_object().cloned().ok_or_else(|| {
                    JobIssue::WaitingData("扩展接口数组元素必须是 JSON 对象".to_owned())
                })
            })
            .collect(),
        _ => Err(JobIssue::WaitingData(
            "扩展接口数据必须是 JSON 对象或对象数组".to_owned(),
        )),
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

fn money_or_number(value: &Value, key: &str) -> Option<f64> {
    value
        .get(key)
        .and_then(|item| item.as_f64().or_else(|| item.as_str()?.parse().ok()))
}

fn area_codes(raw: Option<&str>) -> Result<(String, String, String), JobIssue> {
    let digits = raw
        .unwrap_or_default()
        .chars()
        .filter(char::is_ascii_digit)
        .collect::<String>();
    if digits.len() < 6 {
        return Err(JobIssue::WaitingData(
            "项目/企业地区缺少 6 位行政区划代码".to_owned(),
        ));
    }
    let county = digits[digits.len() - 6..].to_owned();
    Ok((
        format!("{}0000", &county[..2]),
        format!("{}00", &county[..4]),
        county,
    ))
}

fn identity_profile(
    id_card: &str,
    gender_value: Option<i64>,
) -> Result<(String, &'static str), JobIssue> {
    if id_card.len() != 18 || !id_card[..17].chars().all(|c| c.is_ascii_digit()) {
        return Err(JobIssue::WaitingData(
            "身份证号码无法提取出生日期".to_owned(),
        ));
    }
    let birthday = format!(
        "{}-{}-{}",
        &id_card[6..10],
        &id_card[10..12],
        &id_card[12..14]
    );
    let gender = match gender_value {
        Some(1) => "男",
        Some(2) => "女",
        _ => {
            if id_card[16..17].parse::<i32>().unwrap_or(1) % 2 == 0 {
                "女"
            } else {
                "男"
            }
        }
    };
    Ok((birthday, gender))
}

fn identity_validity(worker: &Value) -> Result<(Option<String>, Option<String>, i32), JobIssue> {
    let start = optional_text(worker, "validity_period");
    let expiry = optional_text(worker, "validity_period_end");
    let long = expiry.as_deref().is_some_and(|value| value.contains('长'));
    if start.is_none() {
        return Err(JobIssue::WaitingData("缺少身份证有效期开始日期".to_owned()));
    }
    if expiry.is_none() && !long {
        return Err(JobIssue::WaitingData("缺少身份证有效期结束日期".to_owned()));
    }
    Ok((
        start,
        if long { None } else { expiry },
        if long { 1 } else { 0 },
    ))
}

fn company_type(value: Option<i64>) -> Result<i64, JobIssue> {
    match value {
        Some(1 | 5 | 6 | 7) => Ok(2),
        Some(2) => Ok(6),
        Some(3 | 8 | 9) => Ok(3),
        Some(4) => Ok(1),
        Some(10) => Ok(5),
        Some(11) => Ok(4),
        _ => Err(JobIssue::WaitingData(
            "单位类型无法映射到薪乐达企业登记注册类型".to_owned(),
        )),
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
        _ => Err(JobIssue::WaitingData("工种无法映射到薪乐达字典".to_owned())),
    }
}

fn manager_position(value: Option<&str>) -> Result<&'static str, JobIssue> {
    match value.unwrap_or("").trim() {
        "1" => Ok("5"),
        "2" => Ok("2"),
        "4" => Ok("8"),
        "5" => Ok("7"),
        "7" => Ok("9"),
        "8" => Ok("13"),
        "9" => Ok("12"),
        _ => Err(JobIssue::WaitingData(
            "管理人员类型无法映射到薪乐达岗位字典".to_owned(),
        )),
    }
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
        Some(8) => "08",
        _ => "99",
    }
}

fn politics_code(value: Option<i64>) -> &'static str {
    match value {
        Some(2) => "01",
        Some(3) => "02",
        Some(4) => "03",
        _ => "13",
    }
}

fn nation_code(value: Option<&str>, config: &Value) -> i64 {
    if let Some(value) = value
        && let Some(mapped) = config
            .pointer(&format!("/dictionary_maps/nation/{value}"))
            .and_then(Value::as_i64)
    {
        return mapped;
    }
    match value.unwrap_or("").trim().trim_end_matches('族') {
        "汉" => 1,
        "蒙古" => 2,
        "回" => 3,
        "藏" => 4,
        "维吾尔" => 5,
        "苗" => 6,
        "彝" => 7,
        "壮" => 8,
        "布依" => 9,
        "朝鲜" => 10,
        "满" => 11,
        "侗" => 12,
        "瑶" => 13,
        "白" => 14,
        "土家" => 15,
        "哈尼" => 16,
        "哈萨克" => 17,
        "傣" => 18,
        "黎" => 19,
        "傈僳" => 20,
        "佤" => 21,
        "畲" => 22,
        "高山" => 23,
        "拉祜" => 24,
        "水" => 25,
        "东乡" => 26,
        "纳西" => 27,
        "景颇" => 28,
        "柯尔克孜" => 29,
        "土" => 30,
        _ => 57,
    }
}

fn native_place_code(value: Option<i64>) -> Result<i64, JobIssue> {
    match value {
        Some(1..=34) => Ok(value.unwrap()),
        Some(code) if (110000..=659999).contains(&code) => Ok(match code / 10_000 {
            11 => 1,
            12 => 2,
            31 => 3,
            50 => 4,
            34 => 5,
            62 => 6,
            35 => 7,
            44 => 8,
            52 => 9,
            46 => 10,
            41 => 11,
            13 => 12,
            23 => 13,
            42 => 14,
            43 => 15,
            32 => 16,
            36 => 17,
            22 => 18,
            21 => 19,
            63 => 20,
            61 => 21,
            37 => 22,
            14 => 23,
            51 => 25,
            53 => 26,
            33 => 27,
            45 => 30,
            15 => 31,
            64 => 32,
            54 => 33,
            65 => 34,
            _ => 27,
        }),
        _ => Err(JobIssue::WaitingData("籍贯无法映射到薪乐达字典".to_owned())),
    }
}

fn bank_code(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn format_datetime(value: String) -> String {
    if value.len() >= 19 {
        value[..19].replace('T', " ")
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_and_dictionary_mappings_match_documented_values() {
        assert_eq!(
            identity_profile("330203199001011234", None).unwrap(),
            ("1990-01-01".to_owned(), "男")
        );
        assert_eq!(work_type_code(Some(1)).unwrap(), "020");
        assert_eq!(native_place_code(Some(330200)).unwrap(), 27);
        assert_eq!(nation_code(Some("汉族"), &json!({})), 1);
        assert_eq!(company_type(Some(1)).unwrap(), 2);
        assert_eq!(company_type(Some(2)).unwrap(), 6);
        assert_eq!(company_type(Some(4)).unwrap(), 1);
        assert!(company_type(Some(12)).is_err());
        assert_eq!(manager_position(Some("1")).unwrap(), "5");
        assert!(manager_position(Some("99")).is_err());
    }

    #[test]
    fn safeguard_payload_accepts_single_or_multiple_rows() {
        assert_eq!(normalize_rows(&json!({"a": 1})).unwrap().len(), 1);
        assert_eq!(
            normalize_rows(&json!([{"a": 1}, {"a": 2}])).unwrap().len(),
            2
        );
        assert!(normalize_rows(&json!("invalid")).is_err());
    }
}
