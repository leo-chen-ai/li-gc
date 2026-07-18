use axum::{
    Extension, Json,
    extract::{Path, State},
    http::{StatusCode, Uri, header},
    response::{IntoResponse, Response},
};
use base64::{Engine as _, engine::general_purpose};
use bytes::Bytes;
use chrono::{Datelike, NaiveTime, TimeZone, Timelike};
use percent_encoding::percent_decode_str;
use serde::Serialize;
use serde_json::Value;
use sqlx::{Postgres, QueryBuilder, Row};
use std::{
    collections::{HashMap, HashSet},
    io::{Cursor, Read, Write},
};
use uuid::Uuid;
use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

use crate::{
    feature::auth::{AuthUser, Role},
    feature::device_mqtt::issuer::{
        issue_device_workers_via_broker, issue_single_worker_via_broker,
    },
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
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
    column("monthly_attendance_days", ColumnKind::SmallInt),
    column("shift", ColumnKind::Text),
    column("check_in_time", ColumnKind::Text),
    column("check_out_time", ColumnKind::Text),
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
    action: Option<String>,
    include_delete_actions: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ResourceListView {
    List,
    Calendar,
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
        Some(3) => "安装工",
        Some(4) => "架子工",
        Some(5) => "混凝土工",
        Some(6) => "瓦工",
        Some(7) => "电工",
        Some(8) => "焊工",
        Some(9) => "水工",
        Some(10) => "测量工",
        Some(11) => "抹灰工",
        Some(12) => "油漆工",
        Some(13) => "防水工",
        Some(14) => "机械司机",
        Some(900) => "其他",
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
    list_rows_page(
        state.db.pool(),
        "construction_units",
        &[("project_id", project_id)],
        &[],
        &params,
    )
    .await
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
    create_row(
        state.db.pool(),
        "construction_teams",
        TEAM_COLUMNS,
        &body,
        &[("project_id", project_id)],
        StatusCode::CREATED,
    )
    .await
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

    list_rows_page(
        state.db.pool(),
        "construction_teams",
        &[("project_id", project_id)],
        &scoped_columns,
        &params,
    )
    .await
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
    update_row(
        state.db.pool(),
        "construction_teams",
        TEAM_COLUMNS,
        &body,
        &[("project_id", project_id), ("id", team_id)],
    )
    .await
}

pub async fn delete_team(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, team_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    delete_row(
        state.db.pool(),
        "construction_teams",
        &[("project_id", project_id), ("id", team_id)],
    )
    .await
}

pub async fn create_worker(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let body = normalize_worker_body(body, true)?;
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
        &[("project_id", project_id)],
        &scoped_columns,
        &params,
    )
    .await
}

