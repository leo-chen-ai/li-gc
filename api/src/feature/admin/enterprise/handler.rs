use std::collections::HashMap;

use axum::{
    Json,
    extract::{Path, State},
    http::{StatusCode, Uri, header},
    response::{IntoResponse, Response},
};
use chrono::{Datelike, NaiveDate, Utc};
use percent_encoding::percent_decode_str;
use serde_json::{Value, json};
use sqlx::{Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

#[derive(Debug, Clone)]
struct PageParams {
    page: i64,
    page_size: i64,
    keyword: Option<String>,
    status: Option<String>,
    customer_id: Option<Uuid>,
    own_entity_id: Option<Uuid>,
    date_from: Option<NaiveDate>,
    date_to: Option<NaiveDate>,
}

#[derive(Debug, Clone, Copy)]
struct RecordModule {
    table: &'static str,
    date_column: &'static str,
    searchable_columns: &'static [&'static str],
    export_headers: &'static [(&'static str, &'static str)],
}

const ISSUED_INVOICES: RecordModule = RecordModule {
    table: "enterprise_project_issued_invoices",
    date_column: "invoice_date",
    searchable_columns: &["customer_name", "invoice_no", "remark"],
    export_headers: &[
        ("invoice_date", "开票日期"),
        ("customer_name", "客户名称"),
        ("own_entity_name", "我方主体"),
        ("invoice_no", "发票号码"),
        ("amount_cents", "开票金额(分)"),
        ("tax_rate", "税率"),
        ("status", "状态"),
        ("remark", "备注"),
    ],
};

const RECEIVED_INVOICES: RecordModule = RecordModule {
    table: "enterprise_project_received_invoices",
    date_column: "invoice_date",
    searchable_columns: &[
        "supplier_name",
        "own_entity_name",
        "invoice_no",
        "expense_type",
        "remark",
    ],
    export_headers: &[
        ("invoice_date", "收票日期"),
        ("supplier_name", "供应商名称"),
        ("own_entity_name", "我方主体"),
        ("invoice_no", "发票号码"),
        ("expense_type", "费用类型"),
        ("amount_cents", "收票金额(分)"),
        ("tax_rate", "税率"),
        ("status", "状态"),
        ("remark", "备注"),
    ],
};

const COLLECTIONS: RecordModule = RecordModule {
    table: "enterprise_project_collections",
    date_column: "collection_date",
    searchable_columns: &["payer_name", "own_entity_name", "account_name", "remark"],
    export_headers: &[
        ("collection_date", "回款日期"),
        ("payer_name", "付款方"),
        ("own_entity_name", "我方主体"),
        ("amount_cents", "回款金额(分)"),
        ("account_name", "收款账户"),
        ("status", "状态"),
        ("remark", "备注"),
    ],
};

const PAYMENTS: RecordModule = RecordModule {
    table: "enterprise_project_payments",
    date_column: "payment_date",
    searchable_columns: &["payee_name", "own_entity_name", "account_name", "remark"],
    export_headers: &[
        ("payment_date", "付款日期"),
        ("payee_name", "收款方"),
        ("own_entity_name", "我方主体"),
        ("amount_cents", "付款金额(分)"),
        ("account_name", "付款账户"),
        ("status", "状态"),
        ("remark", "备注"),
    ],
};

fn invalid_input(message: impl Into<String>) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::BAD_REQUEST)
        .with_message(message)
}

fn not_found(message: impl Into<String>) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::NOT_FOUND)
        .with_message(message)
}

fn db_error(error: sqlx::Error) -> ApiError {
    ApiError::default().log_only(error)
}

fn query_map(uri: &Uri) -> HashMap<String, String> {
    uri.query()
        .unwrap_or_default()
        .split('&')
        .filter(|part| !part.is_empty())
        .filter_map(|part| {
            let mut segments = part.splitn(2, '=');
            let key = segments.next()?;
            let value = segments.next().unwrap_or_default();
            let key = percent_decode_str(key).decode_utf8_lossy().to_string();
            let normalized = value.replace('+', " ");
            let value = percent_decode_str(&normalized)
                .decode_utf8_lossy()
                .trim()
                .to_string();
            Some((key, value))
        })
        .collect()
}

fn page_params(uri: &Uri) -> PageParams {
    let query = query_map(uri);
    let page = query
        .get("page")
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(1);
    let page_size = query
        .get("page_size")
        .or_else(|| query.get("pageSize"))
        .and_then(|value| value.parse::<i64>().ok())
        .map(|value| value.clamp(1, 100))
        .unwrap_or(10);
    let keyword = query
        .get("keyword")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let status = query
        .get("status")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value != "all");
    let customer_id = query
        .get("customer_id")
        .and_then(|value| Uuid::parse_str(value).ok());
    let own_entity_id = query
        .get("own_entity_id")
        .and_then(|value| Uuid::parse_str(value).ok());
    let date_from = query
        .get("date_from")
        .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());
    let date_to = query
        .get("date_to")
        .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());

    PageParams {
        page,
        page_size,
        keyword,
        status,
        customer_id,
        own_entity_id,
        date_from,
        date_to,
    }
}

fn text(payload: &Value, key: &str) -> Option<String> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn required_text(payload: &Value, key: &str, label: &str) -> Result<String, ApiError> {
    text(payload, key).ok_or_else(|| invalid_input(format!("{label}不能为空")))
}

fn date(payload: &Value, key: &str) -> Result<Option<NaiveDate>, ApiError> {
    let Some(value) = text(payload, key) else {
        return Ok(None);
    };

    NaiveDate::parse_from_str(&value, "%Y-%m-%d")
        .map(Some)
        .map_err(|_| invalid_input(format!("{key}格式应为YYYY-MM-DD")))
}

fn uuid_value(payload: &Value, key: &str) -> Result<Option<Uuid>, ApiError> {
    let Some(value) = text(payload, key) else {
        return Ok(None);
    };

    Uuid::parse_str(&value)
        .map(Some)
        .map_err(|_| invalid_input(format!("{key}不是有效ID")))
}

fn bool_value(payload: &Value, key: &str) -> Option<bool> {
    match payload.get(key) {
        Some(Value::Bool(value)) => Some(*value),
        Some(Value::String(value)) => match value.trim().to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" | "on" => Some(true),
            "false" | "0" | "no" | "off" => Some(false),
            _ => None,
        },
        Some(Value::Number(value)) => value.as_i64().map(|value| value != 0),
        _ => None,
    }
}

fn amount_cents(payload: &Value, yuan_key: &str, cents_key: &str) -> Result<i64, ApiError> {
    if let Some(value) = payload.get(cents_key) {
        if let Some(value) = value.as_i64() {
            return Ok(value.max(0));
        }
        if let Some(value) = value.as_str() {
            return value
                .trim()
                .parse::<i64>()
                .map(|value| value.max(0))
                .map_err(|_| invalid_input(format!("{cents_key}必须是数字")));
        }
    }

    let Some(value) = payload.get(yuan_key) else {
        return Ok(0);
    };

    match value {
        Value::Number(number) => number
            .as_f64()
            .map(|value| (value * 100.0).round() as i64)
            .ok_or_else(|| invalid_input(format!("{yuan_key}必须是数字"))),
        Value::String(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Ok(0);
            }
            let mut parts = trimmed.split('.');
            let yuan = parts
                .next()
                .unwrap_or("0")
                .parse::<i64>()
                .map_err(|_| invalid_input(format!("{yuan_key}必须是金额")))?;
            let cents_text = parts.next().unwrap_or("0");
            if parts.next().is_some() {
                return Err(invalid_input(format!("{yuan_key}必须是金额")));
            }
            let cents = format!("{cents_text:0<2}");
            let cents = cents
                .chars()
                .take(2)
                .collect::<String>()
                .parse::<i64>()
                .map_err(|_| invalid_input(format!("{yuan_key}必须是金额")))?;
            Ok(yuan.saturating_mul(100).saturating_add(cents).max(0))
        }
        _ => Err(invalid_input(format!("{yuan_key}必须是金额"))),
    }
}

fn optional_f64(payload: &Value, key: &str) -> Result<Option<f64>, ApiError> {
    match payload.get(key) {
        Some(Value::Number(value)) => value
            .as_f64()
            .map(Some)
            .ok_or_else(|| invalid_input(format!("{key}必须是数字"))),
        Some(Value::String(value)) if !value.trim().is_empty() => value
            .trim()
            .parse::<f64>()
            .map(Some)
            .map_err(|_| invalid_input(format!("{key}必须是数字"))),
        _ => Ok(None),
    }
}

