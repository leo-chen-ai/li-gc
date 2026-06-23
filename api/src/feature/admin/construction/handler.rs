use axum::{
    Json,
    extract::{Path, State},
    http::{StatusCode, Uri},
};
use percent_encoding::percent_decode_str;
use serde_json::Value;
use sqlx::{Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
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
    column("invest_total", ColumnKind::BigInt),
    column("investment_nature", ColumnKind::Integer),
    column("labor_cost", ColumnKind::BigInt),
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
    column("contract_amount", ColumnKind::BigInt),
    column("injury_insurance_number", ColumnKind::Text),
    column("margin_amount", ColumnKind::BigInt),
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
    column("contract_amount", ColumnKind::BigInt),
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
    column("unit_price", ColumnKind::BigInt),
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

pub async fn list_projects(State(state): State<AppState>) -> ApiResult<Value> {
    let rows = sqlx::query_scalar::<_, Value>(
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
                END AS attendance_rate
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
        ) r
        "#,
    )
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(rows))
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

fn decode_query_value(value: &str) -> String {
    let normalized = value.replace('+', " ");
    percent_decode_str(&normalized)
        .decode_utf8_lossy()
        .into_owned()
}

pub async fn get_project(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    get_row(
        state.db.pool(),
        "construction_projects",
        &[("id", project_id)],
    )
    .await
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
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    list_rows(
        state.db.pool(),
        "construction_units",
        &[("project_id", project_id)],
    )
    .await
}

pub async fn get_unit(
    State(state): State<AppState>,
    Path((project_id, unit_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Value> {
    get_row(
        state.db.pool(),
        "construction_units",
        &[("project_id", project_id), ("id", unit_id)],
    )
    .await
}

pub async fn update_unit(
    State(state): State<AppState>,
    Path((project_id, unit_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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
    Path((project_id, unit_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    delete_row(
        state.db.pool(),
        "construction_units",
        &[("project_id", project_id), ("id", unit_id)],
    )
    .await
}

pub async fn create_team(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    list_rows(
        state.db.pool(),
        "construction_teams",
        &[("project_id", project_id)],
    )
    .await
}

pub async fn get_team(
    State(state): State<AppState>,
    Path((project_id, team_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Value> {
    get_row(
        state.db.pool(),
        "construction_teams",
        &[("project_id", project_id), ("id", team_id)],
    )
    .await
}

pub async fn update_team(
    State(state): State<AppState>,
    Path((project_id, team_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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
    Path((project_id, team_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    delete_row(
        state.db.pool(),
        "construction_teams",
        &[("project_id", project_id), ("id", team_id)],
    )
    .await
}

pub async fn create_worker(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    create_row(
        state.db.pool(),
        "construction_workers",
        WORKER_COLUMNS,
        &body,
        &[("project_id", project_id)],
        StatusCode::CREATED,
    )
    .await
}

pub async fn list_workers(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    list_rows(
        state.db.pool(),
        "construction_workers",
        &[("project_id", project_id)],
    )
    .await
}

pub async fn get_worker(
    State(state): State<AppState>,
    Path((project_id, worker_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Value> {
    get_row(
        state.db.pool(),
        "construction_workers",
        &[("project_id", project_id), ("id", worker_id)],
    )
    .await
}

pub async fn update_worker(
    State(state): State<AppState>,
    Path((project_id, worker_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
    update_row(
        state.db.pool(),
        "construction_workers",
        WORKER_COLUMNS,
        &body,
        &[("project_id", project_id), ("id", worker_id)],
    )
    .await
}

pub async fn delete_worker(
    State(state): State<AppState>,
    Path((project_id, worker_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    delete_row(
        state.db.pool(),
        "construction_workers",
        &[("project_id", project_id), ("id", worker_id)],
    )
    .await
}

pub async fn list_attendance(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    list_rows(
        state.db.pool(),
        "construction_attendance_records",
        &[("project_id", project_id)],
    )
    .await
}

pub async fn get_attendance(
    State(state): State<AppState>,
    Path((project_id, attendance_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Value> {
    get_row(
        state.db.pool(),
        "construction_attendance_records",
        &[("project_id", project_id), ("id", attendance_id)],
    )
    .await
}

pub async fn update_attendance(
    State(state): State<AppState>,
    Path((project_id, attendance_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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
    Path((project_id, attendance_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    delete_row(
        state.db.pool(),
        "construction_attendance_records",
        &[("project_id", project_id), ("id", attendance_id)],
    )
    .await
}

pub async fn list_attendance_devices(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    list_rows(
        state.db.pool(),
        "construction_attendance_devices",
        &[("project_id", project_id)],
    )
    .await
}

pub async fn get_attendance_device(
    State(state): State<AppState>,
    Path((project_id, device_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Value> {
    get_row(
        state.db.pool(),
        "construction_attendance_devices",
        &[("project_id", project_id), ("id", device_id)],
    )
    .await
}

pub async fn create_attendance_device(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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
    Path((project_id, device_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> ApiResult<Value> {
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
    Path((project_id, device_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    delete_row(
        state.db.pool(),
        "construction_attendance_devices",
        &[("project_id", project_id), ("id", device_id)],
    )
    .await
}

async fn list_rows(
    pool: &sqlx::PgPool,
    table: &'static str,
    where_uuid_columns: &[(&'static str, Uuid)],
) -> ApiResult<Value> {
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb) FROM (SELECT * FROM ",
    );
    query.push(table).push(" r WHERE r.is_deleted = FALSE");
    for (column, value) in where_uuid_columns {
        query
            .push(" AND r.")
            .push(*column)
            .push(" = ")
            .push_bind(*value);
    }
    query.push(") r");

    let rows = query
        .build_query_scalar::<Value>()
        .fetch_one(pool)
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(rows))
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
}