async fn list_workers_page(
    pool: &sqlx::PgPool,
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
                COALESCE(device_stats.total_device_count, 0)::int AS attendance_device_total_count
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

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
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
    let before_issue_fields =
        fetch_worker_issue_fields(state.db.pool(), project_id, worker_id).await?;
    let body = normalize_worker_body(body, false)?;
    let response = update_row(
        state.db.pool(),
        "construction_workers",
        WORKER_COLUMNS,
        &body,
        &[("project_id", project_id), ("id", worker_id)],
    )
    .await?;

    let after_issue_fields =
        fetch_worker_issue_fields(state.db.pool(), project_id, worker_id).await?;
    if let (Some(before), Some(after)) = (before_issue_fields, after_issue_fields) {
        trigger_worker_reissue_after_change(&state, project_id, worker_id, &before, &after).await;
    }

    Ok(response)
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
            return None;
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

async fn trigger_worker_reissue_after_change(
    state: &AppState,
    project_id: Uuid,
    worker_id: Uuid,
    before: &WorkerIssueFields,
    after: &WorkerIssueFields,
) {
    let Some(action) = before.issue_action_after_change(after) else {
        return;
    };

    trigger_worker_device_issue(
        state,
        project_id,
        worker_id,
        action,
        if action == "delete" {
            "人员退场后自动从考勤机删除"
        } else {
            "人员资料修改后自动下发"
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
    let Some(broker_url) = state.config.mqtt_broker_url.clone() else {
        tracing::warn!(
            %project_id,
            %worker_id,
            %action,
            "MQTT_BROKER_URL 未配置，跳过考勤机人员同步"
        );
        return;
    };

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
            &broker_url,
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
    delete_row(
        state.db.pool(),
        "construction_workers",
        &[("project_id", project_id), ("id", worker_id)],
    )
    .await
}

pub async fn list_attendance(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> ApiResult<Value> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    let params = resource_list_params(&uri)?;

    if params.view == ResourceListView::Calendar {
        return list_attendance_calendar(state.db.pool(), project_id, &params).await;
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
            'closeup_photo', COALESCE(r.closeup_photo, closeup_photo.photo_data)
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
SELECT COALESCE(
    jsonb_agg(
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
    ),
    '[]'::jsonb
)
FROM worker_days
"#,
    );

    let items = query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "items": items,
        "month": month.format("%Y-%m").to_string(),
        "view": "calendar",
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
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
    update_row(
        state.db.pool(),
        "construction_attendance_devices",
        ATTENDANCE_DEVICE_COLUMNS,
        &body,
        &[("project_id", project_id), ("id", device_id)],
    )
    .await
}

pub async fn delete_attendance_device(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, device_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    ensure_project_access(state.db.pool(), &auth_user, project_id).await?;
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
    let broker_url = state
        .config
        .mqtt_broker_url
        .clone()
        .ok_or_else(|| invalid_input("MQTT_BROKER_URL 未配置，无法下发人员"))?;
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
        &broker_url,
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
    let broker_url = state
        .config
        .mqtt_broker_url
        .clone()
        .ok_or_else(|| invalid_input("MQTT_BROKER_URL 未配置，无法下发人员"))?;
    let action = issue_action_from_body(&body, "update")?;
    let remark = body
        .get("remark")
        .and_then(value_to_optional_text)
        .unwrap_or_else(|| "整机批量下发".to_string());

    let summary = issue_device_workers_via_broker(
        state.db.pool(),
        &broker_url,
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
    ensure_json_string_array_if_present(&body, "in_photos")?;
    ensure_json_string_array_if_present(&body, "out_photos")?;
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
    ensure_json_string_array_if_present(&body, "in_photos")?;
    ensure_json_string_array_if_present(&body, "out_photos")?;
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
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    validate_managed_attendance_config_patch(state.db.pool(), config_id, &body).await?;
    update_row(
        state.db.pool(),
        "construction_managed_attendance_configs",
        MANAGED_ATTENDANCE_CONFIG_COLUMNS,
        &body,
        &[("id", config_id)],
    )
    .await?;
    let row = fetch_managed_attendance_config(state.db.pool(), config_id).await?;
    Ok(ApiSuccess::default().with_data(row))
}

pub async fn delete_managed_attendance_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
) -> ApiResult<()> {
    soft_delete_row(
        state.db.pool(),
        "construction_managed_attendance_configs",
        &[("id", config_id)],
    )
    .await
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
    Json(body): Json<Value>,
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
        let rendered =
            render_docx_contract_template(&template_bytes, &variables).map_err(|error| {
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
    Json(body): Json<Value>,
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
    Json(body): Json<Value>,
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
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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

pub async fn list_platform_configs(State(state): State<AppState>, uri: Uri) -> ApiResult<Value> {
    let params = module_list_params(&uri)?;
    list_module_rows(state.db.pool(), "construction_platform_configs", &params).await
}

pub async fn get_platform_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
) -> ApiResult<Value> {
    get_row(
        state.db.pool(),
        "construction_platform_configs",
        &[("id", config_id)],
    )
    .await
}

pub async fn update_platform_config(
    State(state): State<AppState>,
    Path(config_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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
    Path(config_id): Path<Uuid>,
) -> ApiResult<()> {
    soft_delete_row(
        state.db.pool(),
        "construction_platform_configs",
        &[("id", config_id)],
    )
    .await
}

pub async fn create_platform_log(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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

pub async fn list_platform_logs(State(state): State<AppState>, uri: Uri) -> ApiResult<Value> {
    let params = module_list_params(&uri)?;
    let mut data =
        list_module_rows_value(state.db.pool(), "construction_platform_logs", &params, None)
            .await?;
    let summary = platform_log_summary(state.db.pool(), &params).await?;
    if let Some(object) = data.as_object_mut() {
        object.insert("summary".to_owned(), summary);
    }

    Ok(ApiSuccess::default().with_data(data))
}

pub async fn get_platform_log(
    State(state): State<AppState>,
    Path(log_id): Path<Uuid>,
) -> ApiResult<Value> {
    get_row(
        state.db.pool(),
        "construction_platform_logs",
        &[("id", log_id)],
    )
    .await
}

pub async fn update_platform_log(
    State(state): State<AppState>,
    Path(log_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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
    Path(log_id): Path<Uuid>,
) -> ApiResult<()> {
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
        let rendered = render_docx_xml_text_nodes(&entry.name, &xml, variables, &mut context);
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
        if is_docx_image_variable(&name) {
            if let Some(image) = load_docx_image(value) {
                if let Some(raw) =
                    create_image_replacement(part_name, &nodes, start, end, image, context)
                {
                    raw_replacements.push(raw);
                    continue;
                }
            }
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

struct DocxImage {
    extension: String,
    content_type: String,
    bytes: Vec<u8>,
}

fn load_docx_image(raw_value: &str) -> Option<DocxImage> {
    let value = raw_value.trim();
    if value.is_empty() {
        return None;
    }
    if let Some(image) = load_data_uri_image(value) {
        return Some(image);
    }
    if let Ok(json) = serde_json::from_str::<Value>(value) {
        for key in ["public_url", "url", "image_url"] {
            if let Some(url) = json.get(key).and_then(Value::as_str) {
                if let Some(image) = load_docx_image(url) {
                    return Some(image);
                }
            }
        }
        return None;
    }
    if value.starts_with("http://") || value.starts_with("https://") {
        return load_http_image(value);
    }
    None
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
    let bytes = general_purpose::STANDARD.decode(payload).ok()?;
    Some(DocxImage {
        extension,
        content_type,
        bytes,
    })
}

fn load_http_image(url: &str) -> Option<DocxImage> {
    let response = ureq::get(url).call().ok()?;
    if !response.status().is_success() {
        return None;
    }
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .filter(|value| value.starts_with("image/"))
        .unwrap_or("image/png")
        .to_owned();
    let extension = image_extension_for_content_type(&content_type)?;
    let mut reader = response.into_body().into_reader();
    let mut bytes = Vec::new();
    std::io::Read::read_to_end(&mut reader, &mut bytes).ok()?;
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

async fn platform_log_summary(
    pool: &sqlx::PgPool,
    params: &ModuleListParams,
) -> Result<Value, ApiError> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT jsonb_build_object(
            'today_request_count', COALESCE(SUM(request_count), 0)::int,
            'today_success_count', COALESCE(SUM(success_count), 0)::int,
            'today_failure_count', COALESCE(SUM(failure_count), 0)::int,
            'today_log_count', COUNT(*)::int
        )
        FROM construction_platform_logs r
        WHERE r.is_deleted = FALSE
          AND (r.occurred_at AT TIME ZONE 'Asia/Shanghai')::date = (NOW() AT TIME ZONE 'Asia/Shanghai')::date
        "#,
    );
    if let Some(project_id) = params.project_id {
        query.push(" AND r.project_id = ").push_bind(project_id);
    }
    if let Some(status) = &params.status {
        query.push(" AND r.status = ").push_bind(status.clone());
    }

    query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ManagedAttendanceListParams {
    page: i64,
    page_size: i64,
    keyword: String,
    project_id: Option<Uuid>,
    status: Option<String>,
    month: Option<chrono::NaiveDate>,
}

fn managed_attendance_list_params(uri: &Uri) -> Result<ManagedAttendanceListParams, ApiError> {
    let mut page = 1_i64;
    let mut page_size = 10_i64;
    let mut keyword = String::new();
    let mut project_id = None;
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
                g.name AS photo_group_name
            FROM construction_managed_attendance_configs c
            JOIN construction_projects p ON p.id = c.project_id AND p.is_deleted = FALSE
            JOIN construction_workers w ON w.id = c.worker_id AND w.is_deleted = FALSE
            LEFT JOIN construction_managed_attendance_photo_groups g
                ON g.id = c.photo_group_id AND g.is_deleted = FALSE
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
                g.name AS photo_group_name
            FROM construction_managed_attendance_configs c
            JOIN construction_projects p ON p.id = c.project_id AND p.is_deleted = FALSE
            JOIN construction_workers w ON w.id = c.worker_id AND w.is_deleted = FALSE
            LEFT JOIN construction_managed_attendance_photo_groups g
                ON g.id = c.photo_group_id AND g.is_deleted = FALSE
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

    validate_managed_config_values(object)?;
    ensure_worker_in_project(pool, project_id, worker_id).await?;
    if let Some(photo_group_id) = photo_group_id {
        ensure_photo_group_in_project(pool, project_id, photo_group_id).await?;
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
        SELECT project_id, worker_id, photo_group_id
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
    let photo_group_id = if object.contains_key("photo_group_id") {
        object
            .get("photo_group_id")
            .map(|value| value_to_optional_uuid("photo_group_id", value))
            .transpose()?
            .flatten()
    } else {
        existing.try_get("photo_group_id").ok()
    };

    ensure_worker_in_project(pool, project_id, worker_id).await?;
    if let Some(photo_group_id) = photo_group_id {
        ensure_photo_group_in_project(pool, project_id, photo_group_id).await?;
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
    if let Some(value) = object.get("check_out_time").and_then(Value::as_str) {
        parse_managed_time("check_out_time", value)?;
    }

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

async fn generate_managed_records_for_month(
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
            c.check_out_time,
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
    let check_out_time: String = row.get("check_out_time");
    let worker_name: Option<String> = row.try_get("worker_name").ok();
    let worker_id_card: Option<String> = row.try_get("worker_id_card").ok();
    let in_photos: Option<Value> = row.try_get("in_photos").ok();
    let out_photos: Option<Value> = row.try_get("out_photos").ok();
    let in_photo_url = first_photo_url(in_photos.as_ref());
    let out_photo_url = first_photo_url(out_photos.as_ref());
    let worker_id_card_mask = worker_id_card.as_deref().map(mask_id_card);
    let in_time = parse_managed_time("check_in_time", &check_in_time)?;
    let out_time = parse_managed_time("check_out_time", &check_out_time)?;
    let attendance_days = selected_month_days(month, monthly_attendance_days)?;

    let mut generated_count = 0_i64;
    let mut tx = pool.begin().await.map_err(db_error)?;
    for attendance_date in &attendance_days {
        for direction in [0_i16, 1_i16] {
            let planned_at =
                managed_planned_at(*attendance_date, in_time, out_time, &shift, direction)?;
            let photo_url = if direction == 0 {
                in_photo_url.clone()
            } else {
                out_photo_url.clone()
            };

            sqlx::query(
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
            .bind(photo_url)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
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
    if let Some(status) = &params.status {
        query.push(" AND r.status = ").push_bind(status.clone());
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
) -> Result<Vec<chrono::NaiveDate>, ApiError> {
    let next_month =
        next_month_start(month).ok_or_else(|| invalid_column_value("month", "YYYY-MM"))?;
    let days_in_month = (next_month - chrono::Duration::days(1)).day();
    let target_days = u32::try_from(monthly_attendance_days)
        .map_err(|_| invalid_column_value("monthly_attendance_days", "1-31"))?
        .min(days_in_month);
    let mut days = Vec::with_capacity(target_days as usize);
    for day in 1..=target_days {
        let Some(date) = chrono::NaiveDate::from_ymd_opt(month.year(), month.month(), day) else {
            return Err(invalid_column_value("month", "YYYY-MM"));
        };
        days.push(date);
    }
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
    in_time: chrono::NaiveTime,
    out_time: chrono::NaiveTime,
    shift: &str,
    direction: i16,
) -> Result<chrono::DateTime<chrono::Utc>, ApiError> {
    let mut date = attendance_date;
    let time = if direction == 0 { in_time } else { out_time };
    if direction == 1 && shift == "night" && out_time <= in_time {
        date = attendance_date
            .succ_opt()
            .ok_or_else(|| invalid_column_value("attendance_date", "valid date"))?;
    }
    let local = date.and_time(time);
    let offset = chrono::FixedOffset::east_opt(8 * 3600)
        .ok_or_else(|| invalid_column_value("timezone", "UTC+8"))?;
    let planned_at = offset
        .from_local_datetime(&local)
        .single()
        .ok_or_else(|| invalid_column_value("planned_at", "valid local time"))?;
    Ok(planned_at.with_timezone(&chrono::Utc))
}

fn parse_managed_time(column: &str, value: &str) -> Result<chrono::NaiveTime, ApiError> {
    chrono::NaiveTime::parse_from_str(value.trim(), "%H:%M")
        .or_else(|_| chrono::NaiveTime::parse_from_str(value.trim(), "%H:%M:%S"))
        .map_err(|_| invalid_column_value(column, "HH:mm"))
}

fn first_photo_url(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_array).and_then(|items| {
        items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .find(|url| !url.is_empty())
            .map(str::to_owned)
    })
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

    if default_entry_time {
        validate_worker_create_body(&object)?;
    }

    object.insert("auth_status".to_owned(), Value::Number(2.into()));
    object.insert("auth_fail_reason".to_owned(), Value::Null);

    if default_entry_time && is_blank_json_value(object.get("entry_time")) {
        object.insert(
            "entry_time".to_owned(),
            Value::String(chrono::Local::now().format("%Y-%m-%d").to_string()),
        );
    }

    Ok(Value::Object(object))
}

fn validate_worker_create_body(object: &serde_json::Map<String, Value>) -> Result<(), ApiError> {
    if is_blank_json_value(object.get("phone")) {
        return Err(invalid_input("请填写手机号"));
    }

    let worker_type = object
        .get("worker_type")
        .map(|value| value_to_optional_i64("worker_type", value))
        .transpose()?
        .flatten();

    if worker_type == Some(1) && is_blank_json_value(object.get("work_type")) {
        return Err(invalid_input("请选择工种"));
    }

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
    fn worker_issue_fields_compare_normalized_device_payload_fields() {
        let before = WorkerIssueFields {
            name: Some(" leo ".to_string()),
            id_card: None,
            phone: Some(" 15852906247 ".to_string()),
            avatar: Some(" https://example.test/a.jpg ".to_string()),
            work_status: Some(1),
        };
        let same = WorkerIssueFields {
            name: Some("leo".to_string()),
            phone: Some("15852906247".to_string()),
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
        assert_eq!(before.issue_action_after_change(&left_site), None);
        assert_eq!(
            left_site.issue_action_after_change(&changed),
            Some("update")
        );
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