fn attachments(payload: &Value) -> Result<Value, ApiError> {
    match payload.get("attachments") {
        Some(Value::Array(_)) => Ok(payload["attachments"].clone()),
        Some(Value::Null) | None => Ok(json!([])),
        _ => Err(invalid_input("attachments必须是数组")),
    }
}

fn optional_attachments(payload: &Value) -> Result<Option<Value>, ApiError> {
    if payload.get("attachments").is_none() {
        return Ok(None);
    }
    attachments(payload).map(Some)
}

fn csv_response(filename: &str, body: String) -> Response {
    (
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                &format!("attachment; filename=\"{filename}\""),
            ),
        ],
        body,
    )
        .into_response()
}

fn csv_escape(value: &str) -> String {
    if value.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn value_to_csv(value: Option<&Value>) -> String {
    match value {
        Some(Value::Null) | None => String::new(),
        Some(Value::String(value)) => value.clone(),
        Some(value) => value.to_string().trim_matches('"').to_string(),
    }
}

fn append_project_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    params: &PageParams,
    table_alias: &str,
) {
    if let Some(keyword) = &params.keyword {
        query.push(" AND (");
        for (index, column) in [
            "name",
            "project_code",
            "customer_name",
            "own_entity_name",
            "owner_name",
        ]
        .iter()
        .enumerate()
        {
            if index > 0 {
                query.push(" OR ");
            }
            query.push(format!("{table_alias}.{column} ILIKE "));
            query.push_bind(format!("%{keyword}%"));
        }
        query.push(")");
    }

    if let Some(status) = &params.status {
        query.push(format!(" AND {table_alias}.status = "));
        query.push_bind(status.clone());
    }

    if let Some(customer_id) = params.customer_id {
        query.push(format!(" AND {table_alias}.customer_id = "));
        query.push_bind(customer_id);
    }

    if let Some(own_entity_id) = params.own_entity_id {
        query.push(format!(" AND {table_alias}.own_entity_id = "));
        query.push_bind(own_entity_id);
    }
}

fn append_customer_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    params: &PageParams,
    table_alias: &str,
) {
    if let Some(keyword) = &params.keyword {
        query.push(" AND (");
        for (index, column) in [
            "name",
            "customer_code",
            "credit_code",
            "contact_name",
            "contact_phone",
            "remark",
        ]
        .iter()
        .enumerate()
        {
            if index > 0 {
                query.push(" OR ");
            }
            query.push(format!("{table_alias}.{column} ILIKE "));
            query.push_bind(format!("%{keyword}%"));
        }
        query.push(")");
    }

    if let Some(status) = &params.status {
        query.push(format!(" AND {table_alias}.status = "));
        query.push_bind(status.clone());
    }

    if let Some(date_from) = params.date_from {
        query.push(format!(" AND {table_alias}.created_at::date >= "));
        query.push_bind(date_from);
    }

    if let Some(date_to) = params.date_to {
        query.push(format!(" AND {table_alias}.created_at::date <= "));
        query.push_bind(date_to);
    }
}

fn append_own_entity_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    params: &PageParams,
    table_alias: &str,
) {
    if let Some(keyword) = &params.keyword {
        query.push(" AND (");
        for (index, column) in [
            "name",
            "credit_code",
            "bank_name",
            "bank_account",
            "contact_name",
            "contact_phone",
            "remark",
        ]
        .iter()
        .enumerate()
        {
            if index > 0 {
                query.push(" OR ");
            }
            query.push(format!("{table_alias}.{column} ILIKE "));
            query.push_bind(format!("%{keyword}%"));
        }
        query.push(")");
    }

    if let Some(status) = &params.status {
        query.push(format!(" AND {table_alias}.status = "));
        query.push_bind(status.clone());
    }

    if let Some(date_from) = params.date_from {
        query.push(format!(" AND {table_alias}.created_at::date >= "));
        query.push_bind(date_from);
    }

    if let Some(date_to) = params.date_to {
        query.push(format!(" AND {table_alias}.created_at::date <= "));
        query.push_bind(date_to);
    }
}

fn append_record_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    module: RecordModule,
    params: &PageParams,
    table_alias: &str,
) {
    if let Some(keyword) = &params.keyword {
        query.push(" AND (");
        for (index, column) in module.searchable_columns.iter().enumerate() {
            if index > 0 {
                query.push(" OR ");
            }
            query.push(format!("{table_alias}.{column} ILIKE "));
            query.push_bind(format!("%{keyword}%"));
        }
        query.push(")");
    }

    if let Some(status) = &params.status {
        query.push(format!(" AND {table_alias}.status = "));
        query.push_bind(status.clone());
    }

    if let Some(customer_id) = params.customer_id {
        query.push(format!(" AND {table_alias}.counterparty_id = "));
        query.push_bind(customer_id);
    }

    if let Some(own_entity_id) = params.own_entity_id {
        query.push(format!(" AND {table_alias}.own_entity_id = "));
        query.push_bind(own_entity_id);
    }

    if let Some(date_from) = params.date_from {
        query.push(format!(" AND {table_alias}.{} >= ", module.date_column));
        query.push_bind(date_from);
    }

    if let Some(date_to) = params.date_to {
        query.push(format!(" AND {table_alias}.{} <= ", module.date_column));
        query.push_bind(date_to);
    }
}

async fn ensure_project(state: &AppState, project_id: Uuid) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM enterprise_projects WHERE id = $1 AND is_deleted = FALSE)",
    )
    .bind(project_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    if exists {
        Ok(())
    } else {
        Err(not_found("经营项目不存在"))
    }
}

