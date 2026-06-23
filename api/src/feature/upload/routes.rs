use axum::{
    Extension, Router,
    extract::{Multipart, State},
    http::StatusCode,
    middleware,
    routing::post,
};
use bytes::Bytes;
use uuid::Uuid;

use crate::{
    feature::auth::AuthUser,
    infrastructure::web::{
        middleware::auth_middleware,
        response::{ApiError, ApiResult, ApiSuccess},
    },
    state::AppState,
};

pub fn upload_routes() -> Router<AppState> {
    Router::new()
        .route("/", post(upload_file))
        .route_layer(middleware::from_fn(auth_middleware))
}

struct UploadRequest {
    file: Bytes,
    original_filename: Option<String>,
    content_type: String,
    biz_type: Option<String>,
    biz_id: Option<Uuid>,
    field_key: Option<String>,
}

async fn upload_file(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    mut multipart: Multipart,
) -> ApiResult<serde_json::Value> {
    let mut file: Option<Bytes> = None;
    let mut original_filename: Option<String> = None;
    let mut content_type = "application/octet-stream".to_string();
    let mut biz_type: Option<String> = None;
    let mut biz_id: Option<Uuid> = None;
    let mut field_key: Option<String> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message(format!("Failed to parse multipart: {e}"))
    })? {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                original_filename = field.file_name().map(ToString::to_string);
                content_type = field
                    .content_type()
                    .filter(|v| !v.trim().is_empty())
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let bytes = field.bytes().await.map_err(|e| {
                    ApiError::default()
                        .with_code(StatusCode::BAD_REQUEST)
                        .with_message(format!("Failed to read file data: {e}"))
                })?;
                if bytes.len() > state.config.upload.max_upload_size {
                    return Err(ApiError::default()
                        .with_code(StatusCode::BAD_REQUEST)
                        .with_message(format!(
                            "File too large. Maximum allowed size is {} bytes",
                            state.config.upload.max_upload_size
                        )));
                }
                file = Some(bytes);
            }
            "biz_type" => biz_type = read_text_field(field).await?,
            "biz_id" => {
                if let Some(value) = read_text_field(field).await? {
                    biz_id = Some(Uuid::parse_str(&value).map_err(|_| {
                        ApiError::default()
                            .with_code(StatusCode::BAD_REQUEST)
                            .with_message("biz_id must be a UUID")
                    })?);
                }
            }
            "field_key" => field_key = read_text_field(field).await?,
            _ => {}
        }
    }

    let req = UploadRequest {
        file: file.ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_message("Missing 'file' field in multipart form")
        })?,
        original_filename,
        content_type,
        biz_type,
        biz_id,
        field_key,
    };

    let object_key = build_object_key(&req);
    let size_bytes = req.file.len() as i64;

    state
        .storage
        .put(&object_key, req.file.clone(), &req.content_type)
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    let public_url = state.storage.public_url(&object_key);
    let record = sqlx::query_scalar::<_, serde_json::Value>(
        r#"
        INSERT INTO upload_files (
            biz_type,
            biz_id,
            field_key,
            original_filename,
            object_key,
            bucket,
            endpoint,
            public_base_url,
            public_url,
            storage_driver,
            content_type,
            size_bytes,
            uploaded_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING to_jsonb(upload_files.*)
        "#,
    )
    .bind(req.biz_type)
    .bind(req.biz_id)
    .bind(req.field_key)
    .bind(req.original_filename)
    .bind(&object_key)
    .bind(state.storage.bucket())
    .bind(state.storage.endpoint())
    .bind(state.storage.public_base_url())
    .bind(&public_url)
    .bind(state.storage.driver())
    .bind(&req.content_type)
    .bind(size_bytes)
    .bind(auth_user.user_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(|e| ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_data(record)
        .with_message("File uploaded successfully"))
}

async fn read_text_field(
    field: axum::extract::multipart::Field<'_>,
) -> Result<Option<String>, ApiError> {
    let value = field.text().await.map_err(|e| {
        ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message(format!("Failed to read form field: {e}"))
    })?;
    let trimmed = value.trim();
    Ok((!trimmed.is_empty()).then(|| trimmed.to_string()))
}

fn build_object_key(req: &UploadRequest) -> String {
    let biz_type = req
        .biz_type
        .as_deref()
        .map(sanitize_segment)
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "common".to_string());
    let biz_id = req
        .biz_id
        .map(|v| v.to_string())
        .unwrap_or_else(|| "unbound".to_string());
    let field_key = req
        .field_key
        .as_deref()
        .map(sanitize_segment)
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "file".to_string());
    let filename = req
        .original_filename
        .as_deref()
        .map(sanitize_filename)
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| format!("file{}", extension_for_content_type(&req.content_type)));

    format!(
        "uploads/{biz_type}/{biz_id}/{field_key}/{}-{filename}",
        Uuid::new_v4()
    )
}

fn extension_for_content_type(content_type: &str) -> &'static str {
    match content_type {
        "image/jpeg" => ".jpg",
        "image/png" => ".png",
        "image/webp" => ".webp",
        "image/gif" => ".gif",
        "application/pdf" => ".pdf",
        _ => "",
    }
}

fn sanitize_segment(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
        .collect()
}

fn sanitize_filename(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '_'
            }
        })
        .collect()
}
