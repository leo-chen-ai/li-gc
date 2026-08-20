use axum::{
    Extension, Json,
    extract::{Path, State},
    http::{StatusCode, Uri, header},
    response::{IntoResponse, Response},
};
use base64::{Engine as _, engine::general_purpose};
use bytes::Bytes;
use chrono::{
    Datelike, Duration as ChronoDuration, FixedOffset, NaiveDate, NaiveTime, TimeZone, Timelike,
};
use percent_encoding::percent_decode_str;
use rand::{Rng, SeedableRng, rngs::StdRng, seq::SliceRandom};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Postgres, QueryBuilder, Row};
use std::{
    collections::{HashMap, HashSet},
    io::{Cursor, Read, Write},
    time::Duration,
};
use uuid::Uuid;
use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

use crate::{
    feature::auth::{AuthUser, Role},
    feature::device_mqtt::issuer::{
        issue_device_workers_via_broker, issue_single_worker_via_broker,
    },
    feature::integration::ningbo_housing,
    infrastructure::web::{
        response::{ApiError, ApiResult, ApiSuccess},
        trimmed_json::TrimmedJson,
    },
    state::AppState,
};

#[derive(Clone, Copy)]
struct ColumnSpec {
    name: &'static str,
    kind: ColumnKind,
}

#[derive(Clone, Copy)]
enum ColumnKind {
    Text,
    Uuid,
    Integer,
    SmallInt,
    BigInt,
    Money,
    Boolean,
    Date,
    Timestamp,
    Json,
}

const fn column(name: &'static str, kind: ColumnKind) -> ColumnSpec {
    ColumnSpec { name, kind }
}

const PROJECT_COLUMNS: &[ColumnSpec] = &[
    column("name", ColumnKind::Text),
    column("address_code", ColumnKind::Text),
    column("street", ColumnKind::Text),
    column("start_date", ColumnKind::Date),
    column("finish_date", ColumnKind::Date),
    column("invest_total", ColumnKind::Money),
    column("investment_nature", ColumnKind::Integer),
    column("labor_cost", ColumnKind::Money),
    column("status", ColumnKind::Integer),
    column("category", ColumnKind::Integer),
    column("industry", ColumnKind::Integer),
    column("address", ColumnKind::Text),
    column("longitude", ColumnKind::Text),
    column("latitude", ColumnKind::Text),
    column("work_permit", ColumnKind::Text),
    column("supervision_area", ColumnKind::Text),
    column("contractor", ColumnKind::Text),
    column("contractor_credit_code", ColumnKind::Text),
    column("manager", ColumnKind::Text),
    column("manager_phone", ColumnKind::Text),
    column("contract_principal", ColumnKind::Text),
    column("contract_principal_id_card", ColumnKind::Text),
    column("contract_principal_phone", ColumnKind::Text),
    column("party_a", ColumnKind::Text),
    column("legal_representative", ColumnKind::Text),
    column("legal_representative_id_card", ColumnKind::Text),
    column("company_office_address", ColumnKind::Text),
    column("company_phone", ColumnKind::Text),
    column("bid_notice", ColumnKind::Text),
    column("build_unit", ColumnKind::Text),
    column("build_unit_credit_code", ColumnKind::Text),
    column("labor_subcontractor", ColumnKind::Text),
    column("labor_subcontractor_credit_code", ColumnKind::Text),
    column("build_nature", ColumnKind::Integer),
    column("build_scale", ColumnKind::Integer),
    column("acreage", ColumnKind::BigInt),
    column("length", ColumnKind::BigInt),
    column("purpose", ColumnKind::Integer),
    column("progress_type", ColumnKind::Integer),
    column("real_name_manager", ColumnKind::Text),
    column("real_name_manager_phone", ColumnKind::Text),
    column("labor_manager", ColumnKind::Text),
    column("labor_manager_phone", ColumnKind::Text),
    column("complaint_phone", ColumnKind::Text),
    column("labor_complaint_phone", ColumnKind::Text),
    column("company_complaint_phone", ColumnKind::Text),
    column("project_complaint_phone", ColumnKind::Text),
    column("nationality", ColumnKind::Text),
    column("manager_id_card", ColumnKind::Text),
    column("labor_manager_id_card", ColumnKind::Text),
    column("contract_amount", ColumnKind::Money),
    column("injury_insurance_number", ColumnKind::Text),
    column("margin_amount", ColumnKind::Money),
    column("pay_date", ColumnKind::Date),
    column("margin_photos", ColumnKind::Text),
    column("injury_insurance_photos", ColumnKind::Text),
    column("payment_guarantee_photos", ColumnKind::Text),
    column("contract_number", ColumnKind::Text),
    column("contract_prefix", ColumnKind::Text),
    column("party_a_seal", ColumnKind::Text),
    column("legal_representative_seal", ColumnKind::Text),
    column("address_code_list", ColumnKind::Text),
    column("supervision_area_list", ColumnKind::Text),
    column("bid_notice_file", ColumnKind::Json),
    column("margin_photos_file", ColumnKind::Json),
    column("injury_insurance_photos_file", ColumnKind::Json),
    column("payment_guarantee_photos_file", ColumnKind::Json),
    column("is_inspected", ColumnKind::Boolean),
    column("is_handheld_device_enabled", ColumnKind::Boolean),
];

const UNIT_COLUMNS: &[ColumnSpec] = &[
    column("company_name", ColumnKind::Text),
    column("company_credit_code", ColumnKind::Text),
    column("company_type", ColumnKind::Integer),
    column("register_date", ColumnKind::Date),
    column("register_area", ColumnKind::Text),
    column("company_address", ColumnKind::Text),
    column("manager_name", ColumnKind::Text),
    column("manager_phone", ColumnKind::Text),
    column("manager_id_card", ColumnKind::Text),
    column("legal_person_name", ColumnKind::Text),
    column("legal_person_id_card", ColumnKind::Text),
    column("company_phone", ColumnKind::Text),
    column("contract_amount", ColumnKind::Money),
    column("attachment", ColumnKind::Text),
    column("register_area_list", ColumnKind::Text),
    column("attachment_file", ColumnKind::Json),
    column("timer_set_a", ColumnKind::Integer),
    column("timer_set_b", ColumnKind::Integer),
    column("timer_set_c", ColumnKind::Integer),
    column("salary_calc_type", ColumnKind::SmallInt),
    column("quantity_unit_type", ColumnKind::SmallInt),
    column("seal_photo", ColumnKind::Text),
];

const TEAM_COLUMNS: &[ColumnSpec] = &[
    column("unit_id", ColumnKind::Uuid),
    column("name", ColumnKind::Text),
    column("work_type", ColumnKind::Integer),
    column("is_manage_team", ColumnKind::Boolean),
    column("settlement_type", ColumnKind::SmallInt),
    column("quantity_unit_type", ColumnKind::SmallInt),
    column("remark", ColumnKind::Text),
    column("attendance_start_time", ColumnKind::Text),
    column("attendance_end_time", ColumnKind::Text),
    column("attendance_is_next_day", ColumnKind::Boolean),
    column("leader_id", ColumnKind::Uuid),
    column("leader_name", ColumnKind::Text),
    column("leader_phone", ColumnKind::Text),
    column("leader_id_card", ColumnKind::Text),
    column("team_no", ColumnKind::Text),
];

const WORKER_COLUMNS: &[ColumnSpec] = &[
    column("unit_id", ColumnKind::Uuid),
    column("team_id", ColumnKind::Uuid),
    column("id_card", ColumnKind::Text),
    column("name", ColumnKind::Text),
    column("gender", ColumnKind::SmallInt),
    column("nation", ColumnKind::Text),
    column("visa_office", ColumnKind::Text),
    column("address", ColumnKind::Text),
    column("validity_period", ColumnKind::Text),
    column("ocr_photo", ColumnKind::Text),
    column("work_type", ColumnKind::Integer),
    column("worker_type", ColumnKind::Integer),
    column("political_status", ColumnKind::Integer),
    column("education", ColumnKind::Integer),
    column("settlement_type", ColumnKind::SmallInt),
    column("quantity_unit_type", ColumnKind::SmallInt),
    column("unit_price", ColumnKind::Money),
    column("salary_bank_card", ColumnKind::Text),
    column("salary_bank", ColumnKind::Text),
    column("has_insurance", ColumnKind::Boolean),
    column("has_major_medical_history", ColumnKind::Boolean),
    column("current_address", ColumnKind::Text),
    column("dormitory_id", ColumnKind::Uuid),
    column("id_card_back_file", ColumnKind::Text),
    column("phone", ColumnKind::Text),
    column("is_manage_team", ColumnKind::Boolean),
    column("is_key_personnel", ColumnKind::Boolean),
    column("avatar", ColumnKind::Text),
    column("work_status", ColumnKind::SmallInt),
    column("labor_contract_file", ColumnKind::Json),
    column("settlement_file", ColumnKind::Json),
    column("exit_time", ColumnKind::Date),
    column("auth_status", ColumnKind::SmallInt),
    column("auth_fail_reason", ColumnKind::Text),
    column("manager_type", ColumnKind::Text),
    column("validity_period_end", ColumnKind::Text),
    column("entry_time", ColumnKind::Date),
    column("signature_photo", ColumnKind::Text),
    column("signature_time", ColumnKind::Date),
    column("native_place", ColumnKind::Integer),
];

const ATTENDANCE_COLUMNS: &[ColumnSpec] = &[
    column("worker_id", ColumnKind::Uuid),
    column("direction", ColumnKind::SmallInt),
    column("trigger_time", ColumnKind::Timestamp),
    column("equipment_id", ColumnKind::Text),
    column("serial_number", ColumnKind::Text),
    column("photo_path", ColumnKind::Text),
    column("overall_photo", ColumnKind::Text),
    column("closeup_photo", ColumnKind::Text),
    column("original_time", ColumnKind::Text),
];

#[derive(Debug, Deserialize)]
pub struct AttendanceGeneratorPreviewRequest {
    worker_ids: Vec<Uuid>,
    month: String,
    attendance_days: u32,
    include_weekends: bool,
    prioritize_weekends: bool,
    morning_start: String,
    morning_end: String,
    evening_start: String,
    evening_end: String,
    #[serde(default)]
    include_midday: bool,
    lunch_out_start: Option<String>,
    lunch_out_end: Option<String>,
    lunch_in_start: Option<String>,
    lunch_in_end: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GeneratedAttendancePreviewRecord {
    worker_id: Uuid,
    worker_name: String,
    team_name: Option<String>,
    direction: i16,
    trigger_time: String,
}

#[derive(Debug, Deserialize)]
pub struct AttendanceGeneratorCommitRequest {
    records: Vec<GeneratedAttendancePreviewRecord>,
}

#[derive(Debug, Deserialize)]
pub struct YongxinAttendanceRepairRequest {
    pub start_date: String,
    pub end_date: String,
    #[serde(default)]
    pub worker_ids: Vec<Uuid>,
    #[serde(default)]
    pub attendance_ids: Vec<Uuid>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct YongxinAttendanceRepairPreviewRow {
    attendance_id: Uuid,
    worker_id: Uuid,
    worker_name: String,
    worker_identity: Option<String>,
    team_name: Option<String>,
    direction: i16,
    trigger_time: chrono::DateTime<chrono::Utc>,
    current_status: Option<String>,
    current_message: Option<String>,
}

const ATTENDANCE_DEVICE_COLUMNS: &[ColumnSpec] = &[
    column("device_type", ColumnKind::Text),
    column("serial_number", ColumnKind::Text),
    column("device_name", ColumnKind::Text),
    column("direction", ColumnKind::SmallInt),
    column("remark", ColumnKind::Text),
];

const ATTENDANCE_DEVICE_ISSUE_REPORT_COLUMNS: &[ColumnSpec] = &[
    column("project_id", ColumnKind::Uuid),
    column("worker_id", ColumnKind::Uuid),
    column("attendance_device_id", ColumnKind::Uuid),
    column("worker_name", ColumnKind::Text),
    column("worker_id_card", ColumnKind::Text),
    column("worker_phone", ColumnKind::Text),
    column("avatar_url", ColumnKind::Text),
    column("device_name", ColumnKind::Text),
    column("serial_number", ColumnKind::Text),
    column("device_type", ColumnKind::Text),
    column("action", ColumnKind::Text),
    column("status", ColumnKind::Text),
    column("issued_at", ColumnKind::Timestamp),
    column("message", ColumnKind::Text),
    column("remark", ColumnKind::Text),
];

const CONTRACT_TEMPLATE_COLUMNS: &[ColumnSpec] = &[
    column("name", ColumnKind::Text),
    column("code", ColumnKind::Text),
    column("content", ColumnKind::Text),
    column("template_file", ColumnKind::Json),
    column("template_file_object_key", ColumnKind::Text),
    column("template_file_name", ColumnKind::Text),
    column("template_file_content_type", ColumnKind::Text),
    column("is_enabled", ColumnKind::Boolean),
    column("is_default", ColumnKind::Boolean),
    column("remark", ColumnKind::Text),
];

const WORK_HOUR_CONFIG_COLUMNS: &[ColumnSpec] = &[
    column("project_id", ColumnKind::Uuid),
    column("name", ColumnKind::Text),
    column("algorithm_type", ColumnKind::Text),
    column("rules", ColumnKind::Json),
    column("is_enabled", ColumnKind::Boolean),
    column("remark", ColumnKind::Text),
];

const PLATFORM_CONFIG_COLUMNS: &[ColumnSpec] = &[
    column("project_id", ColumnKind::Uuid),
    column("platform_name", ColumnKind::Text),
    column("platform_type", ColumnKind::Text),
    column("config", ColumnKind::Json),
    column("is_enabled", ColumnKind::Boolean),
    column("remark", ColumnKind::Text),
];

const PLATFORM_LOG_COLUMNS: &[ColumnSpec] = &[
    column("project_id", ColumnKind::Uuid),
    column("platform_config_id", ColumnKind::Uuid),
    column("platform_name", ColumnKind::Text),
    column("operation", ColumnKind::Text),
    column("direction", ColumnKind::Text),
    column("status", ColumnKind::Text),
    column("request_count", ColumnKind::Integer),
    column("success_count", ColumnKind::Integer),
    column("failure_count", ColumnKind::Integer),
    column("message", ColumnKind::Text),
    column("payload", ColumnKind::Json),
    column("occurred_at", ColumnKind::Timestamp),
];

const MANAGED_ATTENDANCE_PHOTO_GROUP_COLUMNS: &[ColumnSpec] = &[
    column("project_id", ColumnKind::Uuid),
    column("name", ColumnKind::Text),
    column("generation_status", ColumnKind::Text),
    column("in_photos", ColumnKind::Json),
    column("out_photos", ColumnKind::Json),
    column("remark", ColumnKind::Text),
];

const MANAGED_ATTENDANCE_CONFIG_COLUMNS: &[ColumnSpec] = &[
    column("project_id", ColumnKind::Uuid),
    column("worker_id", ColumnKind::Uuid),
    column("photo_group_id", ColumnKind::Uuid),
    column("attendance_device_id", ColumnKind::Uuid),
    column("monthly_attendance_days", ColumnKind::SmallInt),
    column("shift", ColumnKind::Text),
    column("check_in_time", ColumnKind::Text),
    column("check_in_end_time", ColumnKind::Text),
    column("check_out_time", ColumnKind::Text),
    column("check_out_end_time", ColumnKind::Text),
    column("is_enabled", ColumnKind::Boolean),
    column("remark", ColumnKind::Text),
];

pub async fn list_projects(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    uri: Uri,
) -> ApiResult<Value> {
    let (has_query, params) = project_list_params(&uri)?;
    let total = if has_query {
        fetch_project_total(state.db.pool(), &auth_user, &params).await?
    } else {
        0
    };
    let items = fetch_project_items(state.db.pool(), &auth_user, &params, has_query).await?;

    if !has_query {
        return Ok(ApiSuccess::default().with_data(items));
    }

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

async fn fetch_project_items(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    params: &ProjectListParams,
    paginated: bool,
) -> Result<Value, ApiError> {
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                p.*,
                COALESCE(u.unit_count, 0) AS unit_count,
                COALESCE(t.team_count, 0) AS team_count,
                COALESCE(w.worker_count, 0) AS worker_count,
                COALESCE(a.attendance_today, 0) AS attendance_today,
                CASE
                    WHEN COALESCE(w.worker_count, 0) = 0 THEN 0
                    ELSE ROUND(COALESCE(a.attendance_today, 0)::numeric * 100 / w.worker_count)::int
                END AS attendance_rate,
                COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'platform_name', pc.platform_name,
                            'platform_type', pc.platform_type,
                            'is_enabled', pc.is_enabled
                        )
                        ORDER BY pc.created_at
                    )
                    FROM construction_platform_configs pc
                    WHERE pc.project_id = p.id
                      AND pc.is_deleted = FALSE
                ), '[]'::jsonb) AS reporting_platforms
            FROM construction_projects p
            LEFT JOIN (
                SELECT project_id, COUNT(*)::int AS unit_count
                FROM construction_units
                WHERE is_deleted = FALSE
                GROUP BY project_id
            ) u ON u.project_id = p.id
            LEFT JOIN (
                SELECT project_id, COUNT(*)::int AS team_count
                FROM construction_teams
                WHERE is_deleted = FALSE
                GROUP BY project_id
            ) t ON t.project_id = p.id
            LEFT JOIN (
                SELECT project_id, COUNT(*)::int AS worker_count
                FROM construction_workers
                WHERE is_deleted = FALSE
                GROUP BY project_id
            ) w ON w.project_id = p.id
            LEFT JOIN (
                SELECT project_id, COUNT(*)::int AS attendance_today
                FROM construction_attendance_records
                WHERE is_deleted = FALSE
                    AND (trigger_time AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date
                GROUP BY project_id
            ) a ON a.project_id = p.id
            WHERE p.is_deleted = FALSE
        "#,
    );
    push_accessible_project_scope(&mut query, auth_user, "p.id");
    push_project_list_filters(&mut query, params);
    query.push(" ORDER BY p.created_at DESC");
    if paginated {
        query
            .push(" LIMIT ")
            .push_bind(params.page_size)
            .push(" OFFSET ")
            .push_bind(offset);
    }
    query.push(") r");

    query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

async fn fetch_project_total(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    params: &ProjectListParams,
) -> Result<i64, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT COUNT(*)::bigint FROM construction_projects p WHERE p.is_deleted = FALSE",
    );
    push_accessible_project_scope(&mut query, auth_user, "p.id");
    push_project_list_filters(&mut query, params);

    query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

fn push_project_list_filters(query: &mut QueryBuilder<'_, Postgres>, params: &ProjectListParams) {
    if !params.keyword.is_empty() {
        let pattern = format!("%{}%", params.keyword);
        query
            .push(" AND (p.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.address ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.contractor ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.build_unit ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.manager ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.work_permit ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.address_code_list ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
    if let Some(status) = params.status {
        query.push(" AND p.status = ").push_bind(status);
    }
}

pub async fn list_project_options(State(state): State<AppState>, uri: Uri) -> ApiResult<Value> {
    let (keyword, limit) = project_options_params(&uri);

    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.updated_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                id,
                name,
                work_permit,
                status,
                address,
                address_code_list,
                build_unit,
                contractor,
                updated_at
            FROM construction_projects
            WHERE is_deleted = FALSE
        "#,
    );

    if !keyword.is_empty() {
        let pattern = format!("%{keyword}%");
        query
            .push(
                r#"
                AND (
                    name ILIKE
                "#,
            )
            .push_bind(pattern.clone())
            .push(" OR work_permit ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR build_unit ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR contractor ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR address ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR address_code_list ILIKE ")
            .push_bind(pattern)
            .push(")");
    }

    query
        .push(" ORDER BY updated_at DESC LIMIT ")
        .push_bind(limit);
    query.push(") r");

    let rows = query
        .build_query_scalar::<Value>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(rows))
}

pub async fn list_accessible_project_options(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    uri: Uri,
) -> ApiResult<Value> {
    let (keyword, limit) = project_options_params(&uri);

    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.updated_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                p.id,
                p.name,
                p.work_permit,
                p.status,
                p.address,
                p.address_code_list,
                p.build_unit,
                p.contractor,
                p.updated_at
            FROM construction_projects p
            WHERE p.is_deleted = FALSE
        "#,
    );
    push_accessible_project_scope(&mut query, &auth_user, "p.id");

    if !keyword.is_empty() {
        let pattern = format!("%{keyword}%");
        query
            .push(" AND (p.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.work_permit ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.build_unit ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.contractor ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.address ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.address_code_list ILIKE ")
            .push_bind(pattern)
            .push(")");
    }

    query
        .push(" ORDER BY p.updated_at DESC LIMIT ")
        .push_bind(limit);
    query.push(") r");

    let rows = query
        .build_query_scalar::<Value>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(rows))
}

fn project_options_params(uri: &Uri) -> (String, i64) {
    let mut keyword = String::new();
    let mut limit = 30_i64;

    if let Some(query) = uri.query() {
        for pair in query.split('&') {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next().unwrap_or_default();
            let value = parts.next().unwrap_or_default();

            match key {
                "q" => keyword = decode_query_value(value),
                "limit" => {
                    limit = value.parse::<i64>().unwrap_or(30).clamp(1, 80);
                }
                _ => {}
            }
        }
    }

    (keyword.trim().to_owned(), limit)
}

fn project_list_params(uri: &Uri) -> Result<(bool, ProjectListParams), ApiError> {
    let mut has_query = false;
    let mut page = 1_i64;
    let mut page_size = 10_i64;
    let mut keyword = String::new();
    let mut status = None;

    if let Some(query) = uri.query() {
        has_query = true;
        for pair in query.split('&') {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next().unwrap_or_default();
            let value = decode_query_value(parts.next().unwrap_or_default());
            let trimmed = value.trim();

            match key {
                "page" => page = trimmed.parse::<i64>().unwrap_or(1).max(1),
                "page_size" => page_size = trimmed.parse::<i64>().unwrap_or(10).clamp(1, 100),
                "keyword" | "q" => keyword = trimmed.to_owned(),
                "status" if !trimmed.is_empty() && trimmed != "all" => {
                    status = Some(
                        trimmed
                            .parse::<i32>()
                            .map_err(|_| invalid_column_value("status", "integer"))?,
                    );
                }
                _ => {}
            }
        }
    }

    Ok((
        has_query,
        ProjectListParams {
            page,
            page_size,
            keyword: keyword.trim().to_owned(),
            status,
        },
    ))
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WageListParams {
    payroll_month: Option<chrono::NaiveDate>,
    status: Option<String>,
    page: i64,
    page_size: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProjectListParams {
    page: i64,
    page_size: i64,
    keyword: String,
    status: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ResourceListParams {
    view: ResourceListView,
    page: i64,
    page_size: i64,
    keyword: String,
    project_id: Option<Uuid>,
    unit_id: Option<Uuid>,
    team_id: Option<Uuid>,
    worker_id: Option<Uuid>,
    company_type: Option<i32>,
    salary_calc_type: Option<i16>,
    work_type: Option<i32>,
    settlement_type: Option<i16>,
    work_status: Option<i16>,
    auth_status: Option<AuthStatusFilter>,
    direction: Option<i16>,
    attendance_date: Option<chrono::NaiveDate>,
    attendance_month: Option<chrono::NaiveDate>,
    attendance_configured: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ModuleListParams {
    page: i64,
    page_size: i64,
    keyword: String,
    project_id: Option<Uuid>,
    worker_id: Option<Uuid>,
    attendance_device_id: Option<Uuid>,
    status: Option<String>,
    platform_type: Option<String>,
    operation: Option<String>,
    action: Option<String>,
    include_delete_actions: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ResourceListView {
    List,
    Calendar,
    Stats,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum AuthStatusFilter {
    Exact(i16),
    Unverified,
}

fn parse_auth_status_filter(value: &str) -> Result<AuthStatusFilter, ApiError> {
    match value {
        "unverified" | "not_verified" | "uncertified" => Ok(AuthStatusFilter::Unverified),
        _ => value
            .parse::<i16>()
            .map(AuthStatusFilter::Exact)
            .map_err(|_| invalid_column_value("auth_status", "integer or unverified")),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CsvCell {
    value: String,
    text: bool,
}

impl CsvCell {
    fn plain(value: impl Into<String>) -> Self {
        Self {
            value: value.into(),
            text: false,
        }
    }

    fn text(value: impl Into<String>) -> Self {
        Self {
            value: value.into(),
            text: true,
        }
    }
}

fn wage_list_params(uri: &Uri) -> Result<WageListParams, ApiError> {
    let mut payroll_month = None;
    let mut status = None;
    let mut page = 1_i64;
    let mut page_size = 10_i64;

    if let Some(query) = uri.query() {
        for pair in query.split('&') {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next().unwrap_or_default();
            let value = decode_query_value(parts.next().unwrap_or_default());

            match key {
                "payroll_month" if !value.trim().is_empty() => {
                    payroll_month = Some(parse_payroll_month(value.trim())?);
                }
                "status" if !value.trim().is_empty() && value != "all" => {
                    status = Some(value);
                }
                "page" => {
                    page = value.parse::<i64>().unwrap_or(1).max(1);
                }
                "page_size" => {
                    page_size = value.parse::<i64>().unwrap_or(10).clamp(1, 100);
                }
                _ => {}
            }
        }
    }

    Ok(WageListParams {
        payroll_month,
        status,
        page,
        page_size,
    })
}

fn resource_list_params(uri: &Uri) -> Result<ResourceListParams, ApiError> {
    let mut page = 1_i64;
    let mut page_size = 10_i64;
    let mut view = ResourceListView::List;
    let mut keyword = String::new();
    let mut project_id = None;
    let mut unit_id = None;
    let mut team_id = None;
    let mut worker_id = None;
    let mut company_type = None;
    let mut salary_calc_type = None;
    let mut work_type = None;
    let mut settlement_type = None;
    let mut work_status = None;
    let mut auth_status = None;
    let mut direction = None;
    let mut attendance_date = None;
    let mut attendance_month = None;
    let mut attendance_configured = None;

    if let Some(query) = uri.query() {
        for pair in query.split('&') {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next().unwrap_or_default();
            let value = decode_query_value(parts.next().unwrap_or_default());
            let trimmed = value.trim();

            match key {
                "keyword" | "q" => {
                    keyword = trimmed.to_owned();
                }
                "view" if trimmed == "calendar" => {
                    view = ResourceListView::Calendar;
                }
                "view" if trimmed == "stats" => {
                    view = ResourceListView::Stats;
                }
                "month" | "attendance_month" if !trimmed.is_empty() => {
                    attendance_month = Some(parse_payroll_month(trimmed)?);
                }
                "page" => {
                    page = trimmed.parse::<i64>().unwrap_or(1).max(1);
                }
                "page_size" => {
                    page_size = trimmed.parse::<i64>().unwrap_or(10).clamp(1, 100);
                }
                "project_id" if !trimmed.is_empty() => {
                    project_id = Some(
                        Uuid::parse_str(trimmed)
                            .map_err(|_| invalid_column_value("project_id", "uuid"))?,
                    );
                }
                "unit_id" if !trimmed.is_empty() => {
                    unit_id = Some(
                        Uuid::parse_str(trimmed)
                            .map_err(|_| invalid_column_value("unit_id", "uuid"))?,
                    );
                }
                "team_id" if !trimmed.is_empty() => {
                    team_id = Some(
                        Uuid::parse_str(trimmed)
                            .map_err(|_| invalid_column_value("team_id", "uuid"))?,
                    );
                }
                "worker_id" if !trimmed.is_empty() => {
                    worker_id = Some(
                        Uuid::parse_str(trimmed)
                            .map_err(|_| invalid_column_value("worker_id", "uuid"))?,
                    );
                }
                "company_type" if !trimmed.is_empty() => {
                    company_type = Some(
                        trimmed
                            .parse::<i32>()
                            .map_err(|_| invalid_column_value("company_type", "integer"))?,
                    );
                }
                "salary_calc_type" if !trimmed.is_empty() => {
                    salary_calc_type = Some(
                        trimmed
                            .parse::<i16>()
                            .map_err(|_| invalid_column_value("salary_calc_type", "integer"))?,
                    );
                }
                "work_type" if !trimmed.is_empty() => {
                    work_type = Some(
                        trimmed
                            .parse::<i32>()
                            .map_err(|_| invalid_column_value("work_type", "integer"))?,
                    );
                }
                "settlement_type" if !trimmed.is_empty() => {
                    settlement_type = Some(
                        trimmed
                            .parse::<i16>()
                            .map_err(|_| invalid_column_value("settlement_type", "integer"))?,
                    );
                }
                "work_status" if !trimmed.is_empty() => {
                    work_status = Some(
                        trimmed
                            .parse::<i16>()
                            .map_err(|_| invalid_column_value("work_status", "integer"))?,
                    );
                }
                "auth_status" if !trimmed.is_empty() => {
                    auth_status = Some(parse_auth_status_filter(trimmed)?);
                }
                "direction" if !trimmed.is_empty() => {
                    direction = Some(
                        trimmed
                            .parse::<i16>()
                            .map_err(|_| invalid_column_value("direction", "integer"))?,
                    );
                }
                "attendance_date" if !trimmed.is_empty() => {
                    attendance_date = Some(
                        chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
                            .map_err(|_| invalid_column_value("attendance_date", "YYYY-MM-DD"))?,
                    );
                }
                "attendance_configured" if !trimmed.is_empty() => {
                    attendance_configured = Some(trimmed == "true" || trimmed == "1");
                }
                _ => {}
            }
        }
    }

    Ok(ResourceListParams {
        view,
        page,
        page_size,
        keyword: keyword.trim().to_owned(),
        project_id,
        unit_id,
        team_id,
        worker_id,
        company_type,
        salary_calc_type,
        work_type,
        settlement_type,
        work_status,
        auth_status,
        direction,
        attendance_date,
        attendance_month,
        attendance_configured,
    })
}

fn module_list_params(uri: &Uri) -> Result<ModuleListParams, ApiError> {
    let mut page = 1_i64;
    let mut page_size = 10_i64;
    let mut keyword = String::new();
    let mut project_id = None;
    let mut worker_id = None;
    let mut attendance_device_id = None;
    let mut status = None;
    let mut platform_type = None;
    let mut operation = None;
    let mut action = None;
    let mut include_delete_actions = false;

    if let Some(query) = uri.query() {
        for pair in query.split('&') {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next().unwrap_or_default();
            let value = decode_query_value(parts.next().unwrap_or_default());
            let trimmed = value.trim();

            match key {
                "page" => page = trimmed.parse::<i64>().unwrap_or(1).max(1),
                "page_size" => page_size = trimmed.parse::<i64>().unwrap_or(10).clamp(1, 100),
                "keyword" | "q" => keyword = trimmed.to_owned(),
                "project_id" if !trimmed.is_empty() => {
                    project_id = Some(
                        Uuid::parse_str(trimmed)
                            .map_err(|_| invalid_column_value("project_id", "uuid"))?,
                    );
                }
                "worker_id" if !trimmed.is_empty() => {
                    worker_id = Some(
                        Uuid::parse_str(trimmed)
                            .map_err(|_| invalid_column_value("worker_id", "uuid"))?,
                    );
                }
                "attendance_device_id" if !trimmed.is_empty() => {
                    attendance_device_id = Some(
                        Uuid::parse_str(trimmed)
                            .map_err(|_| invalid_column_value("attendance_device_id", "uuid"))?,
                    );
                }
                "status" if !trimmed.is_empty() && trimmed != "all" => {
                    status = Some(trimmed.to_owned());
                }
                "platform_type" if !trimmed.is_empty() && trimmed != "all" => {
                    platform_type = Some(trimmed.to_owned());
                }
                "operation" if !trimmed.is_empty() && trimmed != "all" => {
                    operation = Some(trimmed.to_owned());
                }
                "action" if !trimmed.is_empty() && trimmed != "all" => {
                    if trimmed == "delete" {
                        include_delete_actions = true;
                    }
                    action = Some(trimmed.to_owned());
                }
                "include_delete_actions" | "include_delete" => {
                    include_delete_actions = matches!(trimmed, "1" | "true" | "yes");
                }
                _ => {}
            }
        }
    }

    Ok(ModuleListParams {
        page,
        page_size,
        keyword: keyword.trim().to_owned(),
        project_id,
        worker_id,
        attendance_device_id,
        status,
        platform_type,
        operation,
        action,
        include_delete_actions,
    })
}

fn parse_payroll_month(value: &str) -> Result<chrono::NaiveDate, ApiError> {
    if let Ok(date) = chrono::NaiveDate::parse_from_str(&format!("{value}-01"), "%Y-%m-%d") {
        return Ok(date);
    }
    if let Ok(date) = chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        return chrono::NaiveDate::from_ymd_opt(date.year(), date.month(), 1)
            .ok_or_else(|| invalid_column_value("payroll_month", "YYYY-MM"));
    }
    Err(invalid_column_value("payroll_month", "YYYY-MM"))
}

fn build_csv(headers: &[&str], rows: &[Vec<CsvCell>]) -> String {
    let mut lines = Vec::with_capacity(rows.len() + 1);
    lines.push(
        headers
            .iter()
            .map(|header| escape_csv_cell(&CsvCell::plain(*header)))
            .collect::<Vec<_>>()
            .join(","),
    );
    for row in rows {
        lines.push(
            row.iter()
                .map(escape_csv_cell)
                .collect::<Vec<_>>()
                .join(","),
        );
    }
    format!("\u{feff}{}", lines.join("\r\n"))
}

fn escape_csv_cell(cell: &CsvCell) -> String {
    let value = cell.value.replace('"', "\"\"");
    if cell.text && !value.contains([',', '\r', '\n']) {
        return format!("=\"{value}\"");
    }
    let output = if cell.text {
        format!("=\"{value}\"")
    } else {
        value
    };
    if output.contains([',', '"', '\r', '\n']) {
        format!("\"{}\"", output.replace('"', "\"\""))
    } else {
        output
    }
}

fn decode_query_value(value: &str) -> String {
    let normalized = value.replace('+', " ");
    percent_decode_str(&normalized)
        .decode_utf8_lossy()
        .into_owned()
}

#[derive(Debug)]
struct WageBatchPayload {
    payroll_month: chrono::NaiveDate,
    company_name: Option<String>,
    employee_count: i32,
    payable_amount_cents: i64,
    paid_amount_cents: i64,
    unpaid_amount_cents: i64,
    status: String,
    remark: Option<String>,
    rows: Vec<WageImportRow>,
}

#[derive(Debug)]
struct WageBatchPatchPayload {
    payroll_month: Option<chrono::NaiveDate>,
    company_name: Option<String>,
    employee_count: Option<i32>,
    payable_amount_cents: Option<i64>,
    paid_amount_cents: Option<i64>,
    unpaid_amount_cents: Option<i64>,
    status: Option<String>,
    remark: Option<String>,
    rows: Option<Vec<WageImportRow>>,
}

#[derive(Debug)]
struct WageImportPayload {
    payroll_month: chrono::NaiveDate,
    company_name: Option<String>,
    status: String,
    remark: Option<String>,
    rows: Vec<WageImportRow>,
}

#[derive(Debug)]
struct WageImportRow {
    worker_id: Option<Uuid>,
    worker_name: Option<String>,
    id_card: Option<String>,
    team_name: Option<String>,
    attendance_days: Option<String>,
    monthly_settlement: Option<String>,
    daily_settlement: Option<String>,
    wage_card_number: Option<String>,
    wage_bank: Option<String>,
    payable_amount_cents: i64,
    paid_amount_cents: i64,
    adjustment_amount_cents: i64,
    unpaid_amount_cents: i64,
    adjustment_reason: Option<String>,
}

#[derive(Debug)]
struct WageExportRow {
    payroll_month: chrono::NaiveDate,
    company_name: Option<String>,
    worker_name: Option<String>,
    id_card: Option<String>,
    team_name: Option<String>,
    attendance_days: Option<String>,
    monthly_settlement: Option<String>,
    daily_settlement: Option<String>,
    wage_card_number: Option<String>,
    wage_bank: Option<String>,
    payable_amount_cents: i64,
    paid_amount_cents: i64,
    adjustment_amount_cents: i64,
    unpaid_amount_cents: i64,
    adjustment_reason: Option<String>,
    status: String,
}

fn wage_batch_payload(body: &Value) -> Result<WageBatchPayload, ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| invalid_input("Request body must be a JSON object"))?;
    let payroll_month = required_payroll_month(object.get("payroll_month"))?;
    let rows = optional_wage_rows(object.get("rows"), true)?.unwrap_or_default();
    let (
        row_employee_count,
        row_payable_amount_cents,
        row_paid_amount_cents,
        row_unpaid_amount_cents,
    ) = wage_rows_summary(&rows)?;
    let has_rows = !rows.is_empty();
    let employee_count = if has_rows {
        row_employee_count
    } else {
        optional_nonnegative_i32(object.get("employee_count"), "employee_count")?.unwrap_or(0)
    };
    let payable_amount_cents = if has_rows {
        row_payable_amount_cents
    } else {
        amount_from_object(object, "payable_amount_cents", "payable_amount")?.unwrap_or(0)
    };
    let paid_amount_cents = if has_rows {
        row_paid_amount_cents
    } else {
        amount_from_object(object, "paid_amount_cents", "paid_amount")?.unwrap_or(0)
    };
    let unpaid_amount_cents = if has_rows {
        row_unpaid_amount_cents
    } else {
        amount_from_object(object, "unpaid_amount_cents", "unpaid_amount")?
            .unwrap_or_else(|| payable_amount_cents.saturating_sub(paid_amount_cents))
    };

    Ok(WageBatchPayload {
        payroll_month,
        company_name: optional_string(object.get("company_name")),
        employee_count,
        payable_amount_cents,
        paid_amount_cents,
        unpaid_amount_cents,
        status: optional_string(object.get("status")).unwrap_or_else(|| "draft".to_string()),
        remark: optional_string(object.get("remark")),
        rows,
    })
}

fn wage_batch_patch_payload(body: &Value) -> Result<WageBatchPatchPayload, ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| invalid_input("Request body must be a JSON object"))?;

    Ok(WageBatchPatchPayload {
        payroll_month: object
            .get("payroll_month")
            .map(|value| required_payroll_month(Some(value)))
            .transpose()?,
        company_name: optional_string(object.get("company_name")),
        employee_count: optional_nonnegative_i32(object.get("employee_count"), "employee_count")?,
        payable_amount_cents: amount_from_object(object, "payable_amount_cents", "payable_amount")?,
        paid_amount_cents: amount_from_object(object, "paid_amount_cents", "paid_amount")?,
        unpaid_amount_cents: amount_from_object(object, "unpaid_amount_cents", "unpaid_amount")?,
        status: optional_string(object.get("status")),
        remark: optional_string(object.get("remark")),
        rows: optional_wage_rows(object.get("rows"), true)?,
    })
}

fn wage_import_payload(body: &Value) -> Result<WageImportPayload, ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| invalid_input("Request body must be a JSON object"))?;
    let rows = object
        .get("rows")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid_input("rows must be an array"))?;
    if rows.is_empty() {
        return Err(invalid_input("Excel 没有可导入的工资明细"));
    }

    let mut parsed_rows = Vec::with_capacity(rows.len());
    for (index, row) in rows.iter().enumerate() {
        parsed_rows.push(wage_import_row(row, false).map_err(|error| {
            ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_message(format!(
                    "第 {} 行工资数据无效: {}",
                    index + 1,
                    error.message
                ))
        })?);
    }

    Ok(WageImportPayload {
        payroll_month: required_payroll_month(object.get("payroll_month"))?,
        company_name: optional_string(object.get("company_name")),
        status: optional_string(object.get("status")).unwrap_or_else(|| "imported".to_string()),
        remark: optional_string(object.get("remark")),
        rows: parsed_rows,
    })
}

fn optional_wage_rows(
    value: Option<&Value>,
    allow_empty_amounts: bool,
) -> Result<Option<Vec<WageImportRow>>, ApiError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let rows = value
        .as_array()
        .ok_or_else(|| invalid_input("rows must be an array"))?;
    let mut parsed_rows = Vec::with_capacity(rows.len());
    for (index, row) in rows.iter().enumerate() {
        parsed_rows.push(wage_import_row(row, allow_empty_amounts).map_err(|error| {
            ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_message(format!(
                    "第 {} 行工资明细无效: {}",
                    index + 1,
                    error.message
                ))
        })?);
    }
    Ok(Some(parsed_rows))
}

fn wage_import_row(row: &Value, allow_empty_amounts: bool) -> Result<WageImportRow, ApiError> {
    let object = row
        .as_object()
        .ok_or_else(|| invalid_input("row must be a JSON object"))?;
    let payable_amount_cents =
        amount_from_object(object, "payable_amount_cents", "payable_amount")?.unwrap_or(0);
    let paid_amount_cents =
        amount_from_object(object, "paid_amount_cents", "paid_amount")?.unwrap_or(0);
    if !allow_empty_amounts && payable_amount_cents == 0 && paid_amount_cents == 0 {
        return Err(invalid_input("应发或实发金额不能为空"));
    }

    Ok(WageImportRow {
        worker_id: object
            .get("worker_id")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(|value| {
                Uuid::parse_str(value.trim()).map_err(|_| invalid_column_value("worker_id", "uuid"))
            })
            .transpose()?,
        worker_name: optional_string(object.get("worker_name")),
        id_card: optional_string(object.get("id_card")),
        team_name: optional_string(object.get("team_name")),
        attendance_days: optional_string(object.get("attendance_days")),
        monthly_settlement: optional_string(object.get("monthly_settlement")),
        daily_settlement: optional_string(object.get("daily_settlement")),
        wage_card_number: optional_string(object.get("wage_card_number")),
        wage_bank: optional_string(object.get("wage_bank")),
        payable_amount_cents,
        paid_amount_cents,
        adjustment_amount_cents: amount_from_object(
            object,
            "adjustment_amount_cents",
            "adjustment_amount",
        )?
        .unwrap_or(0),
        unpaid_amount_cents: amount_from_object(object, "unpaid_amount_cents", "unpaid_amount")?
            .unwrap_or_else(|| payable_amount_cents.saturating_sub(paid_amount_cents)),
        adjustment_reason: optional_string(object.get("adjustment_reason")),
    })
}

fn wage_rows_summary(rows: &[WageImportRow]) -> Result<(i32, i64, i64, i64), ApiError> {
    Ok((
        i32::try_from(rows.len()).map_err(|_| invalid_input("Too many wage rows"))?,
        rows.iter().map(|row| row.payable_amount_cents).sum(),
        rows.iter().map(|row| row.paid_amount_cents).sum(),
        rows.iter().map(|row| row.unpaid_amount_cents).sum(),
    ))
}

async fn fetch_wage_batch_items(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    params: &WageListParams,
) -> Result<Value, ApiError> {
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.payroll_month DESC, r.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                b.*,
                COALESCE(created_user.username, created_user.email) AS created_by_name,
                COALESCE(updated_user.username, updated_user.email) AS updated_by_name,
                COALESCE((
                    SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at ASC)
                    FROM construction_wage_items i
                    WHERE i.batch_id = b.id
                        AND i.project_id = b.project_id
                        AND i.is_deleted = FALSE
                ), '[]'::jsonb) AS items
            FROM construction_wage_batches b
            LEFT JOIN users created_user ON created_user.id = b.created_by_user_id
            LEFT JOIN users updated_user ON updated_user.id = b.updated_by_user_id
            WHERE b.project_id =
        "#,
    );
    query.push_bind(project_id);
    push_wage_list_filters(&mut query, params);
    query
        .push(" ORDER BY b.payroll_month DESC, b.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") r");

    query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

async fn fetch_wage_batch_total(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    params: &WageListParams,
) -> Result<i64, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COUNT(*)::bigint
        FROM construction_wage_batches b
        WHERE b.project_id =
        "#,
    );
    query.push_bind(project_id);
    push_wage_list_filters(&mut query, params);

    query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

async fn fetch_wage_batch_summary(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    params: &WageListParams,
) -> Result<Value, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT jsonb_build_object(
            'employee_count', COALESCE(SUM(b.employee_count), 0),
            'payable_amount_cents', COALESCE(SUM(b.payable_amount_cents), 0),
            'paid_amount_cents', COALESCE(SUM(b.paid_amount_cents), 0),
            'unpaid_amount_cents', COALESCE(SUM(b.unpaid_amount_cents), 0)
        )
        FROM construction_wage_batches b
        WHERE b.project_id =
        "#,
    );
    query.push_bind(project_id);
    push_wage_list_filters(&mut query, params);

    query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

async fn fetch_wage_export_rows(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    params: &WageListParams,
) -> Result<Vec<WageExportRow>, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT
            b.payroll_month,
            b.company_name,
            i.worker_name,
            i.id_card,
            i.team_name,
            i.attendance_days,
            i.monthly_settlement,
            i.daily_settlement,
            i.wage_card_number,
            i.wage_bank,
            COALESCE(i.payable_amount_cents, b.payable_amount_cents) AS payable_amount_cents,
            COALESCE(i.paid_amount_cents, b.paid_amount_cents) AS paid_amount_cents,
            COALESCE(i.adjustment_amount_cents, 0) AS adjustment_amount_cents,
            COALESCE(i.unpaid_amount_cents, b.unpaid_amount_cents) AS unpaid_amount_cents,
            i.adjustment_reason,
            b.status
        FROM construction_wage_batches b
        LEFT JOIN construction_wage_items i
            ON i.batch_id = b.id
            AND i.is_deleted = FALSE
        WHERE b.project_id =
        "#,
    );
    query.push_bind(project_id);
    push_wage_list_filters(&mut query, params);
    query.push(" ORDER BY b.payroll_month DESC, b.created_at DESC, i.created_at ASC");

    let rows = query.build().fetch_all(pool).await.map_err(db_error)?;

    rows.into_iter()
        .map(|row| {
            Ok(WageExportRow {
                payroll_month: row.try_get("payroll_month").map_err(db_error)?,
                company_name: row.try_get("company_name").map_err(db_error)?,
                worker_name: row.try_get("worker_name").map_err(db_error)?,
                id_card: row.try_get("id_card").map_err(db_error)?,
                team_name: row.try_get("team_name").map_err(db_error)?,
                attendance_days: row.try_get("attendance_days").map_err(db_error)?,
                monthly_settlement: row.try_get("monthly_settlement").map_err(db_error)?,
                daily_settlement: row.try_get("daily_settlement").map_err(db_error)?,
                wage_card_number: row.try_get("wage_card_number").map_err(db_error)?,
                wage_bank: row.try_get("wage_bank").map_err(db_error)?,
                payable_amount_cents: row.try_get("payable_amount_cents").map_err(db_error)?,
                paid_amount_cents: row.try_get("paid_amount_cents").map_err(db_error)?,
                adjustment_amount_cents: row
                    .try_get("adjustment_amount_cents")
                    .map_err(db_error)?,
                unpaid_amount_cents: row.try_get("unpaid_amount_cents").map_err(db_error)?,
                adjustment_reason: row.try_get("adjustment_reason").map_err(db_error)?,
                status: row.try_get("status").map_err(db_error)?,
            })
        })
        .collect()
}

fn push_wage_list_filters(query: &mut QueryBuilder<'_, Postgres>, params: &WageListParams) {
    query.push(" AND b.is_deleted = FALSE");
    if let Some(payroll_month) = params.payroll_month {
        query
            .push(" AND b.payroll_month = ")
            .push_bind(payroll_month);
    }
    if let Some(status) = &params.status {
        query.push(" AND b.status = ").push_bind(status.clone());
    }
}

fn build_wage_export_csv(rows: Vec<WageExportRow>) -> String {
    build_csv(
        &[
            "发放月份",
            "企业名称",
            "姓名",
            "身份证",
            "所属班组",
            "考勤天数（天）",
            "工资按月结算",
            "工资按天结算",
            "工资卡号",
            "工资卡银行",
            "应发工资（元）",
            "实发工资（元）",
            "调整工资（元）",
            "本次未发（元）",
            "工资调整理由",
            "状态",
        ],
        &rows
            .into_iter()
            .map(|row| {
                vec![
                    CsvCell::plain(row.payroll_month.format("%Y-%m").to_string()),
                    CsvCell::plain(row.company_name.unwrap_or_default()),
                    CsvCell::plain(row.worker_name.unwrap_or_default()),
                    CsvCell::text(row.id_card.unwrap_or_default()),
                    CsvCell::plain(row.team_name.unwrap_or_default()),
                    CsvCell::plain(row.attendance_days.unwrap_or_default()),
                    CsvCell::plain(row.monthly_settlement.unwrap_or_default()),
                    CsvCell::plain(row.daily_settlement.unwrap_or_default()),
                    CsvCell::text(row.wage_card_number.unwrap_or_default()),
                    CsvCell::plain(row.wage_bank.unwrap_or_default()),
                    CsvCell::plain(cents_to_yuan(row.payable_amount_cents)),
                    CsvCell::plain(cents_to_yuan(row.paid_amount_cents)),
                    CsvCell::plain(cents_to_yuan(row.adjustment_amount_cents)),
                    CsvCell::plain(cents_to_yuan(row.unpaid_amount_cents)),
                    CsvCell::plain(row.adjustment_reason.unwrap_or_default()),
                    CsvCell::plain(row.status),
                ]
            })
            .collect::<Vec<_>>(),
    )
}

const WORKER_ADVANCED_EXPORT_FORMATS: &[&str] = &[
    "worker_basic",
    "worker_bank",
    "worker_photos",
    "worker_json",
];
const ATTENDANCE_ADVANCED_EXPORT_FORMATS: &[&str] = &[
    "attendance_time",
    "attendance_status",
    "work_hours",
    "work_record",
    "attendance_records",
    "attendance_json",
];

#[derive(Debug, Clone)]
struct ProjectAdvancedExportParams {
    formats: Vec<String>,
    keyword: String,
    unit_id: Option<Uuid>,
    unit_ids: Vec<Uuid>,
    team_id: Option<Uuid>,
    team_ids: Vec<Uuid>,
    worker_ids: Vec<Uuid>,
    work_status: Option<i16>,
    work_type: Option<i32>,
    direction: Option<i16>,
    attendance_date: Option<chrono::NaiveDate>,
    attendance_month: chrono::NaiveDate,
    attendance_filter: String,
    sort_by: String,
}

#[derive(Clone, Serialize)]
struct ProjectExportWorker {
    id: String,
    project_name: String,
    unit_name: String,
    team_name: String,
    name: String,
    gender: String,
    id_card: String,
    phone: String,
    work_type: String,
    worker_type: String,
    work_status: String,
    entry_time: String,
    exit_time: String,
    address: String,
    current_address: String,
    settlement_type: String,
    unit_price: String,
    salary_bank_card: String,
    salary_bank: String,
}

#[derive(Clone, Serialize)]
struct ProjectExportAttendanceRecord {
    id: String,
    worker_id: String,
    project_name: String,
    worker_name: String,
    id_card: String,
    phone: String,
    unit_name: String,
    team_name: String,
    direction: String,
    direction_value: i16,
    trigger_time: String,
    attendance_date: String,
    attendance_time: String,
    equipment_id: String,
    serial_number: String,
    photo_path: String,
    overall_photo: String,
    closeup_photo: String,
}

fn project_export_params(
    body: &Value,
    allowed_formats: &[&str],
    default_formats: &[&str],
) -> Result<ProjectAdvancedExportParams, ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| invalid_input("Request body must be a JSON object"))?;
    let today = chrono::Utc::now().date_naive();
    let default_month = chrono::NaiveDate::from_ymd_opt(today.year(), today.month(), 1)
        .ok_or_else(|| invalid_column_value("attendance_month", "YYYY-MM"))?;

    Ok(ProjectAdvancedExportParams {
        formats: parse_export_formats(object.get("formats"), allowed_formats, default_formats)?,
        keyword: export_string_from_keys(object, &["keyword", "q", "name"]).unwrap_or_default(),
        unit_id: export_uuid_from_keys(
            object,
            &[
                "unit_id",
                "unitId",
                "participating_unit_id",
                "participatingUnitId",
            ],
        )?,
        unit_ids: export_uuid_list_from_keys(
            object,
            &[
                "unit_ids",
                "unitIds",
                "participating_unit_ids",
                "participatingUnitIds",
            ],
        )?,
        team_id: export_uuid_from_keys(object, &["team_id", "teamId"])?,
        team_ids: export_uuid_list_from_keys(object, &["team_ids", "teamIds"])?,
        worker_ids: export_uuid_list_from_keys(object, &["worker_ids", "workerIds"])?,
        work_status: export_i16_from_keys(object, &["work_status", "workStatus"])?,
        work_type: export_i32_from_keys(object, &["work_type", "workType"])?,
        direction: export_i16_from_keys(object, &["direction"])?,
        attendance_date: export_date_from_keys(object, &["attendance_date", "attendanceDate"])?,
        attendance_month: export_month_from_keys(
            object,
            &["attendance_month", "attendanceMonth", "month", "date"],
        )?
        .unwrap_or(default_month),
        attendance_filter: export_string_from_keys(
            object,
            &["attendance_filter", "attendanceFilter"],
        )
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "all".to_owned()),
        sort_by: export_string_from_keys(object, &["sort_by", "sortBy"])
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "attendance_days_desc".to_owned()),
    })
}

fn parse_export_formats(
    value: Option<&Value>,
    allowed_formats: &[&str],
    default_formats: &[&str],
) -> Result<Vec<String>, ApiError> {
    let mut formats = Vec::new();
    match value {
        Some(Value::Array(items)) => {
            for item in items {
                if let Some(value) = value_as_clean_string(item) {
                    formats.push(value);
                }
            }
        }
        Some(value) => {
            if let Some(value) = value_as_clean_string(value) {
                formats.extend(
                    value
                        .split(',')
                        .map(str::trim)
                        .filter(|item| !item.is_empty())
                        .map(str::to_owned),
                );
            }
        }
        None => {}
    }

    if formats.is_empty() {
        formats = default_formats
            .iter()
            .map(|item| (*item).to_owned())
            .collect();
    }

    let mut deduped = Vec::with_capacity(formats.len());
    for format in formats {
        if !allowed_formats.contains(&format.as_str()) {
            return Err(invalid_column_value("formats", &allowed_formats.join(",")));
        }
        if !deduped.contains(&format) {
            deduped.push(format);
        }
    }
    Ok(deduped)
}

fn export_string_from_keys(
    object: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .find_map(|key| object.get(*key).and_then(value_as_clean_string))
}

fn export_uuid_from_keys(
    object: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> Result<Option<Uuid>, ApiError> {
    let Some(value) = keys.iter().find_map(|key| object.get(*key)) else {
        return Ok(None);
    };
    let Some(value) = value_as_clean_string(value) else {
        return Ok(None);
    };
    if value == "0" || value == "all" {
        return Ok(None);
    }
    Uuid::parse_str(&value)
        .map(Some)
        .map_err(|_| invalid_column_value(keys[0], "uuid"))
}

fn export_uuid_list_from_keys(
    object: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> Result<Vec<Uuid>, ApiError> {
    let Some(value) = keys.iter().find_map(|key| object.get(*key)) else {
        return Ok(Vec::new());
    };
    let raw_values = match value {
        Value::Array(items) => items
            .iter()
            .filter_map(value_as_clean_string)
            .collect::<Vec<_>>(),
        value => value_as_clean_string(value)
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_owned)
            .collect::<Vec<_>>(),
    };

    let mut ids = Vec::new();
    for value in raw_values {
        if value == "0" || value == "all" {
            continue;
        }
        let id = Uuid::parse_str(&value).map_err(|_| invalid_column_value(keys[0], "uuid[]"))?;
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    Ok(ids)
}

fn export_i16_from_keys(
    object: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> Result<Option<i16>, ApiError> {
    let Some(value) = keys.iter().find_map(|key| object.get(*key)) else {
        return Ok(None);
    };
    let Some(value) = value_as_clean_string(value) else {
        return Ok(None);
    };
    if value == "all" || value == "0_all" {
        return Ok(None);
    }
    match value.as_str() {
        "active" => return Ok(Some(1)),
        "inactive" => return Ok(Some(2)),
        _ => {}
    }
    value
        .parse::<i16>()
        .map(Some)
        .map_err(|_| invalid_column_value(keys[0], "integer"))
}

fn export_i32_from_keys(
    object: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> Result<Option<i32>, ApiError> {
    let Some(value) = keys.iter().find_map(|key| object.get(*key)) else {
        return Ok(None);
    };
    let Some(value) = value_as_clean_string(value) else {
        return Ok(None);
    };
    if value == "all" {
        return Ok(None);
    }
    value
        .parse::<i32>()
        .map(Some)
        .map_err(|_| invalid_column_value(keys[0], "integer"))
}

fn export_date_from_keys(
    object: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> Result<Option<chrono::NaiveDate>, ApiError> {
    let Some(value) = export_string_from_keys(object, keys) else {
        return Ok(None);
    };
    if value == "all" {
        return Ok(None);
    }
    chrono::NaiveDate::parse_from_str(&value, "%Y-%m-%d")
        .map(Some)
        .map_err(|_| invalid_column_value(keys[0], "YYYY-MM-DD"))
}

fn export_month_from_keys(
    object: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> Result<Option<chrono::NaiveDate>, ApiError> {
    let Some(value) = export_string_from_keys(object, keys) else {
        return Ok(None);
    };
    if value == "all" {
        return Ok(None);
    }
    parse_payroll_month(&value).map(Some)
}

fn value_as_clean_string(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(value) => {
            let value = value.trim();
            if value.is_empty() {
                None
            } else {
                Some(value.to_owned())
            }
        }
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        Value::Array(_) | Value::Object(_) => None,
    }
}

async fn fetch_project_export_workers(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    project_id: Uuid,
    params: &ProjectAdvancedExportParams,
) -> Result<Vec<ProjectExportWorker>, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
SELECT
    w.id::text AS id,
    COALESCE(p.name, '未命名项目') AS project_name,
    COALESCE(u.company_name, '') AS unit_name,
    COALESCE(t.name, '') AS team_name,
    COALESCE(w.name, '') AS name,
    COALESCE(w.id_card, '') AS id_card,
    COALESCE(w.phone, '') AS phone,
    COALESCE(w.gender, 1)::smallint AS gender,
    w.work_type AS work_type,
    w.worker_type AS worker_type,
    COALESCE(w.work_status, 1)::smallint AS work_status,
    w.settlement_type AS settlement_type,
    COALESCE(to_char(w.entry_time, 'YYYY-MM-DD'), '') AS entry_time,
    COALESCE(to_char(w.exit_time, 'YYYY-MM-DD'), '') AS exit_time,
    COALESCE(w.address, '') AS address,
    COALESCE(w.current_address, '') AS current_address,
    COALESCE(w.unit_price::text, '') AS unit_price,
    COALESCE(w.salary_bank_card, '') AS salary_bank_card,
    COALESCE(w.salary_bank, '') AS salary_bank
FROM construction_workers w
JOIN construction_projects p ON p.id = w.project_id AND p.is_deleted = FALSE
LEFT JOIN construction_units u ON u.id = w.unit_id AND u.is_deleted = FALSE
LEFT JOIN construction_teams t ON t.id = w.team_id AND t.is_deleted = FALSE
WHERE w.is_deleted = FALSE
  AND w.project_id =
"#,
    );
    query.push_bind(project_id);
    push_accessible_project_scope(&mut query, auth_user, "w.project_id");
    push_project_worker_export_filters(&mut query, params);
    query.push(" ORDER BY w.entry_time ASC NULLS LAST, w.created_at ASC");

    let rows = query.build().fetch_all(pool).await.map_err(db_error)?;
    rows.into_iter()
        .map(|row| {
            let gender: i16 = row.try_get("gender").map_err(db_error)?;
            let work_status: i16 = row.try_get("work_status").map_err(db_error)?;
            let work_type: Option<i32> = row.try_get("work_type").map_err(db_error)?;
            let worker_type: Option<i32> = row.try_get("worker_type").map_err(db_error)?;
            let settlement_type: Option<i16> = row.try_get("settlement_type").map_err(db_error)?;

            Ok(ProjectExportWorker {
                id: row.try_get("id").map_err(db_error)?,
                project_name: row.try_get("project_name").map_err(db_error)?,
                unit_name: row.try_get("unit_name").map_err(db_error)?,
                team_name: row.try_get("team_name").map_err(db_error)?,
                name: row.try_get("name").map_err(db_error)?,
                gender: gender_label(gender).to_owned(),
                id_card: row.try_get("id_card").map_err(db_error)?,
                phone: row.try_get("phone").map_err(db_error)?,
                work_type: work_type_label(work_type),
                worker_type: worker_type_label(worker_type),
                work_status: worker_status_label(work_status).to_owned(),
                entry_time: row.try_get("entry_time").map_err(db_error)?,
                exit_time: row.try_get("exit_time").map_err(db_error)?,
                address: row.try_get("address").map_err(db_error)?,
                current_address: row.try_get("current_address").map_err(db_error)?,
                settlement_type: settlement_type_label(settlement_type),
                unit_price: row.try_get("unit_price").map_err(db_error)?,
                salary_bank_card: row.try_get("salary_bank_card").map_err(db_error)?,
                salary_bank: row.try_get("salary_bank").map_err(db_error)?,
            })
        })
        .collect()
}

fn push_project_worker_export_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    params: &ProjectAdvancedExportParams,
) {
    if !params.keyword.is_empty() {
        let pattern = format!("%{}%", params.keyword);
        query
            .push(" AND (w.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR w.id_card ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR w.phone ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR u.company_name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR t.name ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
    if !params.unit_ids.is_empty() {
        push_uuid_list_filter(query, "w.unit_id", &params.unit_ids);
    } else if let Some(unit_id) = params.unit_id {
        query.push(" AND w.unit_id = ").push_bind(unit_id);
    }
    if !params.team_ids.is_empty() {
        push_uuid_list_filter(query, "w.team_id", &params.team_ids);
    } else if let Some(team_id) = params.team_id {
        query.push(" AND w.team_id = ").push_bind(team_id);
    }
    if let Some(work_type) = params.work_type {
        query.push(" AND w.work_type = ").push_bind(work_type);
    }
    if let Some(work_status) = params.work_status {
        query.push(" AND w.work_status = ").push_bind(work_status);
    }
    push_uuid_list_filter(query, "w.id", &params.worker_ids);
}

async fn fetch_project_export_attendance_records(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    project_id: Uuid,
    worker_ids: &[String],
    params: &ProjectAdvancedExportParams,
) -> Result<Vec<ProjectExportAttendanceRecord>, ApiError> {
    if worker_ids.is_empty() {
        return Ok(Vec::new());
    }
    let worker_uuids = worker_ids
        .iter()
        .map(|id| Uuid::parse_str(id).map_err(|_| invalid_column_value("worker_ids", "uuid[]")))
        .collect::<Result<Vec<_>, _>>()?;
    let next_month = next_month(params.attendance_month)?;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
SELECT
    r.id::text AS id,
    w.id::text AS worker_id,
    COALESCE(p.name, '未命名项目') AS project_name,
    COALESCE(w.name, '') AS worker_name,
    COALESCE(w.id_card, '') AS id_card,
    COALESCE(w.phone, '') AS phone,
    COALESCE(u.company_name, '') AS unit_name,
    COALESCE(t.name, '') AS team_name,
    COALESCE(r.direction, 0)::smallint AS direction_value,
    to_char(r.trigger_time AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS trigger_time,
    to_char(r.trigger_time AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS attendance_date,
    to_char(r.trigger_time AT TIME ZONE 'Asia/Shanghai', 'HH24:MI:SS') AS attendance_time,
    COALESCE(r.equipment_id, '') AS equipment_id,
    COALESCE(r.serial_number, '') AS serial_number,
    COALESCE(r.photo_path, '') AS photo_path,
    COALESCE(r.overall_photo, overall_photo.photo_data, '') AS overall_photo,
    COALESCE(r.closeup_photo, closeup_photo.photo_data, '') AS closeup_photo
FROM construction_attendance_records r
JOIN construction_projects p ON p.id = r.project_id AND p.is_deleted = FALSE
JOIN construction_workers w ON w.id = r.worker_id AND w.is_deleted = FALSE
LEFT JOIN construction_units u ON u.id = w.unit_id AND u.is_deleted = FALSE
LEFT JOIN construction_teams t ON t.id = w.team_id AND t.is_deleted = FALSE
LEFT JOIN LATERAL (
    SELECT photo_data
    FROM construction_attendance_record_photos photo
    WHERE photo.attendance_record_id = r.id
      AND photo.photo_kind = 'overall'
    ORDER BY photo.created_at DESC, photo.id DESC
    LIMIT 1
) overall_photo ON TRUE
LEFT JOIN LATERAL (
    SELECT photo_data
    FROM construction_attendance_record_photos photo
    WHERE photo.attendance_record_id = r.id
      AND photo.photo_kind = 'closeup'
    ORDER BY photo.created_at DESC, photo.id DESC
    LIMIT 1
) closeup_photo ON TRUE
WHERE r.is_deleted = FALSE
  AND r.project_id =
"#,
    );
    query.push_bind(project_id);
    push_accessible_project_scope(&mut query, auth_user, "r.project_id");
    push_uuid_list_filter(&mut query, "r.worker_id", &worker_uuids);
    if let Some(attendance_date) = params.attendance_date {
        query
            .push(" AND (r.trigger_time AT TIME ZONE 'Asia/Shanghai')::date = ")
            .push_bind(attendance_date);
    } else {
        query
            .push(" AND (r.trigger_time AT TIME ZONE 'Asia/Shanghai')::date >= ")
            .push_bind(params.attendance_month)
            .push(" AND (r.trigger_time AT TIME ZONE 'Asia/Shanghai')::date < ")
            .push_bind(next_month);
    }
    if let Some(direction) = params.direction {
        query.push(" AND r.direction = ").push_bind(direction);
    }
    query.push(" ORDER BY r.trigger_time ASC");

    let rows = query.build().fetch_all(pool).await.map_err(db_error)?;
    rows.into_iter()
        .map(|row| {
            let direction_value: i16 = row.try_get("direction_value").map_err(db_error)?;
            Ok(ProjectExportAttendanceRecord {
                id: row.try_get("id").map_err(db_error)?,
                worker_id: row.try_get("worker_id").map_err(db_error)?,
                project_name: row.try_get("project_name").map_err(db_error)?,
                worker_name: row.try_get("worker_name").map_err(db_error)?,
                id_card: row.try_get("id_card").map_err(db_error)?,
                phone: row.try_get("phone").map_err(db_error)?,
                unit_name: row.try_get("unit_name").map_err(db_error)?,
                team_name: row.try_get("team_name").map_err(db_error)?,
                direction: direction_label(direction_value).to_owned(),
                direction_value,
                trigger_time: row.try_get("trigger_time").map_err(db_error)?,
                attendance_date: row.try_get("attendance_date").map_err(db_error)?,
                attendance_time: row.try_get("attendance_time").map_err(db_error)?,
                equipment_id: row.try_get("equipment_id").map_err(db_error)?,
                serial_number: row.try_get("serial_number").map_err(db_error)?,
                photo_path: row.try_get("photo_path").map_err(db_error)?,
                overall_photo: row.try_get("overall_photo").map_err(db_error)?,
                closeup_photo: row.try_get("closeup_photo").map_err(db_error)?,
            })
        })
        .collect()
}

fn push_uuid_list_filter(
    query: &mut QueryBuilder<'_, Postgres>,
    expression: &'static str,
    values: &[Uuid],
) {
    if values.is_empty() {
        return;
    }
    query.push(" AND ").push(expression).push(" IN (");
    let mut separated = query.separated(", ");
    for value in values {
        separated.push_bind(*value);
    }
    separated.push_unseparated(")");
}

fn build_worker_full_csv(workers: &[ProjectExportWorker]) -> String {
    build_csv(
        &[
            "项目",
            "参建单位",
            "班组",
            "姓名",
            "性别",
            "身份证号",
            "手机号",
            "工种",
            "工人类型",
            "状态",
            "进场日期",
            "退场日期",
            "户籍地址",
            "现住址",
            "结算方式",
            "单价",
            "工资银行卡",
            "工资银行",
        ],
        &workers
            .iter()
            .map(|worker| {
                vec![
                    CsvCell::plain(&worker.project_name),
                    CsvCell::plain(&worker.unit_name),
                    CsvCell::plain(&worker.team_name),
                    CsvCell::plain(&worker.name),
                    CsvCell::plain(&worker.gender),
                    CsvCell::text(&worker.id_card),
                    CsvCell::text(&worker.phone),
                    CsvCell::plain(&worker.work_type),
                    CsvCell::plain(&worker.worker_type),
                    CsvCell::plain(&worker.work_status),
                    CsvCell::plain(&worker.entry_time),
                    CsvCell::plain(&worker.exit_time),
                    CsvCell::plain(&worker.address),
                    CsvCell::plain(&worker.current_address),
                    CsvCell::plain(&worker.settlement_type),
                    CsvCell::plain(&worker.unit_price),
                    CsvCell::text(&worker.salary_bank_card),
                    CsvCell::plain(&worker.salary_bank),
                ]
            })
            .collect::<Vec<_>>(),
    )
}

fn build_attendance_records_csv(
    records: &[ProjectExportAttendanceRecord],
    workers: &[ProjectExportWorker],
) -> String {
    let workers_by_id = workers
        .iter()
        .map(|worker| (worker.id.as_str(), worker))
        .collect::<HashMap<_, _>>();
    let aggregates = attendance_aggregates_by_worker(records);
    build_csv(
        &[
            "项目",
            "参建单位",
            "班组名称",
            "工种",
            "工人类型",
            "姓名",
            "身份证号",
            "手机号",
            "考勤天数",
            "工时",
            "记工",
            "进出方向",
            "考勤时间",
            "设备 ID",
            "设备序列号",
            "照片路径",
            "全景照片",
            "近景照片",
        ],
        &records
            .iter()
            .map(|record| {
                let worker = workers_by_id.get(record.worker_id.as_str());
                let aggregate = aggregates
                    .get(record.worker_id.as_str())
                    .cloned()
                    .unwrap_or_default();
                vec![
                    CsvCell::plain(&record.project_name),
                    CsvCell::plain(&record.unit_name),
                    CsvCell::plain(&record.team_name),
                    CsvCell::plain(
                        worker
                            .map(|item| item.work_type.as_str())
                            .unwrap_or_default(),
                    ),
                    CsvCell::plain(
                        worker
                            .map(|item| item.worker_type.as_str())
                            .unwrap_or_default(),
                    ),
                    CsvCell::plain(&record.worker_name),
                    CsvCell::text(&record.id_card),
                    CsvCell::text(&record.phone),
                    CsvCell::plain(aggregate.attendance_days.to_string()),
                    CsvCell::plain(format_export_number(aggregate.hours)),
                    CsvCell::plain(format_export_number(aggregate.work_record)),
                    CsvCell::plain(&record.direction),
                    CsvCell::plain(&record.trigger_time),
                    CsvCell::plain(&record.equipment_id),
                    CsvCell::plain(&record.serial_number),
                    CsvCell::plain(&record.photo_path),
                    CsvCell::plain(&record.overall_photo),
                    CsvCell::plain(&record.closeup_photo),
                ]
            })
            .collect::<Vec<_>>(),
    )
}

fn build_attendance_matrix_csv(
    format: &str,
    workers: &[ProjectExportWorker],
    records: &[ProjectExportAttendanceRecord],
    month: chrono::NaiveDate,
) -> Result<String, ApiError> {
    let day_count = days_in_month(month)?;
    let mut grouped: HashMap<(&str, u32), Vec<&ProjectExportAttendanceRecord>> = HashMap::new();
    for record in records {
        if let Some(day) = record
            .attendance_date
            .split('-')
            .next_back()
            .and_then(|value| value.parse::<u32>().ok())
        {
            grouped
                .entry((record.worker_id.as_str(), day))
                .or_default()
                .push(record);
        }
    }

    let mut headers = vec![
        "项目".to_owned(),
        "参建单位".to_owned(),
        "班组".to_owned(),
        "姓名".to_owned(),
        "身份证号".to_owned(),
        "手机号".to_owned(),
        "考勤天数".to_owned(),
        "工时合计".to_owned(),
        "记工合计".to_owned(),
    ];
    headers.extend((1..=day_count).map(|day| format!("{day}日")));

    let rows = workers
        .iter()
        .map(|worker| {
            let mut attendance_days = 0_i32;
            let mut total_hours = 0_f64;
            let mut total_work_record = 0_f64;
            let mut daily_cells = Vec::with_capacity(day_count as usize);
            for day in 1..=day_count {
                let day_records = grouped
                    .get(&(worker.id.as_str(), day))
                    .cloned()
                    .unwrap_or_default();
                let summary = summarize_day_attendance(&day_records);
                if summary.has_attendance {
                    attendance_days += 1;
                }
                total_hours += summary.hours;
                total_work_record += summary.work_record;
                daily_cells.push(CsvCell::plain(day_attendance_cell(format, &summary)));
            }

            let mut row = vec![
                CsvCell::plain(&worker.project_name),
                CsvCell::plain(&worker.unit_name),
                CsvCell::plain(&worker.team_name),
                CsvCell::plain(&worker.name),
                CsvCell::text(&worker.id_card),
                CsvCell::text(&worker.phone),
                CsvCell::plain(attendance_days.to_string()),
                CsvCell::plain(format_export_number(total_hours)),
                CsvCell::plain(format_export_number(total_work_record)),
            ];
            row.extend(daily_cells);
            row
        })
        .collect::<Vec<_>>();

    let header_refs = headers.iter().map(String::as_str).collect::<Vec<_>>();
    Ok(build_csv(&header_refs, &rows))
}

#[derive(Default)]
struct DayAttendanceSummary {
    has_attendance: bool,
    in_time: String,
    out_time: String,
    hours: f64,
    work_record: f64,
}

#[derive(Clone, Copy, Default)]
struct WorkerAttendanceAggregate {
    attendance_days: i32,
    hours: f64,
    work_record: f64,
}

fn attendance_aggregates_by_worker(
    records: &[ProjectExportAttendanceRecord],
) -> HashMap<&str, WorkerAttendanceAggregate> {
    let mut grouped: HashMap<(&str, &str), Vec<&ProjectExportAttendanceRecord>> = HashMap::new();
    for record in records {
        grouped
            .entry((record.worker_id.as_str(), record.attendance_date.as_str()))
            .or_default()
            .push(record);
    }

    let mut aggregates = HashMap::new();
    for ((worker_id, _), day_records) in grouped {
        let summary = summarize_day_attendance(&day_records);
        let aggregate = aggregates
            .entry(worker_id)
            .or_insert_with(WorkerAttendanceAggregate::default);
        if summary.has_attendance {
            aggregate.attendance_days += 1;
        }
        aggregate.hours += summary.hours;
        aggregate.work_record += summary.work_record;
    }
    aggregates
}

fn summarize_day_attendance(records: &[&ProjectExportAttendanceRecord]) -> DayAttendanceSummary {
    if records.is_empty() {
        return DayAttendanceSummary::default();
    }

    let in_time = records
        .iter()
        .filter(|record| record.direction_value == 0)
        .map(|record| record.attendance_time.as_str())
        .min()
        .unwrap_or_default()
        .to_owned();
    let out_time = records
        .iter()
        .filter(|record| record.direction_value == 1)
        .map(|record| record.attendance_time.as_str())
        .max()
        .unwrap_or_default()
        .to_owned();
    let hours = work_hours_between(&in_time, &out_time).unwrap_or(0.0);
    let work_record = if hours >= 8.0 {
        1.0
    } else if hours >= 4.0 || !records.is_empty() {
        0.5
    } else {
        0.0
    };

    DayAttendanceSummary {
        has_attendance: true,
        in_time,
        out_time,
        hours,
        work_record,
    }
}

fn day_attendance_cell(format: &str, summary: &DayAttendanceSummary) -> String {
    if !summary.has_attendance {
        return String::new();
    }
    match format {
        "attendance_time" => match (summary.in_time.is_empty(), summary.out_time.is_empty()) {
            (false, false) => format!(
                "进 {} 出 {}",
                short_time(&summary.in_time),
                short_time(&summary.out_time)
            ),
            (false, true) => format!("进 {}", short_time(&summary.in_time)),
            (true, false) => format!("出 {}", short_time(&summary.out_time)),
            (true, true) => "有记录".to_owned(),
        },
        "work_hours" => {
            if summary.hours > 0.0 {
                format_export_number(summary.hours)
            } else {
                String::new()
            }
        }
        "work_record" => {
            if summary.work_record > 0.0 {
                format_export_number(summary.work_record)
            } else {
                String::new()
            }
        }
        _ => "✓".to_owned(),
    }
}

fn work_hours_between(in_time: &str, out_time: &str) -> Option<f64> {
    if in_time.is_empty() || out_time.is_empty() {
        return None;
    }
    let start = NaiveTime::parse_from_str(in_time, "%H:%M:%S").ok()?;
    let end = NaiveTime::parse_from_str(out_time, "%H:%M:%S").ok()?;
    let mut seconds =
        end.num_seconds_from_midnight() as i64 - start.num_seconds_from_midnight() as i64;
    if seconds < 0 {
        seconds += 24 * 60 * 60;
    }
    Some((seconds as f64 / 3600.0 * 100.0).round() / 100.0)
}

fn short_time(value: &str) -> &str {
    value.get(0..5).unwrap_or(value)
}

fn format_export_number(value: f64) -> String {
    if (value - value.round()).abs() < f64::EPSILON {
        format!("{}", value.round() as i64)
    } else {
        format!("{value:.2}")
    }
}

fn filter_attendance_workers(
    workers: &[ProjectExportWorker],
    records: &[ProjectExportAttendanceRecord],
    attendance_filter: &str,
) -> Vec<ProjectExportWorker> {
    let worker_ids_with_attendance = records
        .iter()
        .map(|record| record.worker_id.as_str())
        .collect::<HashSet<_>>();
    workers
        .iter()
        .filter(|worker| match attendance_filter {
            "has_attendance" => worker_ids_with_attendance.contains(worker.id.as_str()),
            "no_attendance" => !worker_ids_with_attendance.contains(worker.id.as_str()),
            _ => true,
        })
        .cloned()
        .collect()
}

fn sort_attendance_workers(
    workers: &mut [ProjectExportWorker],
    records: &[ProjectExportAttendanceRecord],
    sort_by: &str,
) {
    let mut days_by_worker: HashMap<&str, HashSet<&str>> = HashMap::new();
    for record in records {
        days_by_worker
            .entry(record.worker_id.as_str())
            .or_default()
            .insert(record.attendance_date.as_str());
    }

    workers.sort_by(|left, right| match sort_by {
        "name_asc" => left.name.cmp(&right.name),
        "team_asc" => left
            .team_name
            .cmp(&right.team_name)
            .then_with(|| left.name.cmp(&right.name)),
        "entry_time_desc" => right.entry_time.cmp(&left.entry_time),
        "entry_time_asc" => left.entry_time.cmp(&right.entry_time),
        "work_type_asc" => left
            .work_type
            .cmp(&right.work_type)
            .then_with(|| left.name.cmp(&right.name)),
        _ => {
            let left_days = days_by_worker
                .get(left.id.as_str())
                .map(HashSet::len)
                .unwrap_or(0);
            let right_days = days_by_worker
                .get(right.id.as_str())
                .map(HashSet::len)
                .unwrap_or(0);
            right_days
                .cmp(&left_days)
                .then_with(|| left.name.cmp(&right.name))
        }
    });
}

fn filter_records_by_workers(
    records: &[ProjectExportAttendanceRecord],
    workers: &[ProjectExportWorker],
) -> Vec<ProjectExportAttendanceRecord> {
    let worker_ids = workers
        .iter()
        .map(|worker| worker.id.as_str())
        .collect::<HashSet<_>>();
    records
        .iter()
        .filter(|record| worker_ids.contains(record.worker_id.as_str()))
        .cloned()
        .collect()
}

fn days_in_month(month: chrono::NaiveDate) -> Result<u32, ApiError> {
    Ok((next_month(month)? - month).num_days() as u32)
}

fn next_month(month: chrono::NaiveDate) -> Result<chrono::NaiveDate, ApiError> {
    if month.month() == 12 {
        chrono::NaiveDate::from_ymd_opt(month.year() + 1, 1, 1)
    } else {
        chrono::NaiveDate::from_ymd_opt(month.year(), month.month() + 1, 1)
    }
    .ok_or_else(|| invalid_column_value("attendance_month", "YYYY-MM"))
}

fn gender_label(value: i16) -> &'static str {
    if value == 0 { "女" } else { "男" }
}

fn direction_label(value: i16) -> &'static str {
    if value == 1 { "出场" } else { "进场" }
}

fn worker_status_label(value: i16) -> &'static str {
    if value == 2 { "离场" } else { "在场" }
}

fn work_type_label(value: Option<i32>) -> String {
    match value {
        Some(1) => "钢筋工",
        Some(2) => "木工",
        Some(3) => "机械设备安装工",
        Some(4) => "架子工",
        Some(5) => "混凝土工",
        Some(6) => "砌筑工",
        Some(7) => "建筑电工",
        Some(8) => "电焊工",
        Some(9) => "管道工",
        Some(10) => "测量放线工",
        Some(11 | 12) => "装饰装修工",
        Some(13) => "防水工",
        Some(14) => "挖掘铲运和桩工机械司机",
        Some(15) => "模板工",
        Some(16) => "通风工",
        Some(17) => "安装起重工",
        Some(18) => "安装钳工",
        Some(19) => "电气设备安装调试工",
        Some(20) => "变电安装工",
        Some(21) => "司泵工",
        Some(22) => "桩机操作工",
        Some(23) => "起重信号工",
        Some(24) => "建筑起重机械安装拆卸工",
        Some(25) => "室内成套设施安装工",
        Some(26) => "建筑门窗幕墙安装工",
        Some(27) => "幕墙制作工",
        Some(28) => "石工",
        Some(29) => "除尘工",
        Some(30) => "爆破工",
        Some(31) => "线路架设工",
        Some(32) => "古建筑传统石工",
        Some(33) => "古建筑传统瓦工",
        Some(34) => "古建筑传统彩画工",
        Some(35) => "古建筑传统木工",
        Some(36) => "古建筑传统油工",
        Some(37) => "金属工",
        Some(38) => "杂工",
        Some(900) => "其它",
        Some(value) => return value.to_string(),
        None => "",
    }
    .to_owned()
}

fn worker_type_label(value: Option<i32>) -> String {
    match value {
        Some(1) => "建筑工人",
        Some(1001) => "管理人员",
        Some(9) => "其他",
        Some(value) => return value.to_string(),
        None => "",
    }
    .to_owned()
}

fn settlement_type_label(value: Option<i16>) -> String {
    match value {
        Some(0) => "按上级配置",
        Some(1) => "按日",
        Some(2) => "按月",
        Some(3) => "按周",
        Some(4) => "劳务派遣合同",
        Some(5) => "按小时",
        Some(6) => "计件",
        Some(7) => "按量",
        Some(9) => "其他",
        Some(value) => return value.to_string(),
        None => "",
    }
    .to_owned()
}

fn csv_download_response(filename: String, csv: String) -> Response {
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8".to_owned()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        csv,
    )
        .into_response()
}

fn required_payroll_month(value: Option<&Value>) -> Result<chrono::NaiveDate, ApiError> {
    let value = value.ok_or_else(|| invalid_column_value("payroll_month", "YYYY-MM"))?;
    match value {
        Value::String(value) if !value.trim().is_empty() => parse_payroll_month(value.trim()),
        _ => Err(invalid_column_value("payroll_month", "YYYY-MM")),
    }
}

fn optional_nonnegative_i32(value: Option<&Value>, column: &str) -> Result<Option<i32>, ApiError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value_to_optional_i32(column, value)?;
    if matches!(value, Some(value) if value < 0) {
        return Err(invalid_column_value(column, "nonnegative integer"));
    }
    Ok(value)
}

fn amount_from_object(
    object: &serde_json::Map<String, Value>,
    cents_key: &str,
    yuan_key: &str,
) -> Result<Option<i64>, ApiError> {
    if let Some(value) = object.get(cents_key) {
        return value_to_optional_i64(cents_key, value);
    }
    if let Some(value) = object.get(yuan_key) {
        return value_to_optional_cents(yuan_key, value);
    }
    Ok(None)
}

fn optional_string(value: Option<&Value>) -> Option<String> {
    value.and_then(|value| match value {
        Value::Null => None,
        Value::String(value) if value.trim().is_empty() => None,
        Value::String(value) => Some(value.trim().to_string()),
        Value::Bool(value) => Some(value.to_string()),
        Value::Number(value) => Some(value.to_string()),
        Value::Array(_) | Value::Object(_) => None,
    })
}

fn cents_to_yuan(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let abs = cents.abs();
    format!("{sign}{}.{:02}", abs / 100, abs % 100)
}

pub async fn get_project(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let project = sqlx::query_scalar::<_, Value>(
        r#"
        SELECT to_jsonb(row)
        FROM (
            SELECT
                p.*,
                COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'platform_name', pc.platform_name,
                            'platform_type', pc.platform_type,
                            'is_enabled', pc.is_enabled
                        )
                        ORDER BY pc.created_at
                    )
                    FROM construction_platform_configs pc
                    WHERE pc.project_id = p.id
                      AND pc.is_deleted = FALSE
                ), '[]'::jsonb) AS reporting_platforms
            FROM construction_projects p
            WHERE p.id = $1
              AND p.is_deleted = FALSE
        ) row
        "#,
    )
    .bind(project_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(project))
}

pub async fn create_project(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    create_row(
        state.db.pool(),
        "construction_projects",
        PROJECT_COLUMNS,
        &body,
        &[],
        StatusCode::CREATED,
    )
    .await
}

pub async fn update_project(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    update_row(
        state.db.pool(),
        "construction_projects",
        PROJECT_COLUMNS,
        &body,
        &[("id", project_id)],
    )
    .await
}

pub async fn delete_project(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<()> {
    delete_row(
        state.db.pool(),
        "construction_projects",
        &[("id", project_id)],
    )
    .await
}

pub async fn create_unit(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    create_row(
        state.db.pool(),
        "construction_units",
        UNIT_COLUMNS,
        &body,
        &[("project_id", project_id)],
        StatusCode::CREATED,
    )
    .await
}

pub async fn list_units(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let params = resource_list_params(&uri)?;
    list_unit_rows_page(state.db.pool(), project_id, &params).await
}

pub async fn repair_unit_reporting(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;

    let mut repair_guard = state.db.pool().begin().await.map_err(db_error)?;
    let lock_acquired =
        sqlx::query_scalar::<_, bool>("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(format!("unit-reporting-repair:{project_id}"))
            .fetch_one(&mut *repair_guard)
            .await
            .map_err(db_error)?;
    if !lock_acquired {
        return Err(invalid_input("当前项目的参建单位上报正在修正，请稍后刷新"));
    }

    let has_enabled_platform = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM construction_platform_configs
            WHERE project_id = $1
              AND is_deleted = FALSE
              AND is_enabled = TRUE
              AND platform_type IN ('yongxin_v2', 'xinleda')
        )
        "#,
    )
    .bind(project_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;
    if !has_enabled_platform {
        return Err(invalid_input("当前项目未启用支持参建单位同步的上报平台"));
    }

    let unit_ids = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT unit.id
        FROM construction_units unit
        JOIN construction_platform_configs config
          ON config.project_id = unit.project_id
         AND config.is_deleted = FALSE
         AND config.is_enabled = TRUE
         AND config.platform_type IN ('yongxin_v2', 'xinleda')
        LEFT JOIN LATERAL (
            SELECT job.id, job.status
            FROM integration_jobs job
            LEFT JOIN integration_project_bindings binding
              ON binding.id = job.binding_id
            WHERE job.project_id = unit.project_id
              AND job.entity_type IN ('unit', 'construction_unit')
              AND job.local_entity_id = unit.id
              AND job.operation = 'unit.sync'
              AND platform_job_matches_config(job.binding_id, job.platform_code, binding.platform_config_id, config.id, config.project_id, config.platform_type)
            ORDER BY job.updated_at DESC, job.id DESC
            LIMIT 1
        ) latest_job ON TRUE
        WHERE unit.project_id = $1
          AND unit.is_deleted = FALSE
        GROUP BY unit.id
        HAVING BOOL_OR(
                   latest_job.id IS NULL
                   OR latest_job.status NOT IN ('success', 'completed', 'delivery_unknown')
               )
           AND NOT COALESCE(BOOL_OR(latest_job.status = 'delivery_unknown'), FALSE)
        ORDER BY MIN(unit.created_at), unit.id
        LIMIT 20
        "#,
    )
    .bind(project_id)
    .fetch_all(state.db.pool())
    .await
    .map_err(db_error)?;

    for unit_id in &unit_ids {
        crate::feature::integration::outbox_worker::enqueue_unit_sync(
            state.db.pool(),
            project_id,
            *unit_id,
        )
        .await
        .map_err(db_error)?;
    }

    let reporting_summary = unit_reporting_summary(state.db.pool(), project_id).await?;
    repair_guard.commit().await.map_err(db_error)?;
    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "attempted_count": unit_ids.len(),
        "reporting_summary": reporting_summary,
    })))
}

pub async fn get_unit(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, unit_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    get_row(
        state.db.pool(),
        "construction_units",
        &[("project_id", project_id), ("id", unit_id)],
    )
    .await
}

pub async fn update_unit(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, unit_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    update_row(
        state.db.pool(),
        "construction_units",
        UNIT_COLUMNS,
        &body,
        &[("project_id", project_id), ("id", unit_id)],
    )
    .await
}

pub async fn delete_unit(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, unit_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    delete_row(
        state.db.pool(),
        "construction_units",
        &[("project_id", project_id), ("id", unit_id)],
    )
    .await
}

pub async fn create_team(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    validate_team_type_for_enabled_platforms(state.db.pool(), project_id, &body).await?;
    let body = normalize_new_team_type(body)?;
    let response = create_row(
        state.db.pool(),
        "construction_teams",
        TEAM_COLUMNS,
        &body,
        &[("project_id", project_id)],
        StatusCode::CREATED,
    )
    .await?;

    if let Some(team_id) = response
        .data
        .as_ref()
        .and_then(|team| team.get("id"))
        .and_then(Value::as_str)
        .and_then(|id| Uuid::parse_str(id).ok())
        && let Err(error) = crate::feature::integration::outbox_worker::enqueue_team_sync(
            state.db.pool(),
            project_id,
            team_id,
        )
        .await
    {
        tracing::error!(%team_id, error = %error, "Failed to enqueue Ningbo team sync");
    }

    Ok(response)
}

fn normalize_new_team_type(mut body: Value) -> Result<Value, ApiError> {
    let object = body
        .as_object_mut()
        .ok_or_else(|| invalid_input("班组数据格式错误"))?;
    let is_manage_team = json_bool_value(object.get("is_manage_team")).unwrap_or(false)
        || json_i32_value(object.get("work_type")) == Some(1001);
    if is_manage_team {
        object.insert("is_manage_team".to_owned(), Value::Bool(true));
        object.insert("work_type".to_owned(), Value::from(1001));
        return Ok(body);
    }

    let work_type = json_i32_value(object.get("work_type"));
    match work_type {
        Some(work_type) if !ningbo_team_type_label(Some(work_type)).is_empty() => {}
        Some(_) => return Err(invalid_input("班组类型不在市平台支持的类型清单中")),
        None => {
            object.insert("work_type".to_owned(), Value::from(900));
        }
    }
    Ok(body)
}

fn json_bool_value(value: Option<&Value>) -> Option<bool> {
    value.and_then(|value| {
        value.as_bool().or_else(|| {
            value
                .as_str()
                .map(str::trim)
                .and_then(|raw| raw.parse::<bool>().ok())
        })
    })
}

fn json_i32_value(value: Option<&Value>) -> Option<i32> {
    value.and_then(|value| {
        value
            .as_i64()
            .or_else(|| value.as_str().and_then(|raw| raw.trim().parse().ok()))
            .and_then(|number| i32::try_from(number).ok())
    })
}

async fn validate_team_type_for_enabled_platforms(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    body: &Value,
) -> Result<(), ApiError> {
    let is_manage_team = json_bool_value(body.get("is_manage_team")).unwrap_or(false)
        || json_i32_value(body.get("work_type")) == Some(1001);
    if is_manage_team {
        return Ok(());
    }

    let has_enabled_ningbo_platform = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM construction_platform_configs
            WHERE project_id = $1
              AND is_deleted = FALSE
              AND is_enabled = TRUE
              AND (platform_type = 'ningbo_housing' OR platform_name = '市住建')
        )
        "#,
    )
    .bind(project_id)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    if !has_enabled_ningbo_platform {
        return Ok(());
    }

    let work_type = json_i32_value(body.get("work_type"));
    if ningbo_team_type_label(work_type).is_empty() {
        return Err(invalid_input(
            "启用市住建上报后，班组类型为必填项且必须选择平台支持的类型",
        ));
    }
    Ok(())
}

struct TeamPlatformSyncSource {
    id: Uuid,
    is_deleted: bool,
    project_id: Uuid,
    name: String,
    work_type: Option<i32>,
    leader_name: String,
    remark: String,
    company_credit_code: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

pub(crate) async fn sync_new_team_to_ningbo_platforms(
    pool: &sqlx::PgPool,
    team_id: Uuid,
) -> Result<(), ApiError> {
    let row = sqlx::query(
        r#"
        SELECT
            team.id,
            team.is_deleted,
            team.project_id,
            COALESCE(team.name, '') AS name,
            team.work_type,
            COALESCE(team.leader_name, '') AS leader_name,
            COALESCE(team.remark, '') AS remark,
            COALESCE(unit.company_credit_code, '') AS company_credit_code,
            team.created_at
        FROM construction_teams team
        JOIN construction_units unit
          ON unit.id = team.unit_id
         AND unit.project_id = team.project_id
        WHERE team.id = $1
        "#,
    )
    .bind(team_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)?;
    let source = TeamPlatformSyncSource {
        id: row.try_get("id").map_err(db_error)?,
        is_deleted: row.try_get("is_deleted").map_err(db_error)?,
        project_id: row.try_get("project_id").map_err(db_error)?,
        name: row.try_get("name").map_err(db_error)?,
        work_type: row.try_get("work_type").map_err(db_error)?,
        leader_name: row.try_get("leader_name").map_err(db_error)?,
        remark: row.try_get("remark").map_err(db_error)?,
        company_credit_code: row.try_get("company_credit_code").map_err(db_error)?,
        created_at: row.try_get("created_at").map_err(db_error)?,
    };

    if source.is_deleted {
        return Ok(());
    }

    let configs = sqlx::query(
        r#"
        SELECT id, config
        FROM construction_platform_configs
        WHERE project_id = $1
          AND is_deleted = FALSE
          AND is_enabled = TRUE
          AND (platform_type = 'ningbo_housing' OR platform_name = '市住建')
        ORDER BY created_at, id
        "#,
    )
    .bind(source.project_id)
    .fetch_all(pool)
    .await
    .map_err(db_error)?;

    for config_row in configs {
        let config_id: Uuid = config_row.try_get("id").map_err(db_error)?;
        let config: Value = config_row.try_get("config").map_err(db_error)?;
        sync_team_to_ningbo_config(pool, &source, config_id, &config).await?;
    }
    Ok(())
}

async fn sync_team_to_ningbo_config(
    pool: &sqlx::PgPool,
    source: &TeamPlatformSyncSource,
    config_id: Uuid,
    config: &Value,
) -> Result<(), ApiError> {
    let credentials = match ningbo_housing::NingboHousingCredentials::from_config(config) {
        Ok(credentials) => credentials,
        Err(error) => {
            record_team_sync_configuration_failure(pool, source, config_id, &error.to_string())
                .await?;
            return Ok(());
        }
    };
    let corp_code = if source.company_credit_code.trim().is_empty() {
        json_string_from_keys(config, &["corp_code", "corpCode", "CorpCode"]).unwrap_or_default()
    } else {
        source.company_credit_code.trim().to_owned()
    };
    let team_type = ningbo_team_type_label(source.work_type);
    let validation_error = if source.name.trim().is_empty() {
        Some("班组名称为空，无法上报市住建平台".to_owned())
    } else if corp_code.is_empty() {
        Some("参建单位统一社会信用代码为空，无法上报市住建平台".to_owned())
    } else if !ningbo_housing::is_valid_social_credit_code(&corp_code) {
        Some(format!(
            "参建单位统一社会信用代码格式错误：{corp_code}（应为 18 位大写字母或数字）"
        ))
    } else if team_type.is_empty() {
        Some("班组工种未配置，无法匹配市住建班组类型".to_owned())
    } else {
        None
    };

    let binding_id =
        ensure_ningbo_project_binding(pool, source.project_id, config_id, &credentials, config)
            .await?;
    let request = ningbo_housing::add_team_request(
        &credentials,
        corp_code.clone(),
        team_type.clone(),
        source.name.trim().to_owned(),
        source.leader_name.trim().to_owned(),
        source.remark.clone(),
        source.created_at.format("%Y-%m-%d").to_string(),
    );
    let request_payload = serde_json::to_value(&request).unwrap_or(Value::Null);
    let job_id =
        upsert_team_sync_job(pool, source, config_id, Some(binding_id), &request_payload).await?;
    if let Some(error) = validation_error {
        finish_team_sync_job(pool, job_id, "failed", None, Some(&error)).await?;
        return Ok(());
    }

    let client = match ningbo_housing::build_client() {
        Ok(client) => client,
        Err(error) => {
            finish_team_sync_job(pool, job_id, "failed", None, Some(&error.to_string())).await?;
            return Ok(());
        }
    };
    let add_url = credentials
        .endpoint("Project/AddTeam")
        .map(|url| url.to_string())
        .unwrap_or_else(|_| credentials.base_url.to_string());
    let response = match ningbo_housing::add_team(&client, &credentials, &request).await {
        Ok(response) => response,
        Err(error) => {
            record_team_sync_attempt(
                pool,
                job_id,
                source.project_id,
                binding_id,
                &add_url,
                &request_payload,
                None,
                None,
                "failed",
                Some(&error.to_string()),
            )
            .await?;
            finish_team_sync_job(pool, job_id, "failed", None, Some(&error.to_string())).await?;
            return Ok(());
        }
    };

    if response.status.is_success()
        && let Some(external_team_id) = ningbo_housing::extract_created_team_id(&response.body)
    {
        record_team_sync_attempt(
            pool,
            job_id,
            source.project_id,
            binding_id,
            &add_url,
            &request_payload,
            Some(response.status.as_u16()),
            Some(&response.body),
            "success",
            None,
        )
        .await?;
        complete_team_platform_mapping(
            pool,
            source,
            binding_id,
            job_id,
            external_team_id,
            ningbo_housing::success_payload(external_team_id, false, response.body),
        )
        .await?;
        return Ok(());
    }

    if ningbo_housing::response_indicates_team_exists(&response) {
        record_team_sync_attempt(
            pool,
            job_id,
            source.project_id,
            binding_id,
            &add_url,
            &request_payload,
            Some(response.status.as_u16()),
            Some(&response.body),
            "conflict",
            Some("市平台提示班组已存在，转为查询并绑定平台班组 ID"),
        )
        .await?;
        let platform_teams =
            match ningbo_housing::list_teams(&client, &credentials, &source.name).await {
                Ok(teams) => teams,
                Err(error) => {
                    finish_team_sync_job(
                        pool,
                        job_id,
                        "failed",
                        Some(&response.body),
                        Some(&error.to_string()),
                    )
                    .await?;
                    return Ok(());
                }
            };
        if let Some(matched) = ningbo_housing::match_existing_team(
            &platform_teams,
            &source.name,
            &corp_code,
            &team_type,
            &source.leader_name,
        ) {
            let external_team_id = matched.id;
            let payload = ningbo_housing::success_payload(
                external_team_id,
                true,
                serde_json::to_value(matched).unwrap_or(Value::Null),
            );
            complete_team_platform_mapping(
                pool,
                source,
                binding_id,
                job_id,
                external_team_id,
                payload,
            )
            .await?;
        } else {
            let error = "市平台提示班组已存在，但 Project/ListTeams 未找到唯一匹配项（项目、班组名、统一社会信用代码、班组类型需一致；班组长仅用于重名消歧）";
            finish_team_sync_job(pool, job_id, "failed", Some(&response.body), Some(error)).await?;
        }
        return Ok(());
    }

    let error = ningbo_housing::response_message(&response.body);
    record_team_sync_attempt(
        pool,
        job_id,
        source.project_id,
        binding_id,
        &add_url,
        &request_payload,
        Some(response.status.as_u16()),
        Some(&response.body),
        "failed",
        Some(&error),
    )
    .await?;
    finish_team_sync_job(pool, job_id, "failed", Some(&response.body), Some(&error)).await?;
    Ok(())
}

async fn ensure_ningbo_project_binding(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    config_id: Uuid,
    credentials: &ningbo_housing::NingboHousingCredentials,
    config: &Value,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO integration_project_bindings (
            project_id,
            platform_id,
            platform_config_id,
            external_project_id,
            base_url,
            credentials,
            config,
            enabled_events,
            is_enabled,
            is_deleted,
            deleted_at
        )
        SELECT
            $1,
            platform.id,
            $2,
            $3,
            $4,
            $5,
            $6,
            ARRAY['team.created', 'worker.created', 'worker.updated', 'worker.exited']::text[],
            TRUE,
            FALSE,
            NULL
        FROM integration_platforms platform
        WHERE platform.code = 'ningbo_housing'
          AND platform.is_deleted = FALSE
          AND platform.is_enabled = TRUE
        ON CONFLICT (platform_config_id) WHERE is_deleted = FALSE AND platform_config_id IS NOT NULL
        DO UPDATE SET
            external_project_id = EXCLUDED.external_project_id,
            base_url = EXCLUDED.base_url,
            credentials = EXCLUDED.credentials,
            config = EXCLUDED.config,
            enabled_events = EXCLUDED.enabled_events,
            is_enabled = TRUE,
            updated_at = NOW()
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(config_id)
    .bind(credentials.project_id.to_string())
    .bind(credentials.base_url.as_str())
    .bind(serde_json::json!({
        "app_key": credentials.app_key,
        "app_secret": credentials.app_secret,
    }))
    .bind(config)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(|| invalid_input("市住建平台适配器未初始化，请先运行数据库迁移"))
}

async fn upsert_team_sync_job(
    pool: &sqlx::PgPool,
    source: &TeamPlatformSyncSource,
    config_id: Uuid,
    binding_id: Option<Uuid>,
    request_payload: &Value,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO integration_jobs (
            project_id,
            binding_id,
            platform_code,
            operation,
            entity_type,
            local_entity_id,
            idempotency_key,
            request_payload,
            status,
            attempt_count,
            next_attempt_at,
            last_error,
            completed_at
        )
        VALUES ($1, $2, 'ningbo_housing', 'Project/AddTeam', 'team', $3, $4, $5, 'pending', 0, NOW(), NULL, NULL)
        ON CONFLICT (idempotency_key)
        DO UPDATE SET
            binding_id = EXCLUDED.binding_id,
            request_payload = EXCLUDED.request_payload,
            status = 'pending',
            next_attempt_at = NOW(),
            last_error = NULL,
            completed_at = NULL,
            updated_at = NOW()
        RETURNING id
        "#,
    )
    .bind(source.project_id)
    .bind(binding_id)
    .bind(source.id)
    .bind(format!(
        "ningbo_housing:team:create:{}:{config_id}",
        source.id
    ))
    .bind(request_payload)
    .fetch_one(pool)
    .await
    .map_err(db_error)
}

async fn record_team_sync_configuration_failure(
    pool: &sqlx::PgPool,
    source: &TeamPlatformSyncSource,
    config_id: Uuid,
    error: &str,
) -> Result<(), ApiError> {
    let payload = serde_json::json!({ "team_name": source.name });
    let job_id = upsert_team_sync_job(pool, source, config_id, None, &payload).await?;
    finish_team_sync_job(pool, job_id, "failed", None, Some(error)).await
}

#[allow(clippy::too_many_arguments)]
async fn record_team_sync_attempt(
    pool: &sqlx::PgPool,
    job_id: Uuid,
    project_id: Uuid,
    binding_id: Uuid,
    request_url: &str,
    request_body: &Value,
    response_status: Option<u16>,
    response_body: Option<&Value>,
    status: &str,
    error_message: Option<&str>,
) -> Result<(), ApiError> {
    record_platform_http_attempt(
        pool,
        job_id,
        project_id,
        binding_id,
        "POST",
        request_url,
        request_body,
        response_status,
        response_body,
        status,
        error_message,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn record_platform_http_attempt(
    pool: &sqlx::PgPool,
    job_id: Uuid,
    project_id: Uuid,
    binding_id: Uuid,
    request_method: &str,
    request_url: &str,
    request_body: &Value,
    response_status: Option<u16>,
    response_body: Option<&Value>,
    status: &str,
    error_message: Option<&str>,
) -> Result<(), ApiError> {
    let attempt_no = sqlx::query_scalar::<_, i32>(
        "SELECT COALESCE(MAX(attempt_no), 0) + 1 FROM integration_attempts WHERE job_id = $1",
    )
    .bind(job_id)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    sqlx::query(
        r#"
        INSERT INTO integration_attempts (
            job_id,
            project_id,
            binding_id,
            attempt_no,
            transport,
            request_method,
            request_url,
            request_body,
            response_status,
            response_body,
            status,
            error_message
        )
        VALUES ($1, $2, $3, $4, 'http', $5, $6, $7, $8, $9, $10, $11)
        "#,
    )
    .bind(job_id)
    .bind(project_id)
    .bind(binding_id)
    .bind(attempt_no)
    .bind(request_method)
    .bind(request_url)
    .bind(sanitize_ningbo_attempt_payload(request_body))
    .bind(response_status.map(i32::from))
    .bind(response_body)
    .bind(status)
    .bind(error_message)
    .execute(pool)
    .await
    .map_err(db_error)?;
    Ok(())
}

fn sanitize_ningbo_attempt_payload(value: &Value) -> Value {
    match value {
        Value::Object(object) => Value::Object(
            object
                .iter()
                .map(|(key, value)| {
                    let sensitive = matches!(
                        key.as_str(),
                        "IdentityCard"
                            | "IdCardPhoto"
                            | "PositiveIdCardFile"
                            | "NegativeIdCardFile"
                            | "FacePhoto"
                            | "PayRollBankCardNumber"
                            | "CardNumber"
                            | "IssueCardPic"
                            | "EntryAttachFile"
                            | "ExitFile"
                    );
                    (
                        key.clone(),
                        if sensitive {
                            Value::String("[REDACTED]".to_owned())
                        } else {
                            sanitize_ningbo_attempt_payload(value)
                        },
                    )
                })
                .collect(),
        ),
        Value::Array(items) => {
            Value::Array(items.iter().map(sanitize_ningbo_attempt_payload).collect())
        }
        _ => value.clone(),
    }
}

async fn complete_team_platform_mapping(
    pool: &sqlx::PgPool,
    source: &TeamPlatformSyncSource,
    binding_id: Uuid,
    job_id: Uuid,
    external_team_id: i64,
    payload: Value,
) -> Result<(), ApiError> {
    let mut transaction = pool.begin().await.map_err(db_error)?;
    sqlx::query(
        r#"
        UPDATE integration_entity_mappings mapping
        SET is_deleted = TRUE,
            deleted_at = NOW(),
            updated_at = NOW()
        WHERE mapping.binding_id = $1
          AND mapping.entity_type = 'team'
          AND mapping.external_entity_id = $2
          AND mapping.local_entity_id <> $3
          AND mapping.is_deleted = FALSE
          AND NOT EXISTS (
              SELECT 1
              FROM construction_teams existing_team
              WHERE existing_team.id = mapping.local_entity_id
                AND existing_team.is_deleted = FALSE
          )
        "#,
    )
    .bind(binding_id)
    .bind(external_team_id.to_string())
    .bind(source.id)
    .execute(&mut *transaction)
    .await
    .map_err(db_error)?;

    let mapping_result = sqlx::query(
        r#"
        INSERT INTO integration_entity_mappings (
            binding_id,
            project_id,
            entity_type,
            local_entity_id,
            external_entity_id,
            external_payload,
            last_pushed_at,
            is_deleted,
            deleted_at
        )
        VALUES ($1, $2, 'team', $3, $4, $5, NOW(), FALSE, NULL)
        ON CONFLICT (binding_id, entity_type, local_entity_id) WHERE is_deleted = FALSE
        DO UPDATE SET
            external_entity_id = EXCLUDED.external_entity_id,
            external_payload = EXCLUDED.external_payload,
            last_pushed_at = NOW(),
            updated_at = NOW()
        "#,
    )
    .bind(binding_id)
    .bind(source.project_id)
    .bind(source.id)
    .bind(external_team_id.to_string())
    .bind(&payload)
    .execute(&mut *transaction)
    .await;
    if let Err(error) = mapping_result {
        let _ = transaction.rollback().await;
        let message = if error
            .as_database_error()
            .and_then(|database_error| database_error.constraint())
            == Some("idx_integration_entity_mappings_external_active")
        {
            "该市平台班组 ID 已绑定其他本地班组，已停止自动绑定".to_owned()
        } else {
            format!("保存市平台班组 ID 失败：{error}")
        };
        finish_team_sync_job(pool, job_id, "failed", Some(&payload), Some(&message)).await?;
        return Ok(());
    }

    transaction.commit().await.map_err(db_error)?;

    finish_team_sync_job(pool, job_id, "success", Some(&payload), None).await?;
    sqlx::query("UPDATE integration_project_bindings SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1")
        .bind(binding_id)
        .execute(pool)
        .await
        .map_err(db_error)?;
    Ok(())
}

async fn finish_team_sync_job(
    pool: &sqlx::PgPool,
    job_id: Uuid,
    status: &str,
    response_payload: Option<&Value>,
    error: Option<&str>,
) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        UPDATE integration_jobs
        SET status = $2,
            response_payload = $3,
            attempt_count = attempt_count + 1,
            last_error = $4,
            completed_at = CASE WHEN $2 IN ('success', 'failed') THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(job_id)
    .bind(status)
    .bind(response_payload)
    .bind(error)
    .execute(pool)
    .await
    .map_err(db_error)?;
    Ok(())
}

fn json_string_from_keys(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
    })
}

fn ningbo_team_type_label(work_type: Option<i32>) -> String {
    match work_type {
        Some(1) => "钢筋工",
        Some(2) => "木工",
        Some(3) => "机械设备安装工",
        Some(4) => "架子工",
        Some(5) => "混凝土工",
        Some(6) => "砌筑工",
        Some(7) => "建筑电工",
        Some(8) => "电焊工",
        Some(9) => "管道工",
        Some(10) => "测量放线工",
        Some(11 | 12) => "装饰装修工",
        Some(13) => "防水工",
        Some(14) => "挖掘铲运和桩工机械司机",
        Some(15) => "模板工",
        Some(16) => "通风工",
        Some(17) => "安装起重工",
        Some(18) => "安装钳工",
        Some(19) => "电气设备安装调试工",
        Some(20) => "变电安装工",
        Some(21) => "司泵工",
        Some(22) => "桩机操作工",
        Some(23) => "起重信号工",
        Some(24) => "建筑起重机械安装拆卸工",
        Some(25) => "室内成套设施安装工",
        Some(26) => "建筑门窗幕墙安装工",
        Some(27) => "幕墙制作工",
        Some(28) => "石工",
        Some(29) => "除尘工",
        Some(30) => "爆破工",
        Some(31) => "线路架设工",
        Some(32) => "古建筑传统石工",
        Some(33) => "古建筑传统瓦工",
        Some(34) => "古建筑传统彩画工",
        Some(35) => "古建筑传统木工",
        Some(36) => "古建筑传统油工",
        Some(37) => "金属工",
        Some(38) => "杂工",
        Some(900) => "其它",
        Some(1001) => "管理人员",
        _ => "",
    }
    .to_owned()
}

fn ningbo_worker_type_label(work_type: Option<i32>) -> String {
    match work_type {
        Some(1) => "钢筋工",
        Some(2) => "木工",
        Some(3) => "机械设备安装工",
        Some(4) => "架子工",
        Some(5) => "混凝土工",
        Some(6) => "砌筑工",
        Some(7) => "建筑电工",
        Some(8) => "电焊工",
        Some(9) => "管道工",
        Some(10) => "测量放线工",
        Some(11) => "装饰装修工",
        Some(13) => "防水工",
        Some(14) => "挖掘铲运和桩工机械司机",
        Some(15) => "模板工",
        Some(16) => "通风工",
        Some(17) => "安装起重工",
        Some(18) => "安装钳工",
        Some(19) => "电气设备安装调试工",
        Some(20) => "变电安装工",
        Some(21) => "司泵工",
        Some(22) => "桩机操作工",
        Some(23) => "起重信号工",
        Some(24) => "建筑起重机械安装拆卸工",
        Some(25) => "室内成套设施安装工",
        Some(26) => "建筑门窗幕墙安装工",
        Some(27) => "幕墙制作工",
        Some(28) => "石工",
        Some(29) => "除尘工",
        Some(30) => "爆破工",
        Some(31) => "线路架设工",
        Some(32) => "古建筑传统石工",
        Some(33) => "古建筑传统瓦工",
        Some(34) => "古建筑传统彩画工",
        Some(35) => "古建筑传统木工",
        Some(36) => "古建筑传统油工",
        Some(37) => "金属工",
        Some(38) => "杂工",
        Some(900) => "其它",
        Some(1001) => "管理人员",
        _ => "",
    }
    .to_owned()
}

pub async fn list_teams(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let params = resource_list_params(&uri)?;
    let mut scoped_columns = Vec::new();
    if let Some(unit_id) = params.unit_id {
        scoped_columns.push(("unit_id", unit_id));
    }

    list_team_rows_page(state.db.pool(), project_id, &scoped_columns, &params).await
}

pub async fn repair_team_reporting(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;

    let mut repair_guard = state.db.pool().begin().await.map_err(db_error)?;
    let lock_acquired =
        sqlx::query_scalar::<_, bool>("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(format!("team-reporting-repair:{project_id}"))
            .fetch_one(&mut *repair_guard)
            .await
            .map_err(db_error)?;
    if !lock_acquired {
        return Err(invalid_input("当前项目的班组上报正在修正，请稍后刷新"));
    }

    let has_enabled_platform = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM construction_platform_configs
            WHERE project_id = $1
              AND is_deleted = FALSE
              AND is_enabled = TRUE
              AND (platform_type = 'ningbo_housing' OR platform_name = '市住建')
        )
        "#,
    )
    .bind(project_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;
    if !has_enabled_platform {
        return Err(invalid_input("当前项目未启用市住建上报配置"));
    }

    let team_ids = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT team.id
        FROM construction_teams team
        LEFT JOIN LATERAL (
            SELECT job.status
            FROM integration_jobs job
            WHERE job.project_id = team.project_id
              AND job.entity_type IN ('team', 'construction_team')
              AND job.local_entity_id = team.id
              AND job.platform_code IN ('ningbo_housing', 'zhenhai')
            ORDER BY job.created_at DESC, job.id DESC
            LIMIT 1
        ) latest_job ON TRUE
        WHERE team.project_id = $1
          AND team.is_deleted = FALSE
          AND (
              latest_job.status IS NULL
              OR latest_job.status NOT IN ('success', 'completed')
          )
        ORDER BY team.created_at, team.id
        LIMIT 20
        "#,
    )
    .bind(project_id)
    .fetch_all(state.db.pool())
    .await
    .map_err(db_error)?;

    for team_id in &team_ids {
        crate::feature::integration::outbox_worker::enqueue_team_sync(
            state.db.pool(),
            project_id,
            *team_id,
        )
        .await
        .map_err(db_error)?;
    }

    let reporting_summary = team_reporting_summary(state.db.pool(), project_id).await?;
    repair_guard.commit().await.map_err(db_error)?;
    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "attempted_count": team_ids.len(),
        "reporting_summary": reporting_summary,
    })))
}

pub async fn repair_worker_reporting(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;

    let mut repair_guard = state.db.pool().begin().await.map_err(db_error)?;
    let lock_acquired =
        sqlx::query_scalar::<_, bool>("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(format!("worker-reporting-repair:{project_id}"))
            .fetch_one(&mut *repair_guard)
            .await
            .map_err(db_error)?;
    if !lock_acquired {
        return Err(invalid_input("当前项目的工人上报正在修正，请稍后刷新"));
    }

    let has_enabled_platform = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM construction_platform_configs
            WHERE project_id = $1
              AND is_deleted = FALSE
              AND is_enabled = TRUE
              AND (
                    platform_type IN ('ningbo_housing', 'yongxin_v2', 'xinleda')
                    OR platform_name = '市住建'
                  )
        )
        "#,
    )
    .bind(project_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;
    if !has_enabled_platform {
        return Err(invalid_input("当前项目未启用支持工人同步的上报平台"));
    }

    let worker_ids = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT worker.id
        FROM construction_workers worker
        LEFT JOIN LATERAL (
            SELECT job.status
            FROM integration_jobs job
            WHERE job.project_id = worker.project_id
              AND job.entity_type IN ('worker', 'construction_worker')
              AND job.local_entity_id = worker.id
              AND job.platform_code = 'ningbo_housing'
            ORDER BY job.updated_at DESC, job.id DESC
            LIMIT 1
        ) latest_job ON TRUE
        LEFT JOIN LATERAL (
            SELECT mapping.id
            FROM integration_entity_mappings mapping
            WHERE mapping.project_id = worker.project_id
              AND mapping.entity_type = 'worker'
              AND mapping.local_entity_id = worker.id
              AND mapping.is_deleted = FALSE
            LIMIT 1
        ) active_mapping ON TRUE
        WHERE worker.project_id = $1
          AND worker.is_deleted = FALSE
          AND EXISTS (
                SELECT 1
                FROM construction_platform_configs config
                WHERE config.project_id = worker.project_id
                  AND config.is_deleted = FALSE
                  AND config.is_enabled = TRUE
                  AND (
                        config.platform_type = 'ningbo_housing'
                        OR config.platform_name = '市住建'
                      )
              )
          AND COALESCE(worker.worker_type, 1) <> 1001
          AND COALESCE(worker.work_type, 0) <> 1001
          AND (
              latest_job.status IS NULL
              OR latest_job.status NOT IN ('success', 'completed')
              OR (worker.work_status = 2 AND active_mapping.id IS NOT NULL)
              OR (worker.work_status <> 2 AND active_mapping.id IS NULL)
          )
        ORDER BY worker.created_at, worker.id
        LIMIT 20
        "#,
    )
    .bind(project_id)
    .fetch_all(state.db.pool())
    .await
    .map_err(db_error)?;

    for worker_id in &worker_ids {
        crate::feature::integration::outbox_worker::enqueue_worker_reconcile(
            state.db.pool(),
            project_id,
            *worker_id,
            false,
        )
        .await
        .map_err(db_error)?;
    }

    let platform_repairs = sqlx::query_as::<_, (Uuid, Uuid, String, Option<String>)>(
        r#"
        SELECT
            worker.id,
            config.id,
            config.platform_type,
            latest_job.operation
        FROM construction_platform_configs config
        JOIN construction_workers worker
          ON worker.project_id = config.project_id
         AND worker.is_deleted = FALSE
        LEFT JOIN LATERAL (
            SELECT job.id, job.status, job.operation, job.updated_at
            FROM integration_jobs job
            LEFT JOIN integration_project_bindings binding
              ON binding.id = job.binding_id
            WHERE job.project_id = worker.project_id
              AND job.entity_type IN ('worker', 'construction_worker')
              AND job.local_entity_id = worker.id
              AND platform_job_matches_config(
                    job.binding_id,
                    job.platform_code,
                    binding.platform_config_id,
                    config.id,
                    config.project_id,
                    config.platform_type
                  )
            ORDER BY job.updated_at DESC, job.id DESC
            LIMIT 1
        ) latest_job ON TRUE
        WHERE config.project_id = $1
          AND config.is_deleted = FALSE
          AND config.is_enabled = TRUE
          AND config.platform_type IN ('yongxin_v2', 'xinleda')
          AND (
                latest_job.id IS NULL
                OR latest_job.status NOT IN (
                    'success', 'completed', 'delivery_unknown',
                    'pending', 'processing', 'retry', 'awaiting_result',
                    'waiting_dependency', 'waiting_media'
                )
              )
        ORDER BY latest_job.updated_at NULLS FIRST, config.created_at, worker.created_at, worker.id
        LIMIT 20
        "#,
    )
    .bind(project_id)
    .fetch_all(state.db.pool())
    .await
    .map_err(db_error)?;

    for (worker_id, config_id, platform_type, latest_operation) in &platform_repairs {
        let repair_entry_exit =
            platform_type == "yongxin_v2" && latest_operation.as_deref() == Some("entry_exit.sync");
        crate::feature::integration::outbox_worker::enqueue_worker_platform_repair(
            state.db.pool(),
            project_id,
            *worker_id,
            *config_id,
            repair_entry_exit,
        )
        .await
        .map_err(db_error)?;
    }
    let reporting_summary = worker_reporting_summary(state.db.pool(), project_id).await?;
    repair_guard.commit().await.map_err(db_error)?;
    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "attempted_count": worker_ids.len() + platform_repairs.len(),
        "reporting_summary": reporting_summary,
    })))
}

fn parse_yongxin_repair_dates(
    body: &YongxinAttendanceRepairRequest,
) -> Result<(chrono::NaiveDate, chrono::NaiveDate), ApiError> {
    let start_date = chrono::NaiveDate::parse_from_str(body.start_date.trim(), "%Y-%m-%d")
        .map_err(|_| invalid_column_value("start_date", "YYYY-MM-DD"))?;
    let end_date = chrono::NaiveDate::parse_from_str(body.end_date.trim(), "%Y-%m-%d")
        .map_err(|_| invalid_column_value("end_date", "YYYY-MM-DD"))?;
    if end_date < start_date {
        return Err(invalid_input("结束日期不能早于开始日期"));
    }
    if (end_date - start_date).num_days() > 31 {
        return Err(invalid_input("单次补推最多选择 32 天"));
    }
    if body.worker_ids.is_empty() {
        return Err(invalid_input("请至少选择一名工人"));
    }
    if body.worker_ids.len() > 500 {
        return Err(invalid_input("单次最多选择 500 名工人"));
    }
    Ok((start_date, end_date))
}

fn ensure_system_admin(auth_user: &AuthUser) -> Result<(), ApiError> {
    if auth_user.roles.contains(&Role::Admin) {
        Ok(())
    } else {
        Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_message("仅系统管理员可执行甬薪考勤补推"))
    }
}

fn ensure_attendance_device_admin(auth_user: &AuthUser) -> Result<(), ApiError> {
    if auth_user.roles.contains(&Role::Admin) {
        Ok(())
    } else {
        Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_message("仅系统管理员可新增、编辑或删除考勤机绑定"))
    }
}

pub async fn preview_yongxin_attendance_reporting(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<YongxinAttendanceRepairRequest>,
) -> ApiResult<Value> {
    ensure_system_admin(&auth_user)?;
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let (start_date, end_date) = parse_yongxin_repair_dates(&body)?;

    let has_enabled_platform = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM construction_platform_configs config
            WHERE config.project_id = $1
              AND config.is_deleted = FALSE
              AND config.is_enabled = TRUE
              AND config.platform_type = 'yongxin_v2'
              AND COALESCE(config.config #>> '{modules,sync_attendance}', config.config ->> 'sync_attendance', 'true')::boolean = TRUE
        )
        "#,
    )
    .bind(project_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;
    if !has_enabled_platform {
        return Err(invalid_input("当前项目未启用甬薪考勤同步"));
    }

    let records = sqlx::query_as::<_, YongxinAttendanceRepairPreviewRow>(
        r#"
        SELECT DISTINCT ON (record.id)
            record.id AS attendance_id,
            worker.id AS worker_id,
            COALESCE(worker.name, '未命名工人') AS worker_name,
            worker.id_card AS worker_identity,
            team.name AS team_name,
            record.direction,
            record.trigger_time,
            latest_job.status AS current_status,
            latest_job.last_error AS current_message
        FROM construction_attendance_records record
        JOIN construction_workers worker
          ON worker.id = record.worker_id
         AND worker.is_deleted = FALSE
        LEFT JOIN construction_teams team
          ON team.id = worker.team_id
         AND team.is_deleted = FALSE
        JOIN construction_platform_configs config
          ON config.project_id = record.project_id
         AND config.is_deleted = FALSE
         AND config.is_enabled = TRUE
         AND config.platform_type = 'yongxin_v2'
         AND COALESCE(
               config.config #>> '{modules,sync_attendance}',
               config.config ->> 'sync_attendance',
               'true'
             )::boolean = TRUE
        LEFT JOIN LATERAL (
            SELECT job.id, job.status, job.last_error
            FROM integration_jobs job
            LEFT JOIN integration_project_bindings binding ON binding.id = job.binding_id
            WHERE job.project_id = record.project_id
              AND job.entity_type = 'attendance'
              AND job.local_entity_id = record.id
              AND job.operation = 'attendance.sync'
              AND platform_job_matches_config(
                    job.binding_id, job.platform_code, binding.platform_config_id,
                    config.id, config.project_id, config.platform_type
                  )
            ORDER BY job.updated_at DESC, job.id DESC
            LIMIT 1
        ) latest_job ON TRUE
        WHERE record.project_id = $1
          AND record.is_deleted = FALSE
          AND worker.id = ANY($2)
          AND (record.trigger_time AT TIME ZONE 'Asia/Shanghai')::date BETWEEN $3 AND $4
          AND (
                latest_job.id IS NULL
                OR latest_job.status IN ('failed', 'waiting_data', 'waiting_media', 'disabled')
              )
        ORDER BY record.id, record.trigger_time
        LIMIT 500
        "#,
    )
    .bind(project_id)
    .bind(&body.worker_ids)
    .bind(start_date)
    .bind(end_date)
    .fetch_all(state.db.pool())
    .await
    .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "records": records,
        "record_count": records.len(),
        "worker_count": records.iter().map(|record| record.worker_id).collect::<std::collections::HashSet<_>>().len(),
        "batch_limit": 500,
        "has_more": records.len() == 500,
        "start_date": start_date,
        "end_date": end_date,
    })))
}

pub async fn repair_yongxin_attendance_reporting(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<YongxinAttendanceRepairRequest>,
) -> ApiResult<Value> {
    ensure_system_admin(&auth_user)?;
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;

    let (start_date, end_date) = parse_yongxin_repair_dates(&body)?;
    if body.attendance_ids.is_empty() {
        return Err(invalid_input("请先预览并选择需要补推的考勤记录"));
    }
    if body.attendance_ids.len() > 500 {
        return Err(invalid_input("单次最多补推 500 条考勤"));
    }

    let mut repair_guard = state.db.pool().begin().await.map_err(db_error)?;
    let lock_acquired =
        sqlx::query_scalar::<_, bool>("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(format!("yongxin-attendance-repair:{project_id}"))
            .fetch_one(&mut *repair_guard)
            .await
            .map_err(db_error)?;
    if !lock_acquired {
        return Err(invalid_input("当前项目的甬薪考勤正在补推，请稍后再试"));
    }

    let has_enabled_platform = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM construction_platform_configs config
            WHERE config.project_id = $1
              AND config.is_deleted = FALSE
              AND config.is_enabled = TRUE
              AND config.platform_type = 'yongxin_v2'
              AND COALESCE(
                    config.config #>> '{modules,sync_attendance}',
                    config.config ->> 'sync_attendance',
                    'true'
                  )::boolean = TRUE
        )
        "#,
    )
    .bind(project_id)
    .fetch_one(&mut *repair_guard)
    .await
    .map_err(db_error)?;
    if !has_enabled_platform {
        return Err(invalid_input("当前项目未启用甬薪考勤同步"));
    }

    let targets = sqlx::query_as::<_, (Uuid, Uuid)>(
        r#"
        SELECT record.id, config.id
        FROM construction_attendance_records record
        JOIN construction_workers worker
          ON worker.id = record.worker_id
         AND worker.is_deleted = FALSE
        JOIN construction_platform_configs config
          ON config.project_id = record.project_id
         AND config.is_deleted = FALSE
         AND config.is_enabled = TRUE
         AND config.platform_type = 'yongxin_v2'
         AND COALESCE(
               config.config #>> '{modules,sync_attendance}',
               config.config ->> 'sync_attendance',
               'true'
             )::boolean = TRUE
        LEFT JOIN LATERAL (
            SELECT job.id, job.status
            FROM integration_jobs job
            LEFT JOIN integration_project_bindings binding
              ON binding.id = job.binding_id
            WHERE job.project_id = record.project_id
              AND job.entity_type = 'attendance'
              AND job.local_entity_id = record.id
              AND job.operation = 'attendance.sync'
              AND platform_job_matches_config(
                    job.binding_id,
                    job.platform_code,
                    binding.platform_config_id,
                    config.id,
                    config.project_id,
                    config.platform_type
                  )
            ORDER BY job.updated_at DESC, job.id DESC
            LIMIT 1
        ) latest_job ON TRUE
        WHERE record.project_id = $1
          AND record.is_deleted = FALSE
          AND record.id = ANY($4)
          AND worker.id = ANY($5)
          AND (record.trigger_time AT TIME ZONE 'Asia/Shanghai')::date BETWEEN $2 AND $3
          AND (
                latest_job.id IS NULL
                OR latest_job.status IN (
                    'failed', 'waiting_data', 'waiting_media', 'disabled'
                )
              )
        ORDER BY record.trigger_time, record.id, config.created_at, config.id
        LIMIT 500
        "#,
    )
    .bind(project_id)
    .bind(start_date)
    .bind(end_date)
    .bind(&body.attendance_ids)
    .bind(&body.worker_ids)
    .fetch_all(&mut *repair_guard)
    .await
    .map_err(db_error)?;

    for (attendance_id, config_id) in &targets {
        crate::feature::integration::outbox_worker::enqueue_attendance_platform_repair(
            state.db.pool(),
            project_id,
            *attendance_id,
            *config_id,
            auth_user.user_id,
        )
        .await
        .map_err(db_error)?;
    }

    repair_guard.commit().await.map_err(db_error)?;
    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "queued_count": targets.len(),
        "batch_limit": 500,
        "has_more": targets.len() == 500,
        "start_date": start_date,
        "end_date": end_date,
    })))
}

pub async fn get_team(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, team_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    get_row(
        state.db.pool(),
        "construction_teams",
        &[("project_id", project_id), ("id", team_id)],
    )
    .await
}

pub async fn update_team(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, team_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let before_platform_fields =
        fetch_team_platform_fields(state.db.pool(), project_id, team_id).await?;
    let body = normalize_team_update_type(state.db.pool(), project_id, team_id, body).await?;
    let response = update_row(
        state.db.pool(),
        "construction_teams",
        TEAM_COLUMNS,
        &body,
        &[("project_id", project_id), ("id", team_id)],
    )
    .await?;

    let after_platform_fields =
        fetch_team_platform_fields(state.db.pool(), project_id, team_id).await?;
    if platform_fields_changed(&before_platform_fields, &after_platform_fields)
        && let Err(error) = crate::feature::integration::outbox_worker::enqueue_team_sync(
            state.db.pool(),
            project_id,
            team_id,
        )
        .await
    {
        tracing::error!(%team_id, %project_id, error = %error, "Failed to enqueue team update");
    }

    Ok(response)
}

async fn fetch_team_platform_fields(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    team_id: Uuid,
) -> Result<Option<Value>, ApiError> {
    sqlx::query_scalar::<_, Value>(
        r#"
        SELECT jsonb_build_object(
            'unit_id', unit_id,
            'name', name,
            'work_type', work_type,
            'is_manage_team', is_manage_team,
            'leader_name', leader_name,
            'remark', remark
        )
        FROM construction_teams
        WHERE is_deleted = FALSE
          AND project_id = $1
          AND id = $2
        "#,
    )
    .bind(project_id)
    .bind(team_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)
}

struct TeamPlatformExitTarget {
    binding_id: Uuid,
    external_team_id: i64,
    config: Value,
}

async fn upsert_team_exit_job(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    team_id: Uuid,
    binding_id: Uuid,
    request_payload: &Value,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO integration_jobs (
            project_id,
            binding_id,
            platform_code,
            operation,
            entity_type,
            local_entity_id,
            idempotency_key,
            request_payload,
            status,
            attempt_count,
            next_attempt_at,
            last_error,
            completed_at
        )
        VALUES ($1, $2, 'ningbo_housing', 'Project/TeamExit', 'team', $3, $4, $5, 'pending', 0, NOW(), NULL, NULL)
        ON CONFLICT (idempotency_key)
        DO UPDATE SET
            request_payload = EXCLUDED.request_payload,
            status = 'pending',
            next_attempt_at = NOW(),
            last_error = NULL,
            completed_at = NULL,
            updated_at = NOW()
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(binding_id)
    .bind(team_id)
    .bind(format!(
        "ningbo_housing:team:exit:{team_id}:{binding_id}"
    ))
    .bind(request_payload)
    .fetch_one(pool)
    .await
    .map_err(db_error)
}

pub(crate) async fn exit_team_from_ningbo_platforms(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    team_id: Uuid,
) -> Result<(), ApiError> {
    let team = sqlx::query(
        r#"
        SELECT COALESCE(name, '') AS name
        FROM construction_teams
        WHERE project_id = $1
          AND id = $2
        "#,
    )
    .bind(project_id)
    .bind(team_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)?;
    let team_name: String = team.try_get("name").map_err(db_error)?;

    let target_rows = sqlx::query(
        r#"
        SELECT mapping.external_entity_id, binding.id AS binding_id, binding.config
        FROM integration_entity_mappings mapping
        JOIN integration_project_bindings binding
          ON binding.id = mapping.binding_id
         AND binding.is_deleted = FALSE
        JOIN integration_platforms platform
          ON platform.id = binding.platform_id
         AND platform.code = 'ningbo_housing'
         AND platform.is_deleted = FALSE
        WHERE mapping.project_id = $1
          AND mapping.entity_type = 'team'
          AND mapping.local_entity_id = $2
          AND mapping.is_deleted = FALSE
        ORDER BY mapping.created_at, mapping.id
        "#,
    )
    .bind(project_id)
    .bind(team_id)
    .fetch_all(pool)
    .await
    .map_err(db_error)?;
    let mut targets = Vec::with_capacity(target_rows.len());
    for row in target_rows {
        let external_team_id = row
            .try_get::<String, _>("external_entity_id")
            .map_err(db_error)?
            .parse::<i64>()
            .map_err(|_| invalid_input("市平台班组 ID 无效，已停止删除本地班组"))?;
        targets.push(TeamPlatformExitTarget {
            binding_id: row.try_get("binding_id").map_err(db_error)?,
            external_team_id,
            config: row.try_get("config").map_err(db_error)?,
        });
    }

    for target in targets {
        let exit_request = ningbo_housing::team_exit_request(
            target.external_team_id,
            &team_name,
            chrono::Utc::now().format("%Y-%m-%d").to_string(),
        );
        let request_payload = serde_json::to_value(&exit_request).unwrap_or(Value::Null);
        let job_id = upsert_team_exit_job(
            pool,
            project_id,
            team_id,
            target.binding_id,
            &request_payload,
        )
        .await?;
        let credentials =
            match ningbo_housing::NingboHousingCredentials::from_config(&target.config) {
                Ok(credentials) => credentials,
                Err(error) => {
                    let message = error.to_string();
                    finish_team_sync_job(pool, job_id, "failed", None, Some(&message)).await?;
                    return Err(platform_exit_error(&message));
                }
            };
        let client = match ningbo_housing::build_client() {
            Ok(client) => client,
            Err(error) => {
                let message = error.to_string();
                finish_team_sync_job(pool, job_id, "failed", None, Some(&message)).await?;
                return Err(platform_exit_error(&message));
            }
        };
        let exit_url = credentials
            .endpoint("Project/TeamExit")
            .map(|url| url.to_string())
            .unwrap_or_else(|_| credentials.base_url.to_string());
        let response = match ningbo_housing::exit_team(&client, &credentials, &exit_request).await {
            Ok(response) => response,
            Err(error) => {
                let message = error.to_string();
                record_team_sync_attempt(
                    pool,
                    job_id,
                    project_id,
                    target.binding_id,
                    &exit_url,
                    &request_payload,
                    None,
                    None,
                    "failed",
                    Some(&message),
                )
                .await?;
                finish_team_sync_job(pool, job_id, "failed", None, Some(&message)).await?;
                return Err(platform_exit_error(&message));
            }
        };

        let mut exited = response.status.is_success();
        if !exited
            && let Ok(teams) = ningbo_housing::list_teams(&client, &credentials, &team_name).await
        {
            exited = teams
                .iter()
                .any(|team| team.id == target.external_team_id && team.is_exited);
        }
        if exited {
            let response_payload = serde_json::json!({
                "team_id": target.external_team_id,
                "is_exited": true,
                "platform_response": response.body,
            });
            record_team_sync_attempt(
                pool,
                job_id,
                project_id,
                target.binding_id,
                &exit_url,
                &request_payload,
                Some(response.status.as_u16()),
                Some(&response_payload),
                "success",
                None,
            )
            .await?;
            finish_team_sync_job(pool, job_id, "success", Some(&response_payload), None).await?;
            sqlx::query(
                "UPDATE integration_project_bindings SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1",
            )
            .bind(target.binding_id)
            .execute(pool)
            .await
            .map_err(db_error)?;
            sqlx::query(
                r#"
                UPDATE integration_entity_mappings
                SET is_deleted = TRUE,
                    deleted_at = NOW(),
                    last_pushed_at = NOW(),
                    updated_at = NOW()
                WHERE binding_id = $1
                  AND entity_type = 'team'
                  AND local_entity_id = $2
                  AND is_deleted = FALSE
                "#,
            )
            .bind(target.binding_id)
            .bind(team_id)
            .execute(pool)
            .await
            .map_err(db_error)?;
            continue;
        }

        let message = ningbo_housing::response_message(&response.body);
        record_team_sync_attempt(
            pool,
            job_id,
            project_id,
            target.binding_id,
            &exit_url,
            &request_payload,
            Some(response.status.as_u16()),
            Some(&response.body),
            "failed",
            Some(&message),
        )
        .await?;
        finish_team_sync_job(pool, job_id, "failed", Some(&response.body), Some(&message)).await?;
        return Err(platform_exit_error(&message));
    }
    Ok(())
}

fn platform_exit_error(message: &str) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::BAD_GATEWAY)
        .with_message(format!("市住建平台班组退场失败：{message}"))
}

async fn normalize_team_update_type(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    team_id: Uuid,
    mut body: Value,
) -> Result<Value, ApiError> {
    let (current_is_manage_team, current_work_type) = sqlx::query_as::<_, (bool, Option<i32>)>(
        r#"
        SELECT is_manage_team, work_type
        FROM construction_teams
        WHERE project_id = $1
          AND id = $2
          AND is_deleted = FALSE
        "#,
    )
    .bind(project_id)
    .bind(team_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)?;
    let object = body
        .as_object_mut()
        .ok_or_else(|| invalid_input("班组数据格式错误"))?;
    let target_is_manage_team = json_bool_value(object.get("is_manage_team"))
        .unwrap_or(current_is_manage_team)
        || json_i32_value(object.get("work_type")) == Some(1001);
    if target_is_manage_team {
        object.insert("is_manage_team".to_owned(), Value::Bool(true));
        object.insert("work_type".to_owned(), Value::from(1001));
        return Ok(body);
    }

    let target_work_type = if object.contains_key("work_type") {
        json_i32_value(object.get("work_type"))
    } else {
        current_work_type
    };
    match target_work_type {
        Some(work_type) if !ningbo_team_type_label(Some(work_type)).is_empty() => Ok(body),
        Some(_) => Err(invalid_input("班组类型不在市平台支持的类型清单中")),
        None => {
            object.insert("work_type".to_owned(), Value::from(900));
            Ok(body)
        }
    }
}

pub async fn delete_team(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, team_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let response = delete_row(
        state.db.pool(),
        "construction_teams",
        &[("project_id", project_id), ("id", team_id)],
    )
    .await?;
    if let Err(error) = crate::feature::integration::outbox_worker::enqueue_team_exit(
        state.db.pool(),
        project_id,
        team_id,
    )
    .await
    {
        tracing::error!(%team_id, %project_id, error = %error, "Failed to enqueue Ningbo team exit");
    }
    Ok(response)
}

pub async fn create_worker(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let body = normalize_worker_body(body, true)?;
    check_worker_phone_id_card_unique(state.db.pool(), project_id, None, &body).await?;
    let response = create_row(
        state.db.pool(),
        "construction_workers",
        WORKER_COLUMNS,
        &body,
        &[("project_id", project_id)],
        StatusCode::CREATED,
    )
    .await?;

    if let Some(worker_id) = response
        .data
        .as_ref()
        .and_then(|row| row.get("id"))
        .and_then(Value::as_str)
        .and_then(|value| Uuid::parse_str(value).ok())
    {
        if let Err(error) = crate::feature::integration::outbox_worker::enqueue_worker_reconcile(
            state.db.pool(),
            project_id,
            worker_id,
            false,
        )
        .await
        {
            tracing::error!(%worker_id, error = %error, "Failed to enqueue Ningbo worker sync");
        }
        trigger_worker_device_issue(
            &state,
            project_id,
            worker_id,
            "create",
            "人员新增后自动下发",
        )
        .await;
    }

    Ok(response)
}

#[derive(Debug, Clone)]
struct WorkerPlatformSyncSource {
    id: Uuid,
    is_deleted: bool,
    project_id: Uuid,
    team_id: Uuid,
    name: String,
    identity_card: String,
    address: String,
    grant_org: String,
    validity_period: String,
    validity_period_end: String,
    telephone: String,
    nation_name: String,
    id_card_photo_url: String,
    face_photo_url: String,
    political_status: Option<i32>,
    education: Option<i32>,
    has_bad_medical_history: bool,
    worker_type: Option<i32>,
    work_type: Option<i32>,
    work_status: i16,
    is_team_leader: bool,
    entry_time: chrono::NaiveDate,
    exit_time: Option<chrono::NaiveDate>,
    has_insurance: bool,
    salary_bank_card: String,
    enterprise_name: String,
    corp_code: String,
}

#[derive(Debug, Clone)]
struct WorkerPlatformMapping {
    project_worker_id: i64,
    external_team_id: Option<i64>,
    worker_code: String,
}

pub(crate) async fn reconcile_worker_to_ningbo_platforms(
    state: &AppState,
    worker_id: Uuid,
    strict_exit: bool,
) -> Result<(), ApiError> {
    let mut source = load_worker_platform_sync_source(state.db.pool(), worker_id).await?;
    if strict_exit || source.is_deleted {
        source.work_status = 2;
        source
            .exit_time
            .get_or_insert_with(|| chrono::Local::now().date_naive());
    }
    if source.worker_type == Some(1001) || source.work_type == Some(1001) {
        return Ok(());
    }
    let configs = sqlx::query(
        r#"
        SELECT id, config
        FROM construction_platform_configs
        WHERE project_id = $1
          AND is_deleted = FALSE
          AND is_enabled = TRUE
          AND (platform_type = 'ningbo_housing' OR platform_name = '市住建')
        ORDER BY created_at, id
        "#,
    )
    .bind(source.project_id)
    .fetch_all(state.db.pool())
    .await
    .map_err(db_error)?;

    let mut failures = Vec::new();
    for row in configs {
        let config_id: Uuid = row.try_get("id").map_err(db_error)?;
        let config: Value = row.try_get("config").map_err(db_error)?;
        if let Some(error) =
            reconcile_worker_to_ningbo_config(state, &source, config_id, &config).await?
        {
            failures.push(error);
        }
    }
    if !failures.is_empty() {
        return Err(invalid_input(format!(
            "市平台人员同步失败：{}",
            failures.join("；")
        )));
    }
    Ok(())
}

async fn reconcile_worker_to_ningbo_config(
    state: &AppState,
    source: &WorkerPlatformSyncSource,
    config_id: Uuid,
    config: &Value,
) -> Result<Option<String>, ApiError> {
    let credentials = match ningbo_housing::NingboHousingCredentials::from_config(config) {
        Ok(credentials) => credentials,
        Err(error) => {
            record_worker_action_failure(
                state.db.pool(),
                source,
                config_id,
                None,
                if source.work_status == 2 {
                    "Project/ProjectWorkerExit"
                } else {
                    "Project/EditWorker"
                },
                if source.work_status == 2 {
                    "exit"
                } else {
                    "update"
                },
                &error.to_string(),
            )
            .await?;
            return Ok(Some(error.to_string()));
        }
    };
    let binding_id = ensure_ningbo_project_binding(
        state.db.pool(),
        source.project_id,
        config_id,
        &credentials,
        config,
    )
    .await?;
    let mapping = worker_platform_mapping(state.db.pool(), binding_id, source.id).await?;

    if source.work_status == 2 {
        return exit_worker_from_ningbo_config(
            state,
            source,
            config_id,
            binding_id,
            &credentials,
            mapping.as_ref(),
        )
        .await;
    }

    let Some(mapping) = mapping else {
        sync_worker_to_ningbo_config(state, source, config_id, config).await?;
        return Ok(None);
    };
    edit_worker_on_ningbo_config(
        state,
        source,
        config_id,
        binding_id,
        config,
        &credentials,
        &mapping,
    )
    .await
}

async fn worker_platform_mapping(
    pool: &sqlx::PgPool,
    binding_id: Uuid,
    worker_id: Uuid,
) -> Result<Option<WorkerPlatformMapping>, ApiError> {
    let row = sqlx::query(
        r#"
        SELECT external_entity_id, external_parent_id,
               COALESCE(external_payload ->> 'worker_code', '') AS worker_code
        FROM integration_entity_mappings
        WHERE binding_id = $1
          AND entity_type = 'worker'
          AND local_entity_id = $2
          AND is_deleted = FALSE
        LIMIT 1
        "#,
    )
    .bind(binding_id)
    .bind(worker_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?;
    let Some(row) = row else { return Ok(None) };
    let project_worker_id = row
        .try_get::<String, _>("external_entity_id")
        .map_err(db_error)?
        .parse::<i64>()
        .map_err(|_| invalid_input("已保存的市住建项目人员 ID 格式错误"))?;
    let external_team_id = row
        .try_get::<Option<String>, _>("external_parent_id")
        .map_err(db_error)?
        .and_then(|value| value.parse::<i64>().ok());
    Ok(Some(WorkerPlatformMapping {
        project_worker_id,
        external_team_id,
        worker_code: row.try_get("worker_code").map_err(db_error)?,
    }))
}

async fn load_worker_platform_sync_source(
    pool: &sqlx::PgPool,
    worker_id: Uuid,
) -> Result<WorkerPlatformSyncSource, ApiError> {
    let row = sqlx::query(
        r#"
        SELECT
            worker.id,
            worker.is_deleted,
            worker.project_id,
            worker.team_id,
            COALESCE(worker.name, '') AS name,
            COALESCE(worker.id_card, '') AS identity_card,
            COALESCE(worker.address, '') AS address,
            COALESCE(worker.visa_office, '') AS grant_org,
            COALESCE(worker.validity_period, '') AS validity_period,
            COALESCE(worker.validity_period_end, '') AS validity_period_end,
            COALESCE(worker.phone, '') AS telephone,
            COALESCE(worker.nation, '') AS nation_name,
            COALESCE(worker.ocr_photo, '') AS id_card_photo_url,
            COALESCE(worker.avatar, '') AS face_photo_url,
            worker.political_status,
            worker.education,
            worker.has_major_medical_history,
            worker.worker_type,
            worker.work_type,
            worker.work_status,
            COALESCE(team.leader_id = worker.id, FALSE) AS is_team_leader,
            COALESCE(worker.entry_time, worker.created_at::date) AS entry_time,
            worker.exit_time,
            worker.has_insurance,
            COALESCE(worker.salary_bank_card, '') AS salary_bank_card,
            COALESCE(unit.company_name, '') AS enterprise_name,
            COALESCE(unit.company_credit_code, '') AS corp_code
        FROM construction_workers worker
        JOIN construction_units unit
          ON unit.id = worker.unit_id
         AND unit.project_id = worker.project_id
        JOIN construction_teams team
          ON team.id = worker.team_id
         AND team.project_id = worker.project_id
         AND team.unit_id = worker.unit_id
        WHERE worker.id = $1
        "#,
    )
    .bind(worker_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)?;

    Ok(WorkerPlatformSyncSource {
        id: row.try_get("id").map_err(db_error)?,
        is_deleted: row.try_get("is_deleted").map_err(db_error)?,
        project_id: row.try_get("project_id").map_err(db_error)?,
        team_id: row.try_get("team_id").map_err(db_error)?,
        name: row.try_get("name").map_err(db_error)?,
        identity_card: row.try_get("identity_card").map_err(db_error)?,
        address: row.try_get("address").map_err(db_error)?,
        grant_org: row.try_get("grant_org").map_err(db_error)?,
        validity_period: row.try_get("validity_period").map_err(db_error)?,
        validity_period_end: row.try_get("validity_period_end").map_err(db_error)?,
        telephone: row.try_get("telephone").map_err(db_error)?,
        nation_name: row.try_get("nation_name").map_err(db_error)?,
        id_card_photo_url: row.try_get("id_card_photo_url").map_err(db_error)?,
        face_photo_url: row.try_get("face_photo_url").map_err(db_error)?,
        political_status: row.try_get("political_status").map_err(db_error)?,
        education: row.try_get("education").map_err(db_error)?,
        has_bad_medical_history: row.try_get("has_major_medical_history").map_err(db_error)?,
        worker_type: row.try_get("worker_type").map_err(db_error)?,
        work_type: row.try_get("work_type").map_err(db_error)?,
        work_status: row.try_get("work_status").map_err(db_error)?,
        is_team_leader: row.try_get("is_team_leader").map_err(db_error)?,
        entry_time: row.try_get("entry_time").map_err(db_error)?,
        exit_time: row.try_get("exit_time").map_err(db_error)?,
        has_insurance: row.try_get("has_insurance").map_err(db_error)?,
        salary_bank_card: row.try_get("salary_bank_card").map_err(db_error)?,
        enterprise_name: row.try_get("enterprise_name").map_err(db_error)?,
        corp_code: row.try_get("corp_code").map_err(db_error)?,
    })
}

async fn sync_worker_to_ningbo_config(
    state: &AppState,
    source: &WorkerPlatformSyncSource,
    config_id: Uuid,
    config: &Value,
) -> Result<(), ApiError> {
    let credentials = match ningbo_housing::NingboHousingCredentials::from_config(config) {
        Ok(credentials) => credentials,
        Err(error) => {
            record_worker_sync_failure(
                state.db.pool(),
                source,
                config_id,
                None,
                &error.to_string(),
            )
            .await?;
            return Ok(());
        }
    };
    let binding_id = ensure_ningbo_project_binding(
        state.db.pool(),
        source.project_id,
        config_id,
        &credentials,
        config,
    )
    .await?;
    let job_id = upsert_worker_sync_job(
        state.db.pool(),
        source,
        config_id,
        Some(binding_id),
        &serde_json::json!({
            "IdentityCard": source.identity_card,
            "WorkerName": source.name,
            "TeamLocalId": source.team_id,
        }),
    )
    .await?;

    let work_type_name = ningbo_worker_type_label(source.work_type);
    let validation_error = worker_sync_validation_error(source, &work_type_name);
    if let Some(error) = validation_error {
        finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&error)).await?;
        return Ok(());
    }
    let external_team_id = sqlx::query_scalar::<_, String>(
        r#"
        SELECT external_entity_id
        FROM integration_entity_mappings
        WHERE binding_id = $1
          AND entity_type = 'team'
          AND local_entity_id = $2
          AND is_deleted = FALSE
        LIMIT 1
        "#,
    )
    .bind(binding_id)
    .bind(source.team_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .and_then(|value| value.parse::<i64>().ok());
    let Some(external_team_id) = external_team_id else {
        finish_team_sync_job(
            state.db.pool(),
            job_id,
            "failed",
            None,
            Some("所属班组尚未成功上报，缺少市住建班组 ID"),
        )
        .await?;
        return Ok(());
    };

    let client = match ningbo_housing::build_client() {
        Ok(client) => client,
        Err(error) => {
            finish_team_sync_job(
                state.db.pool(),
                job_id,
                "failed",
                None,
                Some(&error.to_string()),
            )
            .await?;
            return Ok(());
        }
    };

    let platform_id = integration_binding_platform_id(state.db.pool(), binding_id).await?;
    let mut worker_code =
        cached_external_person_id(state.db.pool(), platform_id, source.identity_card.trim())
            .await?;

    if worker_code.is_none() {
        let lookup_url = credentials
            .endpoint("EnterpriseWorker/GetWorkerCode")
            .map(|url| url.to_string())
            .unwrap_or_else(|_| credentials.base_url.to_string());
        let lookup_payload = serde_json::json!({
            "IdentityCard": source.identity_card,
            "ProjectGuid": credentials.project_guid,
        });
        match ningbo_housing::get_worker_code(&client, &credentials, source.identity_card.trim())
            .await
        {
            Ok(response) => {
                let success = response.status.is_success();
                record_platform_http_attempt(
                    state.db.pool(),
                    job_id,
                    source.project_id,
                    binding_id,
                    "GET",
                    &lookup_url,
                    &lookup_payload,
                    Some(response.status.as_u16()),
                    Some(&response.body),
                    if success { "success" } else { "failed" },
                    (!success)
                        .then(|| ningbo_housing::response_message(&response.body))
                        .as_deref(),
                )
                .await?;
                if success {
                    worker_code = ningbo_housing::extract_worker_code(&response.body);
                }
            }
            Err(error) => {
                record_platform_http_attempt(
                    state.db.pool(),
                    job_id,
                    source.project_id,
                    binding_id,
                    "GET",
                    &lookup_url,
                    &lookup_payload,
                    None,
                    None,
                    "failed",
                    Some(&error.to_string()),
                )
                .await?;
            }
        }
    }

    if worker_code.is_none() {
        let basic_request = match build_ningbo_worker_basic_request(state, source).await {
            Ok(request) => request,
            Err(error) => {
                finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&error)).await?;
                return Ok(());
            }
        };
        let basic_payload = serde_json::to_value(&basic_request).unwrap_or(Value::Null);
        let basic_url = credentials
            .endpoint("EnterpriseWorker/AddOrUpdateWorker")
            .map(|url| url.to_string())
            .unwrap_or_else(|_| credentials.base_url.to_string());
        let response =
            match ningbo_housing::add_or_update_worker(&client, &credentials, &basic_request).await
            {
                Ok(response) => {
                    let success = response.status.is_success();
                    record_platform_http_attempt(
                        state.db.pool(),
                        job_id,
                        source.project_id,
                        binding_id,
                        "POST",
                        &basic_url,
                        &basic_payload,
                        Some(response.status.as_u16()),
                        Some(&response.body),
                        if success { "success" } else { "failed" },
                        (!success)
                            .then(|| ningbo_housing::response_message(&response.body))
                            .as_deref(),
                    )
                    .await?;
                    response
                }
                Err(error) => {
                    record_platform_http_attempt(
                        state.db.pool(),
                        job_id,
                        source.project_id,
                        binding_id,
                        "POST",
                        &basic_url,
                        &basic_payload,
                        None,
                        None,
                        "failed",
                        Some(&error.to_string()),
                    )
                    .await?;
                    finish_team_sync_job(
                        state.db.pool(),
                        job_id,
                        "failed",
                        None,
                        Some(&error.to_string()),
                    )
                    .await?;
                    return Ok(());
                }
            };
        if !response.status.is_success() {
            let message = ningbo_housing::response_message(&response.body);
            finish_team_sync_job(
                state.db.pool(),
                job_id,
                "failed",
                Some(&response.body),
                Some(&message),
            )
            .await?;
            return Ok(());
        }
        worker_code = ningbo_housing::extract_worker_code(&response.body);
    }
    let Some(worker_code) = worker_code else {
        finish_team_sync_job(
            state.db.pool(),
            job_id,
            "failed",
            None,
            Some("平台未返回甬建码"),
        )
        .await?;
        return Ok(());
    };
    if let Err(error) = upsert_external_person_identity(
        state.db.pool(),
        platform_id,
        source.identity_card.trim(),
        &worker_code,
        &serde_json::json!({
            "worker_name": source.name,
            "source": "ningbo_worker_sync",
        }),
    )
    .await
    {
        let message = format!("保存甬建码身份缓存失败：{}", error.message);
        finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&message)).await?;
        return Ok(());
    }

    let employment_request = ningbo_housing::AddEnterpriseWorkerRequest {
        enterprise_name: source.enterprise_name.trim().to_owned(),
        corp_code: source.corp_code.trim().to_owned(),
        worker_code: worker_code.clone(),
        work_date: source.entry_time.format("%Y-%m-%d").to_string(),
        current_work_type_name: work_type_name.clone(),
    };
    let employment_payload = serde_json::to_value(&employment_request).unwrap_or(Value::Null);
    let employment_url = credentials
        .endpoint("EnterpriseWorker/AddEnterpriseOfWorker")
        .map(|url| url.to_string())
        .unwrap_or_else(|_| credentials.base_url.to_string());
    let employment_response =
        match ningbo_housing::add_enterprise_worker(&client, &credentials, &employment_request)
            .await
        {
            Ok(response) => {
                let accepted = response.status.is_success()
                    || ningbo_housing::response_indicates_worker_already_employed(&response);
                record_platform_http_attempt(
                    state.db.pool(),
                    job_id,
                    source.project_id,
                    binding_id,
                    "POST",
                    &employment_url,
                    &employment_payload,
                    Some(response.status.as_u16()),
                    Some(&response.body),
                    if accepted { "success" } else { "failed" },
                    (!accepted)
                        .then(|| ningbo_housing::response_message(&response.body))
                        .as_deref(),
                )
                .await?;
                response
            }
            Err(error) => {
                record_platform_http_attempt(
                    state.db.pool(),
                    job_id,
                    source.project_id,
                    binding_id,
                    "POST",
                    &employment_url,
                    &employment_payload,
                    None,
                    None,
                    "failed",
                    Some(&error.to_string()),
                )
                .await?;
                finish_team_sync_job(
                    state.db.pool(),
                    job_id,
                    "failed",
                    None,
                    Some(&error.to_string()),
                )
                .await?;
                return Ok(());
            }
        };
    if !employment_response.status.is_success()
        && !ningbo_housing::response_indicates_worker_already_employed(&employment_response)
    {
        let message = ningbo_housing::response_message(&employment_response.body);
        finish_team_sync_job(
            state.db.pool(),
            job_id,
            "failed",
            Some(&employment_response.body),
            Some(&message),
        )
        .await?;
        return Ok(());
    }

    let project_request = ningbo_housing::AddProjectWorkerRequest {
        project_apartment_id: credentials.project_id,
        team_id: external_team_id,
        worker_code: worker_code.clone(),
        is_team_leader: source.is_team_leader,
        work_type_name,
        entry_time: source.entry_time.format("%Y-%m-%d").to_string(),
        entry_attach_file: None,
        entry_attach_file_extension: None,
        issue_card_date: None,
        issue_card_pic: None,
        issue_card_pic_extension: None,
        card_number: None,
        pay_roll_bank_card_number: nonempty_string(&source.salary_bank_card),
        bank_link_number: None,
        pay_roll_top_bank_code: None,
        has_buy_insurance: source.has_insurance,
    };
    let request_payload = serde_json::to_value(&project_request).unwrap_or(Value::Null);
    let project_url = credentials
        .endpoint("Project/AddWorkerV2")
        .map(|url| url.to_string())
        .unwrap_or_else(|_| credentials.base_url.to_string());
    let response =
        match ningbo_housing::add_project_worker(&client, &credentials, &project_request).await {
            Ok(response) => {
                let success = response.status.is_success();
                record_platform_http_attempt(
                    state.db.pool(),
                    job_id,
                    source.project_id,
                    binding_id,
                    "POST",
                    &project_url,
                    &request_payload,
                    Some(response.status.as_u16()),
                    Some(&response.body),
                    if success { "success" } else { "failed" },
                    (!success)
                        .then(|| ningbo_housing::response_message(&response.body))
                        .as_deref(),
                )
                .await?;
                response
            }
            Err(error) => {
                record_platform_http_attempt(
                    state.db.pool(),
                    job_id,
                    source.project_id,
                    binding_id,
                    "POST",
                    &project_url,
                    &request_payload,
                    None,
                    None,
                    "failed",
                    Some(&error.to_string()),
                )
                .await?;
                finish_team_sync_job(
                    state.db.pool(),
                    job_id,
                    "failed",
                    None,
                    Some(&error.to_string()),
                )
                .await?;
                return Ok(());
            }
        };
    let Some(project_worker_id) = (response.status.is_success())
        .then(|| ningbo_housing::extract_project_worker_id(&response.body))
        .flatten()
    else {
        let message = if response.status.is_success() {
            "平台未返回项目人员 ID".to_owned()
        } else {
            ningbo_housing::response_message(&response.body)
        };
        finish_team_sync_job(
            state.db.pool(),
            job_id,
            "failed",
            Some(&response.body),
            Some(&message),
        )
        .await?;
        return Ok(());
    };

    complete_worker_platform_mapping(
        state.db.pool(),
        source,
        binding_id,
        job_id,
        project_worker_id,
        external_team_id,
        serde_json::json!({
            "worker_code": worker_code,
            "project_worker_id": project_worker_id,
            "team_id": external_team_id,
            "request": request_payload,
            "platform_response": response.body,
        }),
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn edit_worker_on_ningbo_config(
    state: &AppState,
    source: &WorkerPlatformSyncSource,
    config_id: Uuid,
    binding_id: Uuid,
    config: &Value,
    credentials: &ningbo_housing::NingboHousingCredentials,
    mapping: &WorkerPlatformMapping,
) -> Result<Option<String>, ApiError> {
    let work_type_name = ningbo_worker_type_label(source.work_type);
    let initial_payload = serde_json::json!({
        "ProjectWorkerId": mapping.project_worker_id,
        "WorkerName": source.name,
        "TeamLocalId": source.team_id,
    });
    let job_id = upsert_worker_action_job(
        state.db.pool(),
        source,
        config_id,
        Some(binding_id),
        "Project/EditWorker",
        "update",
        &initial_payload,
    )
    .await?;
    if let Some(error) = worker_sync_validation_error(source, &work_type_name) {
        finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&error)).await?;
        return Ok(Some(error));
    }
    let external_team_id =
        current_external_team_id(state.db.pool(), binding_id, source.team_id).await?;
    let Some(external_team_id) = external_team_id else {
        let error = "所属班组尚未成功上报，缺少市住建班组 ID".to_owned();
        finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&error)).await?;
        return Ok(Some(error));
    };

    let basic_request = match build_ningbo_worker_basic_request(state, source).await {
        Ok(request) => request,
        Err(error) => {
            finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&error)).await?;
            return Ok(Some(error));
        }
    };
    let client = match ningbo_housing::build_client() {
        Ok(client) => client,
        Err(error) => {
            let message = error.to_string();
            finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&message)).await?;
            return Ok(Some(message));
        }
    };
    let basic_payload = serde_json::to_value(&basic_request).unwrap_or(Value::Null);
    let basic_url = credentials
        .endpoint("EnterpriseWorker/AddOrUpdateWorker")
        .map(|url| url.to_string())
        .unwrap_or_else(|_| credentials.base_url.to_string());
    let basic_response =
        match ningbo_housing::add_or_update_worker(&client, credentials, &basic_request).await {
            Ok(response) => {
                let success = response.status.is_success();
                record_platform_http_attempt(
                    state.db.pool(),
                    job_id,
                    source.project_id,
                    binding_id,
                    "POST",
                    &basic_url,
                    &basic_payload,
                    Some(response.status.as_u16()),
                    Some(&response.body),
                    if success { "success" } else { "failed" },
                    (!success)
                        .then(|| ningbo_housing::response_message(&response.body))
                        .as_deref(),
                )
                .await?;
                response
            }
            Err(error) => {
                let message = error.to_string();
                record_platform_http_attempt(
                    state.db.pool(),
                    job_id,
                    source.project_id,
                    binding_id,
                    "POST",
                    &basic_url,
                    &basic_payload,
                    None,
                    None,
                    "failed",
                    Some(&message),
                )
                .await?;
                finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&message))
                    .await?;
                return Ok(Some(message));
            }
        };
    if !basic_response.status.is_success() {
        let message = ningbo_housing::response_message(&basic_response.body);
        finish_team_sync_job(
            state.db.pool(),
            job_id,
            "failed",
            Some(&basic_response.body),
            Some(&message),
        )
        .await?;
        return Ok(Some(message));
    }
    let worker_code = ningbo_housing::extract_worker_code(&basic_response.body)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| mapping.worker_code.clone());
    if worker_code.trim().is_empty() {
        let error = "平台未返回甬建码，且项目人员映射中没有甬建码".to_owned();
        finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&error)).await?;
        return Ok(Some(error));
    }
    let platform_id = integration_binding_platform_id(state.db.pool(), binding_id).await?;
    if let Err(error) = upsert_external_person_identity(
        state.db.pool(),
        platform_id,
        source.identity_card.trim(),
        &worker_code,
        &serde_json::json!({ "worker_name": source.name, "source": "ningbo_worker_update" }),
    )
    .await
    {
        let message = format!("保存甬建码身份缓存失败：{}", error.message);
        finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&message)).await?;
        return Ok(Some(message));
    }

    let employment_request = ningbo_housing::AddEnterpriseWorkerRequest {
        enterprise_name: source.enterprise_name.trim().to_owned(),
        corp_code: source.corp_code.trim().to_owned(),
        worker_code: worker_code.clone(),
        work_date: source.entry_time.format("%Y-%m-%d").to_string(),
        current_work_type_name: work_type_name.clone(),
    };
    let employment_payload = serde_json::to_value(&employment_request).unwrap_or(Value::Null);
    let employment_url = credentials
        .endpoint("EnterpriseWorker/AddEnterpriseOfWorker")
        .map(|url| url.to_string())
        .unwrap_or_else(|_| credentials.base_url.to_string());
    let employment_response = match ningbo_housing::add_enterprise_worker(
        &client,
        credentials,
        &employment_request,
    )
    .await
    {
        Ok(response) => {
            let accepted = response.status.is_success()
                || ningbo_housing::response_indicates_worker_already_employed(&response);
            record_platform_http_attempt(
                state.db.pool(),
                job_id,
                source.project_id,
                binding_id,
                "POST",
                &employment_url,
                &employment_payload,
                Some(response.status.as_u16()),
                Some(&response.body),
                if accepted { "success" } else { "failed" },
                (!accepted)
                    .then(|| ningbo_housing::response_message(&response.body))
                    .as_deref(),
            )
            .await?;
            response
        }
        Err(error) => {
            let message = error.to_string();
            record_platform_http_attempt(
                state.db.pool(),
                job_id,
                source.project_id,
                binding_id,
                "POST",
                &employment_url,
                &employment_payload,
                None,
                None,
                "failed",
                Some(&message),
            )
            .await?;
            finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&message)).await?;
            return Ok(Some(message));
        }
    };
    if !employment_response.status.is_success()
        && !ningbo_housing::response_indicates_worker_already_employed(&employment_response)
    {
        let message = ningbo_housing::response_message(&employment_response.body);
        finish_team_sync_job(
            state.db.pool(),
            job_id,
            "failed",
            Some(&employment_response.body),
            Some(&message),
        )
        .await?;
        return Ok(Some(message));
    }

    if mapping.external_team_id != Some(external_team_id)
        || (!mapping.worker_code.is_empty() && mapping.worker_code != worker_code)
    {
        if let Some(error) = exit_worker_from_ningbo_config(
            state,
            source,
            config_id,
            binding_id,
            credentials,
            Some(mapping),
        )
        .await?
        {
            finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&error)).await?;
            return Ok(Some(error));
        }
        sync_worker_to_ningbo_config(state, source, config_id, config).await?;
        let rebound = worker_platform_mapping(state.db.pool(), binding_id, source.id)
            .await?
            .is_some();
        if rebound {
            finish_team_sync_job(
                state.db.pool(),
                job_id,
                "success",
                Some(&serde_json::json!({ "rebound": true })),
                None,
            )
            .await?;
            return Ok(None);
        }
        let error = "人员班组或身份变更后重新上报失败".to_owned();
        finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&error)).await?;
        return Ok(Some(error));
    }

    let request = ningbo_housing::EditProjectWorkerRequest {
        project_apartment_id: credentials.project_id,
        project_worker_id: mapping.project_worker_id,
        is_team_leader: source.is_team_leader,
        work_type_name,
        entry_time: source.entry_time.format("%Y-%m-%d").to_string(),
        entry_attach_file: None,
        entry_attach_file_extension: None,
        issue_card_date: None,
        issue_card_pic: None,
        issue_card_pic_extension: None,
        card_number: None,
        pay_roll_bank_card_number: nonempty_string(&source.salary_bank_card),
        bank_link_number: None,
        pay_roll_top_bank_code: None,
        has_buy_insurance: source.has_insurance,
    };
    let request_payload = serde_json::to_value(&request).unwrap_or(Value::Null);
    let edit_url = credentials
        .endpoint("Project/EditWorker")
        .map(|url| url.to_string())
        .unwrap_or_else(|_| credentials.base_url.to_string());
    let response = match ningbo_housing::edit_project_worker(&client, credentials, &request).await {
        Ok(response) => {
            let success = response.status.is_success();
            record_platform_http_attempt(
                state.db.pool(),
                job_id,
                source.project_id,
                binding_id,
                "POST",
                &edit_url,
                &request_payload,
                Some(response.status.as_u16()),
                Some(&response.body),
                if success { "success" } else { "failed" },
                (!success)
                    .then(|| ningbo_housing::response_message(&response.body))
                    .as_deref(),
            )
            .await?;
            response
        }
        Err(error) => {
            let message = error.to_string();
            record_platform_http_attempt(
                state.db.pool(),
                job_id,
                source.project_id,
                binding_id,
                "POST",
                &edit_url,
                &request_payload,
                None,
                None,
                "failed",
                Some(&message),
            )
            .await?;
            finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&message)).await?;
            return Ok(Some(message));
        }
    };
    if !response.status.is_success() {
        let message = ningbo_housing::response_message(&response.body);
        finish_team_sync_job(
            state.db.pool(),
            job_id,
            "failed",
            Some(&response.body),
            Some(&message),
        )
        .await?;
        return Ok(Some(message));
    }
    let payload = serde_json::json!({
        "worker_code": worker_code,
        "project_worker_id": mapping.project_worker_id,
        "team_id": external_team_id,
        "request": request_payload,
        "platform_response": response.body,
    });
    sqlx::query(
        r#"
        UPDATE integration_entity_mappings
        SET external_parent_id = $3,
            external_payload = $4,
            last_pushed_at = NOW(),
            updated_at = NOW()
        WHERE binding_id = $1
          AND entity_type = 'worker'
          AND local_entity_id = $2
          AND is_deleted = FALSE
        "#,
    )
    .bind(binding_id)
    .bind(source.id)
    .bind(external_team_id.to_string())
    .bind(&payload)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?;
    finish_team_sync_job(state.db.pool(), job_id, "success", Some(&payload), None).await?;
    Ok(None)
}

async fn current_external_team_id(
    pool: &sqlx::PgPool,
    binding_id: Uuid,
    local_team_id: Uuid,
) -> Result<Option<i64>, ApiError> {
    sqlx::query_scalar::<_, String>(
        r#"
        SELECT external_entity_id
        FROM integration_entity_mappings
        WHERE binding_id = $1
          AND entity_type = 'team'
          AND local_entity_id = $2
          AND is_deleted = FALSE
        LIMIT 1
        "#,
    )
    .bind(binding_id)
    .bind(local_team_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)
    .map(|value| value.and_then(|value| value.parse::<i64>().ok()))
}

async fn exit_worker_from_ningbo_config(
    state: &AppState,
    source: &WorkerPlatformSyncSource,
    config_id: Uuid,
    binding_id: Uuid,
    credentials: &ningbo_housing::NingboHousingCredentials,
    mapping: Option<&WorkerPlatformMapping>,
) -> Result<Option<String>, ApiError> {
    let request_payload = mapping.map_or_else(
        || serde_json::json!({ "skipped": true, "reason": "no_project_worker_mapping" }),
        |mapping| {
            serde_json::to_value(ningbo_housing::ProjectWorkerExitRequest {
                project_worker_id: mapping.project_worker_id.to_string(),
                exit_time: source
                    .exit_time
                    .unwrap_or_else(|| chrono::Local::now().date_naive())
                    .format("%Y-%m-%d")
                    .to_string(),
                exit_file: None,
                exit_file_extension: None,
            })
            .unwrap_or(Value::Null)
        },
    );
    let job_id = upsert_worker_action_job(
        state.db.pool(),
        source,
        config_id,
        Some(binding_id),
        "Project/ProjectWorkerExit",
        "exit",
        &request_payload,
    )
    .await?;
    let Some(mapping) = mapping else {
        finish_team_sync_job(
            state.db.pool(),
            job_id,
            "success",
            Some(&request_payload),
            None,
        )
        .await?;
        return Ok(None);
    };
    let request = ningbo_housing::ProjectWorkerExitRequest {
        project_worker_id: mapping.project_worker_id.to_string(),
        exit_time: source
            .exit_time
            .unwrap_or_else(|| chrono::Local::now().date_naive())
            .format("%Y-%m-%d")
            .to_string(),
        exit_file: None,
        exit_file_extension: None,
    };
    let client = match ningbo_housing::build_client() {
        Ok(client) => client,
        Err(error) => {
            let message = error.to_string();
            finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&message)).await?;
            return Ok(Some(message));
        }
    };
    let exit_url = credentials
        .endpoint("Project/ProjectWorkerExit")
        .map(|url| url.to_string())
        .unwrap_or_else(|_| credentials.base_url.to_string());
    let response = match ningbo_housing::exit_project_worker(&client, credentials, &request).await {
        Ok(response) => {
            let accepted = response.status.is_success()
                || ningbo_housing::response_indicates_worker_already_exited(&response);
            record_platform_http_attempt(
                state.db.pool(),
                job_id,
                source.project_id,
                binding_id,
                "POST",
                &exit_url,
                &request_payload,
                Some(response.status.as_u16()),
                Some(&response.body),
                if accepted { "success" } else { "failed" },
                (!accepted)
                    .then(|| ningbo_housing::response_message(&response.body))
                    .as_deref(),
            )
            .await?;
            response
        }
        Err(error) => {
            let message = error.to_string();
            record_platform_http_attempt(
                state.db.pool(),
                job_id,
                source.project_id,
                binding_id,
                "POST",
                &exit_url,
                &request_payload,
                None,
                None,
                "failed",
                Some(&message),
            )
            .await?;
            finish_team_sync_job(state.db.pool(), job_id, "failed", None, Some(&message)).await?;
            return Ok(Some(message));
        }
    };
    if !response.status.is_success()
        && !ningbo_housing::response_indicates_worker_already_exited(&response)
    {
        let message = ningbo_housing::response_message(&response.body);
        finish_team_sync_job(
            state.db.pool(),
            job_id,
            "failed",
            Some(&response.body),
            Some(&message),
        )
        .await?;
        return Ok(Some(message));
    }
    sqlx::query(
        r#"
        UPDATE integration_entity_mappings
        SET is_deleted = TRUE,
            deleted_at = NOW(),
            last_pushed_at = NOW(),
            external_payload = external_payload || $3::jsonb,
            updated_at = NOW()
        WHERE binding_id = $1
          AND entity_type = 'worker'
          AND local_entity_id = $2
          AND is_deleted = FALSE
        "#,
    )
    .bind(binding_id)
    .bind(source.id)
    .bind(serde_json::json!({
        "exit_request": request_payload,
        "exit_response": response.body,
    }))
    .execute(state.db.pool())
    .await
    .map_err(db_error)?;
    finish_team_sync_job(
        state.db.pool(),
        job_id,
        "success",
        Some(&serde_json::json!({ "platform_response": response.body })),
        None,
    )
    .await?;
    Ok(None)
}

fn worker_sync_validation_error(
    source: &WorkerPlatformSyncSource,
    work_type_name: &str,
) -> Option<String> {
    let required = [
        (source.name.trim(), "姓名"),
        (source.identity_card.trim(), "身份证号"),
        (source.enterprise_name.trim(), "任职企业名称"),
        (source.corp_code.trim(), "任职企业统一社会信用代码"),
        (work_type_name, "工种"),
    ];
    if let Some((_, label)) = required.iter().find(|(value, _)| value.is_empty()) {
        return Some(format!("{label}为空，无法上报市住建平台"));
    }
    if !ningbo_housing::is_valid_social_credit_code(source.corp_code.trim()) {
        return Some(format!(
            "任职企业统一社会信用代码格式错误：{}（应为 18 位大写字母或数字）",
            source.corp_code.trim()
        ));
    }
    None
}

fn worker_basic_profile_validation_error(source: &WorkerPlatformSyncSource) -> Option<String> {
    let required = [
        (source.address.trim(), "身份证地址"),
        (source.grant_org.trim(), "身份证签发机关"),
        (source.telephone.trim(), "手机号"),
        (source.nation_name.trim(), "民族"),
    ];
    required
        .iter()
        .find(|(value, _)| value.is_empty())
        .map(|(_, label)| format!("{label}为空，无法创建甬建码"))
}

async fn build_ningbo_worker_basic_request(
    state: &AppState,
    source: &WorkerPlatformSyncSource,
) -> Result<ningbo_housing::AddOrUpdateWorkerRequest, String> {
    if let Some(error) = worker_basic_profile_validation_error(source) {
        return Err(error);
    }
    let id_card_photo = load_worker_image_base64(
        state,
        &source.id_card_photo_url,
        NINGBO_WORKER_IMAGE_MAX_BYTES,
        "身份证人像面",
    )
    .await?;
    let face_photo = load_worker_image_base64(
        state,
        &source.face_photo_url,
        NINGBO_WORKER_IMAGE_MAX_BYTES,
        "人员头像",
    )
    .await?;
    Ok(ningbo_housing::AddOrUpdateWorkerRequest {
        worker_name: source.name.trim().to_owned(),
        identity_card: source.identity_card.trim().to_owned(),
        address: source.address.trim().to_owned(),
        grant_org: source.grant_org.trim().to_owned(),
        id_card_expire_date: ningbo_id_card_expire_date(source),
        marital_status: None,
        telephone: source.telephone.trim().to_owned(),
        national_name: "中国".to_owned(),
        nation_name: source.nation_name.trim().to_owned(),
        id_card_photo: id_card_photo.clone(),
        political_aff_name: ningbo_political_label(source.political_status).to_owned(),
        culture_level_type_name: ningbo_education_label(source.education).to_owned(),
        edu_level_name: None,
        degree_name: None,
        has_bad_medical_history: source.has_bad_medical_history,
        private_string_suit: None,
        urgent_link_man: None,
        urgent_link_man_phone: None,
        worker_type: if source.worker_type == Some(1001) {
            2
        } else {
            1
        },
        is_joined: false,
        joined_time: None,
        temporary_residence_permit_card: None,
        positive_id_card_file: Some(id_card_photo),
        negative_id_card_file: None,
        face_photo,
    })
}

// Keep every populated worker image sent to the Ningbo housing platform well
// below its Base64 field limits. PositiveIdCardFile reuses id_card_photo.
const NINGBO_WORKER_IMAGE_MAX_BYTES: usize = 20 * 1024;

async fn load_worker_image_base64(
    state: &AppState,
    public_url: &str,
    max_bytes: usize,
    label: &str,
) -> Result<String, String> {
    let trimmed = public_url.trim();
    if trimmed.is_empty() {
        return Err(format!("{label}为空，无法创建甬建码"));
    }
    if let Some((metadata, encoded)) = trimmed.split_once(',')
        && metadata.starts_with("data:image/")
        && metadata.ends_with(";base64")
    {
        let bytes = general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| format!("{label} Base64 格式错误"))?;
        let compressed = crate::infrastructure::image_compression::compress_to_jpeg_below_async(
            bytes, max_bytes,
        )
        .await
        .map_err(|error| format!("{label}{error}"))?;
        return Ok(general_purpose::STANDARD.encode(compressed));
    }

    let object_key = sqlx::query_scalar::<_, String>(
        r#"
        SELECT object_key
        FROM upload_files
        WHERE public_url = $1
          AND is_deleted = FALSE
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(trimmed)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|error| format!("读取{label}上传记录失败：{error}"))?
    .ok_or_else(|| format!("{label}不是系统上传文件，无法安全读取原图"))?;
    let bytes = state
        .storage
        .get(&object_key)
        .await
        .map_err(|error| format!("读取{label}失败：{error}"))?;
    let compressed = crate::infrastructure::image_compression::compress_to_jpeg_below_async(
        bytes.to_vec(),
        max_bytes,
    )
    .await
    .map_err(|error| format!("{label}{error}"))?;
    Ok(general_purpose::STANDARD.encode(compressed))
}

fn ningbo_id_card_expire_date(source: &WorkerPlatformSyncSource) -> Option<String> {
    let start = source.validity_period.trim().replace('-', "");
    let end = source.validity_period_end.trim().replace('-', "");
    (!start.is_empty() && !end.is_empty()).then(|| format!("{start} -{end}"))
}

fn ningbo_political_label(value: Option<i32>) -> &'static str {
    match value {
        Some(2) => "中共党员",
        Some(3) => "中共预备党员",
        Some(4) => "共青团员",
        Some(5) => "民主人士",
        _ => "群众",
    }
}

fn ningbo_education_label(value: Option<i32>) -> &'static str {
    match value {
        Some(1) => "小学",
        Some(2) => "初中",
        Some(3) => "高中",
        Some(4) => "中专",
        Some(5) => "大专",
        Some(6) => "本科",
        Some(7) => "硕士",
        _ => "其他",
    }
}

fn nonempty_string(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

async fn upsert_worker_sync_job(
    pool: &sqlx::PgPool,
    source: &WorkerPlatformSyncSource,
    config_id: Uuid,
    binding_id: Option<Uuid>,
    request_payload: &Value,
) -> Result<Uuid, ApiError> {
    upsert_worker_action_job(
        pool,
        source,
        config_id,
        binding_id,
        "Project/AddWorkerV2",
        "create",
        request_payload,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn upsert_worker_action_job(
    pool: &sqlx::PgPool,
    source: &WorkerPlatformSyncSource,
    config_id: Uuid,
    binding_id: Option<Uuid>,
    operation: &str,
    action: &str,
    request_payload: &Value,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO integration_jobs (
            project_id, binding_id, platform_code, operation, entity_type,
            local_entity_id, idempotency_key, request_payload, status,
            attempt_count, next_attempt_at, last_error, completed_at
        )
        VALUES ($1, $2, 'ningbo_housing', $3, 'worker', $4, $5, $6, 'pending', 0, NOW(), NULL, NULL)
        ON CONFLICT (idempotency_key)
        DO UPDATE SET
            binding_id = EXCLUDED.binding_id,
            request_payload = EXCLUDED.request_payload,
            response_payload = NULL,
            status = 'pending',
            attempt_count = 0,
            next_attempt_at = NOW(),
            last_error = NULL,
            completed_at = NULL,
            updated_at = NOW()
        RETURNING id
        "#,
    )
    .bind(source.project_id)
    .bind(binding_id)
    .bind(operation)
    .bind(source.id)
    .bind(format!(
        "ningbo_housing:worker:{action}:{}:{config_id}",
        source.id
    ))
    .bind(request_payload)
    .fetch_one(pool)
    .await
    .map_err(db_error)
}

async fn record_worker_sync_failure(
    pool: &sqlx::PgPool,
    source: &WorkerPlatformSyncSource,
    config_id: Uuid,
    binding_id: Option<Uuid>,
    error: &str,
) -> Result<(), ApiError> {
    let job_id = upsert_worker_sync_job(
        pool,
        source,
        config_id,
        binding_id,
        &serde_json::json!({ "worker_name": source.name }),
    )
    .await?;
    finish_team_sync_job(pool, job_id, "failed", None, Some(error)).await
}

#[allow(clippy::too_many_arguments)]
async fn record_worker_action_failure(
    pool: &sqlx::PgPool,
    source: &WorkerPlatformSyncSource,
    config_id: Uuid,
    binding_id: Option<Uuid>,
    operation: &str,
    action: &str,
    error: &str,
) -> Result<(), ApiError> {
    let job_id = upsert_worker_action_job(
        pool,
        source,
        config_id,
        binding_id,
        operation,
        action,
        &serde_json::json!({ "worker_name": source.name }),
    )
    .await?;
    finish_team_sync_job(pool, job_id, "failed", None, Some(error)).await
}

async fn complete_worker_platform_mapping(
    pool: &sqlx::PgPool,
    source: &WorkerPlatformSyncSource,
    binding_id: Uuid,
    job_id: Uuid,
    external_worker_id: i64,
    external_team_id: i64,
    payload: Value,
) -> Result<(), ApiError> {
    let result = sqlx::query(
        r#"
        INSERT INTO integration_entity_mappings (
            binding_id, project_id, entity_type, local_entity_id,
            external_entity_id, external_parent_id, external_payload,
            last_pushed_at, is_deleted, deleted_at
        )
        VALUES ($1, $2, 'worker', $3, $4, $5, $6, NOW(), FALSE, NULL)
        ON CONFLICT (binding_id, entity_type, local_entity_id) WHERE is_deleted = FALSE
        DO UPDATE SET
            external_entity_id = EXCLUDED.external_entity_id,
            external_parent_id = EXCLUDED.external_parent_id,
            external_payload = EXCLUDED.external_payload,
            last_pushed_at = NOW(),
            updated_at = NOW()
        "#,
    )
    .bind(binding_id)
    .bind(source.project_id)
    .bind(source.id)
    .bind(external_worker_id.to_string())
    .bind(external_team_id.to_string())
    .bind(&payload)
    .execute(pool)
    .await;
    if let Err(error) = result {
        let message = format!("保存市住建项目人员 ID 失败：{error}");
        finish_team_sync_job(pool, job_id, "failed", Some(&payload), Some(&message)).await?;
        return Ok(());
    }
    finish_team_sync_job(pool, job_id, "success", Some(&payload), None).await?;
    sqlx::query(
        "UPDATE integration_project_bindings SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1",
    )
    .bind(binding_id)
    .execute(pool)
    .await
    .map_err(db_error)?;
    Ok(())
}

async fn integration_binding_platform_id(
    pool: &sqlx::PgPool,
    binding_id: Uuid,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT platform_id FROM integration_project_bindings WHERE id = $1 AND is_deleted = FALSE",
    )
    .bind(binding_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(|| invalid_input("市住建项目绑定不存在"))
}

async fn cached_external_person_id(
    pool: &sqlx::PgPool,
    platform_id: Uuid,
    identity_card: &str,
) -> Result<Option<String>, ApiError> {
    sqlx::query_scalar::<_, String>(
        r#"
        SELECT external_person_id
        FROM integration_person_identities
        WHERE platform_id = $1
          AND identity_type = 'id_card'
          AND identity_value = UPPER(BTRIM($2))
          AND is_deleted = FALSE
        LIMIT 1
        "#,
    )
    .bind(platform_id)
    .bind(identity_card)
    .fetch_optional(pool)
    .await
    .map_err(db_error)
}

async fn upsert_external_person_identity(
    pool: &sqlx::PgPool,
    platform_id: Uuid,
    identity_card: &str,
    external_person_id: &str,
    payload: &Value,
) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        INSERT INTO integration_person_identities (
            platform_id, identity_type, identity_value, external_person_id,
            external_payload, last_verified_at, is_deleted, deleted_at
        )
        VALUES ($1, 'id_card', UPPER(BTRIM($2)), $3, $4, NOW(), FALSE, NULL)
        ON CONFLICT (platform_id, identity_type, identity_value) WHERE is_deleted = FALSE
        DO UPDATE SET
            external_person_id = EXCLUDED.external_person_id,
            external_payload = EXCLUDED.external_payload,
            last_verified_at = NOW(),
            updated_at = NOW()
        "#,
    )
    .bind(platform_id)
    .bind(identity_card)
    .bind(external_person_id)
    .bind(payload)
    .execute(pool)
    .await
    .map_err(db_error)?;
    Ok(())
}

pub async fn list_workers(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let params = resource_list_params(&uri)?;
    let mut scoped_columns = Vec::new();
    if let Some(unit_id) = params.unit_id {
        scoped_columns.push(("unit_id", unit_id));
    }
    if let Some(team_id) = params.team_id {
        scoped_columns.push(("team_id", team_id));
    }

    list_workers_page(
        state.db.pool(),
        project_id,
        &[("project_id", project_id)],
        &scoped_columns,
        &params,
    )
    .await
}

async fn list_workers_page(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    where_uuid_columns: &[(&'static str, Uuid)],
    scoped_uuid_columns: &[(&'static str, Uuid)],
    params: &ResourceListParams,
) -> ApiResult<Value> {
    let total = count_rows(
        pool,
        "construction_workers",
        where_uuid_columns,
        scoped_uuid_columns,
        params,
    )
    .await?;
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                r.*,
                COALESCE(issue_stats.success_device_count, 0)::int AS attendance_issue_success_device_count,
                COALESCE(device_stats.total_device_count, 0)::int AS attendance_device_total_count,
                COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'platform_name', config.platform_name,
                            'platform_type', config.platform_type,
                            'is_enabled', config.is_enabled,
                            'status', CASE
                                WHEN (config.platform_type = 'ningbo_housing' OR config.platform_name = '市住建')
                                     AND (r.worker_type = 1001 OR r.work_type = 1001) THEN 'ignored'
                                WHEN latest_job.id IS NULL THEN 'not_reported'
                                WHEN latest_job.status IN ('success', 'completed') THEN 'success'
                                WHEN latest_job.status IN ('pending', 'processing', 'retry', 'awaiting_result', 'waiting_dependency', 'waiting_media') THEN 'pending'
                                ELSE 'failed'
                            END,
                            'failure_reason', CASE
                                WHEN latest_job.id IS NOT NULL
                                     AND latest_job.status NOT IN ('success', 'completed', 'pending', 'processing', 'retry', 'awaiting_result', 'waiting_dependency', 'waiting_media')
                                    THEN COALESCE(
                                        NULLIF(latest_job.last_error, ''),
                                        latest_job.response_payload ->> 'message',
                                        latest_job.response_payload ->> 'msg',
                                        '上报未完成，请修正上报'
                                    )
                                ELSE NULL
                            END,
                            'reported_at', latest_job.updated_at
                        )
                        ORDER BY config.created_at, config.platform_name
                    )
                    FROM construction_platform_configs config
                    LEFT JOIN LATERAL (
                        SELECT job.id, job.status, job.last_error, job.response_payload, job.updated_at
                        FROM integration_jobs job
                        LEFT JOIN integration_project_bindings binding
                          ON binding.id = job.binding_id
                        WHERE job.project_id = r.project_id
                          AND job.entity_type IN ('worker', 'construction_worker')
                          AND job.local_entity_id = r.id
                          AND platform_job_matches_config(job.binding_id, job.platform_code, binding.platform_config_id, config.id, config.project_id, config.platform_type)
                        ORDER BY job.updated_at DESC, job.id DESC
                        LIMIT 1
                    ) latest_job ON TRUE
                    WHERE config.project_id = r.project_id
                      AND config.is_deleted = FALSE
                      AND config.is_enabled = TRUE
                ), '[]'::jsonb) AS reporting_platforms
            FROM construction_workers r
            LEFT JOIN (
                SELECT
                    latest.worker_id,
                    COUNT(*) FILTER (
                        WHERE latest.status = 'success'
                          AND latest.action <> 'delete'
                    )::int AS success_device_count
                FROM (
                    SELECT DISTINCT ON (ir.worker_id, ir.attendance_device_id)
                        ir.worker_id,
                        ir.attendance_device_id,
                        ir.status,
                        ir.action
                    FROM construction_attendance_device_issue_reports ir
                    JOIN construction_attendance_devices d
                      ON d.id = ir.attendance_device_id
                     AND d.is_deleted = FALSE
                    WHERE ir.is_deleted = FALSE
                      AND ir.worker_id IS NOT NULL
                      AND ir.attendance_device_id IS NOT NULL
                    ORDER BY ir.worker_id, ir.attendance_device_id, ir.issued_at DESC, ir.created_at DESC
                ) latest
                GROUP BY latest.worker_id
            ) issue_stats ON issue_stats.worker_id = r.id
            LEFT JOIN (
                SELECT
                    project_id,
                    COUNT(*)::int AS total_device_count
                FROM construction_attendance_devices
                WHERE is_deleted = FALSE
                  AND COALESCE(NULLIF(BTRIM(serial_number), ''), NULL) IS NOT NULL
                GROUP BY project_id
            ) device_stats ON device_stats.project_id = r.project_id
            WHERE r.is_deleted = FALSE
        "#,
    );
    push_uuid_filters(&mut query, where_uuid_columns);
    push_uuid_filters(&mut query, scoped_uuid_columns);
    push_resource_filters(&mut query, "construction_workers", params);
    query
        .push(" ORDER BY r.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") r");

    let items = query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;
    let reporting_summary = worker_reporting_summary(pool, project_id).await?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "reporting_summary": reporting_summary,
    })))
}

async fn worker_reporting_summary(
    pool: &sqlx::PgPool,
    project_id: Uuid,
) -> Result<Value, ApiError> {
    sqlx::query_scalar::<_, Value>(
        r#"
        WITH worker_platform_statuses AS (
            SELECT
                config.id AS platform_config_id,
                config.platform_name,
                config.platform_type,
                config.created_at AS platform_created_at,
                worker.id AS worker_id,
                CASE
                    WHEN (config.platform_type = 'ningbo_housing' OR config.platform_name = '市住建')
                         AND (worker.worker_type = 1001 OR worker.work_type = 1001) THEN 'ignored'
                    WHEN worker.id IS NULL OR latest_job.id IS NULL THEN 'not_reported'
                    WHEN latest_job.status IN ('success', 'completed') THEN 'success'
                    WHEN latest_job.status IN ('pending', 'processing', 'retry', 'awaiting_result', 'waiting_dependency', 'waiting_media') THEN 'pending'
                    ELSE 'failed'
                END AS reporting_status
            FROM construction_platform_configs config
            LEFT JOIN construction_workers worker
              ON worker.project_id = config.project_id
             AND worker.is_deleted = FALSE
            LEFT JOIN LATERAL (
                SELECT job.id, job.status
                FROM integration_jobs job
                LEFT JOIN integration_project_bindings binding
                  ON binding.id = job.binding_id
                WHERE job.project_id = config.project_id
                  AND job.entity_type IN ('worker', 'construction_worker')
                  AND job.local_entity_id = worker.id
                  AND platform_job_matches_config(job.binding_id, job.platform_code, binding.platform_config_id, config.id, config.project_id, config.platform_type)
                ORDER BY job.updated_at DESC, job.id DESC
                LIMIT 1
            ) latest_job ON TRUE
            WHERE config.project_id = $1
              AND config.is_deleted = FALSE
              AND config.is_enabled = TRUE
        ), platform_summary AS (
            SELECT
                platform_config_id,
                platform_name,
                platform_type,
                platform_created_at,
                COUNT(*) FILTER (WHERE worker_id IS NOT NULL AND reporting_status <> 'ignored')::int AS total_count,
                COUNT(*) FILTER (WHERE worker_id IS NOT NULL AND reporting_status = 'success')::int AS success_count,
                COUNT(*) FILTER (WHERE worker_id IS NOT NULL AND reporting_status = 'failed')::int AS failure_count,
                COUNT(*) FILTER (WHERE worker_id IS NOT NULL AND reporting_status = 'pending')::int AS pending_count,
                COUNT(*) FILTER (WHERE worker_id IS NOT NULL AND reporting_status = 'not_reported')::int AS not_reported_count,
                COUNT(*) FILTER (WHERE worker_id IS NOT NULL AND reporting_status = 'ignored')::int AS ignored_count
            FROM worker_platform_statuses
            GROUP BY platform_config_id, platform_name, platform_type, platform_created_at
        )
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'platform_name', platform_name,
                    'platform_type', platform_type,
                    'total_count', total_count,
                    'success_count', success_count,
                    'failure_count', failure_count,
                    'pending_count', pending_count,
                    'not_reported_count', not_reported_count,
                    'ignored_count', ignored_count
                ) ORDER BY platform_created_at, platform_name
            ),
            '[]'::jsonb
        )
        FROM platform_summary
        "#,
    )
    .bind(project_id)
    .fetch_one(pool)
    .await
    .map_err(db_error)
}

pub async fn list_personnel_workers(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    uri: Uri,
) -> ApiResult<Value> {
    let params = resource_list_params(&uri)?;
    let total = count_personnel_workers(state.db.pool(), &auth_user, &params).await?;
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb) FROM (SELECT w.*, COALESCE(p.name, '未命名项目') AS project_name FROM construction_workers w JOIN construction_projects p ON p.id = w.project_id AND p.is_deleted = FALSE WHERE w.is_deleted = FALSE",
    );
    push_accessible_project_scope(&mut query, &auth_user, "w.project_id");
    push_personnel_worker_filters(&mut query, &params);
    query
        .push(" ORDER BY w.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") r");

    let items = query
        .build_query_scalar::<Value>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

pub async fn get_personnel_worker(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(worker_id): Path<Uuid>,
) -> ApiResult<Value> {
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT to_jsonb(r) FROM (SELECT w.*, COALESCE(p.name, '未命名项目') AS project_name, u.company_name AS unit_name, t.name AS team_name FROM construction_workers w JOIN construction_projects p ON p.id = w.project_id AND p.is_deleted = FALSE LEFT JOIN construction_units u ON u.id = w.unit_id AND u.is_deleted = FALSE LEFT JOIN construction_teams t ON t.id = w.team_id AND t.is_deleted = FALSE WHERE w.is_deleted = FALSE AND w.id = ",
    );
    query.push_bind(worker_id);
    push_accessible_project_scope(&mut query, &auth_user, "w.project_id");
    query.push(") r");

    let item = query
        .build_query_scalar::<Value>()
        .fetch_optional(state.db.pool())
        .await
        .map_err(db_error)?
        .ok_or_else(not_found)?;

    Ok(ApiSuccess::default().with_data(item))
}

pub async fn get_worker(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, worker_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    get_row(
        state.db.pool(),
        "construction_workers",
        &[("project_id", project_id), ("id", worker_id)],
    )
    .await
}

pub async fn update_worker(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, worker_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let before_platform_fields =
        fetch_worker_platform_fields(state.db.pool(), project_id, worker_id).await?;
    let before_issue_fields =
        fetch_worker_issue_fields(state.db.pool(), project_id, worker_id).await?;
    let body = normalize_worker_body(body, false)?;
    check_worker_phone_id_card_unique(state.db.pool(), project_id, Some(worker_id), &body).await?;
    let response = update_row(
        state.db.pool(),
        "construction_workers",
        WORKER_COLUMNS,
        &body,
        &[("project_id", project_id), ("id", worker_id)],
    )
    .await?;

    let after_platform_fields =
        fetch_worker_platform_fields(state.db.pool(), project_id, worker_id).await?;
    if platform_fields_changed(&before_platform_fields, &after_platform_fields)
        && let Err(error) = crate::feature::integration::outbox_worker::enqueue_worker_reconcile(
            state.db.pool(),
            project_id,
            worker_id,
            false,
        )
        .await
    {
        tracing::error!(%worker_id, error = %error, "Failed to enqueue Ningbo worker update");
    }

    let after_issue_fields =
        fetch_worker_issue_fields(state.db.pool(), project_id, worker_id).await?;
    if let (Some(before), Some(after)) = (before_issue_fields, after_issue_fields) {
        enqueue_worker_reissue_after_change(
            state.db.pool(),
            project_id,
            worker_id,
            &before,
            &after,
        )
        .await;
    }

    Ok(response)
}

async fn fetch_worker_platform_fields(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    worker_id: Uuid,
) -> Result<Option<Value>, ApiError> {
    sqlx::query_scalar::<_, Value>(
        r#"
        SELECT to_jsonb(worker) - ARRAY[
            'id', 'owner_user_id', 'is_deleted', 'project_id',
            'created_at', 'updated_at', 'deleted_at'
        ]::text[]
        FROM construction_workers worker
        WHERE worker.is_deleted = FALSE
          AND worker.project_id = $1
          AND worker.id = $2
        "#,
    )
    .bind(project_id)
    .bind(worker_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)
}

fn platform_fields_changed(before: &Option<Value>, after: &Option<Value>) -> bool {
    matches!((before, after), (Some(before), Some(after)) if before != after)
}

#[derive(Debug, Clone)]
struct WorkerIssueFields {
    name: Option<String>,
    id_card: Option<String>,
    phone: Option<String>,
    avatar: Option<String>,
    work_status: Option<i16>,
}

impl WorkerIssueFields {
    fn device_payload_changed(&self, other: &Self) -> bool {
        normalized_issue_text(&self.name) != normalized_issue_text(&other.name)
            || normalized_issue_text(&self.id_card) != normalized_issue_text(&other.id_card)
            || normalized_issue_text(&self.phone) != normalized_issue_text(&other.phone)
            || normalized_issue_text(&self.avatar) != normalized_issue_text(&other.avatar)
    }

    fn active_on_device(&self) -> bool {
        self.work_status.unwrap_or(1) != 2
    }

    fn issue_action_after_change(&self, other: &Self) -> Option<&'static str> {
        if !other.active_on_device() {
            return self.active_on_device().then_some("delete");
        }

        if !self.active_on_device() || self.device_payload_changed(other) {
            return Some("update");
        }

        None
    }
}

async fn fetch_worker_issue_fields(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    worker_id: Uuid,
) -> Result<Option<WorkerIssueFields>, ApiError> {
    sqlx::query_as::<
        _,
        (
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<i16>,
        ),
    >(
        r#"
        SELECT name, id_card, phone, avatar, work_status
        FROM construction_workers
        WHERE is_deleted = FALSE
          AND project_id = $1
          AND id = $2
        "#,
    )
    .bind(project_id)
    .bind(worker_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)
    .map(|row| {
        row.map(
            |(name, id_card, phone, avatar, work_status)| WorkerIssueFields {
                name,
                id_card,
                phone,
                avatar,
                work_status,
            },
        )
    })
}

async fn enqueue_worker_reissue_after_change(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    worker_id: Uuid,
    before: &WorkerIssueFields,
    after: &WorkerIssueFields,
) {
    let Some(action) = before.issue_action_after_change(after) else {
        return;
    };

    if let Err(error) = crate::feature::integration::outbox_worker::enqueue_worker_device_reconcile(
        pool, project_id, worker_id, action,
    )
    .await
    {
        tracing::error!(
            %project_id,
            %worker_id,
            %action,
            error = %error,
            "Failed to enqueue attendance device worker update"
        );
    }
}

pub(crate) async fn reconcile_worker_to_attendance_devices(
    state: &AppState,
    project_id: Uuid,
    worker_id: Uuid,
    action: &str,
) {
    trigger_worker_device_issue(
        state,
        project_id,
        worker_id,
        action,
        if action == "delete" {
            "人员退场后异步从考勤机删除"
        } else {
            "人员资料修改后异步下发"
        },
    )
    .await;
}

async fn trigger_worker_device_issue(
    state: &AppState,
    project_id: Uuid,
    worker_id: Uuid,
    action: &str,
    remark: &str,
) {
    let broker_url = state.config.mqtt_broker_url.as_deref();

    let device_ids = match list_project_attendance_device_ids(state.db.pool(), project_id).await {
        Ok(device_ids) => device_ids,
        Err(error) => {
            tracing::warn!(
                %project_id,
                %worker_id,
                %action,
                error = ?error,
                "查询项目考勤机失败，跳过人员同步"
            );
            return;
        }
    };

    for device_id in device_ids {
        if let Err(error) = issue_single_worker_via_broker(
            state.db.pool(),
            broker_url,
            project_id,
            worker_id,
            device_id,
            action,
            None,
            Some(remark),
        )
        .await
        {
            tracing::warn!(
                %project_id,
                %worker_id,
                %device_id,
                %action,
                error = %error,
                "考勤机人员同步失败"
            );
        }
    }
}

async fn list_project_attendance_device_ids(
    pool: &sqlx::PgPool,
    project_id: Uuid,
) -> Result<Vec<Uuid>, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT id
        FROM construction_attendance_devices
        WHERE is_deleted = FALSE
          AND project_id = $1
          AND serial_number IS NOT NULL
          AND BTRIM(serial_number) <> ''
          AND COALESCE(device_type, '') <> '弹厂家'
        ORDER BY created_at ASC
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await
    .map_err(db_error)
}

fn normalized_issue_text(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub async fn delete_worker(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, worker_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    trigger_worker_device_issue(
        &state,
        project_id,
        worker_id,
        "delete",
        "人员删除前自动从考勤机删除",
    )
    .await;
    let response = delete_row(
        state.db.pool(),
        "construction_workers",
        &[("project_id", project_id), ("id", worker_id)],
    )
    .await?;
    if let Err(error) = crate::feature::integration::outbox_worker::enqueue_worker_reconcile(
        state.db.pool(),
        project_id,
        worker_id,
        true,
    )
    .await
    {
        tracing::error!(%worker_id, %project_id, error = %error, "Failed to enqueue Ningbo worker exit");
    }
    Ok(response)
}

pub async fn list_attendance(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let params = resource_list_params(&uri)?;

    match params.view {
        ResourceListView::Calendar => {
            return list_attendance_calendar(state.db.pool(), project_id, &params).await;
        }
        ResourceListView::Stats => {
            return list_attendance_stats(state.db.pool(), project_id, &params).await;
        }
        ResourceListView::List => {}
    }

    list_attendance_rows_page(state.db.pool(), project_id, &params).await
}

async fn list_attendance_rows_page(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    params: &ResourceListParams,
) -> ApiResult<Value> {
    let total = count_rows(
        pool,
        "construction_attendance_records",
        &[("project_id", project_id)],
        &[],
        params,
    )
    .await?;
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
SELECT COALESCE(jsonb_agg(row_json ORDER BY created_at DESC), '[]'::jsonb)
FROM (
    SELECT
        to_jsonb(r) || jsonb_build_object(
            'overall_photo', COALESCE(r.overall_photo, overall_photo.photo_data),
            'closeup_photo', COALESCE(r.closeup_photo, closeup_photo.photo_data),
            'yongxin_reporting', jsonb_build_object(
                'enabled', yongxin_config.enabled,
                'job_id', yongxin_job.id,
                'status', CASE
                    WHEN yongxin_job.id IS NULL AND NOT yongxin_config.enabled THEN 'not_configured'
                    WHEN yongxin_job.id IS NULL THEN 'not_reported'
                    ELSE yongxin_job.status
                END,
                'message', yongxin_job.last_error,
                'external_request_id', yongxin_job.external_request_id,
                'remote_state', yongxin_job.remote_state,
                'updated_at', yongxin_job.updated_at
            )
        ) AS row_json,
        r.created_at
    FROM construction_attendance_records r
    LEFT JOIN LATERAL (
        SELECT photo_data
        FROM construction_attendance_record_photos photo
        WHERE photo.attendance_record_id = r.id
          AND photo.photo_kind = 'overall'
        ORDER BY photo.created_at DESC, photo.id DESC
        LIMIT 1
    ) overall_photo ON TRUE
    LEFT JOIN LATERAL (
        SELECT photo_data
        FROM construction_attendance_record_photos photo
        WHERE photo.attendance_record_id = r.id
          AND photo.photo_kind = 'closeup'
        ORDER BY photo.created_at DESC, photo.id DESC
        LIMIT 1
    ) closeup_photo ON TRUE
    LEFT JOIN LATERAL (
        SELECT EXISTS (
            SELECT 1
            FROM construction_platform_configs config
            WHERE config.project_id = r.project_id
              AND config.platform_type = 'yongxin_v2'
              AND config.is_deleted = FALSE
              AND config.is_enabled = TRUE
              AND COALESCE(
                    config.config #>> '{modules,sync_attendance}',
                    config.config ->> 'sync_attendance',
                    'true'
                  )::boolean = TRUE
        ) AS enabled
    ) yongxin_config ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            job.id,
            job.status,
            job.last_error,
            job.external_request_id,
            job.remote_state,
            job.updated_at
        FROM integration_jobs job
        WHERE job.project_id = r.project_id
          AND job.entity_type = 'attendance'
          AND job.local_entity_id = r.id
          AND job.operation = 'attendance.sync'
          AND job.platform_code = 'yongxin_v2'
        ORDER BY job.updated_at DESC, job.id DESC
        LIMIT 1
    ) yongxin_job ON TRUE
    WHERE r.is_deleted = FALSE
      AND r.project_id =
"#,
    );
    query.push_bind(project_id);
    push_resource_filters(&mut query, "construction_attendance_records", params);
    query
        .push(" ORDER BY r.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") r");

    let items = query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

async fn list_attendance_calendar(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    params: &ResourceListParams,
) -> ApiResult<Value> {
    let month = params.attendance_month.unwrap_or_else(|| {
        let today = chrono::Utc::now().date_naive();
        chrono::NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap_or(today)
    });
    let next_month = if month.month() == 12 {
        chrono::NaiveDate::from_ymd_opt(month.year() + 1, 1, 1)
    } else {
        chrono::NaiveDate::from_ymd_opt(month.year(), month.month() + 1, 1)
    }
    .ok_or_else(|| invalid_column_value("month", "YYYY-MM"))?;

    let mut query = QueryBuilder::<Postgres>::new(
        r#"
WITH base AS (
    SELECT
        r.id,
        r.worker_id,
        r.direction,
        r.trigger_time,
        w.name AS worker_name,
        w.team_id,
        t.name AS team_name,
        (r.trigger_time AT TIME ZONE 'Asia/Shanghai')::date AS local_date,
        to_char(r.trigger_time AT TIME ZONE 'Asia/Shanghai', 'HH24:MI') AS local_time
    FROM construction_attendance_records r
    JOIN construction_workers w ON w.id = r.worker_id AND w.is_deleted = FALSE
    LEFT JOIN construction_teams t ON t.id = w.team_id AND t.is_deleted = FALSE
    WHERE r.is_deleted = FALSE
      AND r.project_id =
"#,
    );
    query.push_bind(project_id);
    query
        .push(" AND (r.trigger_time AT TIME ZONE 'Asia/Shanghai')::date >= ")
        .push_bind(month)
        .push(" AND (r.trigger_time AT TIME ZONE 'Asia/Shanghai')::date < ")
        .push_bind(next_month);
    push_resource_filters(&mut query, "construction_attendance_records", params);
    query.push(
        r#"
),
	work_config AS (
	    SELECT algorithm_type, rules
	    FROM (
	        SELECT algorithm_type, rules, is_enabled
	        FROM construction_work_hour_configs
	        WHERE is_deleted = FALSE
	          AND project_id =
"#,
    );
    query.push_bind(project_id);
    query.push(
        r#"
	        ORDER BY updated_at DESC, created_at DESC
	        LIMIT 1
	    ) latest_config
	    WHERE is_enabled = TRUE
	),
config_segments AS (
    SELECT
        COALESCE(NULLIF(segment.value->>'fromHours', '')::numeric, NULLIF(segment.value->>'startHour', '')::numeric, 0) AS from_hours,
        COALESCE(NULLIF(segment.value->>'toHours', '')::numeric, NULLIF(segment.value->>'endHour', '')::numeric, 24) AS to_hours,
        COALESCE(NULLIF(segment.value->>'rate', '')::numeric, NULLIF(segment.value->>'multiplier', '')::numeric, 1) AS rate
    FROM work_config wc
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(wc.rules->'segments') = 'array' AND jsonb_array_length(wc.rules->'segments') > 0 THEN wc.rules->'segments'
            WHEN wc.rules ? 'overtimeAfterHours' THEN jsonb_build_array(
                jsonb_build_object(
                    'fromHours', 0,
                    'toHours', COALESCE(NULLIF(wc.rules->>'overtimeAfterHours', '')::numeric, 8),
                    'rate', 1
                ),
                jsonb_build_object(
                    'fromHours', COALESCE(NULLIF(wc.rules->>'overtimeAfterHours', '')::numeric, 8),
                    'toHours', COALESCE(NULLIF(wc.rules->>'maxHours', '')::numeric, 24),
                    'rate', COALESCE(NULLIF(wc.rules#>>'{overtime,rate}', '')::numeric, NULLIF(wc.rules#>>'{nightShift,ratio}', '')::numeric, 1.5)
                )
            )
            WHEN wc.rules ? 'standardHoursPerDay' OR wc.rules ? 'dayHours' THEN jsonb_build_array(
                jsonb_build_object(
                    'fromHours', 0,
                    'toHours', COALESCE(NULLIF(wc.rules->>'standardHoursPerDay', '')::numeric, NULLIF(wc.rules->>'dayHours', '')::numeric, 8),
                    'rate', 1
                )
            )
            ELSE '[]'::jsonb
        END
    ) AS segment(value)
),
first_in AS (
    SELECT DISTINCT ON (worker_id, local_date)
        worker_id,
        worker_name,
        team_id,
        team_name,
        local_date,
        id AS first_in_record_id,
        trigger_time AS first_in_trigger_time,
        local_time AS first_in_time
    FROM base
    WHERE direction = 0
    ORDER BY worker_id, local_date, trigger_time ASC, id ASC
),
last_out AS (
    SELECT DISTINCT ON (worker_id, local_date)
        worker_id,
        worker_name,
        team_id,
        team_name,
        local_date,
        id AS last_out_record_id,
        trigger_time AS last_out_trigger_time,
        local_time AS last_out_time
    FROM base
    WHERE direction = 1
    ORDER BY worker_id, local_date, trigger_time DESC, id DESC
),
daily AS (
    SELECT
        COALESCE(fi.worker_id, lo.worker_id) AS worker_id,
        COALESCE(fi.worker_name, lo.worker_name) AS worker_name,
        COALESCE(fi.team_id, lo.team_id) AS team_id,
        COALESCE(fi.team_name, lo.team_name) AS team_name,
        COALESCE(fi.local_date, lo.local_date) AS local_date,
        EXTRACT(DAY FROM COALESCE(fi.local_date, lo.local_date))::int AS day,
        fi.first_in_record_id,
        fi.first_in_trigger_time,
        fi.first_in_time,
        lo.last_out_record_id,
        lo.last_out_trigger_time,
        lo.last_out_time
    FROM first_in fi
    FULL OUTER JOIN last_out lo
      ON lo.worker_id = fi.worker_id
     AND lo.local_date = fi.local_date
),
daily_with_hours AS (
    SELECT
        daily.*,
        CASE
            WHEN first_in_trigger_time IS NULL OR last_out_trigger_time IS NULL THEN 0::numeric
            WHEN last_out_trigger_time <= first_in_trigger_time THEN 0::numeric
            WHEN EXTRACT(EPOCH FROM (last_out_trigger_time - first_in_trigger_time)) / 3600.0 > 23.5 THEN 0::numeric
            ELSE ROUND((EXTRACT(EPOCH FROM (last_out_trigger_time - first_in_trigger_time)) / 3600.0)::numeric, 2)
        END AS working_hours
    FROM daily
),
daily_with_work_point AS (
    SELECT
        daily_with_hours.*,
        CASE
            WHEN first_in_trigger_time IS NULL OR last_out_trigger_time IS NULL OR working_hours <= 0 THEN 0::numeric
            ELSE COALESCE(
                (
                    SELECT rate
                    FROM config_segments
                    WHERE daily_with_hours.working_hours >= from_hours
                      AND daily_with_hours.working_hours < to_hours
                    ORDER BY from_hours
                    LIMIT 1
                ),
                CASE
                    WHEN NOT EXISTS (SELECT 1 FROM config_segments) AND daily_with_hours.working_hours >= 2 AND daily_with_hours.working_hours < 4 THEN 0.5
                    WHEN NOT EXISTS (SELECT 1 FROM config_segments) AND daily_with_hours.working_hours >= 4 AND daily_with_hours.working_hours < 20 THEN 1
                    WHEN NOT EXISTS (SELECT 1 FROM config_segments) AND daily_with_hours.working_hours >= 20 THEN 1.5
                    ELSE 0
                END
            )
        END AS work_point,
        COALESCE((SELECT algorithm_type FROM work_config), 'default') AS work_hour_algorithm
    FROM daily_with_hours
),
worker_days AS (
    SELECT
        worker_id,
        MAX(worker_name) AS worker_name,
        MAX(team_id::text) AS team_id,
        MAX(team_name) AS team_name,
        ROUND(COALESCE(SUM(working_hours), 0), 2) AS total_working_hours,
        ROUND(COALESCE(SUM(work_point), 0), 2) AS total_work_point,
        jsonb_agg(
            jsonb_build_object(
                'day', day,
                'first_in_record_id', first_in_record_id,
                'first_in_time', first_in_time,
                'last_out_record_id', last_out_record_id,
                'last_out_time', last_out_time,
                'working_hours', working_hours,
                'work_point', work_point,
                'work_hour_algorithm', work_hour_algorithm
            )
            ORDER BY day
        ) AS days
    FROM daily_with_work_point
    GROUP BY worker_id
)
SELECT
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'worker_id', worker_id,
                    'worker_name', worker_name,
                    'team_id', team_id,
                    'team_name', team_name,
                    'total_working_hours', total_working_hours,
                    'total_work_point', total_work_point,
                    'days', days
                )
                ORDER BY worker_name
            )
            FROM (
                SELECT *
                FROM worker_days
                ORDER BY worker_name
                LIMIT
        "#,
    );

    let offset = (params.page - 1) * params.page_size;

    #[derive(sqlx::FromRow)]
    struct AttendanceCalendarPage {
        items: Value,
        total: i64,
    }

    query.push_bind(params.page_size);
    query.push(" OFFSET ");
    query.push_bind(offset);
    query.push(
        r#"
            ) paginated
        ),
        '[]'::jsonb
    ) AS items,
    (SELECT COUNT(*) FROM worker_days) AS total
"#,
    );

    let result = query
        .build_query_as::<AttendanceCalendarPage>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": result.items,
        "total": result.total,
        "month": month.format("%Y-%m").to_string(),
        "view": "calendar",
        "page": params.page,
        "page_size": params.page_size,
    })))
}

async fn list_attendance_stats(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    params: &ResourceListParams,
) -> ApiResult<Value> {
    let date = params.attendance_date.unwrap_or_else(|| chrono::Utc::now().date_naive());

    #[derive(sqlx::FromRow)]
    struct AttendanceStats {
        total: i64,
        present: i64,
    }

    let stats = sqlx::query_as::<_, AttendanceStats>(
        r#"
        SELECT
            (SELECT COUNT(*) FROM construction_workers WHERE project_id = $1 AND is_deleted = FALSE) AS total,
            (
                SELECT COUNT(DISTINCT worker_id)
                FROM construction_attendance_records
                WHERE project_id = $1
                  AND is_deleted = FALSE
                  AND (trigger_time AT TIME ZONE 'Asia/Shanghai')::date = $2
            ) AS present
        "#,
    )
    .bind(project_id)
    .bind(date)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;

    let absent = (stats.total - stats.present).max(0);
    let rate = if stats.total > 0 {
        format!("{}%", ((stats.present as f64 / stats.total as f64) * 1000.0).round() / 10.0)
    } else {
        "0%".to_string()
    };

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "total": stats.total,
        "present": stats.present,
        "absent": absent,
        "rate": rate,
        "attendance_date": date.format("%Y-%m-%d").to_string(),
        "view": "stats",
    })))
}

pub async fn get_attendance(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, attendance_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    get_attendance_row(state.db.pool(), project_id, attendance_id).await
}

async fn get_attendance_row(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    attendance_id: Uuid,
) -> ApiResult<Value> {
    let row = sqlx::query_scalar::<_, Value>(
        r#"
        SELECT to_jsonb(r) || jsonb_build_object(
            'overall_photo', COALESCE(r.overall_photo, overall_photo.photo_data),
            'closeup_photo', COALESCE(r.closeup_photo, closeup_photo.photo_data)
        )
        FROM construction_attendance_records r
        LEFT JOIN LATERAL (
            SELECT photo_data
            FROM construction_attendance_record_photos photo
            WHERE photo.attendance_record_id = r.id
              AND photo.photo_kind = 'overall'
            ORDER BY photo.created_at DESC, photo.id DESC
            LIMIT 1
        ) overall_photo ON TRUE
        LEFT JOIN LATERAL (
            SELECT photo_data
            FROM construction_attendance_record_photos photo
            WHERE photo.attendance_record_id = r.id
              AND photo.photo_kind = 'closeup'
            ORDER BY photo.created_at DESC, photo.id DESC
            LIMIT 1
        ) closeup_photo ON TRUE
        WHERE r.is_deleted = FALSE
          AND r.project_id = $1
          AND r.id = $2
        "#,
    )
    .bind(project_id)
    .bind(attendance_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)?;

    Ok(ApiSuccess::default().with_data(row))
}

pub async fn update_attendance(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, attendance_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    update_row(
        state.db.pool(),
        "construction_attendance_records",
        ATTENDANCE_COLUMNS,
        &body,
        &[("project_id", project_id), ("id", attendance_id)],
    )
    .await
}

pub async fn create_attendance(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    create_row(
        state.db.pool(),
        "construction_attendance_records",
        ATTENDANCE_COLUMNS,
        &body,
        &[("project_id", project_id)],
        StatusCode::CREATED,
    )
    .await
}

pub async fn preview_generated_attendance(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<AttendanceGeneratorPreviewRequest>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    if body.worker_ids.is_empty() || body.worker_ids.len() > 500 {
        return Err(invalid_column_value("worker_ids", "1-500 workers"));
    }

    let month = NaiveDate::parse_from_str(&format!("{}-01", body.month), "%Y-%m-%d")
        .map_err(|_| invalid_column_value("month", "YYYY-MM"))?;
    let next_month =
        next_month_start(month).ok_or_else(|| invalid_column_value("month", "YYYY-MM"))?;
    let morning = parse_generator_time_range(&body.morning_start, &body.morning_end, "morning")?;
    let evening = parse_generator_time_range(&body.evening_start, &body.evening_end, "evening")?;
    if morning.1 >= evening.0 {
        return Err(invalid_column_value(
            "evening_start",
            "later than morning end",
        ));
    }
    let midday = if body.include_midday {
        let lunch_out = parse_generator_time_range(
            body.lunch_out_start.as_deref().unwrap_or("11:30"),
            body.lunch_out_end.as_deref().unwrap_or("12:00"),
            "lunch_out",
        )?;
        let lunch_in = parse_generator_time_range(
            body.lunch_in_start.as_deref().unwrap_or("13:00"),
            body.lunch_in_end.as_deref().unwrap_or("13:30"),
            "lunch_in",
        )?;
        if morning.1 >= lunch_out.0 || lunch_out.1 >= lunch_in.0 || lunch_in.1 >= evening.0 {
            return Err(invalid_column_value(
                "midday",
                "morning < lunch out < lunch in < evening",
            ));
        }
        Some((lunch_out, lunch_in))
    } else {
        None
    };

    let unique_worker_ids: Vec<Uuid> = body
        .worker_ids
        .iter()
        .copied()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let workers = sqlx::query_as::<_, (Uuid, String, Option<String>)>(
        r#"
        SELECT w.id, w.name, t.name
        FROM construction_workers w
        LEFT JOIN construction_teams t ON t.id = w.team_id AND t.is_deleted = FALSE
        WHERE w.project_id = $1 AND w.is_deleted = FALSE AND w.id = ANY($2)
        ORDER BY w.name
        "#,
    )
    .bind(project_id)
    .bind(&unique_worker_ids)
    .fetch_all(state.db.pool())
    .await
    .map_err(db_error)?;
    if workers.len() != unique_worker_ids.len() {
        return Err(invalid_column_value(
            "worker_ids",
            "active workers in this project",
        ));
    }

    let mut eligible_dates = Vec::new();
    let mut date = month;
    while date < next_month {
        let is_weekend = date.weekday().number_from_monday() >= 6;
        if body.include_weekends || !is_weekend {
            eligible_dates.push(date);
        }
        date += ChronoDuration::days(1);
    }
    let requested_days = if body.attendance_days == 0 {
        eligible_dates.len()
    } else {
        usize::try_from(body.attendance_days).unwrap_or(usize::MAX)
    };
    if requested_days > eligible_dates.len() {
        return Err(invalid_column_value(
            "attendance_days",
            "not greater than eligible days",
        ));
    }

    let timezone = FixedOffset::east_opt(8 * 3600).expect("valid UTC+8 offset");
    let mut rng = rand::thread_rng();
    let mut records = Vec::new();
    for (worker_id, worker_name, team_name) in workers {
        let mut selected_dates = eligible_dates.clone();
        if body.prioritize_weekends
            && body.include_weekends
            && requested_days < selected_dates.len()
        {
            let mut weekends: Vec<_> = selected_dates
                .iter()
                .copied()
                .filter(|day| day.weekday().number_from_monday() >= 6)
                .collect();
            let mut weekdays: Vec<_> = selected_dates
                .iter()
                .copied()
                .filter(|day| day.weekday().number_from_monday() < 6)
                .collect();
            weekends.shuffle(&mut rng);
            weekdays.shuffle(&mut rng);
            weekends.extend(weekdays);
            selected_dates = weekends;
        } else {
            selected_dates.shuffle(&mut rng);
        }
        selected_dates.truncate(requested_days);
        selected_dates.sort_unstable();

        for attendance_date in selected_dates {
            let mut punches = vec![(0_i16, random_time_in_range(morning, &mut rng))];
            if let Some((lunch_out, lunch_in)) = midday {
                punches.push((1, random_time_in_range(lunch_out, &mut rng)));
                punches.push((0, random_time_in_range(lunch_in, &mut rng)));
            }
            punches.push((1, random_time_in_range(evening, &mut rng)));
            for (direction, punch_time) in punches {
                let local = timezone
                    .from_local_datetime(&attendance_date.and_time(punch_time))
                    .single()
                    .ok_or_else(|| invalid_column_value("trigger_time", "valid UTC+8 datetime"))?;
                records.push(GeneratedAttendancePreviewRecord {
                    worker_id,
                    worker_name: worker_name.clone(),
                    team_name: team_name.clone(),
                    direction,
                    trigger_time: local.to_rfc3339(),
                });
            }
        }
    }
    if records.len() > 10_000 {
        return Err(invalid_column_value("records", "at most 10000 punches"));
    }

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "record_count": records.len(),
        "worker_count": unique_worker_ids.len(),
        "records": records,
    })))
}

pub async fn commit_generated_attendance(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<AttendanceGeneratorCommitRequest>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    if body.records.is_empty() || body.records.len() > 10_000 {
        return Err(invalid_column_value("records", "1-10000 preview records"));
    }
    let worker_ids: Vec<Uuid> = body
        .records
        .iter()
        .map(|record| record.worker_id)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let valid_worker_ids: HashSet<Uuid> = sqlx::query_scalar(
        "SELECT id FROM construction_workers WHERE project_id = $1 AND is_deleted = FALSE AND id = ANY($2)",
    )
    .bind(project_id)
    .bind(&worker_ids)
    .fetch_all(state.db.pool())
    .await
    .map_err(db_error)?
    .into_iter()
    .collect();
    if valid_worker_ids.len() != worker_ids.len() {
        return Err(invalid_column_value(
            "worker_id",
            "active worker in this project",
        ));
    }

    let mut parsed = Vec::with_capacity(body.records.len());
    for record in &body.records {
        if record.direction != 0 && record.direction != 1 {
            return Err(invalid_column_value("direction", "0 or 1"));
        }
        let trigger_time = chrono::DateTime::parse_from_rfc3339(&record.trigger_time)
            .map_err(|_| invalid_column_value("trigger_time", "RFC3339 datetime"))?
            .with_timezone(&chrono::Utc);
        parsed.push((record.worker_id, record.direction, trigger_time));
    }

    let mut transaction = state.db.pool().begin().await.map_err(db_error)?;
    let mut inserted_count = 0_u64;
    for (worker_id, direction, trigger_time) in parsed {
        let result = sqlx::query(
            r#"
            INSERT INTO construction_attendance_records (
                project_id, worker_id, direction, trigger_time, equipment_id,
                original_time, is_generated
            ) VALUES ($1, $2, $3, $4, '考勤生成工具', $5, TRUE)
            ON CONFLICT (project_id, worker_id, direction, trigger_time)
                WHERE is_generated = TRUE AND is_deleted = FALSE
            DO NOTHING
            "#,
        )
        .bind(project_id)
        .bind(worker_id)
        .bind(direction)
        .bind(trigger_time)
        .bind(
            trigger_time
                .with_timezone(&FixedOffset::east_opt(8 * 3600).expect("valid UTC+8 offset"))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string(),
        )
        .execute(&mut *transaction)
        .await
        .map_err(db_error)?;
        inserted_count += result.rows_affected();
    }
    transaction.commit().await.map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "inserted_count": inserted_count,
    })))
}

fn parse_generator_time_range(
    start: &str,
    end: &str,
    column: &str,
) -> Result<(NaiveTime, NaiveTime), ApiError> {
    let start = NaiveTime::parse_from_str(start, "%H:%M")
        .map_err(|_| invalid_column_value(column, "HH:mm range"))?;
    let end = NaiveTime::parse_from_str(end, "%H:%M")
        .map_err(|_| invalid_column_value(column, "HH:mm range"))?;
    if start > end {
        return Err(invalid_column_value(column, "start no later than end"));
    }
    Ok((start, end))
}

fn random_time_in_range<R: Rng + ?Sized>(range: (NaiveTime, NaiveTime), rng: &mut R) -> NaiveTime {
    let start = range.0.num_seconds_from_midnight();
    let end = range.1.num_seconds_from_midnight();
    NaiveTime::from_num_seconds_from_midnight_opt(rng.gen_range(start..=end), 0)
        .expect("valid time range")
}

pub async fn delete_attendance(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, attendance_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    delete_row(
        state.db.pool(),
        "construction_attendance_records",
        &[("project_id", project_id), ("id", attendance_id)],
    )
    .await
}

pub async fn list_attendance_devices(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let params = resource_list_params(&uri)?;
    list_rows_page(
        state.db.pool(),
        "construction_attendance_devices",
        &[("project_id", project_id)],
        &[],
        &params,
    )
    .await
}

pub async fn get_attendance_device(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, device_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    get_row(
        state.db.pool(),
        "construction_attendance_devices",
        &[("project_id", project_id), ("id", device_id)],
    )
    .await
}

pub async fn create_attendance_device(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_attendance_device_admin(&auth_user)?;
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    create_row(
        state.db.pool(),
        "construction_attendance_devices",
        ATTENDANCE_DEVICE_COLUMNS,
        &body,
        &[("project_id", project_id)],
        StatusCode::CREATED,
    )
    .await
}

pub async fn update_attendance_device(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, device_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_attendance_device_admin(&auth_user)?;
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let updated = update_row(
        state.db.pool(),
        "construction_attendance_devices",
        ATTENDANCE_DEVICE_COLUMNS,
        &body,
        &[("project_id", project_id), ("id", device_id)],
    )
    .await?;
    sqlx::query(
        r#"
        UPDATE device_dispatch_jobs j
        SET status = 'failed',
            last_error = '目标设备厂家已变更，原补考勤适配器不再适用',
            locked_by = NULL,
            locked_until = NULL,
            updated_at = NOW()
        FROM construction_attendance_devices d
        WHERE d.id = $1
          AND j.attendance_device_id = d.id
          AND j.job_type = 'supplemental_attendance'
          AND j.adapter_code = 'vendor_b'
          AND d.device_type NOT IN ('B厂家', '弹厂家')
          AND j.device_result_status <> 'success'
          AND j.status = 'pending'
        "#,
    )
    .bind(device_id)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?;
    Ok(updated)
}

pub async fn delete_attendance_device(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, device_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    ensure_attendance_device_admin(&auth_user)?;
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    ensure_attendance_device_in_project(state.db.pool(), project_id, device_id).await?;
    sqlx::query(
        r#"
        UPDATE device_dispatch_jobs
        SET status = 'skipped',
            last_error = '目标考勤设备已删除',
            locked_by = NULL,
            locked_until = NULL,
            updated_at = NOW()
        WHERE attendance_device_id = $1
          AND job_type = 'supplemental_attendance'
          AND device_result_status <> 'success'
          AND status IN ('pending', 'processing', 'delivered')
        "#,
    )
    .bind(device_id)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?;
    sqlx::query(
        r#"
        UPDATE construction_managed_attendance_records r
        SET dispatch_status = 'skipped',
            dispatch_message = '目标考勤设备已删除',
            updated_at = NOW()
        WHERE EXISTS (
              SELECT 1 FROM device_dispatch_jobs target_job
              WHERE target_job.managed_attendance_record_id = r.id
                AND target_job.attendance_device_id = $1
                AND target_job.job_type = 'supplemental_attendance'
          )
          AND r.dispatch_status <> 'success'
          AND EXISTS (
              SELECT 1
              FROM device_dispatch_jobs j
              WHERE j.managed_attendance_record_id = r.id
                AND j.job_type = 'supplemental_attendance'
                AND j.status = 'skipped'
          )
        "#,
    )
    .bind(device_id)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?;
    delete_row(
        state.db.pool(),
        "construction_attendance_devices",
        &[("project_id", project_id), ("id", device_id)],
    )
    .await
}

pub async fn list_attendance_device_issue_reports(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    uri: Uri,
) -> ApiResult<Value> {
    let params = module_list_params(&uri)?;
    list_module_rows_scoped(
        state.db.pool(),
        "construction_attendance_device_issue_reports",
        &params,
        &auth_user,
    )
    .await
}

pub async fn get_attendance_device_issue_report(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(report_id): Path<Uuid>,
) -> ApiResult<Value> {
    let project_id = attendance_device_issue_report_project_id(state.db.pool(), report_id).await?;
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let row = fetch_attendance_device_issue_report(state.db.pool(), report_id).await?;
    Ok(ApiSuccess::default().with_data(row))
}

pub async fn create_attendance_device_issue_report(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    let broker_url = state.config.mqtt_broker_url.as_deref();
    let project_id = required_uuid_field(&body, "project_id")?;
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let worker_id = required_uuid_field(&body, "worker_id")?;
    let attendance_device_id = required_uuid_field(&body, "attendance_device_id")?;
    let action = issue_action_from_body(&body, "create")?;
    let issued_at = body
        .get("issued_at")
        .map(|value| value_to_optional_timestamp("issued_at", value))
        .transpose()?
        .flatten();
    let remark = body.get("remark").and_then(value_to_optional_text);

    let report_id = issue_single_worker_via_broker(
        state.db.pool(),
        broker_url,
        project_id,
        worker_id,
        attendance_device_id,
        &action,
        issued_at,
        remark.as_deref(),
    )
    .await
    .map_err(invalid_input)?;

    let row = fetch_attendance_device_issue_report(state.db.pool(), report_id).await?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(row))
}

pub async fn issue_attendance_device_workers(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, device_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let broker_url = state.config.mqtt_broker_url.as_deref();
    let action = issue_action_from_body(&body, "update")?;
    let remark = body
        .get("remark")
        .and_then(value_to_optional_text)
        .unwrap_or_else(|| "整机批量下发".to_string());

    let summary = issue_device_workers_via_broker(
        state.db.pool(),
        broker_url,
        project_id,
        device_id,
        &action,
        Some(&remark),
        true,
    )
    .await
    .map_err(invalid_input)?;
    let data = serde_json::to_value(summary).map_err(|error| invalid_input(error.to_string()))?;

    Ok(ApiSuccess::default().with_data(data))
}

fn required_uuid_field(body: &Value, column: &str) -> Result<Uuid, ApiError> {
    body.get(column)
        .map(|value| value_to_optional_uuid(column, value))
        .transpose()?
        .flatten()
        .ok_or_else(|| invalid_input(format!("{column} 不能为空")))
}

fn issue_action_from_body(body: &Value, default_action: &str) -> Result<String, ApiError> {
    let action = body
        .get("action")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(default_action);
    match action {
        "create" | "update" | "delete" => Ok(action.to_string()),
        _ => Err(invalid_input("下发动作必须是 create、update 或 delete")),
    }
}

pub async fn update_attendance_device_issue_report(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(report_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    let project_id = attendance_device_issue_report_project_id(state.db.pool(), report_id).await?;
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let updated = update_row(
        state.db.pool(),
        "construction_attendance_device_issue_reports",
        ATTENDANCE_DEVICE_ISSUE_REPORT_COLUMNS,
        &body,
        &[("id", report_id)],
    )
    .await?;
    let report_id = updated
        .data
        .as_ref()
        .and_then(|data| data.get("id"))
        .and_then(Value::as_str)
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or_else(|| invalid_input("Failed to read updated issue report id"))?;
    let row = fetch_attendance_device_issue_report(state.db.pool(), report_id).await?;

    Ok(ApiSuccess::default().with_data(row))
}

pub async fn delete_attendance_device_issue_report(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(report_id): Path<Uuid>,
) -> ApiResult<()> {
    let project_id = attendance_device_issue_report_project_id(state.db.pool(), report_id).await?;
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    delete_row(
        state.db.pool(),
        "construction_attendance_device_issue_reports",
        &[("id", report_id)],
    )
    .await
}

pub async fn create_managed_attendance_photo_group(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    validate_managed_photo_pairs(&body)?;
    create_row(
        state.db.pool(),
        "construction_managed_attendance_photo_groups",
        MANAGED_ATTENDANCE_PHOTO_GROUP_COLUMNS,
        &body,
        &[],
        StatusCode::CREATED,
    )
    .await
}

pub async fn list_managed_attendance_photo_groups(
    State(state): State<AppState>,
    uri: Uri,
) -> ApiResult<Value> {
    let params = managed_attendance_list_params(&uri)?;
    list_managed_photo_groups(state.db.pool(), &params).await
}

pub async fn get_managed_attendance_photo_group(
    State(state): State<AppState>,
    Path(photo_group_id): Path<Uuid>,
) -> ApiResult<Value> {
    get_row(
        state.db.pool(),
        "construction_managed_attendance_photo_groups",
        &[("id", photo_group_id)],
    )
    .await
}

pub async fn update_managed_attendance_photo_group(
    State(state): State<AppState>,
    Path(photo_group_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    validate_managed_photo_pairs(&body)?;
    update_row(
        state.db.pool(),
        "construction_managed_attendance_photo_groups",
        MANAGED_ATTENDANCE_PHOTO_GROUP_COLUMNS,
        &body,
        &[("id", photo_group_id)],
    )
    .await
}

pub async fn delete_managed_attendance_photo_group(
    State(state): State<AppState>,
    Path(photo_group_id): Path<Uuid>,
) -> ApiResult<()> {
    soft_delete_row(
        state.db.pool(),
        "construction_managed_attendance_photo_groups",
        &[("id", photo_group_id)],
    )
    .await
}

pub async fn create_managed_attendance_config(
    State(state): State<AppState>,
    TrimmedJson(mut body): TrimmedJson<Value>,
) -> ApiResult<Value> {
    if let Some(object) = body.as_object_mut() {
        object.remove("attendance_device_id");
    }
    validate_managed_attendance_config_body(state.db.pool(), &body).await?;
    let created = create_row(
        state.db.pool(),
        "construction_managed_attendance_configs",
        MANAGED_ATTENDANCE_CONFIG_COLUMNS,
        &body,
        &[],
        StatusCode::CREATED,
    )
    .await?;
    let config_id = created
        .data
        .as_ref()
        .and_then(|data| data.get("id"))
        .and_then(Value::as_str)
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or_else(|| invalid_input("Failed to read managed attendance config id"))?;

    let row = fetch_managed_attendance_config(state.db.pool(), config_id).await?;
    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(row))
}

pub async fn list_managed_attendance_configs(
    State(state): State<AppState>,
    uri: Uri,
) -> ApiResult<Value> {
    let params = managed_attendance_list_params(&uri)?;
    list_managed_configs(state.db.pool(), &params).await
}

pub async fn get_managed_attendance_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
) -> ApiResult<Value> {
    let row = fetch_managed_attendance_config(state.db.pool(), config_id).await?;
    Ok(ApiSuccess::default().with_data(row))
}

pub async fn update_managed_attendance_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
    TrimmedJson(mut body): TrimmedJson<Value>,
) -> ApiResult<Value> {
    if let Some(object) = body.as_object_mut() {
        object.remove("attendance_device_id");
    }
    validate_managed_attendance_config_patch(state.db.pool(), config_id, &body).await?;
    update_row(
        state.db.pool(),
        "construction_managed_attendance_configs",
        MANAGED_ATTENDANCE_CONFIG_COLUMNS,
        &body,
        &[("id", config_id)],
    )
    .await?;
    retire_ineligible_managed_dispatch_jobs(state.db.pool(), config_id, "托管配置已停用").await?;
    let row = fetch_managed_attendance_config(state.db.pool(), config_id).await?;
    Ok(ApiSuccess::default().with_data(row))
}

pub async fn delete_managed_attendance_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
) -> ApiResult<()> {
    let mut tx = state.db.pool().begin().await.map_err(db_error)?;
    let deleted = sqlx::query(
        r#"
        UPDATE construction_managed_attendance_configs
        SET is_deleted = TRUE, is_enabled = FALSE, deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(config_id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    if deleted.rows_affected() == 0 {
        return Err(not_found());
    }
    sqlx::query(
        r#"
        UPDATE device_dispatch_jobs j
        SET status = 'skipped',
            last_error = '托管配置已删除',
            locked_by = NULL,
            locked_until = NULL,
            updated_at = NOW()
        FROM construction_managed_attendance_records r
        WHERE r.id = j.managed_attendance_record_id
          AND r.config_id = $1
          AND j.job_type = 'supplemental_attendance'
          AND j.status IN ('pending', 'processing')
        "#,
    )
    .bind(config_id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    sqlx::query(
        r#"
        UPDATE construction_managed_attendance_records
        SET dispatch_status = CASE WHEN dispatch_status = 'success' THEN dispatch_status ELSE 'skipped' END,
            dispatch_message = CASE WHEN dispatch_status = 'success' THEN dispatch_message ELSE '托管配置已删除，历史记录已保留' END,
            updated_at = NOW()
        WHERE config_id = $1
          AND is_deleted = FALSE
          AND dispatch_status <> 'success'
        "#,
    )
    .bind(config_id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(ApiSuccess::default())
}

async fn retire_ineligible_managed_dispatch_jobs(
    pool: &sqlx::PgPool,
    config_id: Uuid,
    message: &str,
) -> ApiResult<()> {
    sqlx::query(
        r#"
        UPDATE device_dispatch_jobs j
        SET status = 'skipped',
            last_error = $2,
            locked_by = NULL,
            locked_until = NULL,
            updated_at = NOW()
        FROM construction_managed_attendance_records r,
             construction_managed_attendance_configs c
        WHERE r.id = j.managed_attendance_record_id
          AND c.id = r.config_id
          AND c.id = $1
          AND j.job_type = 'supplemental_attendance'
          AND j.device_result_status <> 'success'
          AND j.status = 'pending'
          AND (c.is_deleted = TRUE OR c.is_enabled = FALSE)
        "#,
    )
    .bind(config_id)
    .bind(message)
    .execute(pool)
    .await
    .map_err(db_error)?;
    sqlx::query(
        r#"
        UPDATE construction_managed_attendance_records r
        SET dispatch_status = 'skipped',
            dispatch_message = $2,
            updated_at = NOW()
        FROM construction_managed_attendance_configs c
        WHERE r.config_id = c.id
          AND c.id = $1
          AND r.dispatch_status <> 'success'
          AND EXISTS (
              SELECT 1
              FROM device_dispatch_jobs j
              WHERE j.managed_attendance_record_id = r.id
                AND j.job_type = 'supplemental_attendance'
                AND j.status = 'skipped'
          )
          AND (c.is_deleted = TRUE OR c.is_enabled = FALSE)
        "#,
    )
    .bind(config_id)
    .bind(message)
    .execute(pool)
    .await
    .map_err(db_error)?;
    Ok(ApiSuccess::default())
}

pub async fn generate_managed_attendance_records(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    let month = body
        .get("month")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(parse_payroll_month)
        .transpose()?
        .unwrap_or_else(|| {
            let today = chrono::Local::now().date_naive();
            chrono::NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap_or(today)
        });
    let result = generate_managed_records_for_month(state.db.pool(), config_id, month).await?;
    Ok(ApiSuccess::default().with_data(result))
}

pub async fn resend_managed_attendance_day(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    let attendance_date = body
        .get("attendance_date")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| invalid_input("attendance_date 不能为空"))
        .and_then(|value| {
            chrono::NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
                .map_err(|_| invalid_column_value("attendance_date", "YYYY-MM-DD"))
        })?;

    let mut tx = state.db.pool().begin().await.map_err(db_error)?;
    let record_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM construction_managed_attendance_records r
        JOIN construction_managed_attendance_configs c
          ON c.id = r.config_id AND c.is_deleted = FALSE AND c.is_enabled = TRUE
        WHERE r.config_id = $1
          AND r.attendance_date = $2
          AND r.is_deleted = FALSE
          AND r.planned_at <= NOW()
        "#,
    )
    .bind(config_id)
    .bind(attendance_date)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    if record_count == 0 {
        return Err(invalid_input(
            "该日期暂时没有已到计划时间的可补发记录，或托管配置已停用",
        ));
    }

    let job_statuses = sqlx::query_scalar::<_, String>(
        r#"
        SELECT j.status
        FROM device_dispatch_jobs j
        JOIN construction_managed_attendance_records r
          ON r.id = j.managed_attendance_record_id AND r.is_deleted = FALSE
        WHERE r.config_id = $1
          AND r.attendance_date = $2
          AND r.planned_at <= NOW()
          AND j.job_type = 'supplemental_attendance'
        FOR UPDATE OF j
        "#,
    )
    .bind(config_id)
    .bind(attendance_date)
    .fetch_all(&mut *tx)
    .await
    .map_err(db_error)?;
    if job_statuses.is_empty() {
        return Err(invalid_input(
            "该日期没有可补发的设备任务，请先重新生成当月记录",
        ));
    }
    if job_statuses.iter().any(|status| status == "processing") {
        return Err(invalid_input("该日期仍有任务正在下发，请稍后再补发"));
    }

    let job_count = sqlx::query(
        r#"
        UPDATE device_dispatch_jobs j
        SET status = 'pending',
            next_attempt_at = NOW(),
            last_error = NULL,
            locked_by = NULL,
            locked_until = NULL,
            device_result_status = 'pending',
            device_result_message = '管理员手动补发',
            device_reported_at = NULL,
            attempt_count = 0,
            sent_at = NULL,
            ack_at = NULL,
            ack_code = NULL,
            ack_payload = NULL,
            updated_at = NOW()
        FROM construction_managed_attendance_records r
        WHERE j.managed_attendance_record_id = r.id
          AND r.config_id = $1
          AND r.attendance_date = $2
          AND r.is_deleted = FALSE
          AND r.planned_at <= NOW()
          AND j.job_type = 'supplemental_attendance'
          AND j.adapter_code = 'vendor_b'
          AND j.transport = 'http_push'
        "#,
    )
    .bind(config_id)
    .bind(attendance_date)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?
    .rows_affected();
    if job_count == 0 {
        return Err(invalid_input("该日期没有支持手动补发的弹厂家任务"));
    }

    sqlx::query(
        r#"
        UPDATE construction_managed_attendance_records
        SET status = 'generated',
            dispatch_status = 'pending',
            dispatched_at = NULL,
            dispatch_message = '已手动补发，等待推送',
            error_message = NULL,
            updated_at = NOW()
        WHERE config_id = $1
          AND attendance_date = $2
          AND is_deleted = FALSE
          AND planned_at <= NOW()
        "#,
    )
    .bind(config_id)
    .bind(attendance_date)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "config_id": config_id,
        "attendance_date": attendance_date,
        "record_count": record_count,
        "job_count": job_count,
    })))
}

pub async fn list_managed_attendance_records(
    State(state): State<AppState>,
    uri: Uri,
) -> ApiResult<Value> {
    let params = managed_attendance_list_params(&uri)?;
    list_managed_records(state.db.pool(), &params).await
}

pub async fn list_wage_batches(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let params = wage_list_params(&uri)?;
    let items = fetch_wage_batch_items(state.db.pool(), project_id, &params).await?;
    let total = fetch_wage_batch_total(state.db.pool(), project_id, &params).await?;
    let summary = fetch_wage_batch_summary(state.db.pool(), project_id, &params).await?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "summary": summary,
    })))
}

async fn insert_wage_item_rows(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    project_id: Uuid,
    batch_id: Uuid,
    rows: &[WageImportRow],
) -> Result<(), ApiError> {
    for row in rows {
        sqlx::query(
            r#"
            INSERT INTO construction_wage_items (
                batch_id,
                project_id,
                worker_id,
                worker_name,
                id_card,
                team_name,
                attendance_days,
                monthly_settlement,
                daily_settlement,
                wage_card_number,
                wage_bank,
                payable_amount_cents,
                paid_amount_cents,
                adjustment_amount_cents,
                unpaid_amount_cents,
                adjustment_reason
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            "#,
        )
        .bind(batch_id)
        .bind(project_id)
        .bind(row.worker_id)
        .bind(row.worker_name.clone())
        .bind(row.id_card.clone())
        .bind(row.team_name.clone())
        .bind(row.attendance_days.clone())
        .bind(row.monthly_settlement.clone())
        .bind(row.daily_settlement.clone())
        .bind(row.wage_card_number.clone())
        .bind(row.wage_bank.clone())
        .bind(row.payable_amount_cents)
        .bind(row.paid_amount_cents)
        .bind(row.adjustment_amount_cents)
        .bind(row.unpaid_amount_cents)
        .bind(row.adjustment_reason.clone())
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    }

    Ok(())
}

pub async fn create_wage_batch(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let payload = wage_batch_payload(&body)?;
    let mut tx = state.db.pool().begin().await.map_err(db_error)?;
    let row = sqlx::query_scalar::<_, Value>(
        r#"
        INSERT INTO construction_wage_batches (
            project_id,
            payroll_month,
            company_name,
            employee_count,
            payable_amount_cents,
            paid_amount_cents,
            unpaid_amount_cents,
            status,
            remark,
            created_by_user_id,
            updated_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        RETURNING to_jsonb(construction_wage_batches.*)
        "#,
    )
    .bind(project_id)
    .bind(payload.payroll_month)
    .bind(payload.company_name)
    .bind(payload.employee_count)
    .bind(payload.payable_amount_cents)
    .bind(payload.paid_amount_cents)
    .bind(payload.unpaid_amount_cents)
    .bind(payload.status)
    .bind(payload.remark)
    .bind(auth_user.user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    let batch_id = row["id"]
        .as_str()
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or_else(|| ApiError::default().with_message("Failed to read wage batch id"))?;

    insert_wage_item_rows(&mut tx, project_id, batch_id, &payload.rows).await?;
    tx.commit().await.map_err(db_error)?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(row))
}

pub async fn update_wage_batch(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, batch_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let payload = wage_batch_patch_payload(&body)?;
    let mut employee_count = payload.employee_count;
    let mut payable_amount_cents = payload.payable_amount_cents;
    let mut paid_amount_cents = payload.paid_amount_cents;
    let mut unpaid_amount_cents = payload.unpaid_amount_cents;
    if let Some(rows) = &payload.rows {
        let (
            row_employee_count,
            row_payable_amount_cents,
            row_paid_amount_cents,
            row_unpaid_amount_cents,
        ) = wage_rows_summary(rows)?;
        employee_count = Some(row_employee_count);
        payable_amount_cents = Some(row_payable_amount_cents);
        paid_amount_cents = Some(row_paid_amount_cents);
        unpaid_amount_cents = Some(row_unpaid_amount_cents);
    }

    let mut tx = state.db.pool().begin().await.map_err(db_error)?;
    let row = sqlx::query_scalar::<_, Value>(
        r#"
        UPDATE construction_wage_batches
        SET
            payroll_month = COALESCE($3, payroll_month),
            company_name = COALESCE($4, company_name),
            employee_count = COALESCE($5, employee_count),
            payable_amount_cents = COALESCE($6, payable_amount_cents),
            paid_amount_cents = COALESCE($7, paid_amount_cents),
            unpaid_amount_cents = COALESCE($8, unpaid_amount_cents),
            status = COALESCE($9, status),
            remark = COALESCE($10, remark),
            updated_by_user_id = $11,
            updated_at = NOW()
        WHERE project_id = $1
            AND id = $2
            AND is_deleted = FALSE
        RETURNING to_jsonb(construction_wage_batches.*)
        "#,
    )
    .bind(project_id)
    .bind(batch_id)
    .bind(payload.payroll_month)
    .bind(payload.company_name)
    .bind(employee_count)
    .bind(payable_amount_cents)
    .bind(paid_amount_cents)
    .bind(unpaid_amount_cents)
    .bind(payload.status)
    .bind(payload.remark)
    .bind(auth_user.user_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)?;

    if let Some(rows) = &payload.rows {
        sqlx::query(
            r#"
            UPDATE construction_wage_items
            SET is_deleted = TRUE, deleted_at = COALESCE(deleted_at, NOW()), updated_at = NOW()
            WHERE project_id = $1 AND batch_id = $2 AND is_deleted = FALSE
            "#,
        )
        .bind(project_id)
        .bind(batch_id)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
        insert_wage_item_rows(&mut tx, project_id, batch_id, rows).await?;
    }

    tx.commit().await.map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(row))
}

pub async fn delete_wage_batch(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, batch_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let mut tx = state.db.pool().begin().await.map_err(db_error)?;

    sqlx::query(
        r#"
        UPDATE construction_wage_items
        SET is_deleted = TRUE, deleted_at = COALESCE(deleted_at, NOW()), updated_at = NOW()
        WHERE project_id = $1 AND batch_id = $2 AND is_deleted = FALSE
        "#,
    )
    .bind(project_id)
    .bind(batch_id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;

    let result = sqlx::query(
        r#"
        UPDATE construction_wage_batches
        SET is_deleted = TRUE, deleted_at = COALESCE(deleted_at, NOW()), updated_at = NOW()
        WHERE project_id = $1 AND id = $2 AND is_deleted = FALSE
        "#,
    )
    .bind(project_id)
    .bind(batch_id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;

    if result.rows_affected() == 0 {
        return Err(not_found());
    }

    tx.commit().await.map_err(db_error)?;
    Ok(ApiSuccess::default().with_data(()))
}

pub async fn import_wage_batch(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let payload = wage_import_payload(&body)?;
    let employee_count =
        i32::try_from(payload.rows.len()).map_err(|_| invalid_input("Too many wage rows"))?;
    let payable_amount_cents = payload
        .rows
        .iter()
        .map(|row| row.payable_amount_cents)
        .sum::<i64>();
    let paid_amount_cents = payload
        .rows
        .iter()
        .map(|row| row.paid_amount_cents)
        .sum::<i64>();
    let unpaid_amount_cents = payload
        .rows
        .iter()
        .map(|row| row.unpaid_amount_cents)
        .sum::<i64>();

    let mut tx = state.db.pool().begin().await.map_err(db_error)?;
    let batch = sqlx::query_scalar::<_, Value>(
        r#"
        INSERT INTO construction_wage_batches (
            project_id,
            payroll_month,
            company_name,
            employee_count,
            payable_amount_cents,
            paid_amount_cents,
            unpaid_amount_cents,
            status,
            remark,
            created_by_user_id,
            updated_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        RETURNING to_jsonb(construction_wage_batches.*)
        "#,
    )
    .bind(project_id)
    .bind(payload.payroll_month)
    .bind(payload.company_name)
    .bind(employee_count)
    .bind(payable_amount_cents)
    .bind(paid_amount_cents)
    .bind(unpaid_amount_cents)
    .bind(payload.status)
    .bind(payload.remark)
    .bind(auth_user.user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    let batch_id = batch["id"]
        .as_str()
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or_else(|| ApiError::default().with_message("Failed to read wage batch id"))?;

    insert_wage_item_rows(&mut tx, project_id, batch_id, &payload.rows).await?;

    tx.commit().await.map_err(db_error)?;
    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(batch))
}

pub async fn export_wage_batches(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> Result<Response, ApiError> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let params = wage_list_params(&uri)?;
    let rows = fetch_wage_export_rows(state.db.pool(), project_id, &params).await?;
    let csv = build_wage_export_csv(rows);
    let filename = format!(
        "project-wages-{}.csv",
        chrono::Utc::now().format("%Y%m%d%H%M%S")
    );

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        csv,
    )
        .into_response())
}

pub async fn export_project_workers_advanced(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let params = project_export_params(
        &body,
        WORKER_ADVANCED_EXPORT_FORMATS,
        &["worker_basic", "worker_bank", "worker_photos"],
    )?;
    let workers =
        fetch_project_export_workers(state.db.pool(), &auth_user, project_id, &params).await?;
    if workers.is_empty() {
        return Err(invalid_input("暂无可导出的工人数据"));
    }

    Ok(csv_download_response(
        format!(
            "project-workers-{}.csv",
            chrono::Utc::now().format("%Y%m%d%H%M%S")
        ),
        build_worker_full_csv(&workers),
    ))
}

pub async fn export_project_attendance_advanced(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let params = project_export_params(
        &body,
        ATTENDANCE_ADVANCED_EXPORT_FORMATS,
        &["attendance_time"],
    )?;
    let workers =
        fetch_project_export_workers(state.db.pool(), &auth_user, project_id, &params).await?;
    if workers.is_empty() {
        return Err(invalid_input("暂无可导出的工人数据"));
    }

    let worker_ids = workers
        .iter()
        .map(|worker| worker.id.clone())
        .collect::<Vec<_>>();
    let records = fetch_project_export_attendance_records(
        state.db.pool(),
        &auth_user,
        project_id,
        &worker_ids,
        &params,
    )
    .await?;
    let mut visible_workers =
        filter_attendance_workers(&workers, &records, &params.attendance_filter);
    sort_attendance_workers(&mut visible_workers, &records, &params.sort_by);
    let visible_records = filter_records_by_workers(&records, &visible_workers);

    let format = params
        .formats
        .first()
        .map(String::as_str)
        .unwrap_or("attendance_time");
    let csv = match format {
        "attendance_time" | "attendance_status" | "work_hours" | "work_record" => {
            build_attendance_matrix_csv(
                format,
                &visible_workers,
                &visible_records,
                params.attendance_month,
            )?
        }
        "attendance_records" => build_attendance_records_csv(&visible_records, &visible_workers),
        _ => return Err(invalid_column_value("formats", "attendance export format")),
    };

    Ok(csv_download_response(
        format!(
            "project-attendance-{}-{}.csv",
            format,
            chrono::Utc::now().format("%Y%m%d%H%M%S")
        ),
        csv,
    ))
}

pub async fn create_contract_template(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    clear_contract_default_if_needed(state.db.pool(), &body).await?;
    create_row(
        state.db.pool(),
        "construction_contract_templates",
        CONTRACT_TEMPLATE_COLUMNS,
        &body,
        &[],
        StatusCode::CREATED,
    )
    .await
}

pub async fn list_contract_templates(State(state): State<AppState>, uri: Uri) -> ApiResult<Value> {
    let params = module_list_params(&uri)?;
    list_module_rows(state.db.pool(), "construction_contract_templates", &params).await
}

pub async fn get_contract_template(
    State(state): State<AppState>,
    Path(template_id): Path<Uuid>,
) -> ApiResult<Value> {
    get_row(
        state.db.pool(),
        "construction_contract_templates",
        &[("id", template_id)],
    )
    .await
}

pub async fn update_contract_template(
    State(state): State<AppState>,
    Path(template_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    clear_contract_default_if_needed(state.db.pool(), &body).await?;
    update_row(
        state.db.pool(),
        "construction_contract_templates",
        CONTRACT_TEMPLATE_COLUMNS,
        &body,
        &[("id", template_id)],
    )
    .await
}

pub async fn delete_contract_template(
    State(state): State<AppState>,
    Path(template_id): Path<Uuid>,
) -> ApiResult<()> {
    soft_delete_row(
        state.db.pool(),
        "construction_contract_templates",
        &[("id", template_id)],
    )
    .await
}

pub async fn get_project_contract_template_config(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    let row = sqlx::query_scalar::<_, Value>(
        r#"
        SELECT to_jsonb(r)
        FROM (
            SELECT c.*, t.name AS template_name, t.code AS template_code
            FROM construction_project_contract_configs c
            LEFT JOIN construction_contract_templates t ON t.id = c.template_id AND t.is_deleted = FALSE
            WHERE c.project_id = $1 AND c.is_deleted = FALSE
        ) r
        "#,
    )
    .bind(project_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .unwrap_or(Value::Null);

    Ok(ApiSuccess::default().with_data(row))
}

pub async fn upsert_project_contract_template_config(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    TrimmedJson(body): TrimmedJson<Value>,
) -> ApiResult<Value> {
    let object = body
        .as_object()
        .ok_or_else(|| invalid_input("Request body must be a JSON object"))?;
    let template_id = value_to_optional_uuid(
        "template_id",
        object.get("template_id").unwrap_or(&Value::Null),
    )?;
    if let Some(template_id) = template_id {
        ensure_contract_template_exists(state.db.pool(), template_id).await?;
    }
    let remark = optional_string(object.get("remark"));

    let row = sqlx::query_scalar::<_, Value>(
        r#"
        INSERT INTO construction_project_contract_configs (project_id, template_id, remark, is_deleted, deleted_at)
        VALUES ($1, $2, $3, FALSE, NULL)
        ON CONFLICT (project_id)
        DO UPDATE SET
            template_id = EXCLUDED.template_id,
            remark = EXCLUDED.remark,
            is_deleted = FALSE,
            deleted_at = NULL
        RETURNING to_jsonb(construction_project_contract_configs)
        "#,
    )
    .bind(project_id)
    .bind(template_id)
    .bind(remark)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(row))
}

pub async fn download_worker_contract(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, worker_id)): Path<(Uuid, Uuid)>,
) -> Result<Response, ApiError> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let data = sqlx::query_scalar::<_, Value>(
        r#"
        SELECT jsonb_build_object(
            'project', to_jsonb(p),
            'worker', to_jsonb(w),
            'unit', to_jsonb(u),
            'team', to_jsonb(t)
        )
        FROM construction_workers w
        JOIN construction_projects p ON p.id = w.project_id AND p.is_deleted = FALSE
        LEFT JOIN construction_units u ON u.id = w.unit_id AND u.is_deleted = FALSE
        LEFT JOIN construction_teams t ON t.id = w.team_id AND t.is_deleted = FALSE
        WHERE w.project_id = $1 AND w.id = $2 AND w.is_deleted = FALSE
        "#,
    )
    .bind(project_id)
    .bind(worker_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)?;

    let template = resolve_contract_template(state.db.pool(), project_id).await?;
    let variables = contract_variables(&data);

    if let Some(object_key) = template.template_file_object_key.as_deref() {
        let template_bytes = state
            .storage
            .get(object_key)
            .await
            .map_err(|error| ApiError::default().with_debug(error.to_string()))?;
        let remote_images =
            load_remote_docx_images(&variables, state.storage.public_base_url()).await;
        let rendered = tokio::task::spawn_blocking(move || {
            render_docx_contract_template(&template_bytes, &variables, &remote_images)
        })
        .await
        .map_err(|error| {
            ApiError::default()
                .with_message("合同文件生成失败")
                .with_debug(format!("DOCX render task failed: {error}"))
        })?
        .map_err(|error| {
            ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_message(format!("合同模板文件解析失败：{error}"))
        })?;
        let filename = contract_filename(
            template
                .template_file_name
                .as_deref()
                .unwrap_or("worker-contract.docx"),
            worker_id,
            "docx",
        );

        return Ok((
            StatusCode::OK,
            [
                (
                    header::CONTENT_TYPE,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        .to_owned(),
                ),
                (
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{filename}\""),
                ),
            ],
            rendered,
        )
            .into_response());
    }

    let rendered = render_text_contract_template(&template.content, &variables);
    let filename = format!("worker-contract-{worker_id}.doc");

    Ok((
        StatusCode::OK,
        [
            (
                header::CONTENT_TYPE,
                "application/msword; charset=utf-8".to_owned(),
            ),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        rendered,
    )
        .into_response())
}

pub async fn create_work_hour_config(
    State(state): State<AppState>,
    TrimmedJson(body): TrimmedJson<Value>,
) -> ApiResult<Value> {
    ensure_json_object_if_present(&body, "rules")?;
    create_row(
        state.db.pool(),
        "construction_work_hour_configs",
        WORK_HOUR_CONFIG_COLUMNS,
        &body,
        &[],
        StatusCode::CREATED,
    )
    .await
}

pub async fn list_work_hour_configs(State(state): State<AppState>, uri: Uri) -> ApiResult<Value> {
    let params = module_list_params(&uri)?;
    list_module_rows(state.db.pool(), "construction_work_hour_configs", &params).await
}

pub async fn get_work_hour_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
) -> ApiResult<Value> {
    get_row(
        state.db.pool(),
        "construction_work_hour_configs",
        &[("id", config_id)],
    )
    .await
}

pub async fn update_work_hour_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
    TrimmedJson(body): TrimmedJson<Value>,
) -> ApiResult<Value> {
    ensure_json_object_if_present(&body, "rules")?;
    update_row(
        state.db.pool(),
        "construction_work_hour_configs",
        WORK_HOUR_CONFIG_COLUMNS,
        &body,
        &[("id", config_id)],
    )
    .await
}

pub async fn delete_work_hour_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
) -> ApiResult<()> {
    soft_delete_row(
        state.db.pool(),
        "construction_work_hour_configs",
        &[("id", config_id)],
    )
    .await
}

pub async fn create_platform_config(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    TrimmedJson(body): TrimmedJson<Value>,
) -> ApiResult<Value> {
    ensure_body_project_access(state.db.pool(), &auth_user, &body).await?;
    ensure_json_object_if_present(&body, "config")?;
    create_row(
        state.db.pool(),
        "construction_platform_configs",
        PLATFORM_CONFIG_COLUMNS,
        &body,
        &[],
        StatusCode::CREATED,
    )
    .await
}

pub async fn list_platform_configs(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    uri: Uri,
) -> ApiResult<Value> {
    let params = module_list_params(&uri)?;
    list_module_rows_scoped(
        state.db.pool(),
        "construction_platform_configs",
        &params,
        &auth_user,
    )
    .await
}

pub async fn get_platform_config(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(config_id): Path<Uuid>,
) -> ApiResult<Value> {
    ensure_row_project_access(
        state.db.pool(),
        &auth_user,
        "construction_platform_configs",
        config_id,
    )
    .await?;
    get_row(
        state.db.pool(),
        "construction_platform_configs",
        &[("id", config_id)],
    )
    .await
}

pub async fn update_platform_config(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(config_id): Path<Uuid>,
    TrimmedJson(body): TrimmedJson<Value>,
) -> ApiResult<Value> {
    ensure_row_project_access(
        state.db.pool(),
        &auth_user,
        "construction_platform_configs",
        config_id,
    )
    .await?;
    ensure_optional_body_project_access(state.db.pool(), &auth_user, &body).await?;
    ensure_json_object_if_present(&body, "config")?;
    update_row(
        state.db.pool(),
        "construction_platform_configs",
        PLATFORM_CONFIG_COLUMNS,
        &body,
        &[("id", config_id)],
    )
    .await
}

pub async fn delete_platform_config(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(config_id): Path<Uuid>,
) -> ApiResult<()> {
    ensure_row_project_access(
        state.db.pool(),
        &auth_user,
        "construction_platform_configs",
        config_id,
    )
    .await?;
    soft_delete_row(
        state.db.pool(),
        "construction_platform_configs",
        &[("id", config_id)],
    )
    .await
}

pub async fn create_platform_log(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_body_project_access(state.db.pool(), &auth_user, &body).await?;
    ensure_json_object_if_present(&body, "payload")?;
    create_row(
        state.db.pool(),
        "construction_platform_logs",
        PLATFORM_LOG_COLUMNS,
        &body,
        &[],
        StatusCode::CREATED,
    )
    .await
}

pub async fn list_platform_logs(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    uri: Uri,
) -> ApiResult<Value> {
    let params = module_list_params(&uri)?;
    let data = list_unified_platform_logs(state.db.pool(), &auth_user, &params).await?;
    Ok(ApiSuccess::default().with_data(data))
}

pub async fn retry_platform_job(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(job_id): Path<Uuid>,
) -> ApiResult<Value> {
    let row = sqlx::query(
        r#"
        SELECT project_id, platform_code, status
        FROM integration_jobs
        WHERE id = $1
        "#,
    )
    .bind(job_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)?;
    let project_id: Uuid = row.try_get("project_id").map_err(db_error)?;
    let platform_code: String = row.try_get("platform_code").map_err(db_error)?;
    let status: String = row.try_get("status").map_err(db_error)?;
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    if !matches!(platform_code.as_str(), "yongxin_v2" | "xinleda") {
        return Err(invalid_input("当前平台任务暂不支持从此入口重试"));
    }
    if status == "delivery_unknown" {
        return Err(invalid_input(
            "该任务的请求结果未知，直接重试可能产生重复数据，请先向平台核对",
        ));
    }
    if matches!(status.as_str(), "success" | "completed" | "processing") {
        return Err(invalid_input("当前任务状态不允许重试"));
    }

    let result = sqlx::query_scalar::<_, Value>(
        r#"
        UPDATE integration_jobs
        SET status = 'pending', attempt_count = 0, next_attempt_at = NOW(),
            locked_by = NULL, locked_until = NULL, last_error = NULL,
            response_payload = NULL, external_request_id = NULL,
            remote_state = NULL, result_checked_at = NULL, expires_at = NULL,
            completed_at = NULL, updated_at = NOW()
        WHERE id = $1
        RETURNING to_jsonb(integration_jobs)
        "#,
    )
    .bind(job_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;
    Ok(ApiSuccess::default().with_data(result))
}

async fn list_unified_platform_logs(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    params: &ModuleListParams,
) -> Result<Value, ApiError> {
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        WITH unified_logs AS (
            SELECT
                log.id,
                log.project_id,
                project.name AS project_name,
                log.platform_config_id,
                log.is_deleted,
                log.platform_name,
                config.platform_type,
                log.operation,
                log.direction,
                log.status,
                log.request_count,
                log.success_count,
                log.failure_count,
                log.message,
                log.payload,
                log.occurred_at,
                log.created_by_user_id,
                log.updated_by_user_id,
                log.created_at,
                log.updated_at,
                log.deleted_at,
                ARRAY[]::text[] AS attempt_statuses,
                'manual'::text AS source
            FROM construction_platform_logs log
            LEFT JOIN construction_projects project
              ON project.id = log.project_id
             AND project.is_deleted = FALSE
            LEFT JOIN construction_platform_configs config
              ON config.id = log.platform_config_id
             AND config.is_deleted = FALSE
            WHERE log.is_deleted = FALSE

            UNION ALL

            SELECT
                job.id,
                job.project_id,
                project.name AS project_name,
                config.id AS platform_config_id,
                FALSE AS is_deleted,
                COALESCE(config.platform_name, platform.name, job.platform_code) AS platform_name,
                COALESCE(config.platform_type, platform.code, job.platform_code) AS platform_type,
                CASE
                    WHEN job.entity_type IN ('team', 'construction_team')
                         AND job.operation IN ('Project/AddTeam', 'addTeam') THEN '班组新增'
                    WHEN job.entity_type IN ('worker', 'construction_worker')
                         AND job.operation = 'Project/AddWorkerV2' THEN '工人新增'
                    WHEN job.entity_type IN ('worker', 'construction_worker')
                         AND job.operation = 'Project/EditWorker' THEN '工人编辑'
                    WHEN job.entity_type IN ('worker', 'construction_worker')
                         AND job.operation = 'Project/ProjectWorkerExit' THEN '工人退场'
                    WHEN job.operation = 'project.query' THEN '项目配置校验'
                    WHEN job.operation = 'project.sync' THEN '项目基本信息同步'
                    WHEN job.operation = 'unit.sync' THEN '参建单位同步'
                    WHEN job.operation = 'team.sync' THEN '班组同步'
                    WHEN job.operation = 'worker.sync' THEN '人员同步'
                    WHEN job.operation = 'entry_exit.sync' THEN '人员进退场同步'
                    WHEN job.operation = 'attendance.sync' THEN '设备考勤同步'
                    WHEN job.operation = 'safeguard.sync' THEN '企业保证金同步'
                    ELSE job.operation
                END AS operation,
                'push'::text AS direction,
                CASE
                    WHEN job.status IN ('success', 'completed') THEN 'success'
                    WHEN job.status = 'failed' THEN 'failed'
                    ELSE job.status
                END AS status,
                GREATEST(
                    job.attempt_count,
                    (SELECT COUNT(*)::int FROM integration_attempts attempt WHERE attempt.job_id = job.id)
                )::int AS request_count,
                CASE WHEN job.status IN ('success', 'completed') THEN 1 ELSE 0 END::int AS success_count,
                CASE WHEN job.status IN ('failed', 'delivery_unknown') THEN 1 ELSE 0 END::int AS failure_count,
                COALESCE(
                    NULLIF(job.last_error, ''),
                    CASE
                        WHEN job.response_payload ->> 'recovered_existing' = 'true'
                            THEN '平台提示班组重复，已查询并绑定现有平台班组 ID'
                        WHEN job.response_payload ->> 'skipped' = 'true'
                            THEN COALESCE(job.response_payload ->> 'reason', '当前操作无需调用平台接口')
                        WHEN job.status IN ('success', 'completed') THEN '上报成功'
                        ELSE NULL
                    END
                ) AS message,
                jsonb_build_object(
                    'source', 'integration_job',
                    'platform_code', job.platform_code,
                    'base_url', COALESCE(binding.base_url, config.config ->> 'base_url'),
                    'entity_type', job.entity_type,
                    'local_entity_id', job.local_entity_id,
                    'entity_name', COALESCE(job_worker.name, attendance_worker.name),
                    'entity_identity', COALESCE(job_worker.id_card, attendance_worker.id_card),
                    'job_request', job.request_payload,
                    'external_request_id', job.external_request_id,
                    'remote_state', job.remote_state,
                    'response', job.response_payload,
                    'attempt_count', job.attempt_count,
                    'attempts', COALESCE((
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'attempt_no', attempt.attempt_no,
                                'method', attempt.request_method,
                                'url', attempt.request_url,
                                'headers', attempt.request_headers,
                                'request', attempt.request_body,
                                'http_status', attempt.response_status,
                                'response', attempt.response_body,
                                'duration_ms', attempt.duration_ms,
                                'status', attempt.status,
                                'error', attempt.error_message,
                                'created_at', attempt.created_at
                            ) ORDER BY attempt.attempt_no
                        )
                        FROM integration_attempts attempt
                        WHERE attempt.job_id = job.id
                    ), '[]'::jsonb)
                ) AS payload,
                job.updated_at AS occurred_at,
                NULL::uuid AS created_by_user_id,
                NULL::uuid AS updated_by_user_id,
                job.created_at,
                job.updated_at,
                NULL::timestamptz AS deleted_at,
                ARRAY(
                    SELECT DISTINCT attempt.status
                    FROM integration_attempts attempt
                    WHERE attempt.job_id = job.id
                      AND attempt.status IS NOT NULL
                ) AS attempt_statuses,
                'system'::text AS source
            FROM integration_jobs job
            LEFT JOIN construction_projects project
              ON project.id = job.project_id
             AND project.is_deleted = FALSE
            LEFT JOIN integration_project_bindings binding
              ON binding.id = job.binding_id
             AND binding.is_deleted = FALSE
            LEFT JOIN integration_platforms platform
              ON platform.id = binding.platform_id
             AND platform.is_deleted = FALSE
            LEFT JOIN construction_platform_configs config
              ON config.id = binding.platform_config_id
             AND config.is_deleted = FALSE
            LEFT JOIN construction_workers job_worker
              ON job.entity_type IN ('worker', 'construction_worker')
             AND job_worker.id = job.local_entity_id
             AND job_worker.is_deleted = FALSE
            LEFT JOIN construction_attendance_records attendance_record
              ON job.entity_type = 'attendance'
             AND attendance_record.id = job.local_entity_id
             AND attendance_record.is_deleted = FALSE
            LEFT JOIN construction_workers attendance_worker
              ON attendance_worker.id = attendance_record.worker_id
             AND attendance_worker.is_deleted = FALSE
            WHERE TRUE
        ), filtered_logs AS (
            SELECT *
            FROM unified_logs log
            WHERE TRUE
        "#,
    );
    push_accessible_project_scope(&mut query, auth_user, "log.project_id");
    if let Some(project_id) = params.project_id {
        query.push(" AND log.project_id = ").push_bind(project_id);
    }
    if let Some(status) = &params.status {
        query
            .push(" AND (log.status = ")
            .push_bind(status.clone())
            .push(" OR ")
            .push_bind(status.clone())
            .push(" = ANY(log.attempt_statuses))");
    }
    if let Some(platform_type) = &params.platform_type {
        query
            .push(" AND log.platform_type = ")
            .push_bind(platform_type.clone());
    }
    if let Some(operation) = &params.operation {
        query
            .push(" AND log.operation = ")
            .push_bind(operation.clone());
    }
    if !params.keyword.is_empty() {
        let pattern = format!("%{}%", params.keyword);
        query
            .push(" AND (COALESCE(log.project_name, '') ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR COALESCE(log.platform_name, '') ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR COALESCE(log.operation, '') ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR COALESCE(log.message, '') ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR COALESCE(log.payload::text, '') ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
    query
        .push(
            r#"
        )
        SELECT jsonb_build_object(
            'items', COALESCE((
                SELECT jsonb_agg(to_jsonb(page) ORDER BY page.occurred_at DESC, page.id DESC)
                FROM (
                    SELECT *
                    FROM filtered_logs
                    ORDER BY occurred_at DESC, id DESC
                    LIMIT
            "#,
        )
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(
            r#"
                ) page
            ), '[]'::jsonb),
            'total', (SELECT COUNT(*)::int FROM filtered_logs),
            'page',
            "#,
        )
        .push_bind(params.page)
        .push(", 'page_size', ")
        .push_bind(params.page_size)
        .push(
            r#",
            'summary', jsonb_build_object(
                'today_request_count', COALESCE((SELECT SUM(request_count)::int FROM filtered_logs WHERE (occurred_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date), 0),
                'today_success_count', COALESCE((SELECT SUM(success_count)::int FROM filtered_logs WHERE (occurred_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date), 0),
                'today_failure_count', COALESCE((SELECT SUM(failure_count)::int FROM filtered_logs WHERE (occurred_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date), 0),
                'today_log_count', (SELECT COUNT(*)::int FROM filtered_logs WHERE (occurred_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date)
            )
        )
        "#,
        );

    query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

pub async fn get_platform_log(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(log_id): Path<Uuid>,
) -> ApiResult<Value> {
    ensure_row_project_access(
        state.db.pool(),
        &auth_user,
        "construction_platform_logs",
        log_id,
    )
    .await?;
    get_row(
        state.db.pool(),
        "construction_platform_logs",
        &[("id", log_id)],
    )
    .await
}

pub async fn update_platform_log(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(log_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_row_project_access(
        state.db.pool(),
        &auth_user,
        "construction_platform_logs",
        log_id,
    )
    .await?;
    ensure_optional_body_project_access(state.db.pool(), &auth_user, &body).await?;
    ensure_json_object_if_present(&body, "payload")?;
    update_row(
        state.db.pool(),
        "construction_platform_logs",
        PLATFORM_LOG_COLUMNS,
        &body,
        &[("id", log_id)],
    )
    .await
}

pub async fn delete_platform_log(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(log_id): Path<Uuid>,
) -> ApiResult<()> {
    ensure_row_project_access(
        state.db.pool(),
        &auth_user,
        "construction_platform_logs",
        log_id,
    )
    .await?;
    soft_delete_row(
        state.db.pool(),
        "construction_platform_logs",
        &[("id", log_id)],
    )
    .await
}

pub async fn get_construction_overview(State(state): State<AppState>) -> ApiResult<Value> {
    let data = sqlx::query_scalar::<_, Value>(
        r#"
        SELECT jsonb_build_object(
            'project_count', (SELECT COUNT(*)::int FROM construction_projects WHERE is_deleted = FALSE),
            'unit_count', (SELECT COUNT(*)::int FROM construction_units WHERE is_deleted = FALSE),
            'team_count', (SELECT COUNT(*)::int FROM construction_teams WHERE is_deleted = FALSE),
            'worker_count', (SELECT COUNT(*)::int FROM construction_workers WHERE is_deleted = FALSE),
            'today_attendance_count', (
                SELECT COUNT(*)::int
                FROM construction_attendance_records
                WHERE is_deleted = FALSE
                  AND (trigger_time AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date
            ),
            'wage_payable_amount_cents', (
                SELECT COALESCE(SUM(payable_amount_cents), 0)::bigint
                FROM construction_wage_batches
                WHERE is_deleted = FALSE
            ),
            'wage_paid_amount_cents', (
                SELECT COALESCE(SUM(paid_amount_cents), 0)::bigint
                FROM construction_wage_batches
                WHERE is_deleted = FALSE
            ),
            'wage_unpaid_amount_cents', (
                SELECT GREATEST(
                    COALESCE(SUM(payable_amount_cents), 0) - COALESCE(SUM(paid_amount_cents), 0),
                    0
                )::bigint
                FROM construction_wage_batches
                WHERE is_deleted = FALSE
            ),
            'wage_paid_rate_basis_points', (
                SELECT CASE
                    WHEN COALESCE(SUM(payable_amount_cents), 0) > 0 THEN
                        ROUND(COALESCE(SUM(paid_amount_cents), 0)::numeric * 10000 / COALESCE(SUM(payable_amount_cents), 0))::int
                    ELSE 0
                END
                FROM construction_wage_batches
                WHERE is_deleted = FALSE
            ),
            'contract_template_count', (
                SELECT COUNT(*)::int
                FROM construction_contract_templates
                WHERE is_deleted = FALSE
            ),
            'work_hour_config_count', (
                SELECT COUNT(*)::int
                FROM construction_work_hour_configs
                WHERE is_deleted = FALSE
            ),
            'platform_config_count', (
                SELECT COUNT(*)::int
                FROM construction_platform_configs
                WHERE is_deleted = FALSE
            ),
            'platform_today_request_count', (
                SELECT COALESCE(SUM(request_count), 0)::int
                FROM construction_platform_logs
                WHERE is_deleted = FALSE
                  AND (occurred_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date
            ),
            'platform_success_count', (
                SELECT COUNT(*)::int
                FROM construction_platform_logs
                WHERE is_deleted = FALSE
                  AND status = 'success'
            ),
            'platform_failed_count', (
                SELECT COUNT(*)::int
                FROM construction_platform_logs
                WHERE is_deleted = FALSE
                  AND status = 'failed'
            ),
            'platform_success_rate_basis_points', (
                SELECT CASE
                    WHEN COUNT(*) > 0 THEN
                        ROUND(COUNT(*) FILTER (WHERE status = 'success')::numeric * 10000 / COUNT(*))::int
                    ELSE 10000
                END
                FROM construction_platform_logs
                WHERE is_deleted = FALSE
            ),
            'project_active_count', (
                SELECT COUNT(*)::int
                FROM construction_projects
                WHERE is_deleted = FALSE
                  AND status = 1
            ),
            'project_other_count', (
                SELECT COUNT(*)::int
                FROM construction_projects
                WHERE is_deleted = FALSE
                  AND (status IS NULL OR status != 1)
            ),
            'attendance_7day_count', (
                SELECT COUNT(*)::int
                FROM construction_attendance_records
                WHERE is_deleted = FALSE
                  AND (trigger_time AT TIME ZONE 'Asia/Shanghai')::date >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date - INTERVAL '6 days'
                  AND (trigger_time AT TIME ZONE 'Asia/Shanghai')::date <= (NOW() AT TIME ZONE 'Asia/Shanghai')::date
            ),
            'attendance_7day_average', (
                SELECT ROUND((COUNT(*)::numeric / 7), 2)
                FROM construction_attendance_records
                WHERE is_deleted = FALSE
                  AND (trigger_time AT TIME ZONE 'Asia/Shanghai')::date >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date - INTERVAL '6 days'
                  AND (trigger_time AT TIME ZONE 'Asia/Shanghai')::date <= (NOW() AT TIME ZONE 'Asia/Shanghai')::date
            ),
            'project_status_distribution', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('status', status, 'count', count) ORDER BY status)
                FROM (
                    SELECT status, COUNT(*)::int AS count
                    FROM construction_projects
                    WHERE is_deleted = FALSE
                    GROUP BY status
                ) s
            ), '[]'::jsonb),
            'attendance_trend', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('date', day::date::text, 'count', COALESCE(count, 0)) ORDER BY day)
                FROM (
                    SELECT day, COUNT(r.id)::int AS count
                    FROM generate_series(
                        (NOW() AT TIME ZONE 'Asia/Shanghai')::date - INTERVAL '6 days',
                        (NOW() AT TIME ZONE 'Asia/Shanghai')::date,
                        INTERVAL '1 day'
                    ) day
                    LEFT JOIN construction_attendance_records r
                        ON r.is_deleted = FALSE
                       AND (r.trigger_time AT TIME ZONE 'Asia/Shanghai')::date = day::date
                    GROUP BY day
                ) t
            ), '[]'::jsonb),
            'platform_status_distribution', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('status', status, 'count', count) ORDER BY status)
                FROM (
                    SELECT status, COUNT(*)::int AS count
                    FROM construction_platform_logs
                    WHERE is_deleted = FALSE
                    GROUP BY status
                ) s
            ), '[]'::jsonb)
        )
        "#,
    )
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(data))
}

async fn list_module_rows(
    pool: &sqlx::PgPool,
    table: &'static str,
    params: &ModuleListParams,
) -> ApiResult<Value> {
    let data = list_module_rows_value(pool, table, params, None).await?;
    Ok(ApiSuccess::default().with_data(data))
}

async fn list_module_rows_scoped(
    pool: &sqlx::PgPool,
    table: &'static str,
    params: &ModuleListParams,
    auth_user: &AuthUser,
) -> ApiResult<Value> {
    let data = list_module_rows_value(pool, table, params, Some(auth_user)).await?;
    Ok(ApiSuccess::default().with_data(data))
}

async fn list_module_rows_value(
    pool: &sqlx::PgPool,
    table: &'static str,
    params: &ModuleListParams,
    auth_user: Option<&AuthUser>,
) -> Result<Value, ApiError> {
    let total = count_module_rows(pool, table, params, auth_user).await?;
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb) FROM (SELECT ",
    );
    push_module_select_columns(&mut query, table);
    query.push(" FROM ").push(table).push(" r");
    push_module_joins(&mut query, table);
    query.push(" WHERE r.is_deleted = FALSE");
    if let Some(auth_user) = auth_user {
        push_accessible_project_scope(&mut query, auth_user, "r.project_id");
    }
    push_module_filters(&mut query, table, params);
    query
        .push(" ORDER BY r.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") r");

    let items = query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;

    Ok(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    }))
}

async fn fetch_attendance_device_issue_report(
    pool: &sqlx::PgPool,
    report_id: Uuid,
) -> Result<Value, ApiError> {
    sqlx::query_scalar::<_, Value>(
        r#"
        SELECT to_jsonb(row)
        FROM (
            SELECT
                r.*,
                p.name AS project_name,
                COALESCE(r.worker_name, w.name) AS worker_name,
                COALESCE(r.worker_id_card, w.id_card) AS worker_id_card,
                COALESCE(r.worker_phone, w.phone) AS worker_phone,
                COALESCE(r.avatar_url, w.avatar) AS avatar_url,
                COALESCE(r.device_name, d.device_name) AS device_name,
                COALESCE(r.serial_number, d.serial_number) AS serial_number,
                COALESCE(r.device_type, d.device_type) AS device_type
            FROM construction_attendance_device_issue_reports r
            LEFT JOIN construction_projects p ON p.id = r.project_id AND p.is_deleted = FALSE
            LEFT JOIN construction_workers w ON w.id = r.worker_id AND w.is_deleted = FALSE
            LEFT JOIN construction_attendance_devices d
                ON d.id = r.attendance_device_id AND d.is_deleted = FALSE
            WHERE r.id = $1
              AND r.is_deleted = FALSE
        ) row
        "#,
    )
    .bind(report_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)
}

async fn count_module_rows(
    pool: &sqlx::PgPool,
    table: &'static str,
    params: &ModuleListParams,
    auth_user: Option<&AuthUser>,
) -> Result<i64, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new("SELECT COUNT(*)::bigint FROM ");
    query.push(table).push(" r");
    push_module_joins(&mut query, table);
    query.push(" WHERE r.is_deleted = FALSE");
    if let Some(auth_user) = auth_user {
        push_accessible_project_scope(&mut query, auth_user, "r.project_id");
    }
    push_module_filters(&mut query, table, params);

    query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

fn push_module_select_columns(query: &mut QueryBuilder<'_, Postgres>, table: &'static str) {
    match table {
        "construction_work_hour_configs"
        | "construction_platform_configs"
        | "construction_platform_logs" => {
            query.push("r.*, p.name AS project_name");
        }
        "construction_attendance_device_issue_reports" => {
            query.push(
                r#"
                r.*,
                p.name AS project_name,
                COALESCE(r.worker_name, w.name) AS worker_name,
                COALESCE(r.worker_id_card, w.id_card) AS worker_id_card,
                COALESCE(r.worker_phone, w.phone) AS worker_phone,
                COALESCE(r.avatar_url, w.avatar) AS avatar_url,
                COALESCE(r.device_name, d.device_name) AS device_name,
                COALESCE(r.serial_number, d.serial_number) AS serial_number,
                COALESCE(r.device_type, d.device_type) AS device_type
                "#,
            );
        }
        _ => {
            query.push("r.*");
        }
    }
}

fn push_module_joins(query: &mut QueryBuilder<'_, Postgres>, table: &'static str) {
    match table {
        "construction_work_hour_configs"
        | "construction_platform_configs"
        | "construction_platform_logs" => {
            query.push(
                " LEFT JOIN construction_projects p ON p.id = r.project_id AND p.is_deleted = FALSE",
            );
        }
        "construction_attendance_device_issue_reports" => {
            query.push(
                " LEFT JOIN construction_projects p ON p.id = r.project_id AND p.is_deleted = FALSE",
            );
            query.push(
                " LEFT JOIN construction_workers w ON w.id = r.worker_id AND w.is_deleted = FALSE",
            );
            query.push(
                " LEFT JOIN construction_attendance_devices d ON d.id = r.attendance_device_id AND d.is_deleted = FALSE",
            );
        }
        _ => {}
    }
}

fn push_module_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    table: &'static str,
    params: &ModuleListParams,
) {
    if let Some(project_id) = params.project_id {
        query.push(" AND r.project_id = ").push_bind(project_id);
    }
    if table == "construction_attendance_device_issue_reports" {
        if let Some(worker_id) = params.worker_id {
            query.push(" AND r.worker_id = ").push_bind(worker_id);
        }
        if let Some(attendance_device_id) = params.attendance_device_id {
            query
                .push(" AND r.attendance_device_id = ")
                .push_bind(attendance_device_id);
        }
    }
    if let Some(status) = &params.status {
        query.push(" AND r.status = ").push_bind(status.clone());
    }
    if let Some(platform_type) = &params.platform_type {
        query
            .push(" AND r.platform_type = ")
            .push_bind(platform_type.clone());
    }
    if let Some(action) = &params.action {
        query.push(" AND r.action = ").push_bind(action.clone());
    } else if table == "construction_attendance_device_issue_reports"
        && !params.include_delete_actions
    {
        query.push(" AND r.action <> 'delete'");
    }
    if params.keyword.is_empty() {
        return;
    }

    let pattern = format!("%{}%", params.keyword);
    match table {
        "construction_contract_templates" => {
            query
                .push(" AND (r.name ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR r.code ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR r.remark ILIKE ")
                .push_bind(pattern)
                .push(")");
        }
        "construction_work_hour_configs" => {
            query
                .push(" AND (r.name ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR r.algorithm_type ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR r.remark ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR p.name ILIKE ")
                .push_bind(pattern)
                .push(")");
        }
        "construction_platform_configs" => {
            query
                .push(" AND (r.platform_name ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR r.platform_type ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR r.remark ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR p.name ILIKE ")
                .push_bind(pattern)
                .push(")");
        }
        "construction_platform_logs" => {
            query
                .push(" AND (r.platform_name ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR r.operation ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR r.message ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR p.name ILIKE ")
                .push_bind(pattern)
                .push(")");
        }
        "construction_attendance_device_issue_reports" => {
            query
                .push(" AND (COALESCE(r.worker_name, w.name) ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR COALESCE(r.worker_id_card, w.id_card) ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR COALESCE(r.worker_phone, w.phone) ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR COALESCE(r.device_name, d.device_name) ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR COALESCE(r.serial_number, d.serial_number) ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR COALESCE(r.device_type, d.device_type) ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR r.message ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR r.remark ILIKE ")
                .push_bind(pattern.clone())
                .push(" OR p.name ILIKE ")
                .push_bind(pattern)
                .push(")");
        }
        _ => {}
    }
}

async fn soft_delete_row(
    pool: &sqlx::PgPool,
    table: &'static str,
    where_uuid_columns: &[(&'static str, Uuid)],
) -> ApiResult<()> {
    let mut query = QueryBuilder::<Postgres>::new("UPDATE ");
    query
        .push(table)
        .push(" SET is_deleted = TRUE, deleted_at = NOW() WHERE is_deleted = FALSE");
    for (column, value) in where_uuid_columns {
        query
            .push(" AND ")
            .push(*column)
            .push(" = ")
            .push_bind(*value);
    }

    let result = query.build().execute(pool).await.map_err(db_error)?;
    if result.rows_affected() == 0 {
        return Err(not_found());
    }

    Ok(ApiSuccess::default().with_data(()))
}

async fn clear_contract_default_if_needed(
    pool: &sqlx::PgPool,
    body: &Value,
) -> Result<(), ApiError> {
    let Some(true) = body.get("is_default").and_then(Value::as_bool) else {
        return Ok(());
    };

    sqlx::query(
        "UPDATE construction_contract_templates SET is_default = FALSE WHERE is_deleted = FALSE",
    )
    .execute(pool)
    .await
    .map_err(db_error)?;

    Ok(())
}

async fn ensure_contract_template_exists(
    pool: &sqlx::PgPool,
    template_id: Uuid,
) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM construction_contract_templates
            WHERE id = $1 AND is_deleted = FALSE AND is_enabled = TRUE
        )
        "#,
    )
    .bind(template_id)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;

    if exists { Ok(()) } else { Err(not_found()) }
}

fn ensure_json_object_if_present(body: &Value, column: &str) -> Result<(), ApiError> {
    let Some(value) = body.get(column) else {
        return Ok(());
    };
    match value {
        Value::Null => Ok(()),
        Value::Object(_) => Ok(()),
        Value::String(value) if value.trim().is_empty() => Ok(()),
        Value::String(value) => serde_json::from_str::<Value>(value)
            .ok()
            .filter(Value::is_object)
            .map(|_| ())
            .ok_or_else(|| invalid_column_value(column, "JSON object")),
        _ => Err(invalid_column_value(column, "JSON object")),
    }
}

fn ensure_json_string_array_if_present(body: &Value, column: &str) -> Result<(), ApiError> {
    let Some(value) = body.get(column) else {
        return Ok(());
    };
    let parsed = match value {
        Value::Null => return Ok(()),
        Value::Array(items) => items.clone(),
        Value::String(value) if value.trim().is_empty() => return Ok(()),
        Value::String(value) => serde_json::from_str::<Value>(value)
            .ok()
            .and_then(|parsed| parsed.as_array().cloned())
            .ok_or_else(|| invalid_column_value(column, "JSON string array"))?,
        _ => return Err(invalid_column_value(column, "JSON string array")),
    };
    if parsed.iter().all(Value::is_string) {
        Ok(())
    } else {
        Err(invalid_column_value(column, "JSON string array"))
    }
}

fn validate_managed_photo_pairs(body: &Value) -> Result<(), ApiError> {
    if body.get("in_photos").is_none() && body.get("out_photos").is_none() {
        return Ok(());
    }
    ensure_json_string_array_if_present(body, "in_photos")?;
    ensure_json_string_array_if_present(body, "out_photos")?;
    let read = |column: &str| {
        body.get(column)
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::trim)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    };
    let in_photos = read("in_photos");
    let out_photos = read("out_photos");
    if in_photos.is_empty() || out_photos.is_empty() {
        return Err(invalid_input("至少需要上传 1 组完整的进场、出场照片"));
    }
    if in_photos.len() != out_photos.len() {
        return Err(invalid_input(
            "每个照片组必须同时包含 1 张进场和 1 张出场照片",
        ));
    }
    if in_photos.len() > 30 {
        return Err(invalid_input("托管照片最多支持 30 组"));
    }
    if in_photos
        .iter()
        .chain(out_photos.iter())
        .any(|url| url.is_empty())
    {
        return Err(invalid_input("照片地址不能为空"));
    }
    Ok(())
}

#[derive(Debug, Clone)]
struct ContractTemplateSource {
    content: String,
    template_file_object_key: Option<String>,
    template_file_name: Option<String>,
}

async fn resolve_contract_template(
    pool: &sqlx::PgPool,
    project_id: Uuid,
) -> Result<ContractTemplateSource, ApiError> {
    let row = sqlx::query(
        r#"
        SELECT t.content, t.template_file_object_key, t.template_file_name
        FROM construction_project_contract_configs c
        JOIN construction_contract_templates t ON t.id = c.template_id
        WHERE c.project_id = $1
          AND c.is_deleted = FALSE
          AND t.is_deleted = FALSE
          AND t.is_enabled = TRUE
        LIMIT 1
        "#,
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?;

    if let Some(row) = row {
        return Ok(ContractTemplateSource {
            content: row.try_get("content").unwrap_or_default(),
            template_file_object_key: row.try_get("template_file_object_key").ok(),
            template_file_name: row.try_get("template_file_name").ok(),
        });
    }

    let row = sqlx::query(
        r#"
        SELECT content, template_file_object_key, template_file_name
        FROM construction_contract_templates
        WHERE is_deleted = FALSE AND is_enabled = TRUE AND is_default = TRUE
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await
    .map_err(db_error)?;

    if let Some(row) = row {
        return Ok(ContractTemplateSource {
            content: row.try_get("content").unwrap_or_default(),
            template_file_object_key: row.try_get("template_file_object_key").ok(),
            template_file_name: row.try_get("template_file_name").ok(),
        });
    }

    Ok(ContractTemplateSource {
        content: "项目：{{project.name}}；工人：{{worker.name}}；班组：{{team.name}}；单位：{{unit.company_name}}；身份证：{{worker.id_card}}"
            .to_owned(),
        template_file_object_key: None,
        template_file_name: None,
    })
}

fn render_text_contract_template(content: &str, variables: &HashMap<String, String>) -> String {
    let mut rendered = content.to_owned();
    for (name, value) in variables {
        if value.trim().is_empty() {
            continue;
        }
        rendered = rendered.replace(&format!("{{{{{name}}}}}"), value);
    }

    rendered
}

fn render_docx_contract_template(
    template_bytes: &[u8],
    variables: &HashMap<String, String>,
    remote_images: &HashMap<String, DocxImage>,
) -> Result<Bytes, String> {
    let reader = Cursor::new(template_bytes);
    let mut archive = ZipArchive::new(reader).map_err(|error| error.to_string())?;
    let mut entries = Vec::with_capacity(archive.len());
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|error| error.to_string())?;
        let name = file.name().to_owned();
        let is_dir = file.is_dir();
        let mut bytes = Vec::new();
        if !is_dir {
            file.read_to_end(&mut bytes)
                .map_err(|error| error.to_string())?;
        }
        entries.push(DocxEntry {
            name,
            is_dir,
            bytes,
        });
    }

    let mut context = DocxRenderContext::default();
    let mut rendered_parts = HashMap::new();
    for entry in &entries {
        if entry.is_dir || !is_word_xml_part(&entry.name) {
            continue;
        }
        let xml = String::from_utf8(entry.bytes.clone()).map_err(|error| error.to_string())?;
        let rendered =
            render_docx_xml_text_nodes(&entry.name, &xml, variables, remote_images, &mut context);
        rendered_parts.insert(entry.name.clone(), rendered.into_bytes());
    }

    let existing_names = entries
        .iter()
        .map(|entry| entry.name.as_str())
        .collect::<Vec<_>>();
    let mut output = Cursor::new(Vec::new());
    {
        let mut writer = ZipWriter::new(&mut output);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        for entry in &entries {
            if entry.is_dir {
                writer
                    .add_directory(entry.name.clone(), options)
                    .map_err(|error| error.to_string())?;
                continue;
            }

            let rendered = if entry.name == "[Content_Types].xml" {
                let xml =
                    String::from_utf8(entry.bytes.clone()).map_err(|error| error.to_string())?;
                update_content_types_xml(&xml, &context.media_files).into_bytes()
            } else if let Some(relationships) = context.relationships.get(&entry.name) {
                let xml =
                    String::from_utf8(entry.bytes.clone()).map_err(|error| error.to_string())?;
                update_relationships_xml(&xml, relationships).into_bytes()
            } else if let Some(rendered) = rendered_parts.get(&entry.name) {
                rendered.clone()
            } else {
                entry.bytes.clone()
            };
            writer
                .start_file(entry.name.clone(), options)
                .map_err(|error| error.to_string())?;
            writer
                .write_all(&rendered)
                .map_err(|error| error.to_string())?;
        }

        for (rels_name, relationships) in &context.relationships {
            if existing_names.contains(&rels_name.as_str()) {
                continue;
            }
            writer
                .start_file(rels_name, options)
                .map_err(|error| error.to_string())?;
            let xml = update_relationships_xml(
                r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>"#,
                relationships,
            );
            writer
                .write_all(xml.as_bytes())
                .map_err(|error| error.to_string())?;
        }

        for media in &context.media_files {
            writer
                .start_file(&media.path, options)
                .map_err(|error| error.to_string())?;
            writer
                .write_all(&media.bytes)
                .map_err(|error| error.to_string())?;
        }
        writer.finish().map_err(|error| error.to_string())?;
    }

    Ok(Bytes::from(output.into_inner()))
}

fn is_word_xml_part(name: &str) -> bool {
    name.starts_with("word/")
        && name.ends_with(".xml")
        && !name.starts_with("word/_rels/")
        && !name.starts_with("word/media/")
}

#[derive(Debug)]
struct DocxEntry {
    name: String,
    is_dir: bool,
    bytes: Vec<u8>,
}

#[derive(Default)]
struct DocxRenderContext {
    next_media_index: usize,
    media_files: Vec<DocxMediaFile>,
    relationships: HashMap<String, Vec<DocxRelationship>>,
}

struct DocxMediaFile {
    path: String,
    extension: String,
    content_type: String,
    bytes: Vec<u8>,
}

#[derive(Clone)]
struct DocxRelationship {
    id: String,
    target: String,
}

#[derive(Clone, Debug)]
struct TextNode {
    run_start: usize,
    run_end: usize,
    content_start: usize,
    content_end: usize,
    text_start: usize,
    text_end: usize,
    text: String,
}

#[derive(Debug)]
struct RawXmlReplacement {
    start: usize,
    end: usize,
    xml: String,
}

fn render_docx_xml_text_nodes(
    part_name: &str,
    xml: &str,
    variables: &HashMap<String, String>,
    remote_images: &HashMap<String, DocxImage>,
    context: &mut DocxRenderContext,
) -> String {
    let nodes = collect_text_nodes(xml);
    if nodes.is_empty() {
        return xml.to_owned();
    }
    let mut plain = String::new();
    for node in &nodes {
        plain.push_str(&node.text);
    }

    let mut replacements = nodes
        .iter()
        .map(|node| node.text.clone())
        .collect::<Vec<_>>();
    let mut raw_replacements = Vec::new();
    for (start, end, name) in find_placeholders(&plain) {
        let Some(value) = variables
            .get(&name)
            .filter(|value| !value.trim().is_empty())
        else {
            continue;
        };
        if is_docx_image_variable(&name)
            && let Some(image) = load_docx_image(value, remote_images)
            && let Some(raw) =
                create_image_replacement(part_name, &nodes, start, end, image, context)
        {
            raw_replacements.push(raw);
            continue;
        }
        apply_text_replacement(&nodes, &mut replacements, start, end, value);
    }

    raw_replacements.sort_by_key(|replacement| replacement.start);
    let mut rendered = String::with_capacity(xml.len());
    let mut cursor = 0;
    let mut raw_index = 0;
    for (node, replacement) in nodes.iter().zip(replacements.iter()) {
        while let Some(raw) = raw_replacements.get(raw_index) {
            if raw.end <= cursor {
                raw_index += 1;
                continue;
            }
            if raw.start > node.content_start {
                break;
            }
            if raw.start >= cursor {
                rendered.push_str(&xml[cursor..raw.start]);
                rendered.push_str(&raw.xml);
                cursor = raw.end;
            }
            raw_index += 1;
        }
        if node.content_end <= cursor {
            continue;
        }
        rendered.push_str(&xml[cursor..node.content_start]);
        rendered.push_str(&escape_xml_text(replacement));
        cursor = node.content_end;
    }
    while let Some(raw) = raw_replacements.get(raw_index) {
        if raw.end > cursor && raw.start >= cursor {
            rendered.push_str(&xml[cursor..raw.start]);
            rendered.push_str(&raw.xml);
            cursor = raw.end;
        }
        raw_index += 1;
    }
    rendered.push_str(&xml[cursor..]);
    rendered
}

fn collect_text_nodes(xml: &str) -> Vec<TextNode> {
    let mut nodes = Vec::new();
    let mut cursor = 0;
    let mut text_offset = 0;
    while let Some(tag_start) = find_next_docx_text_tag(xml, cursor) {
        let Some(tag_end_relative) = xml[tag_start..].find('>') else {
            break;
        };
        let content_start = tag_start + tag_end_relative + 1;
        let Some(close_relative) = xml[content_start..].find("</w:t>") else {
            break;
        };
        let content_end = content_start + close_relative;
        let run_start = xml[..tag_start].rfind("<w:r").unwrap_or(tag_start);
        let run_end = xml[content_end..]
            .find("</w:r>")
            .map(|relative| content_end + relative + "</w:r>".len())
            .unwrap_or(content_end);
        let text = unescape_xml_text(&xml[content_start..content_end]);
        let text_start = text_offset;
        text_offset += text.chars().count();
        nodes.push(TextNode {
            run_start,
            run_end,
            content_start,
            content_end,
            text_start,
            text_end: text_offset,
            text,
        });
        cursor = content_end + "</w:t>".len();
    }
    nodes
}

fn find_next_docx_text_tag(xml: &str, cursor: usize) -> Option<usize> {
    let mut search_from = cursor;
    while let Some(relative_start) = xml[search_from..].find("<w:t") {
        let tag_start = search_from + relative_start;
        let next = xml.as_bytes().get(tag_start + "<w:t".len()).copied();
        if matches!(
            next,
            Some(b'>') | Some(b' ') | Some(b'\t') | Some(b'\r') | Some(b'\n')
        ) {
            return Some(tag_start);
        }
        search_from = tag_start + "<w:t".len();
    }
    None
}

fn find_placeholders(text: &str) -> Vec<(usize, usize, String)> {
    let chars = text.chars().collect::<Vec<_>>();
    let mut placeholders = Vec::new();
    let mut index = 0;
    while index + 1 < chars.len() {
        if chars[index] == '{' && chars[index + 1] == '{' {
            let mut end = index + 2;
            while end + 1 < chars.len() {
                if chars[end] == '}' && chars[end + 1] == '}' {
                    let name = chars[index + 2..end]
                        .iter()
                        .collect::<String>()
                        .trim()
                        .to_owned();
                    placeholders.push((index, end + 2, name));
                    index = end + 2;
                    break;
                }
                end += 1;
            }
            if end + 1 >= chars.len() {
                break;
            }
        } else {
            index += 1;
        }
    }
    placeholders
}

fn is_docx_image_variable(name: &str) -> bool {
    matches!(
        name,
        "worker.avatar"
            | "worker.ocr_photo"
            | "worker.id_card_back_file"
            | "worker.signature_photo"
            | "project.party_a_seal"
            | "unit.seal_photo"
            | "工人身份证人像面"
            | "工人身份证国徽面"
            | "工人签字"
            | "甲方公章"
            | "法定代表人章"
    )
}

fn create_image_replacement(
    part_name: &str,
    nodes: &[TextNode],
    start: usize,
    end: usize,
    image: DocxImage,
    context: &mut DocxRenderContext,
) -> Option<RawXmlReplacement> {
    let involved = nodes
        .iter()
        .filter(|node| node.text_end > start && node.text_start < end)
        .collect::<Vec<_>>();
    let first = involved.first()?;
    let last = involved.last()?;

    context.next_media_index += 1;
    let media_index = context.next_media_index;
    let media_path = format!(
        "word/media/contract-image-{media_index}.{}",
        image.extension
    );
    let media_target = format!("media/contract-image-{media_index}.{}", image.extension);
    let rel_id = format!("rIdContractImage{media_index}");
    let rels_name = word_relationship_part_name(part_name)?;
    context
        .relationships
        .entry(rels_name)
        .or_default()
        .push(DocxRelationship {
            id: rel_id.clone(),
            target: media_target,
        });
    context.media_files.push(DocxMediaFile {
        path: media_path,
        extension: image.extension,
        content_type: image.content_type,
        bytes: image.bytes,
    });

    Some(RawXmlReplacement {
        start: first.run_start,
        end: last.run_end,
        xml: image_run_xml(&rel_id, media_index),
    })
}

fn word_relationship_part_name(part_name: &str) -> Option<String> {
    let (dir, file) = part_name.rsplit_once('/')?;
    Some(format!("{dir}/_rels/{file}.rels"))
}

const MAX_DOCX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
const MAX_REMOTE_DOCX_IMAGES: usize = 12;
const DOCX_IMAGE_CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const DOCX_IMAGE_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone, Debug)]
struct DocxImage {
    extension: String,
    content_type: String,
    bytes: Vec<u8>,
}

#[derive(Debug)]
struct TrustedImageBase {
    scheme: String,
    host: String,
    port: Option<u16>,
    path_prefix: String,
}

impl TrustedImageBase {
    fn parse(value: &str) -> Option<Self> {
        let url = reqwest::Url::parse(value).ok()?;
        if !matches!(url.scheme(), "http" | "https")
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return None;
        }
        Some(Self {
            scheme: url.scheme().to_owned(),
            host: url.host_str()?.to_owned(),
            port: url.port_or_known_default(),
            path_prefix: url.path().trim_end_matches('/').to_owned(),
        })
    }

    fn allows(&self, url: &reqwest::Url) -> bool {
        if url.scheme() != self.scheme
            || url.host_str() != Some(self.host.as_str())
            || url.port_or_known_default() != self.port
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return false;
        }

        self.path_prefix.is_empty()
            || url.path() == self.path_prefix
            || url
                .path()
                .strip_prefix(&self.path_prefix)
                .is_some_and(|suffix| suffix.starts_with('/'))
    }
}

async fn load_remote_docx_images(
    variables: &HashMap<String, String>,
    public_base_url: &str,
) -> HashMap<String, DocxImage> {
    let Some(trusted_base) = TrustedImageBase::parse(public_base_url) else {
        tracing::warn!("DOCX remote images disabled: invalid storage public base URL");
        return HashMap::new();
    };
    let Ok(client) = reqwest::Client::builder()
        .connect_timeout(DOCX_IMAGE_CONNECT_TIMEOUT)
        .timeout(DOCX_IMAGE_REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
    else {
        tracing::warn!("DOCX remote images disabled: HTTP client initialization failed");
        return HashMap::new();
    };

    let urls = variables
        .iter()
        .filter(|(name, _)| is_docx_image_variable(name))
        .filter_map(|(_, value)| extract_remote_docx_image_url(value))
        .collect::<HashSet<_>>();
    let mut downloads = tokio::task::JoinSet::new();
    for raw_url in urls.into_iter().take(MAX_REMOTE_DOCX_IMAGES) {
        let Ok(url) = reqwest::Url::parse(&raw_url) else {
            continue;
        };
        if !trusted_base.allows(&url) {
            tracing::warn!(host = url.host_str(), "Rejected untrusted DOCX image URL");
            continue;
        }
        let client = client.clone();
        downloads.spawn(async move {
            let result = download_remote_docx_image(&client, url).await;
            (raw_url, result)
        });
    }

    let mut images = HashMap::new();
    while let Some(result) = downloads.join_next().await {
        match result {
            Ok((raw_url, Ok(image))) => {
                images.insert(raw_url, image);
            }
            Ok((_, Err(error))) => {
                tracing::warn!(%error, "DOCX remote image download skipped");
            }
            Err(error) => tracing::warn!(%error, "DOCX remote image task failed"),
        }
    }
    images
}

async fn download_remote_docx_image(
    client: &reqwest::Client,
    url: reqwest::Url,
) -> Result<DocxImage, String> {
    let mut response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "image/png,image/jpeg,image/gif")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("unexpected HTTP status {}", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_DOCX_IMAGE_BYTES as u64)
    {
        return Err("image exceeds size limit".to_owned());
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .ok_or_else(|| "missing image content type".to_owned())?
        .to_owned();
    let extension = image_extension_for_content_type(&content_type)
        .ok_or_else(|| "unsupported image content type".to_owned())?;

    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        append_bounded_image_bytes(&mut bytes, &chunk)?;
    }
    if !image_bytes_match_content_type(&content_type, &bytes) {
        return Err("image content does not match content type".to_owned());
    }
    Ok(DocxImage {
        extension,
        content_type,
        bytes,
    })
}

fn append_bounded_image_bytes(target: &mut Vec<u8>, chunk: &[u8]) -> Result<(), String> {
    if target.len().saturating_add(chunk.len()) > MAX_DOCX_IMAGE_BYTES {
        return Err("image exceeds size limit".to_owned());
    }
    target.extend_from_slice(chunk);
    Ok(())
}

fn extract_remote_docx_image_url(raw_value: &str) -> Option<String> {
    let value = raw_value.trim();
    if let Ok(json) = serde_json::from_str::<Value>(value) {
        return ["public_url", "url", "image_url"]
            .into_iter()
            .filter_map(|key| json.get(key).and_then(Value::as_str))
            .find_map(extract_remote_docx_image_url);
    }
    let url = reqwest::Url::parse(value).ok()?;
    matches!(url.scheme(), "http" | "https").then(|| value.to_owned())
}

fn load_docx_image(
    raw_value: &str,
    remote_images: &HashMap<String, DocxImage>,
) -> Option<DocxImage> {
    let value = raw_value.trim();
    if value.is_empty() {
        return None;
    }
    if let Some(image) = load_data_uri_image(value) {
        return Some(image);
    }
    if let Ok(json) = serde_json::from_str::<Value>(value) {
        for key in ["public_url", "url", "image_url"] {
            if let Some(url) = json.get(key).and_then(Value::as_str)
                && let Some(image) = load_docx_image(url, remote_images)
            {
                return Some(image);
            }
        }
        return None;
    }
    remote_images.get(value).cloned()
}

fn load_data_uri_image(value: &str) -> Option<DocxImage> {
    let (meta, payload) = value.split_once(',')?;
    if !meta.starts_with("data:image/") || !meta.ends_with(";base64") {
        return None;
    }
    let content_type = meta
        .trim_start_matches("data:")
        .trim_end_matches(";base64")
        .to_owned();
    let extension = image_extension_for_content_type(&content_type)?;
    if payload.len() > MAX_DOCX_IMAGE_BYTES.saturating_mul(4) / 3 + 4 {
        return None;
    }
    let bytes = general_purpose::STANDARD.decode(payload).ok()?;
    if bytes.len() > MAX_DOCX_IMAGE_BYTES || !image_bytes_match_content_type(&content_type, &bytes)
    {
        return None;
    }
    Some(DocxImage {
        extension,
        content_type,
        bytes,
    })
}

fn image_extension_for_content_type(content_type: &str) -> Option<String> {
    match content_type {
        "image/png" => Some("png".to_owned()),
        "image/jpeg" | "image/jpg" => Some("jpg".to_owned()),
        "image/gif" => Some("gif".to_owned()),
        _ => None,
    }
}

fn image_bytes_match_content_type(content_type: &str, bytes: &[u8]) -> bool {
    match content_type {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" | "image/jpg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        _ => false,
    }
}

fn image_run_xml(rel_id: &str, image_index: usize) -> String {
    let name = format!("合同图片{image_index}");
    let cx = 1_900_000;
    let cy = 1_250_000;
    format!(
        r#"<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="{image_index}" name="{name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="{image_index}" name="{name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="{rel_id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"#
    )
}

fn update_relationships_xml(xml: &str, relationships: &[DocxRelationship]) -> String {
    if relationships.is_empty() {
        return xml.to_owned();
    }
    let additions = relationships
        .iter()
        .map(|relationship| {
            format!(
                r#"<Relationship Id="{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="{}"/>"#,
                escape_xml_attr(&relationship.id),
                escape_xml_attr(&relationship.target)
            )
        })
        .collect::<String>();
    if let Some(index) = xml.rfind("</Relationships>") {
        let mut rendered = String::with_capacity(xml.len() + additions.len());
        rendered.push_str(&xml[..index]);
        rendered.push_str(&additions);
        rendered.push_str(&xml[index..]);
        rendered
    } else {
        format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{additions}</Relationships>"#
        )
    }
}

fn update_content_types_xml(xml: &str, media_files: &[DocxMediaFile]) -> String {
    let mut rendered = xml.to_owned();
    for media in media_files {
        let marker = format!(r#"Extension="{}""#, media.extension);
        if rendered.contains(&marker) {
            continue;
        }
        let addition = format!(
            r#"<Default Extension="{}" ContentType="{}"/>"#,
            escape_xml_attr(&media.extension),
            escape_xml_attr(&media.content_type)
        );
        if let Some(index) = rendered.rfind("</Types>") {
            rendered.insert_str(index, &addition);
        }
    }
    rendered
}

fn escape_xml_attr(value: &str) -> String {
    escape_xml_text(value)
}

fn apply_text_replacement(
    nodes: &[TextNode],
    replacements: &mut [String],
    start: usize,
    end: usize,
    value: &str,
) {
    let mut first_node_index = None;
    for (index, node) in nodes.iter().enumerate() {
        if node.text_end <= start || node.text_start >= end {
            continue;
        }
        if first_node_index.is_none() {
            first_node_index = Some(index);
        }
    }
    let Some(first_index) = first_node_index else {
        return;
    };

    for (index, node) in nodes.iter().enumerate() {
        if node.text_end <= start || node.text_start >= end {
            continue;
        }
        let segment_start = start.saturating_sub(node.text_start);
        let segment_end = if end < node.text_end {
            end - node.text_start
        } else {
            node.text.chars().count()
        };
        if index == first_index {
            replacements[index] =
                replace_char_range(&replacements[index], segment_start, segment_end, value);
        } else {
            replacements[index] =
                replace_char_range(&replacements[index], segment_start, segment_end, "");
        }
    }
}

fn replace_char_range(value: &str, start: usize, end: usize, replacement: &str) -> String {
    let mut result = String::new();
    for (index, ch) in value.chars().enumerate() {
        if index == start {
            result.push_str(replacement);
        }
        if index < start || index >= end {
            result.push(ch);
        }
    }
    if start >= value.chars().count() {
        result.push_str(replacement);
    }
    result
}

fn contract_variables(data: &Value) -> HashMap<String, String> {
    let entries = [
        ("project.name", json_path_text(data, &["project", "name"])),
        (
            "project.address",
            json_path_text(data, &["project", "address"]),
        ),
        (
            "project.contractor",
            json_path_text(data, &["project", "contractor"]),
        ),
        (
            "project.contract_number",
            json_path_text(data, &["project", "contract_number"]),
        ),
        (
            "project.party_a_seal",
            json_path_text(data, &["project", "party_a_seal"]),
        ),
        ("worker.name", json_path_text(data, &["worker", "name"])),
        (
            "worker.id_card",
            json_path_text(data, &["worker", "id_card"]),
        ),
        ("worker.phone", json_path_text(data, &["worker", "phone"])),
        (
            "worker.gender",
            gender_text(&json_path_text(data, &["worker", "gender"])),
        ),
        (
            "worker.address",
            json_path_text(data, &["worker", "address"]),
        ),
        (
            "worker.current_address",
            json_path_text(data, &["worker", "current_address"]),
        ),
        ("worker.avatar", json_path_text(data, &["worker", "avatar"])),
        (
            "worker.ocr_photo",
            json_path_text(data, &["worker", "ocr_photo"]),
        ),
        (
            "worker.id_card_back_file",
            json_path_text(data, &["worker", "id_card_back_file"]),
        ),
        (
            "worker.signature_photo",
            json_path_text(data, &["worker", "signature_photo"]),
        ),
        (
            "worker.entry_time",
            json_path_text(data, &["worker", "entry_time"]),
        ),
        (
            "unit.company_name",
            json_path_text(data, &["unit", "company_name"]),
        ),
        (
            "unit.manager_name",
            json_path_text(data, &["unit", "manager_name"]),
        ),
        (
            "unit.manager_phone",
            json_path_text(data, &["unit", "manager_phone"]),
        ),
        (
            "unit.company_address",
            json_path_text(data, &["unit", "company_address"]),
        ),
        (
            "unit.legal_person_name",
            json_path_text(data, &["unit", "legal_person_name"]),
        ),
        (
            "unit.legal_person_id_card",
            json_path_text(data, &["unit", "legal_person_id_card"]),
        ),
        (
            "unit.seal_photo",
            json_path_text(data, &["unit", "seal_photo"]),
        ),
        ("team.name", json_path_text(data, &["team", "name"])),
        (
            "team.leader_name",
            json_path_text(data, &["team", "leader_name"]),
        ),
    ];
    let mut variables = entries
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value))
        .collect::<HashMap<_, _>>();

    let aliases = [
        ("合同编号", "project.contract_number"),
        ("项目名称", "project.name"),
        ("项目所在地", "project.address"),
        ("劳务企业名称", "unit.company_name"),
        ("企业办公地址", "unit.company_address"),
        ("法定代表人", "unit.legal_person_name"),
        ("法人身份证号", "unit.legal_person_id_card"),
        ("主要负责人", "unit.manager_name"),
        ("主要负责人联系电话", "unit.manager_phone"),
        ("班组名称", "team.name"),
        ("工人姓名", "worker.name"),
        ("工人性别", "worker.gender"),
        ("工人身份证号", "worker.id_card"),
        ("工人联系电话", "worker.phone"),
        ("工人户籍住址", "worker.address"),
        ("工人现住址", "worker.current_address"),
        ("工种", "worker.work_type"),
        ("进场日期", "worker.entry_time"),
        ("工人身份证人像面", "worker.ocr_photo"),
        ("工人身份证国徽面", "worker.id_card_back_file"),
        ("工人签字", "worker.signature_photo"),
        ("甲方公章", "project.party_a_seal"),
        ("法定代表人章", "unit.seal_photo"),
        ("日期", "today"),
    ];
    variables.insert(
        "today".to_owned(),
        chrono::Local::now().format("%Y年%m月%d日").to_string(),
    );
    variables.insert(
        "worker.work_type".to_owned(),
        json_path_text(data, &["worker", "work_type"]),
    );

    for (alias, target) in aliases {
        if let Some(value) = variables.get(target).cloned() {
            variables.insert(alias.to_owned(), value);
        }
    }

    variables
}

fn gender_text(value: &str) -> String {
    match value {
        "1" => "男".to_owned(),
        "2" => "女".to_owned(),
        _ => value.to_owned(),
    }
}

fn contract_filename(template_name: &str, worker_id: Uuid, extension: &str) -> String {
    let stem = template_name
        .rsplit_once('.')
        .map(|(left, _)| left)
        .unwrap_or(template_name)
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_owned();
    let stem = if stem.is_empty() {
        "worker-contract"
    } else {
        &stem
    };
    format!("{stem}-{worker_id}.{extension}")
}

fn unescape_xml_text(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn escape_xml_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn json_path_text(data: &Value, path: &[&str]) -> String {
    let mut current = data;
    for segment in path {
        current = current.get(*segment).unwrap_or(&Value::Null);
    }
    match current {
        Value::Null => String::new(),
        Value::String(value) => value.clone(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        Value::Array(_) | Value::Object(_) => current.to_string(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ManagedAttendanceListParams {
    page: i64,
    page_size: i64,
    keyword: String,
    project_id: Option<Uuid>,
    worker_id: Option<Uuid>,
    config_id: Option<Uuid>,
    status: Option<String>,
    month: Option<chrono::NaiveDate>,
}

fn managed_attendance_list_params(uri: &Uri) -> Result<ManagedAttendanceListParams, ApiError> {
    let mut page = 1_i64;
    let mut page_size = 10_i64;
    let mut keyword = String::new();
    let mut project_id = None;
    let mut worker_id = None;
    let mut config_id = None;
    let mut status = None;
    let mut month = None;

    if let Some(query) = uri.query() {
        for pair in query.split('&') {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next().unwrap_or_default();
            let value = decode_query_value(parts.next().unwrap_or_default());
            let trimmed = value.trim();

            match key {
                "page" => page = trimmed.parse::<i64>().unwrap_or(1).max(1),
                "page_size" => page_size = trimmed.parse::<i64>().unwrap_or(10).clamp(1, 100),
                "keyword" | "q" => keyword = trimmed.to_owned(),
                "project_id" if !trimmed.is_empty() => {
                    project_id = Some(
                        Uuid::parse_str(trimmed)
                            .map_err(|_| invalid_column_value("project_id", "uuid"))?,
                    );
                }
                "worker_id" if !trimmed.is_empty() => {
                    worker_id = Some(
                        Uuid::parse_str(trimmed)
                            .map_err(|_| invalid_column_value("worker_id", "uuid"))?,
                    );
                }
                "config_id" if !trimmed.is_empty() => {
                    config_id = Some(
                        Uuid::parse_str(trimmed)
                            .map_err(|_| invalid_column_value("config_id", "uuid"))?,
                    );
                }
                "status" if !trimmed.is_empty() && trimmed != "all" => {
                    status = Some(trimmed.to_owned());
                }
                "month" if !trimmed.is_empty() => {
                    month = Some(parse_payroll_month(trimmed)?);
                }
                _ => {}
            }
        }
    }

    Ok(ManagedAttendanceListParams {
        page,
        page_size,
        keyword: keyword.trim().to_owned(),
        project_id,
        worker_id,
        config_id,
        status,
        month,
    })
}

async fn list_managed_photo_groups(
    pool: &sqlx::PgPool,
    params: &ManagedAttendanceListParams,
) -> ApiResult<Value> {
    let total = count_managed_photo_groups(pool, params).await?;
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT g.*, p.name AS project_name
            FROM construction_managed_attendance_photo_groups g
            LEFT JOIN construction_projects p ON p.id = g.project_id AND p.is_deleted = FALSE
            WHERE g.is_deleted = FALSE
        "#,
    );
    push_managed_photo_group_filters(&mut query, params);
    query
        .push(" ORDER BY g.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") r");
    let items = query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

async fn count_managed_photo_groups(
    pool: &sqlx::PgPool,
    params: &ManagedAttendanceListParams,
) -> Result<i64, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COUNT(*)::bigint
        FROM construction_managed_attendance_photo_groups g
        LEFT JOIN construction_projects p ON p.id = g.project_id AND p.is_deleted = FALSE
        WHERE g.is_deleted = FALSE
        "#,
    );
    push_managed_photo_group_filters(&mut query, params);
    query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

fn push_managed_photo_group_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    params: &ManagedAttendanceListParams,
) {
    if let Some(project_id) = params.project_id {
        query.push(" AND g.project_id = ").push_bind(project_id);
    }
    if let Some(status) = &params.status {
        query
            .push(" AND g.generation_status = ")
            .push_bind(status.clone());
    }
    if !params.keyword.is_empty() {
        let pattern = format!("%{}%", params.keyword);
        query
            .push(" AND (g.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR g.remark ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.name ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
}

async fn list_managed_configs(
    pool: &sqlx::PgPool,
    params: &ManagedAttendanceListParams,
) -> ApiResult<Value> {
    let total = count_managed_configs(pool, params).await?;
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                c.*,
                p.name AS project_name,
                w.name AS worker_name,
                w.id_card AS worker_id_card,
                t.name AS team_name,
                g.name AS photo_group_name,
                g.in_photos,
                g.out_photos,
                d.device_name AS attendance_device_name,
                d.serial_number AS attendance_device_sn,
                d.serial_number AS attendance_device_serial_number,
                d.device_type AS attendance_device_type,
                COALESCE(record_stats.record_count, 0) AS managed_record_count,
                record_stats.last_generated_at,
                record_stats.last_generated_month,
                record_stats.pending_count,
                record_stats.success_count,
                record_stats.failed_count
            FROM construction_managed_attendance_configs c
            JOIN construction_projects p ON p.id = c.project_id AND p.is_deleted = FALSE
            JOIN construction_workers w ON w.id = c.worker_id AND w.is_deleted = FALSE
            LEFT JOIN construction_teams t ON t.id = w.team_id AND t.is_deleted = FALSE
            LEFT JOIN construction_managed_attendance_photo_groups g
                ON g.id = c.photo_group_id AND g.is_deleted = FALSE
            LEFT JOIN construction_attendance_devices d
                ON d.id = c.attendance_device_id AND d.is_deleted = FALSE
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*)::bigint AS record_count,
                    MAX(r.generated_at) AS last_generated_at,
                    to_char(MAX(r.attendance_date), 'YYYY-MM') AS last_generated_month,
                    COUNT(*) FILTER (WHERE r.dispatch_status = 'pending')::bigint AS pending_count,
                    COUNT(*) FILTER (WHERE r.dispatch_status = 'success')::bigint AS success_count,
                    COUNT(*) FILTER (WHERE r.dispatch_status = 'failed')::bigint AS failed_count
                FROM construction_managed_attendance_records r
                WHERE r.config_id = c.id AND r.is_deleted = FALSE
            ) record_stats ON TRUE
            WHERE c.is_deleted = FALSE
        "#,
    );
    push_managed_config_filters(&mut query, params);
    query
        .push(" ORDER BY c.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") r");
    let items = query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

async fn count_managed_configs(
    pool: &sqlx::PgPool,
    params: &ManagedAttendanceListParams,
) -> Result<i64, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COUNT(*)::bigint
        FROM construction_managed_attendance_configs c
        JOIN construction_projects p ON p.id = c.project_id AND p.is_deleted = FALSE
        JOIN construction_workers w ON w.id = c.worker_id AND w.is_deleted = FALSE
        LEFT JOIN construction_managed_attendance_photo_groups g
            ON g.id = c.photo_group_id AND g.is_deleted = FALSE
        LEFT JOIN construction_attendance_devices d
            ON d.id = c.attendance_device_id AND d.is_deleted = FALSE
        WHERE c.is_deleted = FALSE
        "#,
    );
    push_managed_config_filters(&mut query, params);
    query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

fn push_managed_config_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    params: &ManagedAttendanceListParams,
) {
    if let Some(project_id) = params.project_id {
        query.push(" AND c.project_id = ").push_bind(project_id);
    }
    if let Some(worker_id) = params.worker_id {
        query.push(" AND c.worker_id = ").push_bind(worker_id);
    }
    if let Some(status) = &params.status {
        if status == "enabled" {
            query.push(" AND c.is_enabled = TRUE");
        } else if status == "disabled" {
            query.push(" AND c.is_enabled = FALSE");
        }
    }
    if !params.keyword.is_empty() {
        let pattern = format!("%{}%", params.keyword);
        query
            .push(" AND (w.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR w.id_card ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR c.remark ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR g.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.name ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
}

async fn fetch_managed_attendance_config(
    pool: &sqlx::PgPool,
    config_id: Uuid,
) -> Result<Value, ApiError> {
    sqlx::query_scalar::<_, Value>(
        r#"
        SELECT to_jsonb(r)
        FROM (
            SELECT
                c.*,
                p.name AS project_name,
                w.name AS worker_name,
                w.id_card AS worker_id_card,
                g.name AS photo_group_name,
                d.device_name AS attendance_device_name,
                d.serial_number AS attendance_device_sn,
                d.serial_number AS attendance_device_serial_number,
                d.device_type AS attendance_device_type
            FROM construction_managed_attendance_configs c
            JOIN construction_projects p ON p.id = c.project_id AND p.is_deleted = FALSE
            JOIN construction_workers w ON w.id = c.worker_id AND w.is_deleted = FALSE
            LEFT JOIN construction_managed_attendance_photo_groups g
                ON g.id = c.photo_group_id AND g.is_deleted = FALSE
            LEFT JOIN construction_attendance_devices d
                ON d.id = c.attendance_device_id AND d.is_deleted = FALSE
            WHERE c.id = $1 AND c.is_deleted = FALSE
        ) r
        "#,
    )
    .bind(config_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)
}

async fn validate_managed_attendance_config_body(
    pool: &sqlx::PgPool,
    body: &Value,
) -> Result<(), ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| invalid_input("Request body must be a JSON object"))?;
    let project_id = required_uuid_from_object(object, "project_id")?;
    let worker_id = required_uuid_from_object(object, "worker_id")?;
    let photo_group_id = object
        .get("photo_group_id")
        .map(|value| value_to_optional_uuid("photo_group_id", value))
        .transpose()?
        .flatten();
    let attendance_device_id = object
        .get("attendance_device_id")
        .map(|value| value_to_optional_uuid("attendance_device_id", value))
        .transpose()?
        .flatten();

    validate_managed_config_values(object)?;
    ensure_worker_in_project(pool, project_id, worker_id).await?;
    ensure_vendor_b_device_in_project(pool, project_id).await?;
    if let Some(photo_group_id) = photo_group_id {
        ensure_photo_group_in_project(pool, project_id, photo_group_id).await?;
    }
    if let Some(attendance_device_id) = attendance_device_id {
        ensure_attendance_device_in_project(pool, project_id, attendance_device_id).await?;
    }

    Ok(())
}

async fn validate_managed_attendance_config_patch(
    pool: &sqlx::PgPool,
    config_id: Uuid,
    body: &Value,
) -> Result<(), ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| invalid_input("Request body must be a JSON object"))?;
    if object.is_empty() {
        return Err(invalid_input("No writable fields provided"));
    }
    validate_managed_config_values(object)?;

    let existing = sqlx::query(
        r#"
        SELECT project_id, worker_id, photo_group_id, attendance_device_id
        FROM construction_managed_attendance_configs
        WHERE id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(config_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)?;
    let project_id = object
        .get("project_id")
        .map(|value| value_to_optional_uuid("project_id", value))
        .transpose()?
        .flatten()
        .unwrap_or_else(|| existing.get("project_id"));
    let worker_id = object
        .get("worker_id")
        .map(|value| value_to_optional_uuid("worker_id", value))
        .transpose()?
        .flatten()
        .unwrap_or_else(|| existing.get("worker_id"));
    let existing_project_id: Uuid = existing.get("project_id");
    let existing_worker_id: Uuid = existing.get("worker_id");
    if project_id != existing_project_id {
        return Err(invalid_input("托管配置创建后不能更换所属项目"));
    }
    if worker_id != existing_worker_id {
        return Err(invalid_input("托管配置创建后不能更换托管人员"));
    }
    let photo_group_id = if object.contains_key("photo_group_id") {
        object
            .get("photo_group_id")
            .map(|value| value_to_optional_uuid("photo_group_id", value))
            .transpose()?
            .flatten()
    } else {
        existing.try_get("photo_group_id").ok()
    };
    let attendance_device_id = if object.contains_key("attendance_device_id") {
        object
            .get("attendance_device_id")
            .map(|value| value_to_optional_uuid("attendance_device_id", value))
            .transpose()?
            .flatten()
    } else {
        existing.try_get("attendance_device_id").ok()
    };

    ensure_worker_in_project(pool, project_id, worker_id).await?;
    if let Some(photo_group_id) = photo_group_id {
        ensure_photo_group_in_project(pool, project_id, photo_group_id).await?;
    }
    if let Some(attendance_device_id) = attendance_device_id {
        ensure_attendance_device_in_project(pool, project_id, attendance_device_id).await?;
    }

    Ok(())
}

fn validate_managed_config_values(object: &serde_json::Map<String, Value>) -> Result<(), ApiError> {
    if let Some(value) = object.get("monthly_attendance_days") {
        let days = value_to_optional_i64("monthly_attendance_days", value)?
            .ok_or_else(|| invalid_column_value("monthly_attendance_days", "1-31"))?;
        if !(1..=31).contains(&days) {
            return Err(invalid_column_value("monthly_attendance_days", "1-31"));
        }
    }
    if let Some(shift) = object.get("shift").and_then(Value::as_str) {
        if !matches!(shift, "day" | "night") {
            return Err(invalid_column_value("shift", "day or night"));
        }
    }
    if let Some(value) = object.get("check_in_time").and_then(Value::as_str) {
        parse_managed_time("check_in_time", value)?;
    }
    if let Some(value) = object.get("check_in_end_time").and_then(Value::as_str) {
        parse_managed_time("check_in_end_time", value)?;
    }
    if let Some(value) = object.get("check_out_time").and_then(Value::as_str) {
        parse_managed_time("check_out_time", value)?;
    }
    if let Some(value) = object.get("check_out_end_time").and_then(Value::as_str) {
        parse_managed_time("check_out_end_time", value)?;
    }
    validate_managed_time_range(object, "check_in_time", "check_in_end_time", "进场")?;
    validate_managed_time_range(object, "check_out_time", "check_out_end_time", "出场")?;

    Ok(())
}

async fn ensure_worker_in_project(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    worker_id: Uuid,
) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM construction_workers
            WHERE id = $1 AND project_id = $2 AND is_deleted = FALSE
        )
        "#,
    )
    .bind(worker_id)
    .bind(project_id)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    if exists {
        Ok(())
    } else {
        Err(invalid_input("托管工人不属于所选项目"))
    }
}

async fn ensure_vendor_b_device_in_project(
    pool: &sqlx::PgPool,
    project_id: Uuid,
) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM construction_attendance_devices
            WHERE project_id = $1
              AND is_deleted = FALSE
              AND device_type IN ('B厂家', '弹厂家')
              AND NULLIF(BTRIM(serial_number), '') IS NOT NULL
        )
        "#,
    )
    .bind(project_id)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    if exists {
        Ok(())
    } else {
        Err(invalid_input(
            "该项目未配置弹厂家考勤机，当前自动托管暂不支持海厂家（原A厂家）设备",
        ))
    }
}

async fn ensure_photo_group_in_project(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    photo_group_id: Uuid,
) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM construction_managed_attendance_photo_groups
            WHERE id = $1 AND project_id = $2 AND is_deleted = FALSE
        )
        "#,
    )
    .bind(photo_group_id)
    .bind(project_id)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    if exists {
        Ok(())
    } else {
        Err(invalid_input("托管照片组不属于所选项目"))
    }
}

async fn ensure_attendance_device_in_project(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    attendance_device_id: Uuid,
) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM construction_attendance_devices
            WHERE id = $1 AND project_id = $2 AND is_deleted = FALSE
        )
        "#,
    )
    .bind(attendance_device_id)
    .bind(project_id)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    if exists {
        Ok(())
    } else {
        Err(invalid_input("目标考勤设备不存在、已删除或不属于所选项目"))
    }
}

pub(crate) async fn generate_managed_records_for_month(
    pool: &sqlx::PgPool,
    config_id: Uuid,
    month: chrono::NaiveDate,
) -> Result<Value, ApiError> {
    let row = sqlx::query(
        r#"
        SELECT
            c.id,
            c.project_id,
            c.worker_id,
            c.photo_group_id,
            c.monthly_attendance_days,
            c.shift,
            c.check_in_time,
            c.check_in_end_time,
            c.check_out_time,
            c.check_out_end_time,
            c.is_enabled,
            w.name AS worker_name,
            w.id_card AS worker_id_card,
            g.in_photos,
            g.out_photos
        FROM construction_managed_attendance_configs c
        JOIN construction_workers w ON w.id = c.worker_id AND w.is_deleted = FALSE
        LEFT JOIN construction_managed_attendance_photo_groups g
            ON g.id = c.photo_group_id AND g.is_deleted = FALSE
        WHERE c.id = $1 AND c.is_deleted = FALSE
        "#,
    )
    .bind(config_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)?;

    let is_enabled: bool = row.get("is_enabled");
    if !is_enabled {
        return Err(invalid_input("托管配置已停用"));
    }

    let project_id: Uuid = row.get("project_id");
    let worker_id: Uuid = row.get("worker_id");
    let photo_group_id: Option<Uuid> = row.try_get("photo_group_id").ok();
    let monthly_attendance_days: i16 = row.get("monthly_attendance_days");
    let shift: String = row.get("shift");
    let check_in_time: String = row.get("check_in_time");
    let check_in_end_time: String = row.get("check_in_end_time");
    let check_out_time: String = row.get("check_out_time");
    let check_out_end_time: String = row.get("check_out_end_time");
    let worker_name: Option<String> = row.try_get("worker_name").ok();
    let worker_id_card: Option<String> = row.try_get("worker_id_card").ok();
    let in_photos: Option<Value> = row.try_get("in_photos").ok();
    let out_photos: Option<Value> = row.try_get("out_photos").ok();
    let worker_id_card_mask = worker_id_card.as_deref().map(mask_id_card);
    let in_time = parse_managed_time("check_in_time", &check_in_time)?;
    let in_end_time = parse_managed_time("check_in_end_time", &check_in_end_time)?;
    let out_time = parse_managed_time("check_out_time", &check_out_time)?;
    let out_end_time = parse_managed_time("check_out_end_time", &check_out_end_time)?;
    let attendance_days = selected_month_days(month, monthly_attendance_days, config_id)?;
    let next_month =
        next_month_start(month).ok_or_else(|| invalid_column_value("month", "YYYY-MM"))?;

    let mut generated_count = 0_i64;
    let mut tx = pool.begin().await.map_err(db_error)?;
    sqlx::query(
        r#"
        UPDATE device_dispatch_jobs j
        SET status = 'skipped',
            last_error = '托管考勤记录已在重新生成时取消',
            locked_by = NULL,
            locked_until = NULL,
            updated_at = NOW()
        FROM construction_managed_attendance_records r
        WHERE j.managed_attendance_record_id = r.id
          AND j.job_type = 'supplemental_attendance'
          AND j.status = 'pending'
          AND r.config_id = $1 AND r.is_deleted = FALSE
          AND r.attendance_date >= $2 AND r.attendance_date < $3
          AND NOT (r.attendance_date = ANY($4))
        "#,
    )
    .bind(config_id)
    .bind(month)
    .bind(next_month)
    .bind(&attendance_days)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    sqlx::query(
        r#"
        UPDATE construction_managed_attendance_records
        SET is_deleted = TRUE,
            deleted_at = NOW(),
            dispatch_status = 'skipped',
            dispatch_message = '托管考勤记录已在重新生成时取消',
            updated_at = NOW()
        WHERE config_id = $1 AND is_deleted = FALSE
          AND attendance_date >= $2 AND attendance_date < $3
          AND NOT (attendance_date = ANY($4))
          AND NOT EXISTS (
              SELECT 1
              FROM device_dispatch_jobs j
              WHERE j.managed_attendance_record_id = construction_managed_attendance_records.id
                AND j.job_type = 'supplemental_attendance'
                AND (
                    j.status = 'processing'
                    OR j.device_result_status IN ('accepted', 'success')
                )
          )
        "#,
    )
    .bind(config_id)
    .bind(month)
    .bind(next_month)
    .bind(&attendance_days)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    let photo_pairs =
        deterministic_photo_pairs(in_photos.as_ref(), out_photos.as_ref(), config_id, month);
    for (day_index, attendance_date) in attendance_days.iter().enumerate() {
        for direction in [0_i16, 1_i16] {
            let (range_start, range_end) = if direction == 0 {
                (in_time, in_end_time)
            } else {
                (out_time, out_end_time)
            };
            let planned_at = managed_planned_at(
                *attendance_date,
                range_start,
                range_end,
                &shift,
                direction,
                config_id,
            )?;
            let photo_url = photo_pairs
                .get(day_index % photo_pairs.len().max(1))
                .map(|pair| {
                    if direction == 0 {
                        pair.0.clone()
                    } else {
                        pair.1.clone()
                    }
                });

            let existing_dispatch_states = sqlx::query_as::<_, (String, String)>(
                r#"
                SELECT j.status, j.device_result_status
                FROM construction_managed_attendance_records r
                JOIN device_dispatch_jobs j
                  ON j.managed_attendance_record_id = r.id
                 AND j.job_type = 'supplemental_attendance'
                WHERE r.config_id = $1
                  AND r.attendance_date = $2
                  AND r.direction = $3
                  AND r.is_deleted = FALSE
                FOR UPDATE OF r, j
                "#,
            )
            .bind(config_id)
            .bind(*attendance_date)
            .bind(direction)
            .fetch_all(&mut *tx)
            .await
            .map_err(db_error)?;
            if existing_dispatch_states
                .iter()
                .any(|(status, result_status)| {
                    status == "processing"
                        || matches!(result_status.as_str(), "accepted" | "success")
                })
            {
                generated_count += 1;
                continue;
            }

            let managed_attendance_record_id = sqlx::query_scalar::<_, Uuid>(
                r#"
                INSERT INTO construction_managed_attendance_records (
                    config_id,
                    project_id,
                    worker_id,
                    photo_group_id,
                    worker_name,
                    worker_id_card_mask,
                    attendance_date,
                    direction,
                    shift,
                    planned_at,
                    photo_url,
                    status,
                    error_message,
                    generated_at,
                    is_deleted,
                    deleted_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'generated', NULL, NOW(), FALSE, NULL)
                ON CONFLICT (config_id, attendance_date, direction)
                    WHERE is_deleted = FALSE
                DO UPDATE SET
                    project_id = EXCLUDED.project_id,
                    worker_id = EXCLUDED.worker_id,
                    photo_group_id = EXCLUDED.photo_group_id,
                    worker_name = EXCLUDED.worker_name,
                    worker_id_card_mask = EXCLUDED.worker_id_card_mask,
                    shift = EXCLUDED.shift,
                    planned_at = EXCLUDED.planned_at,
                    photo_url = EXCLUDED.photo_url,
                    status = 'generated',
                    error_message = NULL,
                    generated_at = NOW(),
                    updated_at = NOW()
                RETURNING id
                "#,
            )
            .bind(config_id)
            .bind(project_id)
            .bind(worker_id)
            .bind(photo_group_id)
            .bind(worker_name.clone())
            .bind(worker_id_card_mask.clone())
            .bind(*attendance_date)
            .bind(direction)
            .bind(shift.clone())
            .bind(planned_at)
            .bind(photo_url.clone())
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;

            let targets = sqlx::query_as::<_, (Uuid, String, Option<String>)>(
                r#"
                SELECT id, device_type, serial_number
                FROM construction_attendance_devices
                WHERE project_id = $1
                  AND is_deleted = FALSE
                  AND device_type IN ('B厂家', '弹厂家')
                  AND direction = CASE
                      WHEN EXISTS (
                          SELECT 1 FROM construction_attendance_devices exact
                          WHERE exact.project_id = $1 AND exact.is_deleted = FALSE
                            AND exact.device_type IN ('B厂家', '弹厂家')
                            AND exact.direction = $2
                      ) THEN $2
                      ELSE 2
                  END
                ORDER BY device_name NULLS LAST, created_at, id
                "#,
            )
            .bind(project_id)
            .bind(direction)
            .fetch_all(&mut *tx)
            .await
            .map_err(db_error)?;
            let target_ids = targets.iter().map(|(id, _, _)| *id).collect::<Vec<_>>();
            sqlx::query(
                r#"
                UPDATE device_dispatch_jobs
                SET status = 'skipped',
                    last_error = '设备方向不再匹配当前考勤记录',
                    locked_by = NULL,
                    locked_until = NULL,
                    updated_at = NOW()
                WHERE managed_attendance_record_id = $1
                  AND job_type = 'supplemental_attendance'
                  AND status = 'pending'
                  AND NOT (attendance_device_id = ANY($2))
                "#,
            )
            .bind(managed_attendance_record_id)
            .bind(&target_ids)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
            if targets.is_empty() {
                synchronize_managed_dispatch_job(
                    &mut tx,
                    managed_attendance_record_id,
                    project_id,
                    worker_id,
                    worker_name.as_deref().unwrap_or_default(),
                    direction,
                    planned_at,
                    photo_url.as_deref(),
                    None,
                    None,
                    None,
                )
                .await?;
            } else {
                for (device_id, device_type, serial_number) in targets {
                    synchronize_managed_dispatch_job(
                        &mut tx,
                        managed_attendance_record_id,
                        project_id,
                        worker_id,
                        worker_name.as_deref().unwrap_or_default(),
                        direction,
                        planned_at,
                        photo_url.as_deref(),
                        Some(device_id),
                        Some(device_type.as_str()),
                        serial_number.as_deref(),
                    )
                    .await?;
                }
            }
            generated_count += 1;
        }
    }
    tx.commit().await.map_err(db_error)?;

    Ok(serde_json::json!({
        "config_id": config_id,
        "month": month.format("%Y-%m").to_string(),
        "attendance_days": attendance_days.len(),
        "generated_count": generated_count,
    }))
}

#[allow(clippy::too_many_arguments)]
async fn synchronize_managed_dispatch_job(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    managed_attendance_record_id: Uuid,
    project_id: Uuid,
    worker_id: Uuid,
    worker_name: &str,
    direction: i16,
    planned_at: chrono::DateTime<chrono::Utc>,
    photo_url: Option<&str>,
    target_device_id: Option<Uuid>,
    target_device_type: Option<&str>,
    target_device_serial_number: Option<&str>,
) -> Result<(), ApiError> {
    let Some(attendance_device_id) = target_device_id else {
        sqlx::query(
            r#"
            UPDATE device_dispatch_jobs
            SET status = 'skipped',
                last_error = '项目未配置匹配方向的考勤设备',
                locked_by = NULL,
                locked_until = NULL,
                updated_at = NOW()
            WHERE managed_attendance_record_id = $1
              AND job_type = 'supplemental_attendance'
              AND status IN ('pending', 'processing')
            "#,
        )
        .bind(managed_attendance_record_id)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
        sqlx::query(
            r#"
            UPDATE construction_managed_attendance_records
            SET dispatch_status = 'skipped',
                dispatched_at = NULL,
                dispatch_message = '项目未配置匹配方向的考勤设备，未创建下发任务',
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(managed_attendance_record_id)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
        return Ok(());
    };

    let device_type = target_device_type.unwrap_or("unknown");
    let supported = matches!(device_type, "B厂家" | "弹厂家");
    let has_photo = photo_url.is_some_and(|value| !value.trim().is_empty());
    let dispatchable = supported && has_photo;
    let adapter_code = if supported {
        "vendor_b".to_owned()
    } else {
        unsupported_adapter_code(device_type)
    };
    let transport = if supported {
        "http_push"
    } else {
        "unsupported"
    };
    let planned_time_expired = dispatchable && planned_at <= chrono::Utc::now();
    let initial_platform_status = if planned_time_expired {
        "skipped"
    } else if dispatchable {
        "pending"
    } else {
        "failed"
    };
    let initial_device_status = if dispatchable { "pending" } else { "failed" };
    let unsupported_message = if planned_time_expired {
        Some("生成记录时计划执行时间已过，自动跳过；如需发送请使用手动补发".to_owned())
    } else if !supported {
        Some(format!("暂不支持设备类型“{device_type}”的补录考勤下发"))
    } else if !has_photo {
        Some("托管考勤未配置照片，无法调用弹厂家考勤照片接口".to_owned())
    } else {
        None
    };
    let device_sn = target_device_serial_number
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| attendance_device_id.to_string());
    let message_id =
        format!("supplemental-attendance:{managed_attendance_record_id}:{attendance_device_id}");
    let payload = serde_json::json!({
        "schemaVersion": 1,
        "managedAttendanceRecordId": managed_attendance_record_id,
        "projectId": project_id,
        "workerId": worker_id,
        "workerName": worker_name,
        "direction": if direction == 0 { "in" } else { "out" },
        "plannedAt": planned_at,
        "photoUrl": photo_url,
    });

    let (platform_status, device_result_status, device_reported_at, result_message) =
        sqlx::query_as::<
            _,
            (
                String,
                String,
                Option<chrono::DateTime<chrono::Utc>>,
                Option<String>,
            ),
        >(
            r#"
            INSERT INTO device_dispatch_jobs (
                project_id,
                worker_id,
                attendance_device_id,
                device_sn,
                action,
                mqtt_topic,
                message_id,
                payload,
                status,
                next_attempt_at,
                last_error,
                job_type,
                adapter_code,
                transport,
                managed_attendance_record_id,
                device_result_status,
                device_result_message
            )
            VALUES (
                $1, $2, $3, $4, 'supplemental_attendance', NULL, $5, $6,
                $7, $13, $8, 'supplemental_attendance', $9, $10, $11, $12, $8
            )
            ON CONFLICT (managed_attendance_record_id, attendance_device_id)
                WHERE managed_attendance_record_id IS NOT NULL AND attendance_device_id IS NOT NULL
            DO UPDATE SET
                project_id = EXCLUDED.project_id,
                worker_id = EXCLUDED.worker_id,
                device_sn = EXCLUDED.device_sn,
                payload = CASE
                    WHEN device_dispatch_jobs.status = 'processing'
                      OR device_dispatch_jobs.device_result_status IN ('accepted', 'success')
                        THEN device_dispatch_jobs.payload
                    ELSE EXCLUDED.payload
                END,
                adapter_code = EXCLUDED.adapter_code,
                transport = EXCLUDED.transport,
                status = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.status
                    ELSE EXCLUDED.status
                END,
                next_attempt_at = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.next_attempt_at
                    ELSE EXCLUDED.next_attempt_at
                END,
                last_error = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.last_error
                    ELSE EXCLUDED.last_error
                END,
                locked_by = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.locked_by
                    ELSE NULL
                END,
                locked_until = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.locked_until
                    ELSE NULL
                END,
                device_result_status = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.device_result_status
                    ELSE EXCLUDED.device_result_status
                END,
                device_result_message = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.device_result_message
                    ELSE EXCLUDED.device_result_message
                END,
                device_reported_at = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.device_reported_at
                    ELSE NULL
                END,
                attempt_count = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.attempt_count
                    ELSE 0
                END,
                sent_at = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.sent_at
                    ELSE NULL
                END,
                ack_at = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.ack_at
                    ELSE NULL
                END,
                ack_code = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.ack_code
                    ELSE NULL
                END,
                ack_payload = CASE
                    WHEN device_dispatch_jobs.device_result_status = 'success'
                      OR (device_dispatch_jobs.device_result_status = 'accepted' AND device_dispatch_jobs.status = 'delivered')
                      OR device_dispatch_jobs.status = 'processing'
                        THEN device_dispatch_jobs.ack_payload
                    ELSE NULL
                END,
                updated_at = NOW()
            RETURNING status, device_result_status, device_reported_at,
                      COALESCE(device_result_message, last_error)
            "#,
        )
        .bind(project_id)
        .bind(worker_id)
        .bind(attendance_device_id)
        .bind(device_sn)
        .bind(message_id)
        .bind(payload)
        .bind(initial_platform_status)
        .bind(unsupported_message.as_deref())
        .bind(adapter_code)
        .bind(transport)
        .bind(managed_attendance_record_id)
        .bind(initial_device_status)
        .bind(planned_at)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;

    let compatibility_status = match (platform_status.as_str(), device_result_status.as_str()) {
        (_, "success") => "success",
        (_, "failed") | ("failed", _) => "failed",
        ("processing" | "delivered", _) => "processing",
        ("skipped", _) => "skipped",
        _ => "pending",
    };
    sqlx::query(
        r#"
        UPDATE construction_managed_attendance_records
        SET dispatch_status = $2,
            dispatched_at = CASE WHEN $2 IN ('success', 'failed') THEN COALESCE($3, NOW()) ELSE NULL END,
            dispatch_message = $4,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(managed_attendance_record_id)
    .bind(compatibility_status)
    .bind(device_reported_at)
    .bind(result_message)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    Ok(())
}

fn unsupported_adapter_code(device_type: &str) -> String {
    let normalized = device_type
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>();
    let normalized = normalized.trim_matches('_').replace("__", "_");
    if normalized.is_empty() {
        "unsupported_unknown".to_owned()
    } else {
        format!("unsupported_{normalized}")
    }
}

async fn list_managed_records(
    pool: &sqlx::PgPool,
    params: &ManagedAttendanceListParams,
) -> ApiResult<Value> {
    let total = count_managed_records(pool, params).await?;
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.planned_at ASC, r.direction ASC), '[]'::jsonb)
        FROM (
            SELECT
                r.*,
                p.name AS project_name,
                g.name AS photo_group_name
            FROM construction_managed_attendance_records r
            JOIN construction_projects p ON p.id = r.project_id AND p.is_deleted = FALSE
            LEFT JOIN construction_managed_attendance_photo_groups g
                ON g.id = r.photo_group_id AND g.is_deleted = FALSE
            WHERE r.is_deleted = FALSE
        "#,
    );
    push_managed_record_filters(&mut query, params);
    query
        .push(" ORDER BY r.planned_at ASC, r.direction ASC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") r");
    let items = query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

async fn count_managed_records(
    pool: &sqlx::PgPool,
    params: &ManagedAttendanceListParams,
) -> Result<i64, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COUNT(*)::bigint
        FROM construction_managed_attendance_records r
        JOIN construction_projects p ON p.id = r.project_id AND p.is_deleted = FALSE
        LEFT JOIN construction_managed_attendance_photo_groups g
            ON g.id = r.photo_group_id AND g.is_deleted = FALSE
        WHERE r.is_deleted = FALSE
        "#,
    );
    push_managed_record_filters(&mut query, params);
    query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

fn push_managed_record_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    params: &ManagedAttendanceListParams,
) {
    if let Some(project_id) = params.project_id {
        query.push(" AND r.project_id = ").push_bind(project_id);
    }
    if let Some(worker_id) = params.worker_id {
        query.push(" AND r.worker_id = ").push_bind(worker_id);
    }
    if let Some(config_id) = params.config_id {
        query.push(" AND r.config_id = ").push_bind(config_id);
    }
    if let Some(status) = &params.status {
        query
            .push(" AND (r.status = ")
            .push_bind(status.clone())
            .push(" OR r.dispatch_status = ")
            .push_bind(status.clone())
            .push(")");
    }
    if let Some(month) = params.month {
        let next_month = next_month_start(month).unwrap_or(month);
        query
            .push(" AND r.attendance_date >= ")
            .push_bind(month)
            .push(" AND r.attendance_date < ")
            .push_bind(next_month);
    }
    if !params.keyword.is_empty() {
        let pattern = format!("%{}%", params.keyword);
        query
            .push(" AND (r.worker_name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR r.worker_id_card_mask ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR g.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.name ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
}

fn selected_month_days(
    month: chrono::NaiveDate,
    monthly_attendance_days: i16,
    config_id: Uuid,
) -> Result<Vec<chrono::NaiveDate>, ApiError> {
    let next_month =
        next_month_start(month).ok_or_else(|| invalid_column_value("month", "YYYY-MM"))?;
    let days_in_month = (next_month - chrono::Duration::days(1)).day();
    let target_days = u32::try_from(monthly_attendance_days)
        .map_err(|_| invalid_column_value("monthly_attendance_days", "1-31"))?
        .min(days_in_month);
    let mut days = (1..=days_in_month)
        .filter_map(|day| chrono::NaiveDate::from_ymd_opt(month.year(), month.month(), day))
        .collect::<Vec<_>>();
    let mut seed = [0_u8; 32];
    seed[..16].copy_from_slice(config_id.as_bytes());
    seed[16..20].copy_from_slice(&month.year().to_le_bytes());
    seed[20..24].copy_from_slice(&month.month().to_le_bytes());
    let mut rng = StdRng::from_seed(seed);
    days.shuffle(&mut rng);
    days.truncate(target_days as usize);
    days.sort_unstable();
    Ok(days)
}

fn next_month_start(month: chrono::NaiveDate) -> Option<chrono::NaiveDate> {
    if month.month() == 12 {
        chrono::NaiveDate::from_ymd_opt(month.year() + 1, 1, 1)
    } else {
        chrono::NaiveDate::from_ymd_opt(month.year(), month.month() + 1, 1)
    }
}

fn managed_planned_at(
    attendance_date: chrono::NaiveDate,
    range_start: chrono::NaiveTime,
    range_end: chrono::NaiveTime,
    shift: &str,
    direction: i16,
    config_id: Uuid,
) -> Result<chrono::DateTime<chrono::Utc>, ApiError> {
    let mut date = attendance_date;
    if range_end < range_start {
        return Err(invalid_input("考勤随机时间区间结束时间不能早于开始时间"));
    }
    if direction == 1
        && shift == "night"
        && range_start < chrono::NaiveTime::from_hms_opt(12, 0, 0).unwrap()
    {
        date = attendance_date
            .succ_opt()
            .ok_or_else(|| invalid_column_value("attendance_date", "valid date"))?;
    }
    let start_seconds = range_start.num_seconds_from_midnight();
    let end_seconds = range_end.num_seconds_from_midnight();
    let mut seed = [0_u8; 32];
    seed[..16].copy_from_slice(config_id.as_bytes());
    seed[16..20].copy_from_slice(&attendance_date.year().to_le_bytes());
    seed[20..24].copy_from_slice(&attendance_date.month().to_le_bytes());
    seed[24..28].copy_from_slice(&attendance_date.day().to_le_bytes());
    seed[28..30].copy_from_slice(&direction.to_le_bytes());
    let mut rng = StdRng::from_seed(seed);
    let random_seconds = rng.gen_range(start_seconds..=end_seconds);
    let time = chrono::NaiveTime::from_num_seconds_from_midnight_opt(random_seconds, 0)
        .ok_or_else(|| invalid_column_value("planned_at", "valid time range"))?;
    let local = date.and_time(time);
    let offset = chrono::FixedOffset::east_opt(8 * 3600)
        .ok_or_else(|| invalid_column_value("timezone", "UTC+8"))?;
    let planned_at = offset
        .from_local_datetime(&local)
        .single()
        .ok_or_else(|| invalid_column_value("planned_at", "valid local time"))?;
    Ok(planned_at.with_timezone(&chrono::Utc))
}

fn validate_managed_time_range(
    object: &serde_json::Map<String, Value>,
    start_column: &str,
    end_column: &str,
    label: &str,
) -> Result<(), ApiError> {
    let (Some(start), Some(end)) = (
        object.get(start_column).and_then(Value::as_str),
        object.get(end_column).and_then(Value::as_str),
    ) else {
        return Ok(());
    };
    if parse_managed_time(start_column, start)? > parse_managed_time(end_column, end)? {
        return Err(invalid_input(format!("{label}结束时间不能早于开始时间")));
    }
    Ok(())
}

fn parse_managed_time(column: &str, value: &str) -> Result<chrono::NaiveTime, ApiError> {
    chrono::NaiveTime::parse_from_str(value.trim(), "%H:%M")
        .or_else(|_| chrono::NaiveTime::parse_from_str(value.trim(), "%H:%M:%S"))
        .map_err(|_| invalid_column_value(column, "HH:mm"))
}

fn deterministic_photo_pairs(
    in_value: Option<&Value>,
    out_value: Option<&Value>,
    config_id: Uuid,
    month: chrono::NaiveDate,
) -> Vec<(String, String)> {
    let strings = |value: Option<&Value>| {
        value
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|url| !url.is_empty())
            .map(str::to_owned)
            .collect::<Vec<_>>()
    };
    let mut pairs = strings(in_value)
        .into_iter()
        .zip(strings(out_value))
        .collect::<Vec<_>>();
    let mut seed = [0_u8; 32];
    seed[..16].copy_from_slice(config_id.as_bytes());
    seed[16..20].copy_from_slice(&month.year().to_le_bytes());
    seed[20..24].copy_from_slice(&month.month().to_le_bytes());
    pairs.shuffle(&mut StdRng::from_seed(seed));
    pairs
}

fn mask_id_card(value: &str) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    if chars.len() <= 8 {
        return value.to_owned();
    }
    let prefix = chars.iter().take(3).collect::<String>();
    let suffix = chars
        .iter()
        .skip(chars.len().saturating_sub(4))
        .collect::<String>();
    format!("{prefix}***********{suffix}")
}

fn required_uuid_from_object(
    object: &serde_json::Map<String, Value>,
    column: &str,
) -> Result<Uuid, ApiError> {
    object
        .get(column)
        .ok_or_else(|| invalid_column_value(column, "UUID"))
        .and_then(|value| value_to_optional_uuid(column, value))?
        .ok_or_else(|| invalid_column_value(column, "UUID"))
}

async fn count_personnel_workers(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    params: &ResourceListParams,
) -> Result<i64, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT COUNT(*)::bigint FROM construction_workers w JOIN construction_projects p ON p.id = w.project_id AND p.is_deleted = FALSE WHERE w.is_deleted = FALSE",
    );
    push_accessible_project_scope(&mut query, auth_user, "w.project_id");
    push_personnel_worker_filters(&mut query, params);

    query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

fn push_accessible_project_scope(
    query: &mut QueryBuilder<'_, Postgres>,
    auth_user: &AuthUser,
    project_id_expression: &'static str,
) {
    if auth_user.roles.contains(&Role::Admin) {
        return;
    }

    query
        .push(" AND EXISTS (SELECT 1 FROM user_managed_projects ump WHERE ump.user_id = ")
        .push_bind(auth_user.user_id)
        .push(" AND ump.project_id = ")
        .push(project_id_expression)
        .push(")");
}

async fn ensure_body_project_access(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    body: &Value,
) -> Result<Uuid, ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| invalid_input("Request body must be a JSON object"))?;
    let project_id = required_uuid_from_object(object, "project_id")?;
    ensure_project_access(pool, auth_user, project_id).await?;
    Ok(project_id)
}

async fn ensure_optional_body_project_access(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    body: &Value,
) -> Result<(), ApiError> {
    let Some(object) = body.as_object() else {
        return Err(invalid_input("Request body must be a JSON object"));
    };
    if object.contains_key("project_id") {
        let project_id = required_uuid_from_object(object, "project_id")?;
        ensure_project_access(pool, auth_user, project_id).await?;
    }
    Ok(())
}

async fn ensure_row_project_access(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    table: &'static str,
    id: Uuid,
) -> Result<Uuid, ApiError> {
    let table = match table {
        "construction_platform_configs" => "construction_platform_configs",
        "construction_platform_logs" => "construction_platform_logs",
        _ => return Err(not_found()),
    };
    let mut query = QueryBuilder::<Postgres>::new("SELECT project_id FROM ");
    query
        .push(table)
        .push(" WHERE id = ")
        .push_bind(id)
        .push(" AND is_deleted = FALSE");
    let project_id = query
        .build_query_scalar::<Uuid>()
        .fetch_optional(pool)
        .await
        .map_err(db_error)?
        .ok_or_else(not_found)?;
    ensure_project_access(pool, auth_user, project_id).await?;
    Ok(project_id)
}

async fn ensure_project_access(
    pool: &sqlx::PgPool,
    auth_user: &AuthUser,
    project_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = if auth_user.roles.contains(&Role::Admin) {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM construction_projects WHERE id = $1 AND is_deleted = FALSE)",
        )
        .bind(project_id)
        .fetch_one(pool)
        .await
        .map_err(db_error)?
    } else {
        sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM construction_projects p
                JOIN user_managed_projects ump ON ump.project_id = p.id
                WHERE p.id = $1 AND p.is_deleted = FALSE AND ump.user_id = $2
            )
            "#,
        )
        .bind(project_id)
        .bind(auth_user.user_id)
        .fetch_one(pool)
        .await
        .map_err(db_error)?
    };

    if allowed {
        Ok(())
    } else {
        Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_message("No access to this project"))
    }
}

async fn attendance_device_issue_report_project_id(
    pool: &sqlx::PgPool,
    report_id: Uuid,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT project_id FROM construction_attendance_device_issue_reports WHERE id = $1 AND is_deleted = FALSE",
    )
    .bind(report_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(not_found)
}

fn push_personnel_worker_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    params: &ResourceListParams,
) {
    if let Some(project_id) = params.project_id {
        query.push(" AND w.project_id = ").push_bind(project_id);
    }
    if !params.keyword.is_empty() {
        let pattern = format!("%{}%", params.keyword);
        query
            .push(" AND (w.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR w.id_card ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR w.phone ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR p.name ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
    if let Some(unit_id) = params.unit_id {
        query.push(" AND w.unit_id = ").push_bind(unit_id);
    }
    if let Some(team_id) = params.team_id {
        query.push(" AND w.team_id = ").push_bind(team_id);
    }
    if let Some(work_type) = params.work_type {
        query.push(" AND w.work_type = ").push_bind(work_type);
    }
    if let Some(work_status) = params.work_status {
        query.push(" AND w.work_status = ").push_bind(work_status);
    }
    match &params.auth_status {
        Some(AuthStatusFilter::Exact(auth_status)) => {
            query.push(" AND w.auth_status = ").push_bind(*auth_status);
        }
        Some(AuthStatusFilter::Unverified) => {
            query.push(" AND COALESCE(w.auth_status, 1) <> 2");
        }
        None => {}
    }
}

async fn list_rows_page(
    pool: &sqlx::PgPool,
    table: &'static str,
    where_uuid_columns: &[(&'static str, Uuid)],
    scoped_uuid_columns: &[(&'static str, Uuid)],
    params: &ResourceListParams,
) -> ApiResult<Value> {
    let total = count_rows(pool, table, where_uuid_columns, scoped_uuid_columns, params).await?;
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb) FROM (SELECT * FROM ",
    );
    query.push(table).push(" r WHERE r.is_deleted = FALSE");
    push_uuid_filters(&mut query, where_uuid_columns);
    push_uuid_filters(&mut query, scoped_uuid_columns);
    push_resource_filters(&mut query, table, params);
    query
        .push(" ORDER BY r.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") r");

    let items = query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

async fn list_unit_rows_page(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    params: &ResourceListParams,
) -> ApiResult<Value> {
    let where_uuid_columns = [("project_id", project_id)];
    let total = count_rows(pool, "construction_units", &where_uuid_columns, &[], params).await?;
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                r.*,
                COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'platform_name', config.platform_name,
                            'platform_type', config.platform_type,
                            'is_enabled', config.is_enabled,
                            'status', CASE
                                WHEN latest_job.id IS NULL THEN 'not_reported'
                                WHEN latest_job.status IN ('success', 'completed') THEN 'success'
                                WHEN latest_job.status IN ('pending', 'processing', 'retry', 'awaiting_result', 'waiting_dependency', 'waiting_media') THEN 'pending'
                                ELSE 'failed'
                            END,
                            'failure_reason', CASE
                                WHEN latest_job.id IS NOT NULL
                                     AND latest_job.status NOT IN ('success', 'completed', 'pending', 'processing', 'retry', 'awaiting_result', 'waiting_dependency', 'waiting_media')
                                    THEN COALESCE(
                                        NULLIF(latest_job.last_error, ''),
                                        latest_job.response_payload ->> 'message',
                                        latest_job.response_payload ->> 'msg',
                                        '上报未完成，请检查平台日志'
                                    )
                                ELSE NULL
                            END,
                            'reported_at', latest_job.updated_at
                        )
                        ORDER BY config.created_at, config.platform_name
                    )
                    FROM construction_platform_configs config
                    LEFT JOIN LATERAL (
                        SELECT
                            job.id,
                            job.status,
                            job.last_error,
                            job.response_payload,
                            job.updated_at
                        FROM integration_jobs job
                        LEFT JOIN integration_project_bindings binding
                          ON binding.id = job.binding_id
                        WHERE job.project_id = r.project_id
                          AND job.entity_type IN ('unit', 'construction_unit')
                          AND job.local_entity_id = r.id
                          AND job.operation = 'unit.sync'
                          AND platform_job_matches_config(job.binding_id, job.platform_code, binding.platform_config_id, config.id, config.project_id, config.platform_type)
                        ORDER BY job.updated_at DESC, job.id DESC
                        LIMIT 1
                    ) latest_job ON TRUE
                    WHERE config.project_id = r.project_id
                      AND config.is_deleted = FALSE
                      AND config.is_enabled = TRUE
                      AND config.platform_type IN ('yongxin_v2', 'xinleda')
                ), '[]'::jsonb) AS reporting_platforms
            FROM construction_units r
            WHERE r.is_deleted = FALSE
        "#,
    );
    push_uuid_filters(&mut query, &where_uuid_columns);
    push_resource_filters(&mut query, "construction_units", params);
    query
        .push(" ORDER BY r.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") row_data");

    let items = query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;
    let reporting_summary = unit_reporting_summary(pool, project_id).await?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "reporting_summary": reporting_summary,
    })))
}

async fn unit_reporting_summary(pool: &sqlx::PgPool, project_id: Uuid) -> Result<Value, ApiError> {
    sqlx::query_scalar::<_, Value>(
        r#"
        WITH unit_platform_statuses AS (
            SELECT
                config.id AS platform_config_id,
                config.platform_name,
                config.platform_type,
                config.created_at AS platform_created_at,
                unit.id AS unit_id,
                CASE
                    WHEN unit.id IS NULL OR latest_job.id IS NULL THEN 'not_reported'
                    WHEN latest_job.status IN ('success', 'completed') THEN 'success'
                    WHEN latest_job.status IN ('pending', 'processing', 'retry', 'awaiting_result', 'waiting_dependency', 'waiting_media') THEN 'pending'
                    ELSE 'failed'
                END AS reporting_status
            FROM construction_platform_configs config
            LEFT JOIN construction_units unit
              ON unit.project_id = config.project_id
             AND unit.is_deleted = FALSE
            LEFT JOIN LATERAL (
                SELECT job.id, job.status
                FROM integration_jobs job
                LEFT JOIN integration_project_bindings binding
                  ON binding.id = job.binding_id
                WHERE job.project_id = config.project_id
                  AND job.entity_type IN ('unit', 'construction_unit')
                  AND job.local_entity_id = unit.id
                  AND job.operation = 'unit.sync'
                  AND platform_job_matches_config(job.binding_id, job.platform_code, binding.platform_config_id, config.id, config.project_id, config.platform_type)
                ORDER BY job.updated_at DESC, job.id DESC
                LIMIT 1
            ) latest_job ON TRUE
            WHERE config.project_id = $1
              AND config.is_deleted = FALSE
              AND config.is_enabled = TRUE
              AND config.platform_type IN ('yongxin_v2', 'xinleda')
        ), platform_summary AS (
            SELECT
                platform_config_id,
                platform_name,
                platform_type,
                platform_created_at,
                COUNT(*) FILTER (WHERE unit_id IS NOT NULL)::int AS total_count,
                COUNT(*) FILTER (WHERE unit_id IS NOT NULL AND reporting_status = 'success')::int AS success_count,
                COUNT(*) FILTER (WHERE unit_id IS NOT NULL AND reporting_status = 'failed')::int AS failure_count,
                COUNT(*) FILTER (WHERE unit_id IS NOT NULL AND reporting_status = 'pending')::int AS pending_count,
                COUNT(*) FILTER (WHERE unit_id IS NOT NULL AND reporting_status = 'not_reported')::int AS not_reported_count
            FROM unit_platform_statuses
            GROUP BY platform_config_id, platform_name, platform_type, platform_created_at
        )
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'platform_name', platform_name,
                    'platform_type', platform_type,
                    'total_count', total_count,
                    'success_count', success_count,
                    'failure_count', failure_count,
                    'pending_count', pending_count,
                    'not_reported_count', not_reported_count,
                    'ignored_count', 0
                )
                ORDER BY platform_created_at, platform_name
            ),
            '[]'::jsonb
        )
        FROM platform_summary
        "#,
    )
    .bind(project_id)
    .fetch_one(pool)
    .await
    .map_err(db_error)
}

async fn list_team_rows_page(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    scoped_uuid_columns: &[(&'static str, Uuid)],
    params: &ResourceListParams,
) -> ApiResult<Value> {
    let where_uuid_columns = [("project_id", project_id)];
    let total = count_rows(
        pool,
        "construction_teams",
        &where_uuid_columns,
        scoped_uuid_columns,
        params,
    )
    .await?;
    let offset = (params.page - 1) * params.page_size;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                r.*,
                COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'platform_name', config.platform_name,
                            'platform_type', config.platform_type,
                            'is_enabled', config.is_enabled,
                            'status', CASE
                                WHEN latest_job.id IS NULL THEN 'not_reported'
                                WHEN latest_job.status IN ('success', 'completed') THEN 'success'
                                WHEN latest_job.status IN ('pending', 'processing', 'retry', 'awaiting_result', 'waiting_dependency', 'waiting_media') THEN 'pending'
                                ELSE 'failed'
                            END,
                            'failure_reason', CASE
                                WHEN latest_job.id IS NOT NULL
                                     AND latest_job.status NOT IN ('success', 'completed', 'pending', 'processing', 'retry', 'awaiting_result', 'waiting_dependency', 'waiting_media')
                                    THEN COALESCE(
                                        NULLIF(latest_job.last_error, ''),
                                        latest_job.response_payload ->> 'message',
                                        latest_job.response_payload ->> 'msg',
                                        '上报未完成，请修正上报'
                                    )
                                ELSE NULL
                            END,
                            'reported_at', latest_job.updated_at
                        )
                        ORDER BY config.created_at, config.platform_name
                    )
                    FROM construction_platform_configs config
                    LEFT JOIN LATERAL (
                        SELECT
                            job.id,
                            job.status,
                            job.last_error,
                            job.response_payload,
                            job.updated_at
                        FROM integration_jobs job
                        LEFT JOIN integration_project_bindings binding
                          ON binding.id = job.binding_id
                        WHERE job.project_id = r.project_id
                          AND job.entity_type IN ('team', 'construction_team')
                          AND job.local_entity_id = r.id
                          AND platform_job_matches_config(job.binding_id, job.platform_code, binding.platform_config_id, config.id, config.project_id, config.platform_type)
                        ORDER BY job.created_at DESC, job.id DESC
                        LIMIT 1
                    ) latest_job ON TRUE
                    WHERE config.project_id = r.project_id
                      AND config.is_deleted = FALSE
                      AND config.is_enabled = TRUE
                ), '[]'::jsonb) AS reporting_platforms
            FROM construction_teams r
            WHERE r.is_deleted = FALSE
        "#,
    );
    push_uuid_filters(&mut query, &where_uuid_columns);
    push_uuid_filters(&mut query, scoped_uuid_columns);
    push_resource_filters(&mut query, "construction_teams", params);
    query
        .push(" ORDER BY r.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") row_data");

    let items = query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;
    let reporting_summary = team_reporting_summary(pool, project_id).await?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "reporting_summary": reporting_summary,
    })))
}

async fn team_reporting_summary(pool: &sqlx::PgPool, project_id: Uuid) -> Result<Value, ApiError> {
    sqlx::query_scalar::<_, Value>(
        r#"
        WITH team_platform_statuses AS (
            SELECT
                config.id AS platform_config_id,
                config.platform_name,
                config.platform_type,
                config.created_at AS platform_created_at,
                team.id AS team_id,
                CASE
                    WHEN team.id IS NULL OR latest_job.id IS NULL THEN 'not_reported'
                    WHEN latest_job.status IN ('success', 'completed') THEN 'success'
                    WHEN latest_job.status IN ('pending', 'processing', 'retry', 'awaiting_result', 'waiting_dependency', 'waiting_media') THEN 'pending'
                    ELSE 'failed'
                END AS reporting_status
            FROM construction_platform_configs config
            LEFT JOIN construction_teams team
                ON team.project_id = config.project_id
               AND team.is_deleted = FALSE
            LEFT JOIN LATERAL (
                SELECT job.id, job.status
                FROM integration_jobs job
                LEFT JOIN integration_project_bindings binding
                  ON binding.id = job.binding_id
                WHERE job.project_id = config.project_id
                  AND job.entity_type IN ('team', 'construction_team')
                  AND job.local_entity_id = team.id
                  AND platform_job_matches_config(job.binding_id, job.platform_code, binding.platform_config_id, config.id, config.project_id, config.platform_type)
                ORDER BY job.created_at DESC, job.id DESC
                LIMIT 1
            ) latest_job ON TRUE
            WHERE config.project_id = $1
              AND config.is_deleted = FALSE
              AND config.is_enabled = TRUE
        ), platform_summary AS (
            SELECT
                platform_config_id,
                platform_name,
                platform_type,
                platform_created_at,
                COUNT(*) FILTER (WHERE team_id IS NOT NULL AND reporting_status <> 'ignored')::int AS total_count,
                COUNT(*) FILTER (WHERE team_id IS NOT NULL AND reporting_status = 'success')::int AS success_count,
                COUNT(*) FILTER (WHERE team_id IS NOT NULL AND reporting_status = 'failed')::int AS failure_count,
                COUNT(*) FILTER (WHERE team_id IS NOT NULL AND reporting_status = 'pending')::int AS pending_count,
                COUNT(*) FILTER (WHERE team_id IS NOT NULL AND reporting_status = 'not_reported')::int AS not_reported_count,
                COUNT(*) FILTER (WHERE team_id IS NOT NULL AND reporting_status = 'ignored')::int AS ignored_count
            FROM team_platform_statuses
            GROUP BY platform_config_id, platform_name, platform_type, platform_created_at
        )
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'platform_name', platform_name,
                    'platform_type', platform_type,
                    'total_count', total_count,
                    'success_count', success_count,
                    'failure_count', failure_count,
                    'pending_count', pending_count,
                    'not_reported_count', not_reported_count,
                    'ignored_count', ignored_count
                )
                ORDER BY platform_created_at, platform_name
            ),
            '[]'::jsonb
        )
        FROM platform_summary
        "#,
    )
    .bind(project_id)
    .fetch_one(pool)
    .await
    .map_err(db_error)
}

async fn count_rows(
    pool: &sqlx::PgPool,
    table: &'static str,
    where_uuid_columns: &[(&'static str, Uuid)],
    scoped_uuid_columns: &[(&'static str, Uuid)],
    params: &ResourceListParams,
) -> Result<i64, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new("SELECT COUNT(*)::bigint FROM ");
    query.push(table).push(" r WHERE r.is_deleted = FALSE");
    push_uuid_filters(&mut query, where_uuid_columns);
    push_uuid_filters(&mut query, scoped_uuid_columns);
    push_resource_filters(&mut query, table, params);

    query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

fn push_uuid_filters(query: &mut QueryBuilder<'_, Postgres>, columns: &[(&'static str, Uuid)]) {
    for (column, value) in columns {
        query
            .push(" AND r.")
            .push(*column)
            .push(" = ")
            .push_bind(*value);
    }
}

fn push_resource_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    table: &'static str,
    params: &ResourceListParams,
) {
    match table {
        "construction_units" => {
            if !params.keyword.is_empty() {
                let pattern = format!("%{}%", params.keyword);
                query
                    .push(" AND (r.company_name ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.company_credit_code ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.manager_name ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.manager_phone ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.legal_person_name ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.company_phone ILIKE ")
                    .push_bind(pattern)
                    .push(")");
            }
            if let Some(company_type) = params.company_type {
                query.push(" AND r.company_type = ").push_bind(company_type);
            }
            if let Some(salary_calc_type) = params.salary_calc_type {
                query
                    .push(" AND r.salary_calc_type = ")
                    .push_bind(salary_calc_type);
            }
        }
        "construction_teams" => {
            if !params.keyword.is_empty() {
                let pattern = format!("%{}%", params.keyword);
                query
                    .push(" AND (r.name ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.leader_name ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.leader_phone ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.leader_id_card ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.team_no ILIKE ")
                    .push_bind(pattern)
                    .push(")");
            }
            if let Some(work_type) = params.work_type {
                query.push(" AND r.work_type = ").push_bind(work_type);
            }
            if let Some(settlement_type) = params.settlement_type {
                query
                    .push(" AND r.settlement_type = ")
                    .push_bind(settlement_type);
            }
            if let Some(configured) = params.attendance_configured {
                if configured {
                    query.push(" AND COALESCE(NULLIF(r.attendance_start_time, ''), NULL) IS NOT NULL AND COALESCE(NULLIF(r.attendance_end_time, ''), NULL) IS NOT NULL");
                } else {
                    query.push(" AND (COALESCE(NULLIF(r.attendance_start_time, ''), NULL) IS NULL OR COALESCE(NULLIF(r.attendance_end_time, ''), NULL) IS NULL)");
                }
            }
        }
        "construction_workers" => {
            if !params.keyword.is_empty() {
                let pattern = format!("%{}%", params.keyword);
                query
                    .push(" AND (r.name ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.id_card ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.phone ILIKE ")
                    .push_bind(pattern)
                    .push(")");
            }
            if let Some(work_type) = params.work_type {
                query.push(" AND r.work_type = ").push_bind(work_type);
            }
            if let Some(work_status) = params.work_status {
                query.push(" AND r.work_status = ").push_bind(work_status);
            }
            match &params.auth_status {
                Some(AuthStatusFilter::Exact(auth_status)) => {
                    query.push(" AND r.auth_status = ").push_bind(*auth_status);
                }
                Some(AuthStatusFilter::Unverified) => {
                    query.push(" AND COALESCE(r.auth_status, 1) <> 2");
                }
                None => {}
            }
        }
        "construction_attendance_records" => {
            if !params.keyword.is_empty() {
                let pattern = format!("%{}%", params.keyword);
                query
                    .push(" AND (r.equipment_id ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.serial_number ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR EXISTS (SELECT 1 FROM construction_workers w LEFT JOIN construction_teams t ON t.id = w.team_id WHERE w.id = r.worker_id AND (w.name ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR w.id_card ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR w.phone ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR t.name ILIKE ")
                    .push_bind(pattern)
                    .push(")))");
            }
            if let Some(worker_id) = params.worker_id {
                query.push(" AND r.worker_id = ").push_bind(worker_id);
            }
            if let Some(team_id) = params.team_id {
                query
                    .push(" AND EXISTS (SELECT 1 FROM construction_workers w WHERE w.id = r.worker_id AND w.team_id = ")
                    .push_bind(team_id)
                    .push(")");
            }
            if let Some(direction) = params.direction {
                query.push(" AND r.direction = ").push_bind(direction);
            }
            if let Some(attendance_date) = params.attendance_date {
                query
                    .push(" AND (r.trigger_time AT TIME ZONE 'Asia/Shanghai')::date = ")
                    .push_bind(attendance_date);
            }
        }
        "construction_attendance_devices" => {
            if !params.keyword.is_empty() {
                let pattern = format!("%{}%", params.keyword);
                query
                    .push(" AND (r.device_type ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.serial_number ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.device_name ILIKE ")
                    .push_bind(pattern.clone())
                    .push(" OR r.remark ILIKE ")
                    .push_bind(pattern)
                    .push(")");
            }
            if let Some(direction) = params.direction {
                query.push(" AND r.direction = ").push_bind(direction);
            }
        }
        _ => {}
    }
}

async fn get_row(
    pool: &sqlx::PgPool,
    table: &'static str,
    where_uuid_columns: &[(&'static str, Uuid)],
) -> ApiResult<Value> {
    let mut query = QueryBuilder::<Postgres>::new("SELECT to_jsonb(r) FROM ");
    query.push(table).push(" r WHERE r.is_deleted = FALSE");
    for (column, value) in where_uuid_columns {
        query
            .push(" AND r.")
            .push(*column)
            .push(" = ")
            .push_bind(*value);
    }

    let row = query
        .build_query_scalar::<Value>()
        .fetch_optional(pool)
        .await
        .map_err(db_error)?
        .ok_or_else(not_found)?;

    Ok(ApiSuccess::default().with_data(row))
}

async fn create_row(
    pool: &sqlx::PgPool,
    table: &'static str,
    allowed_columns: &'static [ColumnSpec],
    body: &Value,
    fixed_uuid_columns: &[(&'static str, Uuid)],
    status: StatusCode,
) -> ApiResult<Value> {
    let fields = extract_fields(body, allowed_columns)?;
    if fields.is_empty() && fixed_uuid_columns.is_empty() {
        return Err(invalid_input("No writable fields provided"));
    }

    let mut query = QueryBuilder::<Postgres>::new("INSERT INTO ");
    query.push(table).push(" (");
    {
        let mut separated = query.separated(", ");
        for (column, _) in fixed_uuid_columns {
            separated.push(*column);
        }
        for (column, _) in &fields {
            separated.push(column.name);
        }
    }
    query.push(") VALUES (");
    let mut value_index = 0;
    for (_, value) in fixed_uuid_columns {
        if value_index > 0 {
            query.push(", ");
        }
        query.push_bind(*value);
        value_index += 1;
    }
    for (column, value) in &fields {
        if value_index > 0 {
            query.push(", ");
        }
        push_typed_bind_query(&mut query, *column, value)?;
        value_index += 1;
    }
    query.push(") RETURNING to_jsonb(").push(table).push(")");

    let row = query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_code(status).with_data(row))
}

async fn update_row(
    pool: &sqlx::PgPool,
    table: &'static str,
    allowed_columns: &'static [ColumnSpec],
    body: &Value,
    where_uuid_columns: &[(&'static str, Uuid)],
) -> ApiResult<Value> {
    let fields = extract_fields(body, allowed_columns)?;
    if fields.is_empty() {
        return Err(invalid_input("No writable fields provided"));
    }

    let mut query = QueryBuilder::<Postgres>::new("UPDATE ");
    query.push(table).push(" SET ");
    for (index, (column, value)) in fields.iter().enumerate() {
        if index > 0 {
            query.push(", ");
        }
        query.push(column.name).push(" = ");
        push_typed_bind_query(&mut query, *column, value)?;
    }
    query.push(" WHERE ");
    for (index, (column, value)) in where_uuid_columns.iter().enumerate() {
        if index > 0 {
            query.push(" AND ");
        }
        query.push(*column).push(" = ").push_bind(*value);
    }
    query.push(" RETURNING to_jsonb(").push(table).push(")");

    let row = query
        .build_query_scalar::<Value>()
        .fetch_optional(pool)
        .await
        .map_err(db_error)?
        .ok_or_else(not_found)?;

    Ok(ApiSuccess::default().with_data(row))
}

fn normalize_worker_body(body: Value, default_entry_time: bool) -> Result<Value, ApiError> {
    let mut object = body
        .as_object()
        .cloned()
        .ok_or_else(|| invalid_input("Request body must be a JSON object"))?;

    if default_entry_time || object.contains_key("phone") {
        validate_worker_phone(&object)?;
    }
    validate_worker_work_type(&object, default_entry_time)?;
    if default_entry_time {
        validate_worker_create_body(&object)?;
    }

    object.insert("auth_status".to_owned(), Value::Number(2.into()));
    object.insert("auth_fail_reason".to_owned(), Value::Null);

    if default_entry_time && is_blank_json_value(object.get("native_place")) {
        // 新录入人员未填写籍贯时统一保存浙江宁波行政区划码，供各上报平台使用。
        object.insert("native_place".to_owned(), Value::Number(330200.into()));
    }

    if default_entry_time && is_blank_json_value(object.get("entry_time")) {
        object.insert(
            "entry_time".to_owned(),
            Value::String(chrono::Local::now().format("%Y-%m-%d").to_string()),
        );
    }

    Ok(Value::Object(object))
}

async fn check_worker_phone_id_card_unique(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    exclude_worker_id: Option<Uuid>,
    body: &Value,
) -> Result<(), ApiError> {
    let phone = body
        .get("phone")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let id_card = body
        .get("id_card")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty());

    if let Some(phone) = phone {
        let mut query = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM construction_workers WHERE project_id = $1 AND phone = $2 AND is_deleted = FALSE",
        )
        .bind(project_id)
        .bind(phone);
        if let Some(wid) = exclude_worker_id {
            query = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM construction_workers WHERE project_id = $1 AND phone = $2 AND is_deleted = FALSE AND id != $3",
            )
            .bind(project_id)
            .bind(phone)
            .bind(wid);
        }
        let count = query.fetch_one(pool).await.map_err(db_error)?;
        if count > 0 {
            return Err(invalid_input("该手机号在当前项目中已存在，不允许重复录入"));
        }
    }

    if let Some(id_card) = id_card {
        let mut query = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM construction_workers WHERE project_id = $1 AND id_card = $2 AND is_deleted = FALSE",
        )
        .bind(project_id)
        .bind(id_card);
        if let Some(wid) = exclude_worker_id {
            query = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM construction_workers WHERE project_id = $1 AND id_card = $2 AND is_deleted = FALSE AND id != $3",
            )
            .bind(project_id)
            .bind(id_card)
            .bind(wid);
        }
        let count = query.fetch_one(pool).await.map_err(db_error)?;
        if count > 0 {
            return Err(invalid_input(
                "该身份证号在当前项目中已存在，不允许重复录入",
            ));
        }
    }

    Ok(())
}

fn validate_worker_phone(object: &serde_json::Map<String, Value>) -> Result<(), ApiError> {
    if is_blank_json_value(object.get("phone")) {
        return Err(invalid_input("请填写手机号"));
    }
    Ok(())
}

fn validate_worker_work_type(
    object: &serde_json::Map<String, Value>,
    required: bool,
) -> Result<(), ApiError> {
    if is_blank_json_value(object.get("work_type")) {
        return if required {
            Err(invalid_input("请选择工种"))
        } else {
            Ok(())
        };
    }
    let work_type = object
        .get("work_type")
        .map(|value| value_to_optional_i64("work_type", value))
        .transpose()?
        .flatten()
        .ok_or_else(|| invalid_input("请选择工种"))?;
    if !is_official_ningbo_worker_work_type(work_type) {
        return Err(invalid_input("工种不在市住建工人工种字典中"));
    }
    Ok(())
}

fn is_official_ningbo_worker_work_type(value: i64) -> bool {
    matches!(value, 1..=11 | 13..=38 | 900 | 1001)
}

fn validate_worker_create_body(object: &serde_json::Map<String, Value>) -> Result<(), ApiError> {
    let worker_type = object
        .get("worker_type")
        .map(|value| value_to_optional_i64("worker_type", value))
        .transpose()?
        .flatten();

    if worker_type == Some(1001) && is_blank_json_value(object.get("manager_type")) {
        return Err(invalid_input("请选择人员类型"));
    }

    Ok(())
}

fn is_blank_json_value(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => true,
        Some(Value::String(value)) => value.trim().is_empty(),
        Some(_) => false,
    }
}

async fn delete_row(
    pool: &sqlx::PgPool,
    table: &'static str,
    where_uuid_columns: &[(&'static str, Uuid)],
) -> ApiResult<()> {
    let mut query = QueryBuilder::<Postgres>::new("DELETE FROM ");
    query.push(table).push(" WHERE ");
    for (index, (column, value)) in where_uuid_columns.iter().enumerate() {
        if index > 0 {
            query.push(" AND ");
        }
        query.push(*column).push(" = ").push_bind(*value);
    }

    let result = query.build().execute(pool).await.map_err(db_error)?;
    if result.rows_affected() == 0 {
        return Err(not_found());
    }

    Ok(ApiSuccess::default().with_data(()))
}

fn extract_fields<'a>(
    body: &'a Value,
    allowed_columns: &'static [ColumnSpec],
) -> Result<Vec<(ColumnSpec, &'a Value)>, ApiError> {
    let object = body
        .as_object()
        .ok_or_else(|| invalid_input("Request body must be a JSON object"))?;

    let mut fields = Vec::new();
    for column in allowed_columns {
        if let Some(value) = object.get(column.name) {
            fields.push((*column, value));
        }
    }

    Ok(fields)
}

fn push_typed_bind_query(
    query: &mut QueryBuilder<'_, Postgres>,
    column: ColumnSpec,
    value: &Value,
) -> Result<(), ApiError> {
    match column.kind {
        ColumnKind::Text => {
            query.push_bind(value_to_optional_text(value));
        }
        ColumnKind::Uuid => {
            query.push_bind(value_to_optional_uuid(column.name, value)?);
        }
        ColumnKind::Integer => {
            query.push_bind(value_to_optional_i32(column.name, value)?);
        }
        ColumnKind::SmallInt => {
            query.push_bind(value_to_optional_i16(column.name, value)?);
        }
        ColumnKind::BigInt => {
            query.push_bind(value_to_optional_i64(column.name, value)?);
        }
        ColumnKind::Money => match value_to_optional_money(column.name, value)? {
            Some(value) => {
                query.push_bind(value).push("::numeric(16,2)");
            }
            None => {
                query.push("NULL::numeric(16,2)");
            }
        },
        ColumnKind::Boolean => {
            query.push_bind(value_to_optional_bool(column.name, value)?);
        }
        ColumnKind::Date => {
            query.push_bind(value_to_optional_date(column.name, value)?);
        }
        ColumnKind::Timestamp => {
            query.push_bind(value_to_optional_timestamp(column.name, value)?);
        }
        ColumnKind::Json => {
            query.push_bind(value_to_optional_json(value));
        }
    }
    Ok(())
}

fn value_to_optional_text(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(value) => Some(value.clone()),
        Value::Bool(value) => Some(value.to_string()),
        Value::Number(value) => Some(value.to_string()),
        Value::Array(_) | Value::Object(_) => Some(value.to_string()),
    }
}

fn value_to_optional_uuid(column: &str, value: &Value) -> Result<Option<Uuid>, ApiError> {
    match value {
        Value::Null => Ok(None),
        Value::String(value) if value.trim().is_empty() => Ok(None),
        Value::String(value) => Uuid::parse_str(value)
            .map(Some)
            .map_err(|_| invalid_column_value(column, "UUID")),
        _ => Err(invalid_column_value(column, "UUID")),
    }
}

fn value_to_optional_i16(column: &str, value: &Value) -> Result<Option<i16>, ApiError> {
    value_to_optional_i64(column, value)?
        .map(|value| i16::try_from(value).map_err(|_| invalid_column_value(column, "smallint")))
        .transpose()
}

fn value_to_optional_i32(column: &str, value: &Value) -> Result<Option<i32>, ApiError> {
    value_to_optional_i64(column, value)?
        .map(|value| i32::try_from(value).map_err(|_| invalid_column_value(column, "integer")))
        .transpose()
}

fn value_to_optional_i64(column: &str, value: &Value) -> Result<Option<i64>, ApiError> {
    match value {
        Value::Null => Ok(None),
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                Ok(Some(value))
            } else if let Some(value) = value.as_u64() {
                i64::try_from(value)
                    .map(Some)
                    .map_err(|_| invalid_column_value(column, "bigint"))
            } else if let Some(value) = value.as_f64() {
                if value.fract() == 0.0 && value >= i64::MIN as f64 && value <= i64::MAX as f64 {
                    Ok(Some(value as i64))
                } else {
                    Err(invalid_column_value(column, "integer number"))
                }
            } else {
                Err(invalid_column_value(column, "number"))
            }
        }
        Value::String(value) if value.trim().is_empty() => Ok(None),
        Value::String(value) => value
            .trim()
            .parse::<i64>()
            .map(Some)
            .map_err(|_| invalid_column_value(column, "integer number")),
        _ => Err(invalid_column_value(column, "integer number")),
    }
}

fn value_to_optional_money(column: &str, value: &Value) -> Result<Option<String>, ApiError> {
    match value {
        Value::Null => Ok(None),
        Value::String(value) if value.trim().is_empty() => Ok(None),
        Value::String(value) => parse_money_amount(column, value.trim()).map(Some),
        Value::Number(value) => parse_money_amount(column, &value.to_string()).map(Some),
        _ => Err(invalid_column_value(column, "amount")),
    }
}

fn parse_money_amount(column: &str, value: &str) -> Result<String, ApiError> {
    let normalized = value
        .replace([',', '，', '￥', '¥'], "")
        .replace([' ', '\t', '\n', '\r'], "")
        .replace('元', "")
        .trim()
        .to_owned();
    if normalized.is_empty() {
        return Ok("0.00".to_owned());
    }

    let (sign, number) = normalized
        .strip_prefix('-')
        .map(|value| ("-", value))
        .unwrap_or(("", normalized.as_str()));
    let mut parts = number.split('.');
    let yuan = parts.next().unwrap_or_default();
    let cents = parts.next().unwrap_or_default();
    if parts.next().is_some()
        || yuan.is_empty()
        || !yuan.chars().all(|ch| ch.is_ascii_digit())
        || cents.len() > 2
        || !cents.chars().all(|ch| ch.is_ascii_digit())
    {
        return Err(invalid_column_value(column, "amount"));
    }

    Ok(format!("{sign}{yuan}.{}", format!("{cents:0<2}")))
}

#[cfg(test)]
fn value_to_required_cents(column: &str, value: &Value) -> Result<i64, ApiError> {
    value_to_optional_cents(column, value)?.ok_or_else(|| invalid_column_value(column, "amount"))
}

fn value_to_optional_cents(column: &str, value: &Value) -> Result<Option<i64>, ApiError> {
    match value {
        Value::Null => Ok(None),
        Value::String(value) if value.trim().is_empty() => Ok(None),
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                Ok(Some(value * 100))
            } else if let Some(value) = value.as_u64() {
                i64::try_from(value)
                    .map(|value| Some(value * 100))
                    .map_err(|_| invalid_column_value(column, "amount"))
            } else if let Some(value) = value.as_f64() {
                parse_yuan_to_cents(column, &format!("{value:.2}")).map(Some)
            } else {
                Err(invalid_column_value(column, "amount"))
            }
        }
        Value::String(value) => parse_yuan_to_cents(column, value.trim()).map(Some),
        _ => Err(invalid_column_value(column, "amount")),
    }
}

fn parse_yuan_to_cents(column: &str, value: &str) -> Result<i64, ApiError> {
    let normalized = value
        .replace([',', '，', '￥', '¥'], "")
        .replace('元', "")
        .trim()
        .to_owned();
    if normalized.is_empty() {
        return Ok(0);
    }

    let (sign, number) = normalized
        .strip_prefix('-')
        .map(|value| (-1_i64, value))
        .unwrap_or((1_i64, normalized.as_str()));
    let mut parts = number.splitn(2, '.');
    let yuan = parts
        .next()
        .unwrap_or_default()
        .parse::<i64>()
        .map_err(|_| invalid_column_value(column, "amount"))?;
    let cents_part = parts.next().unwrap_or_default();
    if cents_part.len() > 2 || !cents_part.chars().all(|ch| ch.is_ascii_digit()) {
        return Err(invalid_column_value(column, "amount"));
    }
    let cents = if cents_part.is_empty() {
        0
    } else {
        format!("{cents_part:0<2}")
            .parse::<i64>()
            .map_err(|_| invalid_column_value(column, "amount"))?
    };

    Ok(sign * (yuan * 100 + cents))
}

fn value_to_optional_bool(column: &str, value: &Value) -> Result<Option<bool>, ApiError> {
    match value {
        Value::Null => Ok(None),
        Value::Bool(value) => Ok(Some(*value)),
        Value::Number(value) if value.as_i64() == Some(1) => Ok(Some(true)),
        Value::Number(value) if value.as_i64() == Some(0) => Ok(Some(false)),
        Value::String(value) if value.trim().is_empty() => Ok(None),
        Value::String(value) => match value.trim().to_ascii_lowercase().as_str() {
            "true" | "1" => Ok(Some(true)),
            "false" | "0" => Ok(Some(false)),
            _ => Err(invalid_column_value(column, "boolean")),
        },
        _ => Err(invalid_column_value(column, "boolean")),
    }
}

fn value_to_optional_date(
    column: &str,
    value: &Value,
) -> Result<Option<chrono::NaiveDate>, ApiError> {
    match value {
        Value::Null => Ok(None),
        Value::String(value) if value.trim().is_empty() => Ok(None),
        Value::String(value) => {
            if let Ok(date) = chrono::NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d") {
                return Ok(Some(date));
            }
            chrono::DateTime::parse_from_rfc3339(value.trim())
                .map(|value| Some(value.date_naive()))
                .map_err(|_| invalid_column_value(column, "date"))
        }
        _ => Err(invalid_column_value(column, "date")),
    }
}

fn value_to_optional_timestamp(
    column: &str,
    value: &Value,
) -> Result<Option<chrono::DateTime<chrono::Utc>>, ApiError> {
    match value {
        Value::Null => Ok(None),
        Value::String(value) if value.trim().is_empty() => Ok(None),
        Value::String(value) => chrono::DateTime::parse_from_rfc3339(value.trim())
            .map(|value| Some(value.with_timezone(&chrono::Utc)))
            .map_err(|_| invalid_column_value(column, "timestamp")),
        _ => Err(invalid_column_value(column, "timestamp")),
    }
}

fn value_to_optional_json(value: &Value) -> Option<sqlx::types::Json<Value>> {
    match value {
        Value::Null => None,
        Value::String(value) if value.trim().is_empty() => None,
        Value::String(value) => Some(sqlx::types::Json(
            serde_json::from_str(value).unwrap_or_else(|_| Value::String(value.clone())),
        )),
        _ => Some(sqlx::types::Json(value.clone())),
    }
}

fn invalid_input(message: impl Into<String>) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::BAD_REQUEST)
        .with_message(message)
}

fn invalid_column_value(column: &str, expected: &str) -> ApiError {
    invalid_input(format!("{column} must be {expected}"))
}

fn not_found() -> ApiError {
    ApiError::default()
        .with_code(StatusCode::NOT_FOUND)
        .with_message("Construction resource not found")
}

fn db_error(error: sqlx::Error) -> ApiError {
    ApiError::default().with_debug(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ningbo_team_types_use_the_official_names() {
        let expected = [
            (1, "钢筋工"),
            (2, "木工"),
            (3, "机械设备安装工"),
            (6, "砌筑工"),
            (15, "模板工"),
            (19, "电气设备安装调试工"),
            (24, "建筑起重机械安装拆卸工"),
            (34, "古建筑传统彩画工"),
            (38, "杂工"),
            (900, "其它"),
            (1001, "管理人员"),
        ];
        for (work_type, platform_name) in expected {
            assert_eq!(ningbo_team_type_label(Some(work_type)), platform_name);
        }
        assert!(ningbo_team_type_label(Some(9999)).is_empty());
    }

    #[test]
    fn ningbo_worker_types_reject_legacy_non_dictionary_value() {
        for value in [1, 6, 11, 13, 38, 900, 1001] {
            assert!(is_official_ningbo_worker_work_type(value));
        }
        assert!(!is_official_ningbo_worker_work_type(12));
        assert!(!is_official_ningbo_worker_work_type(0));
    }

    #[test]
    fn ningbo_worker_image_limit_is_safe_after_base64_encoding() {
        const NINGBO_WORKER_IMAGE_MAX_BASE64_CHARS: usize = 66_560;
        let maximum_encoded_length = NINGBO_WORKER_IMAGE_MAX_BYTES.div_ceil(3) * 4;

        assert_eq!(NINGBO_WORKER_IMAGE_MAX_BYTES, 20 * 1024);
        assert!(maximum_encoded_length <= NINGBO_WORKER_IMAGE_MAX_BASE64_CHARS);
    }

    #[test]
    fn worker_update_cannot_clear_required_phone() {
        assert!(normalize_worker_body(serde_json::json!({ "phone": "" }), false).is_err());
    }

    #[test]
    fn worker_create_defaults_missing_native_place_to_ningbo() {
        let normalized = normalize_worker_body(
            serde_json::json!({ "phone": "13800000000", "work_type": 1 }),
            true,
        )
        .unwrap();
        assert_eq!(
            normalized.get("native_place").and_then(Value::as_i64),
            Some(330200)
        );
    }

    #[test]
    fn trusted_docx_image_base_restricts_origin_and_path() {
        let trusted = TrustedImageBase::parse("https://cdn.example.test/wx").unwrap();

        assert!(trusted.allows(
            &reqwest::Url::parse("https://cdn.example.test/wx/contracts/seal.png?token=1").unwrap()
        ));
        assert!(
            !trusted
                .allows(&reqwest::Url::parse("https://cdn.example.test/private/seal.png").unwrap())
        );
        assert!(
            !trusted.allows(&reqwest::Url::parse("http://cdn.example.test/wx/seal.png").unwrap())
        );
        assert!(
            !trusted
                .allows(&reqwest::Url::parse("https://cdn.example.test:444/wx/seal.png").unwrap())
        );
        assert!(!trusted.allows(&reqwest::Url::parse("https://127.0.0.1/wx/seal.png").unwrap()));
    }

    #[test]
    fn docx_image_url_extraction_supports_upload_json() {
        let raw = r#"{"public_url":"https://cdn.example.test/wx/avatar.png"}"#;

        assert_eq!(
            extract_remote_docx_image_url(raw).as_deref(),
            Some("https://cdn.example.test/wx/avatar.png")
        );
        assert_eq!(
            extract_remote_docx_image_url("data:image/png;base64,AAAA"),
            None
        );
    }

    #[test]
    fn docx_image_body_limit_is_enforced_across_chunks() {
        let mut bytes = vec![0; MAX_DOCX_IMAGE_BYTES - 2];

        assert!(append_bounded_image_bytes(&mut bytes, &[1, 2]).is_ok());
        assert!(append_bounded_image_bytes(&mut bytes, &[3]).is_err());
        assert_eq!(bytes.len(), MAX_DOCX_IMAGE_BYTES);
    }

    #[test]
    fn data_uri_image_requires_matching_image_signature() {
        let valid = format!(
            "data:image/png;base64,{}",
            general_purpose::STANDARD.encode(b"\x89PNG\r\n\x1a\n")
        );
        let invalid = format!(
            "data:image/png;base64,{}",
            general_purpose::STANDARD.encode(b"not a png")
        );

        assert!(load_data_uri_image(&valid).is_some());
        assert!(load_data_uri_image(&invalid).is_none());
    }

    #[test]
    fn project_options_params_tolerates_encoded_keyword_and_bad_limit() {
        let uri: Uri =
            "/api/v1/admin/projects/options?q=%E6%B7%AE%E5%AE%89+%E9%A1%B9%E7%9B%AE&limit=bad"
                .parse()
                .expect("valid uri");

        let (keyword, limit) = project_options_params(&uri);

        assert_eq!(keyword, "淮安 项目");
        assert_eq!(limit, 30);
    }

    #[test]
    fn project_options_params_clamps_limit() {
        let uri: Uri = "/api/v1/admin/projects/options?limit=999"
            .parse()
            .expect("valid uri");

        let (keyword, limit) = project_options_params(&uri);

        assert_eq!(keyword, "");
        assert_eq!(limit, 80);
    }

    #[test]
    fn module_list_params_accepts_attendance_device_filter() {
        let device_id = Uuid::parse_str("00000000-0000-0000-0000-000000000002").unwrap();
        let uri: Uri = format!(
            "/api/v1/admin/attendance-device-issue-reports?attendance_device_id={device_id}&include_delete_actions=1"
        )
        .parse()
        .expect("valid uri");

        let params = module_list_params(&uri).expect("valid params");

        assert_eq!(params.attendance_device_id, Some(device_id));
        assert!(params.include_delete_actions);
    }

    #[test]
    fn module_list_params_accepts_platform_type_filter() {
        let uri: Uri =
            "/api/v1/admin/platform-logs?platform_type=ningbo_housing&operation=attendance.sync"
                .parse()
                .expect("valid uri");

        let params = module_list_params(&uri).expect("valid params");

        assert_eq!(params.platform_type.as_deref(), Some("ningbo_housing"));
        assert_eq!(params.operation.as_deref(), Some("attendance.sync"));
    }

    #[test]
    fn worker_issue_fields_compare_normalized_device_payload_fields() {
        let before = WorkerIssueFields {
            name: Some(" leo ".to_string()),
            id_card: None,
            phone: Some(" 13245234123 ".to_string()),
            avatar: Some(" https://example.test/a.jpg ".to_string()),
            work_status: Some(1),
        };
        let same = WorkerIssueFields {
            name: Some("leo".to_string()),
            phone: Some("13245234123".to_string()),
            avatar: Some("https://example.test/a.jpg".to_string()),
            ..before.clone()
        };
        let changed = WorkerIssueFields {
            id_card: Some("321183199611224410".to_string()),
            ..same.clone()
        };
        let left_site = WorkerIssueFields {
            work_status: Some(2),
            ..same.clone()
        };

        assert_eq!(before.issue_action_after_change(&same), None);
        assert_eq!(before.issue_action_after_change(&changed), Some("update"));
        assert_eq!(before.issue_action_after_change(&left_site), Some("delete"));
        assert_eq!(
            left_site.issue_action_after_change(&changed),
            Some("update")
        );
    }

    #[test]
    fn platform_sync_requires_a_real_before_after_change() {
        let before = Some(serde_json::json!({ "name": "张三", "work_type": 2 }));
        let same = Some(serde_json::json!({ "work_type": 2, "name": "张三" }));
        let changed = Some(serde_json::json!({ "name": "张三", "work_type": 3 }));

        assert!(!platform_fields_changed(&before, &same));
        assert!(platform_fields_changed(&before, &changed));
        assert!(!platform_fields_changed(&None, &changed));
    }

    #[test]
    fn wage_month_params_normalize_to_month_start() {
        let uri: Uri = "/api/v1/admin/projects/00000000-0000-0000-0000-000000000000/wage-batches?payroll_month=2026-05&status=paid"
            .parse()
            .expect("valid uri");

        let params = wage_list_params(&uri).expect("params");

        assert_eq!(
            params.payroll_month,
            Some(chrono::NaiveDate::from_ymd_opt(2026, 5, 1).unwrap())
        );
        assert_eq!(params.status.as_deref(), Some("paid"));
        assert_eq!(params.page, 1);
        assert_eq!(params.page_size, 10);
    }

    #[test]
    fn wage_list_params_clamp_pagination() {
        let uri: Uri =
            "/api/v1/admin/projects/00000000-0000-0000-0000-000000000000/wage-batches?page=0&page_size=999"
                .parse()
                .expect("valid uri");

        let params = wage_list_params(&uri).expect("params");

        assert_eq!(params.page, 1);
        assert_eq!(params.page_size, 100);
    }

    #[test]
    fn resource_list_params_default_to_first_ten_rows() {
        let uri: Uri = "/api/v1/admin/projects/00000000-0000-0000-0000-000000000000/units"
            .parse()
            .expect("valid uri");

        let params = resource_list_params(&uri).expect("params");

        assert_eq!(params.page, 1);
        assert_eq!(params.page_size, 10);
    }

    #[test]
    fn resource_list_params_clamp_pagination_and_parse_scope() {
        let uri: Uri = "/api/v1/admin/projects/00000000-0000-0000-0000-000000000000/workers?page=0&page_size=999&keyword=%E5%BC%A0%E4%B8%89&unit_id=11111111-1111-4111-8111-111111111111&team_id=22222222-2222-4222-8222-222222222222&work_type=3&work_status=2&auth_status=2&direction=1&attendance_date=2026-06-23&attendance_configured=true"
            .parse()
            .expect("valid uri");

        let params = resource_list_params(&uri).expect("params");

        assert_eq!(params.page, 1);
        assert_eq!(params.page_size, 100);
        assert_eq!(params.keyword, "张三");
        assert_eq!(
            params.unit_id,
            Some(Uuid::parse_str("11111111-1111-4111-8111-111111111111").unwrap())
        );
        assert_eq!(
            params.team_id,
            Some(Uuid::parse_str("22222222-2222-4222-8222-222222222222").unwrap())
        );
        assert_eq!(params.work_type, Some(3));
        assert_eq!(params.work_status, Some(2));
        assert_eq!(params.auth_status, Some(AuthStatusFilter::Exact(2)));
        assert_eq!(params.direction, Some(1));
        assert_eq!(
            params.attendance_date,
            Some(chrono::NaiveDate::from_ymd_opt(2026, 6, 23).unwrap())
        );
        assert_eq!(params.attendance_configured, Some(true));
    }

    #[test]
    fn resource_list_params_parse_attendance_calendar_view() {
        let uri: Uri = "/api/v1/admin/projects/00000000-0000-0000-0000-000000000000/attendance-records?view=calendar&month=2026-06"
            .parse()
            .expect("valid uri");

        let params = resource_list_params(&uri).expect("params");

        assert_eq!(params.view, ResourceListView::Calendar);
        assert_eq!(
            params.attendance_month,
            Some(chrono::NaiveDate::from_ymd_opt(2026, 6, 1).unwrap())
        );
        assert_eq!(params.page, 1);
        assert_eq!(params.page_size, 10);
    }

    #[test]
    fn resource_list_params_parse_attendance_stats_view() {
        let uri: Uri = "/api/v1/admin/projects/00000000-0000-0000-0000-000000000000/attendance-records?view=stats&attendance_date=2026-06-23"
            .parse()
            .expect("valid uri");

        let params = resource_list_params(&uri).expect("params");

        assert_eq!(params.view, ResourceListView::Stats);
        assert_eq!(
            params.attendance_date,
            Some(chrono::NaiveDate::from_ymd_opt(2026, 6, 23).unwrap())
        );
        assert_eq!(params.page, 1);
        assert_eq!(params.page_size, 10);
    }

    #[test]
    fn wage_amount_parser_converts_yuan_to_cents() {
        assert_eq!(
            value_to_required_cents("amount", &Value::String("5000".into())).unwrap(),
            500000
        );
        assert_eq!(
            value_to_required_cents("amount", &Value::String("12.30".into())).unwrap(),
            1230
        );
        assert_eq!(
            value_to_optional_cents("amount", &Value::Null).unwrap(),
            None
        );
    }

    #[test]
    fn money_amount_parser_accepts_two_decimal_places() {
        assert_eq!(
            value_to_optional_money("contract_amount", &Value::String("1234.56".into())).unwrap(),
            Some("1234.56".to_owned())
        );
        assert_eq!(
            value_to_optional_money("unit_price", &serde_json::json!(86.5)).unwrap(),
            Some("86.50".to_owned())
        );
        assert!(
            value_to_optional_money("contract_amount", &Value::String("1.234".into())).is_err()
        );
    }

    #[test]
    fn wage_batch_payload_accepts_manual_summary_amounts() {
        let payload = wage_batch_payload(&serde_json::json!({
            "payroll_month": "2026-05",
            "company_name": "测试企业",
            "employee_count": 12,
            "payable_amount": "5000",
            "paid_amount": "4200.50",
            "status": "confirmed"
        }))
        .expect("payload");

        assert_eq!(
            payload.payroll_month,
            chrono::NaiveDate::from_ymd_opt(2026, 5, 1).unwrap()
        );
        assert_eq!(payload.employee_count, 12);
        assert_eq!(payload.payable_amount_cents, 500000);
        assert_eq!(payload.paid_amount_cents, 420050);
        assert_eq!(payload.unpaid_amount_cents, 79950);
        assert_eq!(payload.status, "confirmed");
    }

    #[test]
    fn wage_batch_payload_accepts_manual_worker_rows() {
        let payload = wage_batch_payload(&serde_json::json!({
            "payroll_month": "2026-05",
            "company_name": "测试企业",
            "rows": [
                {
                    "worker_id": "11111111-1111-4111-8111-111111111111",
                    "worker_name": "张三",
                    "id_card": "332603197912123456",
                    "team_name": "木工班组",
                    "payable_amount_cents": 500000,
                    "paid_amount_cents": 450000
                },
                {
                    "worker_id": "22222222-2222-4222-8222-222222222222",
                    "worker_name": "李四",
                    "id_card": "332603198001012222",
                    "team_name": "钢筋班组",
                    "payable_amount_cents": 300000,
                    "paid_amount_cents": 300000
                }
            ]
        }))
        .expect("payload");

        assert_eq!(payload.rows.len(), 2);
        assert_eq!(
            payload.rows[0].worker_id,
            Some(Uuid::parse_str("11111111-1111-4111-8111-111111111111").unwrap())
        );
        assert_eq!(payload.rows[0].worker_name.as_deref(), Some("张三"));
        assert_eq!(payload.rows[0].unpaid_amount_cents, 50000);
    }

    #[test]
    fn wage_import_payload_validates_rows_and_amounts() {
        let payload = wage_import_payload(&serde_json::json!({
            "payroll_month": "2026-05",
            "company_name": "测试企业",
            "rows": [
                {
                    "worker_name": "张三",
                    "id_card": "332603197912123456",
                    "team_name": "木工班组",
                    "payable_amount_cents": 500000,
                    "paid_amount_cents": 450000
                }
            ]
        }))
        .expect("payload");

        assert_eq!(payload.rows.len(), 1);
        assert_eq!(
            payload.rows[0].id_card.as_deref(),
            Some("332603197912123456")
        );
        assert_eq!(payload.rows[0].unpaid_amount_cents, 50000);
    }

    #[test]
    fn managed_attendance_days_are_random_but_stable_for_config_and_month() {
        let config_id = Uuid::parse_str("11111111-1111-4111-8111-111111111111").unwrap();
        let month = chrono::NaiveDate::from_ymd_opt(2026, 9, 1).unwrap();
        let first = selected_month_days(month, 12, config_id).unwrap();
        let second = selected_month_days(month, 12, config_id).unwrap();

        assert_eq!(first, second);
        assert_eq!(first.len(), 12);
        assert!(first.windows(2).all(|pair| pair[0] < pair[1]));
        assert_ne!(
            first.iter().map(|date| date.day()).collect::<Vec<_>>(),
            (1..=12).collect::<Vec<_>>()
        );
    }

    #[test]
    fn managed_planned_time_is_stable_and_inside_configured_range() {
        let config_id = Uuid::parse_str("11111111-1111-4111-8111-111111111111").unwrap();
        let date = chrono::NaiveDate::from_ymd_opt(2026, 8, 9).unwrap();
        let start = chrono::NaiveTime::from_hms_opt(8, 0, 0).unwrap();
        let end = chrono::NaiveTime::from_hms_opt(8, 30, 0).unwrap();
        let first = managed_planned_at(date, start, end, "day", 0, config_id).unwrap();
        let second = managed_planned_at(date, start, end, "day", 0, config_id).unwrap();
        let local_time = first
            .with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap())
            .time();

        assert_eq!(first, second);
        assert!(local_time >= start && local_time <= end);
    }

    #[test]
    fn managed_photo_pairs_are_stable_and_not_repeated_before_exhaustion() {
        let config_id = Uuid::parse_str("11111111-1111-4111-8111-111111111111").unwrap();
        let month = chrono::NaiveDate::from_ymd_opt(2026, 9, 1).unwrap();
        let in_photos = serde_json::json!(["in-1", "in-2", "in-3"]);
        let out_photos = serde_json::json!(["out-1", "out-2", "out-3"]);
        let first =
            deterministic_photo_pairs(Some(&in_photos), Some(&out_photos), config_id, month);
        let second =
            deterministic_photo_pairs(Some(&in_photos), Some(&out_photos), config_id, month);

        assert_eq!(first, second);
        assert_eq!(first.len(), 3);
        assert_eq!(
            first
                .iter()
                .map(|pair| &pair.0)
                .collect::<HashSet<_>>()
                .len(),
            3
        );
        for (in_photo, out_photo) in first {
            assert_eq!(
                in_photo.trim_start_matches("in-"),
                out_photo.trim_start_matches("out-")
            );
        }
    }

    #[test]
    fn managed_photo_pair_payload_requires_complete_pairs_and_caps_at_thirty() {
        assert!(
            validate_managed_photo_pairs(&serde_json::json!({
                "in_photos": ["in-1"], "out_photos": ["out-1"]
            }))
            .is_ok()
        );
        assert!(
            validate_managed_photo_pairs(&serde_json::json!({
                "in_photos": ["in-1", "in-2"], "out_photos": ["out-1"]
            }))
            .is_err()
        );
        let photos = (0..31)
            .map(|index| format!("photo-{index}"))
            .collect::<Vec<_>>();
        assert!(
            validate_managed_photo_pairs(&serde_json::json!({
                "in_photos": photos, "out_photos": photos
            }))
            .is_err()
        );
    }

    #[test]
    fn csv_export_escapes_and_preserves_identifier_text() {
        let csv = build_csv(
            &["姓名", "身份证", "备注"],
            &[vec![
                CsvCell::plain("张三"),
                CsvCell::text("332603197912123456"),
                CsvCell::plain("包含,逗号"),
            ]],
        );

        assert!(csv.starts_with('\u{feff}'));
        assert!(csv.contains("=\"332603197912123456\""));
        assert!(csv.contains("\"包含,逗号\""));
    }
}