async fn customer_name_by_id(state: &AppState, customer_id: Uuid) -> Result<String, ApiError> {
    sqlx::query_scalar::<_, String>(
        "SELECT name FROM enterprise_customers WHERE id = $1 AND is_deleted = FALSE",
    )
    .bind(customer_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(|| not_found("往来单位不存在"))
}

async fn own_entity_name_by_id(state: &AppState, own_entity_id: Uuid) -> Result<String, ApiError> {
    sqlx::query_scalar::<_, String>(
        "SELECT name FROM enterprise_own_entities WHERE id = $1 AND is_deleted = FALSE",
    )
    .bind(own_entity_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(|| not_found("我方主体不存在"))
}

async fn optional_counterparty(
    state: &AppState,
    payload: &Value,
    fallback_name_key: &str,
) -> Result<(Option<Uuid>, Option<String>), ApiError> {
    let counterparty_id = uuid_value(payload, "counterparty_id")?;
    let counterparty_name = match counterparty_id {
        Some(counterparty_id) => Some(customer_name_by_id(state, counterparty_id).await?),
        None => text(payload, fallback_name_key),
    };
    Ok((counterparty_id, counterparty_name))
}

async fn optional_own_entity(
    state: &AppState,
    payload: &Value,
) -> Result<(Option<Uuid>, Option<String>), ApiError> {
    let own_entity_id = uuid_value(payload, "own_entity_id")?;
    let own_entity_name = match own_entity_id {
        Some(own_entity_id) => Some(own_entity_name_by_id(state, own_entity_id).await?),
        None => text(payload, "own_entity_name"),
    };
    Ok((own_entity_id, own_entity_name))
}

fn year_param(uri: &Uri) -> i32 {
    query_map(uri)
        .get("year")
        .and_then(|value| value.parse::<i32>().ok())
        .filter(|value| (2000..=2100).contains(value))
        .unwrap_or_else(|| Utc::now().year())
}

pub async fn list_enterprise_customers(
    State(state): State<AppState>,
    uri: Uri,
) -> ApiResult<Value> {
    let params = page_params(&uri);
    let offset = (params.page - 1) * params.page_size;

    let mut count_query = QueryBuilder::new(
        "SELECT COUNT(*)::BIGINT FROM enterprise_customers c WHERE c.is_deleted = FALSE",
    );
    append_customer_filters(&mut count_query, &params, "c");
    let total = count_query
        .build_query_scalar::<i64>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    let mut items_query = QueryBuilder::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                c.*,
                COALESCE(project_totals.project_count, 0)::BIGINT AS project_count,
                COALESCE(project_totals.contract_amount_cents, 0)::BIGINT AS contract_amount_cents,
                COALESCE(issued.issued_invoice_amount_cents, 0)::BIGINT AS issued_invoice_amount_cents,
                COALESCE(received.received_invoice_amount_cents, 0)::BIGINT AS received_invoice_amount_cents,
                COALESCE(collections.collection_amount_cents, 0)::BIGINT AS collection_amount_cents,
                COALESCE(payments.payment_amount_cents, 0)::BIGINT AS payment_amount_cents,
                COALESCE(collections.collection_amount_cents, 0)::BIGINT - COALESCE(payments.payment_amount_cents, 0)::BIGINT AS cash_profit_cents,
                COALESCE(issued.issued_invoice_amount_cents, 0)::BIGINT - COALESCE(received.received_invoice_amount_cents, 0)::BIGINT AS accounting_profit_cents,
                COALESCE(issued.issued_invoice_amount_cents, 0)::BIGINT - COALESCE(collections.collection_amount_cents, 0)::BIGINT AS receivable_balance_cents,
                COALESCE(received.received_invoice_amount_cents, 0)::BIGINT - COALESCE(payments.payment_amount_cents, 0)::BIGINT AS payable_balance_cents
            FROM enterprise_customers c
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::BIGINT AS project_count, SUM(contract_amount_cents)::BIGINT AS contract_amount_cents
                FROM enterprise_projects p
                WHERE p.customer_id = c.id AND p.is_deleted = FALSE
            ) project_totals ON TRUE
            LEFT JOIN LATERAL (
                SELECT SUM(i.amount_cents)::BIGINT AS issued_invoice_amount_cents
                FROM enterprise_project_issued_invoices i
                JOIN enterprise_projects p ON p.id = i.project_id
                WHERE p.is_deleted = FALSE AND i.is_deleted = FALSE AND i.status <> 'voided'
                    AND (i.counterparty_id = c.id OR (i.counterparty_id IS NULL AND p.customer_id = c.id))
            ) issued ON TRUE
            LEFT JOIN LATERAL (
                SELECT SUM(i.amount_cents)::BIGINT AS received_invoice_amount_cents
                FROM enterprise_project_received_invoices i
                JOIN enterprise_projects p ON p.id = i.project_id
                WHERE p.is_deleted = FALSE AND i.is_deleted = FALSE AND i.status <> 'voided'
                    AND (i.counterparty_id = c.id OR (i.counterparty_id IS NULL AND p.customer_id = c.id))
            ) received ON TRUE
            LEFT JOIN LATERAL (
                SELECT SUM(r.amount_cents)::BIGINT AS collection_amount_cents
                FROM enterprise_project_collections r
                JOIN enterprise_projects p ON p.id = r.project_id
                WHERE p.is_deleted = FALSE AND r.is_deleted = FALSE AND r.status = 'confirmed'
                    AND (r.counterparty_id = c.id OR (r.counterparty_id IS NULL AND p.customer_id = c.id))
            ) collections ON TRUE
            LEFT JOIN LATERAL (
                SELECT SUM(r.amount_cents)::BIGINT AS payment_amount_cents
                FROM enterprise_project_payments r
                JOIN enterprise_projects p ON p.id = r.project_id
                WHERE p.is_deleted = FALSE AND r.is_deleted = FALSE AND r.status = 'confirmed'
                    AND (r.counterparty_id = c.id OR (r.counterparty_id IS NULL AND p.customer_id = c.id))
            ) payments ON TRUE
            WHERE c.is_deleted = FALSE
        "#,
    );
    append_customer_filters(&mut items_query, &params, "c");
    items_query
        .push(" ORDER BY c.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") row");
    let items = items_query
        .build_query_scalar::<Value>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

pub async fn get_enterprise_customer(
    State(state): State<AppState>,
    Path(customer_id): Path<Uuid>,
) -> ApiResult<Value> {
    let row = sqlx::query_scalar::<_, Value>(
        "SELECT to_jsonb(c) FROM enterprise_customers c WHERE c.id = $1 AND c.is_deleted = FALSE",
    )
    .bind(customer_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(|| not_found("往来单位不存在"))?;

    Ok(ApiSuccess::default().with_data(row))
}

pub async fn export_enterprise_customers(
    State(state): State<AppState>,
    uri: Uri,
) -> Result<Response, ApiError> {
    let params = page_params(&uri);
    let mut query = QueryBuilder::new(
        r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                c.*,
                COALESCE(project_totals.project_count, 0)::BIGINT AS project_count,
                COALESCE(project_totals.contract_amount_cents, 0)::BIGINT AS contract_amount_cents,
                COALESCE(issued.issued_invoice_amount_cents, 0)::BIGINT AS issued_invoice_amount_cents,
                COALESCE(received.received_invoice_amount_cents, 0)::BIGINT AS received_invoice_amount_cents,
                COALESCE(collections.collection_amount_cents, 0)::BIGINT AS collection_amount_cents,
                COALESCE(payments.payment_amount_cents, 0)::BIGINT AS payment_amount_cents,
                COALESCE(collections.collection_amount_cents, 0)::BIGINT - COALESCE(payments.payment_amount_cents, 0)::BIGINT AS cash_profit_cents,
                COALESCE(issued.issued_invoice_amount_cents, 0)::BIGINT - COALESCE(received.received_invoice_amount_cents, 0)::BIGINT AS accounting_profit_cents,
                COALESCE(issued.issued_invoice_amount_cents, 0)::BIGINT - COALESCE(collections.collection_amount_cents, 0)::BIGINT AS receivable_balance_cents,
                COALESCE(received.received_invoice_amount_cents, 0)::BIGINT - COALESCE(payments.payment_amount_cents, 0)::BIGINT AS payable_balance_cents
            FROM enterprise_customers c
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::BIGINT AS project_count, SUM(contract_amount_cents)::BIGINT AS contract_amount_cents
                FROM enterprise_projects p
                WHERE p.customer_id = c.id AND p.is_deleted = FALSE
            ) project_totals ON TRUE
            LEFT JOIN LATERAL (
                SELECT SUM(i.amount_cents)::BIGINT AS issued_invoice_amount_cents
                FROM enterprise_project_issued_invoices i
                JOIN enterprise_projects p ON p.id = i.project_id
                WHERE p.is_deleted = FALSE AND i.is_deleted = FALSE AND i.status <> 'voided'
                    AND (i.counterparty_id = c.id OR (i.counterparty_id IS NULL AND p.customer_id = c.id))
            ) issued ON TRUE
            LEFT JOIN LATERAL (
                SELECT SUM(i.amount_cents)::BIGINT AS received_invoice_amount_cents
                FROM enterprise_project_received_invoices i
                JOIN enterprise_projects p ON p.id = i.project_id
                WHERE p.is_deleted = FALSE AND i.is_deleted = FALSE AND i.status <> 'voided'
                    AND (i.counterparty_id = c.id OR (i.counterparty_id IS NULL AND p.customer_id = c.id))
            ) received ON TRUE
            LEFT JOIN LATERAL (
                SELECT SUM(r.amount_cents)::BIGINT AS collection_amount_cents
                FROM enterprise_project_collections r
                JOIN enterprise_projects p ON p.id = r.project_id
                WHERE p.is_deleted = FALSE AND r.is_deleted = FALSE AND r.status = 'confirmed'
                    AND (r.counterparty_id = c.id OR (r.counterparty_id IS NULL AND p.customer_id = c.id))
            ) collections ON TRUE
            LEFT JOIN LATERAL (
                SELECT SUM(r.amount_cents)::BIGINT AS payment_amount_cents
                FROM enterprise_project_payments r
                JOIN enterprise_projects p ON p.id = r.project_id
                WHERE p.is_deleted = FALSE AND r.is_deleted = FALSE AND r.status = 'confirmed'
                    AND (r.counterparty_id = c.id OR (r.counterparty_id IS NULL AND p.customer_id = c.id))
            ) payments ON TRUE
            WHERE c.is_deleted = FALSE
        "#,
    );
    append_customer_filters(&mut query, &params, "c");
    query.push(" ORDER BY c.created_at DESC) row");
    let rows = query
        .build_query_scalar::<Value>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    let mut csv = "往来单位编号,往来单位名称,统一社会信用代码,联系人,联系电话,地址,项目数,合同金额(分),开票金额(分),回款金额(分),收票金额(分),付款金额(分),应收余额(分),应付余额(分),现金毛利(分),账面毛利(分),状态,备注\n".to_string();
    for row in rows.as_array().into_iter().flatten() {
        let values = [
            "customer_code",
            "name",
            "credit_code",
            "contact_name",
            "contact_phone",
            "address",
            "project_count",
            "contract_amount_cents",
            "issued_invoice_amount_cents",
            "collection_amount_cents",
            "received_invoice_amount_cents",
            "payment_amount_cents",
            "receivable_balance_cents",
            "payable_balance_cents",
            "cash_profit_cents",
            "accounting_profit_cents",
            "status",
            "remark",
        ]
        .iter()
        .map(|key| csv_escape(&value_to_csv(row.get(*key))))
        .collect::<Vec<_>>();
        csv.push_str(&values.join(","));
        csv.push('\n');
    }

    Ok(csv_response("enterprise-customers.csv", csv))
}

pub async fn create_enterprise_customer(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    let name = required_text(&payload, "name", "往来单位名称")?;
    let row = sqlx::query_scalar::<_, Value>(
        r#"
        INSERT INTO enterprise_customers (
            customer_code, name, credit_code, contact_name, contact_phone, address,
            status, remark
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING to_jsonb(enterprise_customers)
        "#,
    )
    .bind(text(&payload, "customer_code"))
    .bind(name)
    .bind(text(&payload, "credit_code"))
    .bind(text(&payload, "contact_name"))
    .bind(text(&payload, "contact_phone"))
    .bind(text(&payload, "address"))
    .bind(text(&payload, "status").unwrap_or_else(|| "active".to_string()))
    .bind(text(&payload, "remark"))
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(row))
}

pub async fn update_enterprise_customer(
    State(state): State<AppState>,
    Path(customer_id): Path<Uuid>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    let row = sqlx::query_scalar::<_, Value>(
        r#"
        UPDATE enterprise_customers
        SET
            customer_code = COALESCE($2, customer_code),
            name = COALESCE($3, name),
            credit_code = COALESCE($4, credit_code),
            contact_name = COALESCE($5, contact_name),
            contact_phone = COALESCE($6, contact_phone),
            address = COALESCE($7, address),
            status = COALESCE($8, status),
            remark = COALESCE($9, remark)
        WHERE id = $1 AND is_deleted = FALSE
        RETURNING to_jsonb(enterprise_customers)
        "#,
    )
    .bind(customer_id)
    .bind(text(&payload, "customer_code"))
    .bind(text(&payload, "name"))
    .bind(text(&payload, "credit_code"))
    .bind(text(&payload, "contact_name"))
    .bind(text(&payload, "contact_phone"))
    .bind(text(&payload, "address"))
    .bind(text(&payload, "status"))
    .bind(text(&payload, "remark"))
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(|| not_found("往来单位不存在"))?;

    if let Some(name) = text(&payload, "name") {
        sqlx::query(
            "UPDATE enterprise_projects SET customer_name = $2 WHERE customer_id = $1 AND is_deleted = FALSE",
        )
        .bind(customer_id)
        .bind(name.clone())
        .execute(state.db.pool())
        .await
        .map_err(db_error)?;

        let record_updates = [
            ("enterprise_project_issued_invoices", "customer_name"),
            ("enterprise_project_received_invoices", "supplier_name"),
            ("enterprise_project_collections", "payer_name"),
            ("enterprise_project_payments", "payee_name"),
        ];
        for (table, column) in record_updates {
            sqlx::query(&format!(
                "UPDATE {table} SET {column} = $2 WHERE counterparty_id = $1 AND is_deleted = FALSE"
            ))
            .bind(customer_id)
            .bind(name.clone())
            .execute(state.db.pool())
            .await
            .map_err(db_error)?;
        }
    }

    Ok(ApiSuccess::default().with_data(row))
}

pub async fn delete_enterprise_customer(
    State(state): State<AppState>,
    Path(customer_id): Path<Uuid>,
) -> ApiResult<()> {
    let affected = sqlx::query(
        "UPDATE enterprise_customers SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1 AND is_deleted = FALSE",
    )
    .bind(customer_id)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?
    .rows_affected();

    if affected == 0 {
        return Err(not_found("往来单位不存在"));
    }

    Ok(ApiSuccess::default().with_data(()))
}

pub async fn get_enterprise_customer_summary(
    State(state): State<AppState>,
    Path(customer_id): Path<Uuid>,
    uri: Uri,
) -> ApiResult<Value> {
    customer_name_by_id(&state, customer_id).await?;
    let year = year_param(&uri);
    let start = NaiveDate::from_ymd_opt(year, 1, 1).ok_or_else(|| invalid_input("年份无效"))?;
    let end = NaiveDate::from_ymd_opt(year + 1, 1, 1).ok_or_else(|| invalid_input("年份无效"))?;

    let summary = sqlx::query_scalar::<_, Value>(
        r#"
        WITH project_totals AS (
            SELECT COUNT(*)::BIGINT AS project_count, COALESCE(SUM(contract_amount_cents), 0)::BIGINT AS contract_amount_cents
            FROM enterprise_projects
            WHERE customer_id = $1 AND is_deleted = FALSE
        ),
        totals AS (
            SELECT
                COALESCE((SELECT SUM(i.amount_cents)
                    FROM enterprise_project_issued_invoices i
                    JOIN enterprise_projects p ON p.id = i.project_id
                    WHERE p.is_deleted = FALSE AND i.is_deleted = FALSE
                        AND i.status <> 'voided' AND i.invoice_date >= $2 AND i.invoice_date < $3
                        AND (i.counterparty_id = $1 OR (i.counterparty_id IS NULL AND p.customer_id = $1))), 0)::BIGINT AS issued_invoice_amount_cents,
                COALESCE((SELECT SUM(i.amount_cents)
                    FROM enterprise_project_received_invoices i
                    JOIN enterprise_projects p ON p.id = i.project_id
                    WHERE p.is_deleted = FALSE AND i.is_deleted = FALSE
                        AND i.status <> 'voided' AND i.invoice_date >= $2 AND i.invoice_date < $3
                        AND (i.counterparty_id = $1 OR (i.counterparty_id IS NULL AND p.customer_id = $1))), 0)::BIGINT AS received_invoice_amount_cents,
                COALESCE((SELECT SUM(r.amount_cents)
                    FROM enterprise_project_collections r
                    JOIN enterprise_projects p ON p.id = r.project_id
                    WHERE p.is_deleted = FALSE AND r.is_deleted = FALSE
                        AND r.status = 'confirmed' AND r.collection_date >= $2 AND r.collection_date < $3
                        AND (r.counterparty_id = $1 OR (r.counterparty_id IS NULL AND p.customer_id = $1))), 0)::BIGINT AS collection_amount_cents,
                COALESCE((SELECT SUM(r.amount_cents)
                    FROM enterprise_project_payments r
                    JOIN enterprise_projects p ON p.id = r.project_id
                    WHERE p.is_deleted = FALSE AND r.is_deleted = FALSE
                        AND r.status = 'confirmed' AND r.payment_date >= $2 AND r.payment_date < $3
                        AND (r.counterparty_id = $1 OR (r.counterparty_id IS NULL AND p.customer_id = $1))), 0)::BIGINT AS payment_amount_cents
        )
        SELECT jsonb_build_object(
            'customer_id', $1,
            'year', $4,
            'project_count', project_totals.project_count,
            'contract_amount_cents', project_totals.contract_amount_cents,
            'issued_invoice_amount_cents', totals.issued_invoice_amount_cents,
            'received_invoice_amount_cents', totals.received_invoice_amount_cents,
            'collection_amount_cents', totals.collection_amount_cents,
            'payment_amount_cents', totals.payment_amount_cents,
            'cash_profit_cents', totals.collection_amount_cents - totals.payment_amount_cents,
            'accounting_profit_cents', totals.issued_invoice_amount_cents - totals.received_invoice_amount_cents,
            'receivable_balance_cents', totals.issued_invoice_amount_cents - totals.collection_amount_cents,
            'payable_balance_cents', totals.received_invoice_amount_cents - totals.payment_amount_cents,
            'collection_rate', CASE WHEN totals.issued_invoice_amount_cents > 0 THEN ROUND((totals.collection_amount_cents::numeric / totals.issued_invoice_amount_cents::numeric) * 100, 2) ELSE 0 END,
            'payment_rate', CASE WHEN totals.received_invoice_amount_cents > 0 THEN ROUND((totals.payment_amount_cents::numeric / totals.received_invoice_amount_cents::numeric) * 100, 2) ELSE 0 END
        )
        FROM project_totals, totals
        "#,
    )
    .bind(customer_id)
    .bind(start)
    .bind(end)
    .bind(year)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(summary))
}

pub async fn list_enterprise_own_entities(
    State(state): State<AppState>,
    uri: Uri,
) -> ApiResult<Value> {
    let params = page_params(&uri);
    let offset = (params.page - 1) * params.page_size;

    let mut count_query = QueryBuilder::new(
        "SELECT COUNT(*)::BIGINT FROM enterprise_own_entities e WHERE e.is_deleted = FALSE",
    );
    append_own_entity_filters(&mut count_query, &params, "e");
    let total = count_query
        .build_query_scalar::<i64>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    let mut items_query = QueryBuilder::new(
        "SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.is_default DESC, e.created_at DESC), '[]'::jsonb) FROM (SELECT * FROM enterprise_own_entities e WHERE e.is_deleted = FALSE",
    );
    append_own_entity_filters(&mut items_query, &params, "e");
    items_query
        .push(" ORDER BY e.is_default DESC, e.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") e");
    let items = items_query
        .build_query_scalar::<Value>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

pub async fn get_enterprise_own_entity(
    State(state): State<AppState>,
    Path(entity_id): Path<Uuid>,
) -> ApiResult<Value> {
    let row = sqlx::query_scalar::<_, Value>(
        "SELECT to_jsonb(e) FROM enterprise_own_entities e WHERE e.id = $1 AND e.is_deleted = FALSE",
    )
    .bind(entity_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(|| not_found("我方主体不存在"))?;

    Ok(ApiSuccess::default().with_data(row))
}

pub async fn export_enterprise_own_entities(
    State(state): State<AppState>,
    uri: Uri,
) -> Result<Response, ApiError> {
    let params = page_params(&uri);
    let mut query = QueryBuilder::new(
        "SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.is_default DESC, e.created_at DESC), '[]'::jsonb) FROM (SELECT * FROM enterprise_own_entities e WHERE e.is_deleted = FALSE",
    );
    append_own_entity_filters(&mut query, &params, "e");
    query.push(" ORDER BY e.is_default DESC, e.created_at DESC) e");
    let rows = query
        .build_query_scalar::<Value>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    let mut csv =
        "主体名称,统一社会信用代码,开户行,银行账号,联系人,联系电话,地址,是否默认,状态,备注\n"
            .to_string();
    for row in rows.as_array().into_iter().flatten() {
        let values = [
            "name",
            "credit_code",
            "bank_name",
            "bank_account",
            "contact_name",
            "contact_phone",
            "address",
            "is_default",
            "status",
            "remark",
        ]
        .iter()
        .map(|key| csv_escape(&value_to_csv(row.get(*key))))
        .collect::<Vec<_>>();
        csv.push_str(&values.join(","));
        csv.push('\n');
    }

    Ok(csv_response("enterprise-own-entities.csv", csv))
}

pub async fn create_enterprise_own_entity(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    let name = required_text(&payload, "name", "主体名称")?;
    let is_default = bool_value(&payload, "is_default").unwrap_or(false);
    if is_default {
        sqlx::query(
            "UPDATE enterprise_own_entities SET is_default = FALSE WHERE is_deleted = FALSE",
        )
        .execute(state.db.pool())
        .await
        .map_err(db_error)?;
    }

    let row = sqlx::query_scalar::<_, Value>(
        r#"
        INSERT INTO enterprise_own_entities (
            name, credit_code, bank_name, bank_account, contact_name, contact_phone,
            address, status, is_default, remark
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING to_jsonb(enterprise_own_entities)
        "#,
    )
    .bind(name)
    .bind(text(&payload, "credit_code"))
    .bind(text(&payload, "bank_name"))
    .bind(text(&payload, "bank_account"))
    .bind(text(&payload, "contact_name"))
    .bind(text(&payload, "contact_phone"))
    .bind(text(&payload, "address"))
    .bind(text(&payload, "status").unwrap_or_else(|| "active".to_string()))
    .bind(is_default)
    .bind(text(&payload, "remark"))
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(row))
}

pub async fn update_enterprise_own_entity(
    State(state): State<AppState>,
    Path(entity_id): Path<Uuid>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    let is_default = bool_value(&payload, "is_default");
    if is_default == Some(true) {
        sqlx::query(
            "UPDATE enterprise_own_entities SET is_default = FALSE WHERE id <> $1 AND is_deleted = FALSE",
        )
        .bind(entity_id)
        .execute(state.db.pool())
        .await
        .map_err(db_error)?;
    }

    let row = sqlx::query_scalar::<_, Value>(
        r#"
        UPDATE enterprise_own_entities
        SET
            name = COALESCE($2, name),
            credit_code = COALESCE($3, credit_code),
            bank_name = COALESCE($4, bank_name),
            bank_account = COALESCE($5, bank_account),
            contact_name = COALESCE($6, contact_name),
            contact_phone = COALESCE($7, contact_phone),
            address = COALESCE($8, address),
            status = COALESCE($9, status),
            is_default = COALESCE($10, is_default),
            remark = COALESCE($11, remark)
        WHERE id = $1 AND is_deleted = FALSE
        RETURNING to_jsonb(enterprise_own_entities)
        "#,
    )
    .bind(entity_id)
    .bind(text(&payload, "name"))
    .bind(text(&payload, "credit_code"))
    .bind(text(&payload, "bank_name"))
    .bind(text(&payload, "bank_account"))
    .bind(text(&payload, "contact_name"))
    .bind(text(&payload, "contact_phone"))
    .bind(text(&payload, "address"))
    .bind(text(&payload, "status"))
    .bind(is_default)
    .bind(text(&payload, "remark"))
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(|| not_found("我方主体不存在"))?;

    if let Some(name) = text(&payload, "name") {
        sqlx::query(
            "UPDATE enterprise_projects SET own_entity_name = $2 WHERE own_entity_id = $1 AND is_deleted = FALSE",
        )
        .bind(entity_id)
        .bind(&name)
        .execute(state.db.pool())
        .await
        .map_err(db_error)?;
        for table in [
            "enterprise_project_issued_invoices",
            "enterprise_project_received_invoices",
            "enterprise_project_collections",
            "enterprise_project_payments",
        ] {
            sqlx::query(&format!(
                "UPDATE {table} SET own_entity_name = $2 WHERE own_entity_id = $1 AND is_deleted = FALSE"
            ))
            .bind(entity_id)
            .bind(&name)
            .execute(state.db.pool())
            .await
            .map_err(db_error)?;
        }
    }

    Ok(ApiSuccess::default().with_data(row))
}

pub async fn delete_enterprise_own_entity(
    State(state): State<AppState>,
    Path(entity_id): Path<Uuid>,
) -> ApiResult<()> {
    let affected = sqlx::query(
        "UPDATE enterprise_own_entities SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1 AND is_deleted = FALSE",
    )
    .bind(entity_id)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?
    .rows_affected();

    if affected == 0 {
        return Err(not_found("我方主体不存在"));
    }

    Ok(ApiSuccess::default().with_data(()))
}

pub async fn list_enterprise_projects(State(state): State<AppState>, uri: Uri) -> ApiResult<Value> {
    let params = page_params(&uri);
    let offset = (params.page - 1) * params.page_size;

    let mut count_query = QueryBuilder::new(
        "SELECT COUNT(*)::BIGINT FROM enterprise_projects p WHERE p.is_deleted = FALSE",
    );
    append_project_filters(&mut count_query, &params, "p");
    let total = count_query
        .build_query_scalar::<i64>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    let mut items_query = QueryBuilder::new(
        "SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb) FROM (SELECT * FROM enterprise_projects p WHERE p.is_deleted = FALSE",
    );
    append_project_filters(&mut items_query, &params, "p");
    items_query
        .push(" ORDER BY p.created_at DESC LIMIT ")
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") p");
    let items = items_query
        .build_query_scalar::<Value>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

pub async fn get_enterprise_project(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    let row = sqlx::query_scalar::<_, Value>(
        "SELECT to_jsonb(p) FROM enterprise_projects p WHERE p.id = $1 AND p.is_deleted = FALSE",
    )
    .bind(project_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(|| not_found("经营项目不存在"))?;

    Ok(ApiSuccess::default().with_data(row))
}

pub async fn create_enterprise_project(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    let name = required_text(&payload, "name", "项目名称")?;
    let customer_id = uuid_value(&payload, "customer_id")?;
    let customer_name = match customer_id {
        Some(customer_id) => Some(customer_name_by_id(&state, customer_id).await?),
        None => text(&payload, "customer_name"),
    };
    let (own_entity_id, own_entity_name) = optional_own_entity(&state, &payload).await?;
    let row = sqlx::query_scalar::<_, Value>(
        r#"
        INSERT INTO enterprise_projects (
            project_code, name, customer_id, customer_name, own_entity_id, own_entity_name,
            contract_amount_cents, owner_name, status,
            planned_start_date, planned_end_date, actual_start_date, actual_end_date, remark
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING to_jsonb(enterprise_projects)
        "#,
    )
    .bind(text(&payload, "project_code"))
    .bind(name)
    .bind(customer_id)
    .bind(customer_name)
    .bind(own_entity_id)
    .bind(own_entity_name)
    .bind(amount_cents(
        &payload,
        "contract_amount",
        "contract_amount_cents",
    )?)
    .bind(text(&payload, "owner_name"))
    .bind(text(&payload, "status").unwrap_or_else(|| "active".to_string()))
    .bind(date(&payload, "planned_start_date")?)
    .bind(date(&payload, "planned_end_date")?)
    .bind(date(&payload, "actual_start_date")?)
    .bind(date(&payload, "actual_end_date")?)
    .bind(text(&payload, "remark"))
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(row))
}

pub async fn update_enterprise_project(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    let customer_id = uuid_value(&payload, "customer_id")?;
    let customer_name = match customer_id {
        Some(customer_id) => Some(customer_name_by_id(&state, customer_id).await?),
        None => text(&payload, "customer_name"),
    };
    let (own_entity_id, own_entity_name) = optional_own_entity(&state, &payload).await?;
    let row = sqlx::query_scalar::<_, Value>(
        r#"
        UPDATE enterprise_projects
        SET
            project_code = COALESCE($2, project_code),
            name = COALESCE($3, name),
            customer_id = COALESCE($4, customer_id),
            customer_name = COALESCE($5, customer_name),
            own_entity_id = COALESCE($6, own_entity_id),
            own_entity_name = COALESCE($7, own_entity_name),
            contract_amount_cents = COALESCE($8, contract_amount_cents),
            owner_name = COALESCE($9, owner_name),
            status = COALESCE($10, status),
            planned_start_date = COALESCE($11, planned_start_date),
            planned_end_date = COALESCE($12, planned_end_date),
            actual_start_date = COALESCE($13, actual_start_date),
            actual_end_date = COALESCE($14, actual_end_date),
            remark = COALESCE($15, remark)
        WHERE id = $1 AND is_deleted = FALSE
        RETURNING to_jsonb(enterprise_projects)
        "#,
    )
    .bind(project_id)
    .bind(text(&payload, "project_code"))
    .bind(text(&payload, "name"))
    .bind(customer_id)
    .bind(customer_name)
    .bind(own_entity_id)
    .bind(own_entity_name)
    .bind(
        if payload.get("contract_amount").is_some()
            || payload.get("contract_amount_cents").is_some()
        {
            Some(amount_cents(
                &payload,
                "contract_amount",
                "contract_amount_cents",
            )?)
        } else {
            None
        },
    )
    .bind(text(&payload, "owner_name"))
    .bind(text(&payload, "status"))
    .bind(date(&payload, "planned_start_date")?)
    .bind(date(&payload, "planned_end_date")?)
    .bind(date(&payload, "actual_start_date")?)
    .bind(date(&payload, "actual_end_date")?)
    .bind(text(&payload, "remark"))
    .fetch_optional(state.db.pool())
    .await
    .map_err(db_error)?
    .ok_or_else(|| not_found("经营项目不存在"))?;

    Ok(ApiSuccess::default().with_data(row))
}

pub async fn delete_enterprise_project(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<()> {
    let affected = sqlx::query(
        "UPDATE enterprise_projects SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1 AND is_deleted = FALSE",
    )
    .bind(project_id)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?
    .rows_affected();

    if affected == 0 {
        return Err(not_found("经营项目不存在"));
    }

    Ok(ApiSuccess::default().with_data(()))
}

pub async fn export_enterprise_projects(
    State(state): State<AppState>,
    uri: Uri,
) -> Result<Response, ApiError> {
    let params = page_params(&uri);
    let mut query = QueryBuilder::new(
        "SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb) FROM (SELECT * FROM enterprise_projects p WHERE p.is_deleted = FALSE",
    );
    append_project_filters(&mut query, &params, "p");
    query.push(" ORDER BY p.created_at DESC) p");
    let rows = query
        .build_query_scalar::<Value>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    let mut csv =
        "项目编号,项目名称,往来单位,我方主体,合同金额(分),负责人,状态,计划开始,计划结束,备注\n"
            .to_string();
    for row in rows.as_array().into_iter().flatten() {
        let values = [
            "project_code",
            "name",
            "customer_name",
            "own_entity_name",
            "contract_amount_cents",
            "owner_name",
            "status",
            "planned_start_date",
            "planned_end_date",
            "remark",
        ]
        .iter()
        .map(|key| csv_escape(&value_to_csv(row.get(*key))))
        .collect::<Vec<_>>();
        csv.push_str(&values.join(","));
        csv.push('\n');
    }

    Ok(csv_response("enterprise-projects.csv", csv))
}

async fn create_record(
    state: AppState,
    project_id: Uuid,
    payload: Value,
    module: RecordModule,
) -> ApiResult<Value> {
    ensure_project(&state, project_id).await?;
    let amount = amount_cents(&payload, "amount", "amount_cents")?;
    let tax_rate = optional_f64(&payload, "tax_rate")?;
    let attachments = attachments(&payload)?;
    let (own_entity_id, own_entity_name) = optional_own_entity(&state, &payload).await?;

    let sql = match module.table {
        "enterprise_project_issued_invoices" => {
            r#"
            INSERT INTO enterprise_project_issued_invoices
                (project_id, counterparty_id, customer_name, own_entity_id, own_entity_name, invoice_no, invoice_date, amount_cents, tax_rate, attachments, status, remark)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING to_jsonb(enterprise_project_issued_invoices)
            "#
        }
        "enterprise_project_received_invoices" => {
            r#"
            INSERT INTO enterprise_project_received_invoices
                (project_id, counterparty_id, supplier_name, own_entity_id, own_entity_name, invoice_no, invoice_date, amount_cents, tax_rate, expense_type, attachments, status, remark)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING to_jsonb(enterprise_project_received_invoices)
            "#
        }
        "enterprise_project_collections" => {
            r#"
            INSERT INTO enterprise_project_collections
                (project_id, issued_invoice_id, counterparty_id, payer_name, own_entity_id, own_entity_name, collection_date, amount_cents, account_name, attachments, status, remark)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING to_jsonb(enterprise_project_collections)
            "#
        }
        "enterprise_project_payments" => {
            r#"
            INSERT INTO enterprise_project_payments
                (project_id, received_invoice_id, counterparty_id, payee_name, own_entity_id, own_entity_name, payment_date, amount_cents, account_name, attachments, status, remark)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING to_jsonb(enterprise_project_payments)
            "#
        }
        _ => unreachable!(),
    };

    let row = match module.table {
        "enterprise_project_issued_invoices" => {
            let (counterparty_id, customer_name) =
                optional_counterparty(&state, &payload, "customer_name").await?;
            sqlx::query_scalar::<_, Value>(sql)
                .bind(project_id)
                .bind(counterparty_id)
                .bind(customer_name)
                .bind(own_entity_id)
                .bind(own_entity_name.clone())
                .bind(text(&payload, "invoice_no"))
                .bind(
                    date(&payload, "invoice_date")?
                        .ok_or_else(|| invalid_input("开票日期不能为空"))?,
                )
                .bind(amount)
                .bind(tax_rate)
                .bind(attachments.clone())
                .bind(text(&payload, "status").unwrap_or_else(|| "issued".to_string()))
                .bind(text(&payload, "remark"))
                .fetch_one(state.db.pool())
                .await
        }
        "enterprise_project_received_invoices" => {
            let (counterparty_id, supplier_name) =
                optional_counterparty(&state, &payload, "supplier_name").await?;
            sqlx::query_scalar::<_, Value>(sql)
                .bind(project_id)
                .bind(counterparty_id)
                .bind(supplier_name)
                .bind(own_entity_id)
                .bind(own_entity_name.clone())
                .bind(text(&payload, "invoice_no"))
                .bind(
                    date(&payload, "invoice_date")?
                        .ok_or_else(|| invalid_input("收票日期不能为空"))?,
                )
                .bind(amount)
                .bind(tax_rate)
                .bind(text(&payload, "expense_type"))
                .bind(attachments.clone())
                .bind(text(&payload, "status").unwrap_or_else(|| "received".to_string()))
                .bind(text(&payload, "remark"))
                .fetch_one(state.db.pool())
                .await
        }
        "enterprise_project_collections" => {
            let (counterparty_id, payer_name) =
                optional_counterparty(&state, &payload, "payer_name").await?;
            sqlx::query_scalar::<_, Value>(sql)
                .bind(project_id)
                .bind(uuid_value(&payload, "issued_invoice_id")?)
                .bind(counterparty_id)
                .bind(payer_name)
                .bind(own_entity_id)
                .bind(own_entity_name.clone())
                .bind(
                    date(&payload, "collection_date")?
                        .ok_or_else(|| invalid_input("回款日期不能为空"))?,
                )
                .bind(amount)
                .bind(text(&payload, "account_name"))
                .bind(attachments.clone())
                .bind(text(&payload, "status").unwrap_or_else(|| "confirmed".to_string()))
                .bind(text(&payload, "remark"))
                .fetch_one(state.db.pool())
                .await
        }
        "enterprise_project_payments" => {
            let (counterparty_id, payee_name) =
                optional_counterparty(&state, &payload, "payee_name").await?;
            sqlx::query_scalar::<_, Value>(sql)
                .bind(project_id)
                .bind(uuid_value(&payload, "received_invoice_id")?)
                .bind(counterparty_id)
                .bind(payee_name)
                .bind(own_entity_id)
                .bind(own_entity_name)
                .bind(
                    date(&payload, "payment_date")?
                        .ok_or_else(|| invalid_input("付款日期不能为空"))?,
                )
                .bind(amount)
                .bind(text(&payload, "account_name"))
                .bind(attachments)
                .bind(text(&payload, "status").unwrap_or_else(|| "confirmed".to_string()))
                .bind(text(&payload, "remark"))
                .fetch_one(state.db.pool())
                .await
        }
        _ => unreachable!(),
    }
    .map_err(db_error)?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(row))
}

async fn update_record(
    state: AppState,
    project_id: Uuid,
    record_id: Uuid,
    payload: Value,
    module: RecordModule,
) -> ApiResult<Value> {
    ensure_project(&state, project_id).await?;
    let amount = if payload.get("amount").is_some() || payload.get("amount_cents").is_some() {
        Some(amount_cents(&payload, "amount", "amount_cents")?)
    } else {
        None
    };
    let tax_rate = optional_f64(&payload, "tax_rate")?;
    let attachments = optional_attachments(&payload)?;
    let (own_entity_id, own_entity_name) = optional_own_entity(&state, &payload).await?;

    let row = match module.table {
        "enterprise_project_issued_invoices" => {
            let (counterparty_id, customer_name) =
                optional_counterparty(&state, &payload, "customer_name").await?;
            sqlx::query_scalar::<_, Value>(
                r#"
            UPDATE enterprise_project_issued_invoices
            SET counterparty_id = COALESCE($3, counterparty_id),
                customer_name = COALESCE($4, customer_name),
                own_entity_id = COALESCE($5, own_entity_id),
                own_entity_name = COALESCE($6, own_entity_name),
                invoice_no = COALESCE($7, invoice_no),
                invoice_date = COALESCE($8, invoice_date),
                amount_cents = COALESCE($9, amount_cents),
                tax_rate = COALESCE($10, tax_rate),
                attachments = COALESCE($11, attachments),
                status = COALESCE($12, status),
                remark = COALESCE($13, remark)
            WHERE project_id = $1 AND id = $2 AND is_deleted = FALSE
            RETURNING to_jsonb(enterprise_project_issued_invoices)
            "#,
            )
            .bind(project_id)
            .bind(record_id)
            .bind(counterparty_id)
            .bind(customer_name)
            .bind(own_entity_id)
            .bind(own_entity_name.clone())
            .bind(text(&payload, "invoice_no"))
            .bind(date(&payload, "invoice_date")?)
            .bind(amount)
            .bind(tax_rate)
            .bind(attachments.clone())
            .bind(text(&payload, "status"))
            .bind(text(&payload, "remark"))
            .fetch_optional(state.db.pool())
            .await
        }
        "enterprise_project_received_invoices" => {
            let (counterparty_id, supplier_name) =
                optional_counterparty(&state, &payload, "supplier_name").await?;
            sqlx::query_scalar::<_, Value>(
                r#"
            UPDATE enterprise_project_received_invoices
            SET counterparty_id = COALESCE($3, counterparty_id),
                supplier_name = COALESCE($4, supplier_name),
                own_entity_id = COALESCE($5, own_entity_id),
                own_entity_name = COALESCE($6, own_entity_name),
                invoice_no = COALESCE($7, invoice_no),
                invoice_date = COALESCE($8, invoice_date),
                amount_cents = COALESCE($9, amount_cents),
                tax_rate = COALESCE($10, tax_rate),
                expense_type = COALESCE($11, expense_type),
                attachments = COALESCE($12, attachments),
                status = COALESCE($13, status),
                remark = COALESCE($14, remark)
            WHERE project_id = $1 AND id = $2 AND is_deleted = FALSE
            RETURNING to_jsonb(enterprise_project_received_invoices)
            "#,
            )
            .bind(project_id)
            .bind(record_id)
            .bind(counterparty_id)
            .bind(supplier_name)
            .bind(own_entity_id)
            .bind(own_entity_name.clone())
            .bind(text(&payload, "invoice_no"))
            .bind(date(&payload, "invoice_date")?)
            .bind(amount)
            .bind(tax_rate)
            .bind(text(&payload, "expense_type"))
            .bind(attachments.clone())
            .bind(text(&payload, "status"))
            .bind(text(&payload, "remark"))
            .fetch_optional(state.db.pool())
            .await
        }
        "enterprise_project_collections" => {
            let (counterparty_id, payer_name) =
                optional_counterparty(&state, &payload, "payer_name").await?;
            sqlx::query_scalar::<_, Value>(
                r#"
            UPDATE enterprise_project_collections
            SET issued_invoice_id = COALESCE($3, issued_invoice_id),
                counterparty_id = COALESCE($4, counterparty_id),
                payer_name = COALESCE($5, payer_name),
                own_entity_id = COALESCE($6, own_entity_id),
                own_entity_name = COALESCE($7, own_entity_name),
                collection_date = COALESCE($8, collection_date),
                amount_cents = COALESCE($9, amount_cents),
                account_name = COALESCE($10, account_name),
                attachments = COALESCE($11, attachments),
                status = COALESCE($12, status),
                remark = COALESCE($13, remark)
            WHERE project_id = $1 AND id = $2 AND is_deleted = FALSE
            RETURNING to_jsonb(enterprise_project_collections)
            "#,
            )
            .bind(project_id)
            .bind(record_id)
            .bind(uuid_value(&payload, "issued_invoice_id")?)
            .bind(counterparty_id)
            .bind(payer_name)
            .bind(own_entity_id)
            .bind(own_entity_name.clone())
            .bind(date(&payload, "collection_date")?)
            .bind(amount)
            .bind(text(&payload, "account_name"))
            .bind(attachments.clone())
            .bind(text(&payload, "status"))
            .bind(text(&payload, "remark"))
            .fetch_optional(state.db.pool())
            .await
        }
        "enterprise_project_payments" => {
            let (counterparty_id, payee_name) =
                optional_counterparty(&state, &payload, "payee_name").await?;
            sqlx::query_scalar::<_, Value>(
                r#"
            UPDATE enterprise_project_payments
            SET received_invoice_id = COALESCE($3, received_invoice_id),
                counterparty_id = COALESCE($4, counterparty_id),
                payee_name = COALESCE($5, payee_name),
                own_entity_id = COALESCE($6, own_entity_id),
                own_entity_name = COALESCE($7, own_entity_name),
                payment_date = COALESCE($8, payment_date),
                amount_cents = COALESCE($9, amount_cents),
                account_name = COALESCE($10, account_name),
                attachments = COALESCE($11, attachments),
                status = COALESCE($12, status),
                remark = COALESCE($13, remark)
            WHERE project_id = $1 AND id = $2 AND is_deleted = FALSE
            RETURNING to_jsonb(enterprise_project_payments)
            "#,
            )
            .bind(project_id)
            .bind(record_id)
            .bind(uuid_value(&payload, "received_invoice_id")?)
            .bind(counterparty_id)
            .bind(payee_name)
            .bind(own_entity_id)
            .bind(own_entity_name)
            .bind(date(&payload, "payment_date")?)
            .bind(amount)
            .bind(text(&payload, "account_name"))
            .bind(attachments)
            .bind(text(&payload, "status"))
            .bind(text(&payload, "remark"))
            .fetch_optional(state.db.pool())
            .await
        }
        _ => unreachable!(),
    }
    .map_err(db_error)?
    .ok_or_else(|| not_found("流水记录不存在"))?;

    Ok(ApiSuccess::default().with_data(row))
}

async fn delete_record(
    state: AppState,
    project_id: Uuid,
    record_id: Uuid,
    module: RecordModule,
) -> ApiResult<()> {
    ensure_project(&state, project_id).await?;
    let affected = sqlx::query(&format!(
        "UPDATE {} SET is_deleted = TRUE, deleted_at = NOW() WHERE project_id = $1 AND id = $2 AND is_deleted = FALSE",
        module.table
    ))
    .bind(project_id)
    .bind(record_id)
    .execute(state.db.pool())
    .await
    .map_err(db_error)?
    .rows_affected();

    if affected == 0 {
        return Err(not_found("流水记录不存在"));
    }

    Ok(ApiSuccess::default().with_data(()))
}

async fn list_records(
    state: AppState,
    project_id: Uuid,
    uri: Uri,
    module: RecordModule,
) -> ApiResult<Value> {
    ensure_project(&state, project_id).await?;
    let params = page_params(&uri);
    let offset = (params.page - 1) * params.page_size;

    let mut count_query = QueryBuilder::new(format!(
        "SELECT COUNT(*)::BIGINT FROM {} r WHERE r.is_deleted = FALSE AND r.project_id = ",
        module.table
    ));
    count_query.push_bind(project_id);
    append_record_filters(&mut count_query, module, &params, "r");
    let total = count_query
        .build_query_scalar::<i64>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    let mut items_query = QueryBuilder::new(format!(
        "SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.{} DESC, r.created_at DESC), '[]'::jsonb) FROM (SELECT * FROM {} r WHERE r.is_deleted = FALSE AND r.project_id = ",
        module.date_column, module.table
    ));
    items_query.push_bind(project_id);
    append_record_filters(&mut items_query, module, &params, "r");
    items_query
        .push(format!(
            " ORDER BY r.{} DESC, r.created_at DESC LIMIT ",
            module.date_column
        ))
        .push_bind(params.page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .push(") r");

    let items = items_query
        .build_query_scalar::<Value>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(json!({
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    })))
}

async fn export_records(
    state: AppState,
    project_id: Uuid,
    uri: Uri,
    module: RecordModule,
    filename: &str,
) -> Result<Response, ApiError> {
    ensure_project(&state, project_id).await?;
    let params = page_params(&uri);
    let mut query = QueryBuilder::new(format!(
        "SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.{} DESC, r.created_at DESC), '[]'::jsonb) FROM (SELECT * FROM {} r WHERE r.is_deleted = FALSE AND r.project_id = ",
        module.date_column, module.table
    ));
    query.push_bind(project_id);
    append_record_filters(&mut query, module, &params, "r");
    query.push(format!(
        " ORDER BY r.{} DESC, r.created_at DESC) r",
        module.date_column
    ));
    let rows = query
        .build_query_scalar::<Value>()
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;

    let mut csv = module
        .export_headers
        .iter()
        .map(|(_, label)| *label)
        .collect::<Vec<_>>()
        .join(",");
    csv.push('\n');
    for row in rows.as_array().into_iter().flatten() {
        let values = module
            .export_headers
            .iter()
            .map(|(key, _)| csv_escape(&value_to_csv(row.get(*key))))
            .collect::<Vec<_>>();
        csv.push_str(&values.join(","));
        csv.push('\n');
    }

    Ok(csv_response(filename, csv))
}

pub async fn get_enterprise_project_summary(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Value> {
    ensure_project(&state, project_id).await?;

    let summary = sqlx::query_scalar::<_, Value>(
        r#"
        WITH totals AS (
            SELECT
                COALESCE((SELECT SUM(amount_cents) FROM enterprise_project_issued_invoices WHERE project_id = $1 AND is_deleted = FALSE AND status <> 'voided'), 0)::BIGINT AS issued_invoice_amount_cents,
                COALESCE((SELECT SUM(amount_cents) FROM enterprise_project_received_invoices WHERE project_id = $1 AND is_deleted = FALSE AND status <> 'voided'), 0)::BIGINT AS received_invoice_amount_cents,
                COALESCE((SELECT SUM(amount_cents) FROM enterprise_project_collections WHERE project_id = $1 AND is_deleted = FALSE AND status = 'confirmed'), 0)::BIGINT AS collection_amount_cents,
                COALESCE((SELECT SUM(amount_cents) FROM enterprise_project_payments WHERE project_id = $1 AND is_deleted = FALSE AND status = 'confirmed'), 0)::BIGINT AS payment_amount_cents
        )
        SELECT jsonb_build_object(
            'project_id', $1,
            'issued_invoice_amount_cents', issued_invoice_amount_cents,
            'received_invoice_amount_cents', received_invoice_amount_cents,
            'collection_amount_cents', collection_amount_cents,
            'payment_amount_cents', payment_amount_cents,
            'cash_profit_cents', collection_amount_cents - payment_amount_cents,
            'accounting_profit_cents', issued_invoice_amount_cents - received_invoice_amount_cents,
            'receivable_balance_cents', issued_invoice_amount_cents - collection_amount_cents,
            'payable_balance_cents', received_invoice_amount_cents - payment_amount_cents
        )
        FROM totals
        "#,
    )
    .bind(project_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(db_error)?;

    Ok(ApiSuccess::default().with_data(summary))
}

pub async fn list_issued_invoices(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> ApiResult<Value> {
    list_records(state, project_id, uri, ISSUED_INVOICES).await
}

pub async fn create_issued_invoice(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    create_record(state, project_id, payload, ISSUED_INVOICES).await
}

pub async fn export_issued_invoices(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> Result<Response, ApiError> {
    export_records(
        state,
        project_id,
        uri,
        ISSUED_INVOICES,
        "issued-invoices.csv",
    )
    .await
}

pub async fn update_issued_invoice(
    State(state): State<AppState>,
    Path((project_id, record_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    update_record(state, project_id, record_id, payload, ISSUED_INVOICES).await
}

pub async fn delete_issued_invoice(
    State(state): State<AppState>,
    Path((project_id, record_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    delete_record(state, project_id, record_id, ISSUED_INVOICES).await
}

pub async fn list_received_invoices(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> ApiResult<Value> {
    list_records(state, project_id, uri, RECEIVED_INVOICES).await
}

pub async fn create_received_invoice(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    create_record(state, project_id, payload, RECEIVED_INVOICES).await
}

pub async fn export_received_invoices(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> Result<Response, ApiError> {
    export_records(
        state,
        project_id,
        uri,
        RECEIVED_INVOICES,
        "received-invoices.csv",
    )
    .await
}

pub async fn update_received_invoice(
    State(state): State<AppState>,
    Path((project_id, record_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    update_record(state, project_id, record_id, payload, RECEIVED_INVOICES).await
}

pub async fn delete_received_invoice(
    State(state): State<AppState>,
    Path((project_id, record_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    delete_record(state, project_id, record_id, RECEIVED_INVOICES).await
}

pub async fn list_collections(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> ApiResult<Value> {
    list_records(state, project_id, uri, COLLECTIONS).await
}

pub async fn create_collection(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    create_record(state, project_id, payload, COLLECTIONS).await
}

pub async fn export_collections(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> Result<Response, ApiError> {
    export_records(state, project_id, uri, COLLECTIONS, "collections.csv").await
}

pub async fn update_collection(
    State(state): State<AppState>,
    Path((project_id, record_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    update_record(state, project_id, record_id, payload, COLLECTIONS).await
}

pub async fn delete_collection(
    State(state): State<AppState>,
    Path((project_id, record_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    delete_record(state, project_id, record_id, COLLECTIONS).await
}

pub async fn list_payments(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> ApiResult<Value> {
    list_records(state, project_id, uri, PAYMENTS).await
}

pub async fn create_payment(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    create_record(state, project_id, payload, PAYMENTS).await
}

pub async fn export_payments(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    uri: Uri,
) -> Result<Response, ApiError> {
    export_records(state, project_id, uri, PAYMENTS, "payments.csv").await
}

pub async fn update_payment(
    State(state): State<AppState>,
    Path((project_id, record_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<Value>,
) -> ApiResult<Value> {
    update_record(state, project_id, record_id, payload, PAYMENTS).await
}

pub async fn delete_payment(
    State(state): State<AppState>,
    Path((project_id, record_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<()> {
    delete_record(state, project_id, record_id, PAYMENTS).await
}
