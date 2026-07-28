use std::io::Cursor;

use axum::{
    Json, Router,
    extract::{
        DefaultBodyLimit, Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use bytes::Bytes;
use chrono::{DateTime, Utc};
use image::{ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::state::AppState;

const B_VENDOR_DEVICE_TYPE: &str = "B厂家";
const WORKERS_EVENT: &str = "workers";
const PHOTO_EVENT: &str = "photo";
const PHOTO_SOURCE: &str = "device_vendor_b_photo";
const PHOTO_JSON_LIMIT_BYTES: usize = 30 * 1024 * 1024;
const MAX_PHOTO_PIXELS: u64 = 100_000_000;

const FIND_EXISTING_PHOTO_SQL: &str = r#"
SELECT COALESCE(
    NULLIF(BTRIM(record.photo_path), ''),
    (
        SELECT NULLIF(BTRIM(photo.photo_data), '')
        FROM construction_attendance_record_photos photo
        WHERE photo.attendance_record_id = record.id
          AND photo.source = $4
        ORDER BY photo.created_at DESC, photo.id DESC
        LIMIT 1
    )
)
FROM construction_attendance_records record
WHERE record.is_deleted = FALSE
  AND record.worker_id = $1
  AND record.serial_number = $2
  AND record.original_time = $3
ORDER BY record.created_at ASC, record.id ASC
LIMIT 1
"#;

const DOWNLOAD_WORKERS_SQL: &str = r#"
WITH matched_device AS (
    SELECT project_id
    FROM construction_attendance_devices
    WHERE is_deleted = FALSE
      AND device_type = $1
      AND BTRIM(serial_number) = $2
    LIMIT 1
)
SELECT
    worker.id,
    worker.project_id,
    worker.name,
    worker.id_card,
    worker.avatar,
    worker.is_deleted,
    worker.work_status,
    GREATEST(
        worker.updated_at,
        COALESCE(zhenhai.updated_at, worker.updated_at),
        COALESCE(ningbo.updated_at, worker.updated_at),
        COALESCE(jinhua.updated_at, worker.updated_at)
    ) AS changed_at,
    zhenhai.external_person_id AS user_id,
    ningbo.external_person_id AS worker_code,
    jinhua.external_person_id AS jh_worker_code
FROM construction_workers worker
JOIN matched_device device ON device.project_id = worker.project_id
LEFT JOIN LATERAL (
    SELECT identity.external_person_id, identity.updated_at
    FROM integration_person_identities identity
    JOIN integration_platforms platform
      ON platform.id = identity.platform_id
     AND platform.is_deleted = FALSE
     AND platform.code = 'zhenhai'
    WHERE identity.is_deleted = FALSE
      AND identity.identity_type = 'id_card'
      AND identity.identity_value = UPPER(BTRIM(worker.id_card))
    ORDER BY identity.updated_at DESC
    LIMIT 1
) zhenhai ON TRUE
LEFT JOIN LATERAL (
    SELECT identity.external_person_id, identity.updated_at
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
) ningbo ON TRUE
LEFT JOIN LATERAL (
    SELECT identity.external_person_id, identity.updated_at
    FROM integration_person_identities identity
    JOIN integration_platforms platform
      ON platform.id = identity.platform_id
     AND platform.is_deleted = FALSE
     AND platform.code IN ('jinhua', 'jinhua_housing')
    WHERE identity.is_deleted = FALSE
      AND identity.identity_type = 'id_card'
      AND identity.identity_value = UPPER(BTRIM(worker.id_card))
    ORDER BY identity.updated_at DESC
    LIMIT 1
) jinhua ON TRUE
WHERE (
        $3::TIMESTAMPTZ IS NULL
        AND worker.is_deleted = FALSE
        AND COALESCE(worker.work_status, 1) <> 2
    )
    OR (
        $3::TIMESTAMPTZ IS NOT NULL
        AND GREATEST(
            worker.updated_at,
            COALESCE(zhenhai.updated_at, worker.updated_at),
            COALESCE(ningbo.updated_at, worker.updated_at),
            COALESCE(jinhua.updated_at, worker.updated_at)
        ) > $3
    )
ORDER BY changed_at, worker.id
"#;

const DOWNLOAD_DELETED_WORKERS_SQL: &str = r#"
WITH matched_device AS (
    SELECT project_id
    FROM construction_attendance_devices
    WHERE is_deleted = FALSE
      AND device_type = $1
      AND BTRIM(serial_number) = $2
    LIMIT 1
), deleted_events AS (
    SELECT DISTINCT ON (event.aggregate_id)
        event.aggregate_id,
        event.project_id,
        event.payload -> 'deleted_snapshot' AS snapshot,
        event.created_at
    FROM integration_outbox_events event
    JOIN matched_device device ON device.project_id = event.project_id
    WHERE event.event_type = 'construction.worker.changed'
      AND event.aggregate_type = 'worker'
      AND event.payload ->> 'operation' = 'delete'
      AND event.payload ? 'deleted_snapshot'
      AND event.created_at > $3
    ORDER BY event.aggregate_id, event.created_at DESC, event.id DESC
)
SELECT
    event.aggregate_id AS id,
    event.project_id,
    NULLIF(event.snapshot ->> 'name', '') AS name,
    NULLIF(event.snapshot ->> 'id_card', '') AS id_card,
    NULLIF(event.snapshot ->> 'avatar', '') AS avatar,
    TRUE AS is_deleted,
    2::SMALLINT AS work_status,
    event.created_at AS changed_at,
    zhenhai.external_person_id AS user_id,
    ningbo.external_person_id AS worker_code,
    jinhua.external_person_id AS jh_worker_code
FROM deleted_events event
LEFT JOIN LATERAL (
    SELECT identity.external_person_id
    FROM integration_person_identities identity
    JOIN integration_platforms platform
      ON platform.id = identity.platform_id
     AND platform.is_deleted = FALSE
     AND platform.code = 'zhenhai'
    WHERE identity.is_deleted = FALSE
      AND identity.identity_type = 'id_card'
      AND identity.identity_value = UPPER(BTRIM(event.snapshot ->> 'id_card'))
    ORDER BY identity.updated_at DESC
    LIMIT 1
) zhenhai ON TRUE
LEFT JOIN LATERAL (
    SELECT identity.external_person_id
    FROM integration_person_identities identity
    JOIN integration_platforms platform
      ON platform.id = identity.platform_id
     AND platform.is_deleted = FALSE
     AND platform.code = 'ningbo_housing'
    WHERE identity.is_deleted = FALSE
      AND identity.identity_type = 'id_card'
      AND identity.identity_value = UPPER(BTRIM(event.snapshot ->> 'id_card'))
    ORDER BY identity.updated_at DESC
    LIMIT 1
) ningbo ON TRUE
LEFT JOIN LATERAL (
    SELECT identity.external_person_id
    FROM integration_person_identities identity
    JOIN integration_platforms platform
      ON platform.id = identity.platform_id
     AND platform.is_deleted = FALSE
     AND platform.code IN ('jinhua', 'jinhua_housing')
    WHERE identity.is_deleted = FALSE
      AND identity.identity_type = 'id_card'
      AND identity.identity_value = UPPER(BTRIM(event.snapshot ->> 'id_card'))
    ORDER BY identity.updated_at DESC
    LIMIT 1
) jinhua ON TRUE
ORDER BY changed_at, id
"#;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/workers", get(download_workers))
        .route("/photo", post(upload_attendance_photo))
        .layer(DefaultBodyLimit::max(PHOTO_JSON_LIMIT_BYTES))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadWorkersQuery {
    device_id: String,
    #[serde(default = "default_product_id")]
    product_id: String,
    update: Option<String>,
}

fn default_product_id() -> String {
    "1".to_owned()
}

#[derive(Debug, Serialize)]
struct VendorResponse<T> {
    success: bool,
    code: u16,
    message: String,
    time: i64,
    data: T,
    event: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VendorWorker {
    update: String,
    name: String,
    worker_id: String,
    photo: String,
    project_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    id_card_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    del: Option<String>,
    user_id: Option<String>,
    worker_code: Option<String>,
    jh_worker_code: Option<String>,
}

type WorkerRow = (
    Uuid,
    Uuid,
    Option<String>,
    Option<String>,
    Option<String>,
    bool,
    i16,
    DateTime<Utc>,
    Option<String>,
    Option<String>,
    Option<String>,
);

async fn download_workers(
    State(state): State<AppState>,
    query: Result<Query<DownloadWorkersQuery>, QueryRejection>,
) -> Result<Json<VendorResponse<Vec<VendorWorker>>>, VendorError> {
    let snapshot_time = Utc::now().timestamp();
    let Query(query) =
        query.map_err(|_| VendorError::bad_request("请求参数错误，deviceId为必传参数"))?;
    let device_id = required_trimmed(&query.device_id, "deviceId")?;
    let _product_id = required_trimmed(&query.product_id, "productId")?;
    let updated_after = parse_update(query.update.as_deref())?;
    let is_incremental = updated_after.is_some();
    let deleted_updated_after = updated_after;

    ensure_b_vendor_device(state.db.pool(), device_id).await?;

    let mut rows = sqlx::query_as::<_, WorkerRow>(DOWNLOAD_WORKERS_SQL)
        .bind(B_VENDOR_DEVICE_TYPE)
        .bind(device_id)
        .bind(updated_after)
        .fetch_all(state.db.pool())
        .await
        .map_err(|error| VendorError::internal(error.to_string()))?;

    if let Some(updated_after) = deleted_updated_after {
        let deleted_rows = sqlx::query_as::<_, WorkerRow>(DOWNLOAD_DELETED_WORKERS_SQL)
            .bind(B_VENDOR_DEVICE_TYPE)
            .bind(device_id)
            .bind(updated_after)
            .fetch_all(state.db.pool())
            .await
            .map_err(|error| VendorError::internal(error.to_string()))?;
        rows.extend(deleted_rows);
        rows.sort_by_key(|row| (row.7, row.0));
    }

    let data = rows
        .into_iter()
        .map(|row| worker_from_row(row, is_incremental))
        .collect();
    Ok(Json(VendorResponse {
        success: true,
        code: 0,
        message: "success".to_owned(),
        time: snapshot_time,
        data,
        event: WORKERS_EVENT,
    }))
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum VendorText {
    Text(String),
    Signed(i64),
    Unsigned(u64),
}

impl VendorText {
    fn into_string(self) -> String {
        match self {
            Self::Text(value) => value,
            Self::Signed(value) => value.to_string(),
            Self::Unsigned(value) => value.to_string(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttendancePhotoRequest {
    base64: String,
    project_id: Option<VendorText>,
    device_id: VendorText,
    file_name: String,
    worker_id: VendorText,
    time: VendorText,
    direction: Option<String>,
}

#[derive(Debug, Serialize)]
struct AttendancePhotoData {
    path: String,
}

#[derive(Debug)]
struct DeviceBinding {
    id: Uuid,
    project_id: Uuid,
    direction: i16,
}

async fn upload_attendance_photo(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<AttendancePhotoRequest>, JsonRejection>,
) -> Result<Json<VendorResponse<AttendancePhotoData>>, VendorError> {
    parse_required_millis_header(&headers, "ts")?;
    let Json(payload) = payload.map_err(|_| photo_bad_request("请求体必须是有效的JSON"))?;

    let device_id_value = payload.device_id.into_string();
    let device_id = photo_required(&device_id_value, "deviceId", 200)?;
    let worker_id_value = payload.worker_id.into_string();
    let worker_id_text = photo_required(&worker_id_value, "workerId", 200)?;
    let worker_id =
        Uuid::parse_str(worker_id_text).map_err(|_| photo_bad_request("workerId必须是人员UUID"))?;
    let file_name = photo_required(&payload.file_name, "fileName", 255)?;
    let time_value = payload.time.into_string();
    let time_millis = parse_required_millis(&time_value, "time")?;
    let trigger_time = DateTime::from_timestamp_millis(time_millis)
        .ok_or_else(|| photo_bad_request("time时间戳超出有效范围"))?;

    let binding = fetch_b_vendor_device(state.db.pool(), device_id).await?;
    if let Some(project_id) = payload.project_id {
        let project_id =
            Uuid::parse_str(photo_required(&project_id.into_string(), "projectId", 200)?)
                .map_err(|_| photo_bad_request("projectId必须是项目UUID"))?;
        if project_id != binding.project_id {
            return Err(photo_conflict("projectId与deviceId绑定项目不一致"));
        }
    }

    let worker_exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM construction_workers
            WHERE id = $1
              AND project_id = $2
              AND is_deleted = FALSE
              AND COALESCE(work_status, 1) <> 2
        )
        "#,
    )
    .bind(worker_id)
    .bind(binding.project_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(photo_internal)?;
    if !worker_exists {
        return Err(photo_not_found(
            "workerId对应的在场人员不存在或不属于该设备项目",
        ));
    }

    let direction = parse_attendance_direction(payload.direction.as_deref(), binding.direction)?;
    let (photo_bytes, content_type, extension) =
        decode_attendance_photo(&payload.base64, state.config.upload.max_upload_size)?;
    let photo_hash = hex::encode(Sha256::digest(&photo_bytes));
    let photo_size = photo_bytes.len() as i64;
    let object_key = format!(
        "uploads/attendance/{}/b_vendor/{}/{}/{}-{}.{}",
        binding.project_id,
        sanitize_object_segment(device_id),
        worker_id,
        time_millis,
        &photo_hash[..16],
        extension,
    );
    let public_url = state.storage.public_url(&object_key);
    let original_time = format!("b-photo:{time_millis}");
    let dedupe_key = format!("attendance-b-photo:{worker_id}:{device_id}:{time_millis}");

    if let Some(path) = sqlx::query_scalar::<_, Option<String>>(FIND_EXISTING_PHOTO_SQL)
        .bind(worker_id)
        .bind(device_id)
        .bind(&original_time)
        .bind(PHOTO_SOURCE)
        .fetch_optional(state.db.pool())
        .await
        .map_err(photo_internal)?
        .flatten()
    {
        return Ok(photo_success(path));
    }

    state
        .storage
        .put(&object_key, Bytes::from(photo_bytes), content_type)
        .await
        .map_err(photo_internal)?;

    let mut tx = state.db.pool().begin().await.map_err(photo_internal)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)")
        .bind(&dedupe_key)
        .execute(&mut *tx)
        .await
        .map_err(photo_internal)?;

    if let Some(path) = sqlx::query_scalar::<_, Option<String>>(FIND_EXISTING_PHOTO_SQL)
        .bind(worker_id)
        .bind(device_id)
        .bind(&original_time)
        .bind(PHOTO_SOURCE)
        .fetch_optional(&mut *tx)
        .await
        .map_err(photo_internal)?
        .flatten()
    {
        tx.commit().await.map_err(photo_internal)?;
        return Ok(photo_success(path));
    }

    let attendance_record_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO construction_attendance_records (
            id, worker_id, project_id, direction, trigger_time, equipment_id,
            serial_number, photo_path, original_time
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)
        "#,
    )
    .bind(attendance_record_id)
    .bind(worker_id)
    .bind(binding.project_id)
    .bind(direction)
    .bind(trigger_time)
    .bind(device_id)
    .bind(&public_url)
    .bind(&original_time)
    .execute(&mut *tx)
    .await
    .map_err(photo_internal)?;

    sqlx::query(
        r#"
        INSERT INTO construction_attendance_record_photos (
            attendance_record_id, project_id, worker_id, photo_kind,
            photo_data, content_type, source
        )
        VALUES ($1, $2, $3, 'closeup', $4, $5, $6)
        "#,
    )
    .bind(attendance_record_id)
    .bind(binding.project_id)
    .bind(worker_id)
    .bind(&public_url)
    .bind(content_type)
    .bind(PHOTO_SOURCE)
    .execute(&mut *tx)
    .await
    .map_err(photo_internal)?;

    sqlx::query(
        r#"
        INSERT INTO upload_files (
            biz_type, biz_id, field_key, original_filename, object_key,
            bucket, endpoint, public_base_url, public_url, storage_driver,
            content_type, size_bytes
        )
        VALUES (
            'attendance_record', $1, 'closeup_photo', $2, $3,
            $4, $5, $6, $7, $8, $9, $10
        )
        "#,
    )
    .bind(attendance_record_id)
    .bind(file_name)
    .bind(&object_key)
    .bind(state.storage.bucket())
    .bind(state.storage.endpoint())
    .bind(state.storage.public_base_url())
    .bind(&public_url)
    .bind(state.storage.driver())
    .bind(content_type)
    .bind(photo_size)
    .execute(&mut *tx)
    .await
    .map_err(photo_internal)?;

    sqlx::query(
        r#"
        UPDATE construction_attendance_devices
        SET online_status = 'online',
            last_seen_at = NOW(),
            last_online_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(binding.id)
    .execute(&mut *tx)
    .await
    .map_err(photo_internal)?;

    crate::feature::integration::outbox_worker::enqueue_domain_event_tx(
        &mut tx,
        binding.project_id,
        "construction.attendance.created",
        "attendance",
        attendance_record_id,
        serde_json::json!({
            "operation": "insert",
            "source": PHOTO_SOURCE,
            "has_photo": true,
            "occurred_at": Utc::now(),
        }),
        &format!("attendance:{PHOTO_SOURCE}:{attendance_record_id}"),
    )
    .await
    .map_err(photo_internal)?;

    tx.commit().await.map_err(photo_internal)?;
    Ok(photo_success(public_url))
}

fn photo_success(path: String) -> Json<VendorResponse<AttendancePhotoData>> {
    Json(VendorResponse {
        success: true,
        code: 0,
        message: "success".to_owned(),
        time: Utc::now().timestamp(),
        data: AttendancePhotoData { path },
        event: PHOTO_EVENT,
    })
}

fn parse_required_millis_header(headers: &HeaderMap, name: &str) -> Result<i64, VendorError> {
    let value = headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| photo_bad_request(format!("请求头{name}为必传参数")))?;
    parse_required_millis(value, name)
}

fn parse_required_millis(value: &str, field: &str) -> Result<i64, VendorError> {
    let value = photo_required(value, field, 32)?;
    let timestamp = value
        .parse::<i64>()
        .map_err(|_| photo_bad_request(format!("{field}必须是毫秒级时间戳")))?;
    if timestamp <= 0 || DateTime::from_timestamp_millis(timestamp).is_none() {
        return Err(photo_bad_request(format!("{field}时间戳超出有效范围")));
    }
    Ok(timestamp)
}

fn photo_required<'a>(value: &'a str, field: &str, max_len: usize) -> Result<&'a str, VendorError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(photo_bad_request(format!("{field}不能为空")));
    }
    if value.len() > max_len {
        return Err(photo_bad_request(format!("{field}长度不能超过{max_len}")));
    }
    Ok(value)
}

fn parse_attendance_direction(
    value: Option<&str>,
    device_direction: i16,
) -> Result<i16, VendorError> {
    let value = value.map(str::trim).filter(|value| !value.is_empty());
    match value.map(str::to_ascii_lowercase).as_deref() {
        Some("in" | "0") => Ok(0),
        Some("out" | "1") => Ok(1),
        None => Ok(match device_direction {
            1 => 1,
            _ => 0,
        }),
        Some(_) => Err(photo_bad_request("direction只支持in或out")),
    }
}

fn decode_attendance_photo(
    encoded: &str,
    max_bytes: usize,
) -> Result<(Vec<u8>, &'static str, &'static str), VendorError> {
    let encoded = encoded
        .split_once(',')
        .filter(|(metadata, _)| {
            metadata.starts_with("data:image/") && metadata.ends_with(";base64")
        })
        .map(|(_, data)| data)
        .unwrap_or(encoded);
    let compact = encoded
        .chars()
        .filter(|character| !character.is_ascii_whitespace())
        .collect::<String>();
    let bytes = BASE64_STANDARD
        .decode(compact)
        .map_err(|_| photo_bad_request("base64图片编码无效"))?;
    if bytes.is_empty() {
        return Err(photo_bad_request("base64图片内容不能为空"));
    }
    if bytes.len() > max_bytes {
        return Err(photo_bad_request(format!(
            "考勤图片超过{}字节限制",
            max_bytes
        )));
    }
    let format =
        image::guess_format(&bytes).map_err(|_| photo_bad_request("base64内容不是有效图片"))?;
    let (content_type, extension) = match format {
        ImageFormat::Jpeg => ("image/jpeg", "jpg"),
        ImageFormat::Png => ("image/png", "png"),
        ImageFormat::WebP => ("image/webp", "webp"),
        ImageFormat::Gif => ("image/gif", "gif"),
        _ => return Err(photo_bad_request("仅支持JPEG、PNG、WebP或GIF图片")),
    };
    let (width, height) = ImageReader::with_format(Cursor::new(&bytes), format)
        .into_dimensions()
        .map_err(|_| photo_bad_request("base64内容不是完整的有效图片"))?;
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PHOTO_PIXELS {
        return Err(photo_bad_request("考勤图片尺寸无效或像素数过大"));
    }
    Ok((bytes, content_type, extension))
}

fn sanitize_object_segment(value: &str) -> String {
    let sanitized = value
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
        .collect::<String>();
    if sanitized.is_empty() {
        "device".to_owned()
    } else {
        sanitized
    }
}

fn required_trimmed<'a>(value: &'a str, field: &str) -> Result<&'a str, VendorError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(VendorError::bad_request(format!("{field}不能为空")));
    }
    Ok(value)
}

fn parse_update(value: Option<&str>) -> Result<Option<DateTime<Utc>>, VendorError> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let timestamp = value
        .parse::<i64>()
        .map_err(|_| VendorError::bad_request("update必须是秒级时间戳"))?;
    if timestamp == 0 {
        return Ok(None);
    }
    if timestamp < 0 {
        return Err(VendorError::bad_request("update不能小于0"));
    }
    DateTime::from_timestamp(timestamp, 0)
        .map(Some)
        .ok_or_else(|| VendorError::bad_request("update时间戳超出有效范围"))
}

async fn ensure_b_vendor_device(pool: &PgPool, device_id: &str) -> Result<(), VendorError> {
    fetch_b_vendor_device(pool, device_id).await.map(|_| ())
}

async fn fetch_b_vendor_device(
    pool: &PgPool,
    device_id: &str,
) -> Result<DeviceBinding, VendorError> {
    let devices = sqlx::query_as::<_, (Uuid, Uuid, i16)>(
        r#"
        SELECT id, project_id, direction
        FROM construction_attendance_devices
        WHERE is_deleted = FALSE
          AND device_type = $1
          AND BTRIM(serial_number) = $2
        ORDER BY updated_at DESC, id DESC
        LIMIT 2
        "#,
    )
    .bind(B_VENDOR_DEVICE_TYPE)
    .bind(device_id)
    .fetch_all(pool)
    .await
    .map_err(|error| VendorError::internal(error.to_string()))?;

    match devices.as_slice() {
        [] => Err(VendorError::not_found("deviceId对应的B厂家设备不存在")),
        [(id, project_id, direction)] => Ok(DeviceBinding {
            id: *id,
            project_id: *project_id,
            direction: *direction,
        }),
        _ => Err(VendorError::conflict(
            "deviceId存在重复配置，请检查B厂家设备绑定",
        )),
    }
}

fn worker_from_row(row: WorkerRow, is_incremental: bool) -> VendorWorker {
    let (
        id,
        project_id,
        name,
        id_card_number,
        photo,
        is_deleted,
        work_status,
        changed_at,
        user_id,
        worker_code,
        jh_worker_code,
    ) = row;
    VendorWorker {
        update: changed_at.timestamp().to_string(),
        name: name.unwrap_or_default(),
        worker_id: id.to_string(),
        photo: photo.unwrap_or_default(),
        project_id: project_id.to_string(),
        id_card_number: id_card_number.filter(|value| !value.trim().is_empty()),
        del: if !is_incremental {
            None
        } else if is_deleted || work_status == 2 {
            Some("1".to_owned())
        } else {
            Some("0".to_owned())
        },
        user_id,
        worker_code,
        jh_worker_code,
    }
}

#[derive(Debug)]
struct VendorError {
    status: StatusCode,
    code: u16,
    message: String,
    event: &'static str,
}

impl VendorError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: 400,
            message: message.into(),
            event: WORKERS_EVENT,
        }
    }

    fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: 404,
            message: message.into(),
            event: WORKERS_EVENT,
        }
    }

    fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            code: 409,
            message: message.into(),
            event: WORKERS_EVENT,
        }
    }

    fn internal(details: impl std::fmt::Display) -> Self {
        tracing::error!(target: "device_vendor_b", error = %details, "B厂家设备接口失败");
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: 500,
            message: "服务内部错误".to_owned(),
            event: WORKERS_EVENT,
        }
    }

    fn with_event(mut self, event: &'static str) -> Self {
        self.event = event;
        self
    }
}

fn photo_bad_request(message: impl Into<String>) -> VendorError {
    VendorError::bad_request(message).with_event(PHOTO_EVENT)
}

fn photo_not_found(message: impl Into<String>) -> VendorError {
    VendorError::not_found(message).with_event(PHOTO_EVENT)
}

fn photo_conflict(message: impl Into<String>) -> VendorError {
    VendorError::conflict(message).with_event(PHOTO_EVENT)
}

fn photo_internal(details: impl std::fmt::Display) -> VendorError {
    VendorError::internal(details).with_event(PHOTO_EVENT)
}

impl IntoResponse for VendorError {
    fn into_response(self) -> Response {
        let body = serde_json::json!({
            "success": false,
            "code": self.code,
            "message": self.message,
            "time": Utc::now().timestamp(),
            "data": [],
            "event": self.event,
        });
        (self.status, Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_defaults_to_full_download() {
        assert_eq!(parse_update(None).unwrap(), None);
        assert_eq!(parse_update(Some("")).unwrap(), None);
        assert_eq!(parse_update(Some("0")).unwrap(), None);
    }

    #[test]
    fn update_accepts_seconds_timestamp() {
        let parsed = parse_update(Some("1583132110")).unwrap().unwrap();
        assert_eq!(parsed.timestamp(), 1_583_132_110);
    }

    #[test]
    fn update_rejects_invalid_values() {
        assert!(parse_update(Some("not-a-time")).is_err());
        assert!(parse_update(Some("-1")).is_err());
    }

    #[test]
    fn query_validates_b_vendor_device_and_incremental_semantics() {
        assert!(DOWNLOAD_WORKERS_SQL.contains("device_type = $1"));
        assert!(DOWNLOAD_WORKERS_SQL.contains("COALESCE(worker.work_status, 1) <> 2"));
        assert!(DOWNLOAD_WORKERS_SQL.contains(") > $3"));
        assert!(DOWNLOAD_DELETED_WORKERS_SQL.contains("integration_outbox_events"));
        assert!(DOWNLOAD_DELETED_WORKERS_SQL.contains("deleted_snapshot"));
        assert!(DOWNLOAD_DELETED_WORKERS_SQL.contains("event.created_at > $3"));
    }

    #[test]
    fn response_uses_vendor_field_names() {
        let worker = VendorWorker {
            update: "1583132110".to_owned(),
            name: "测试人员".to_owned(),
            worker_id: "worker-1".to_owned(),
            photo: "https://example.test/photo.jpg".to_owned(),
            project_id: "project-1".to_owned(),
            id_card_number: None,
            del: Some("0".to_owned()),
            user_id: Some("zhenhai-1".to_owned()),
            worker_code: Some("ningbo-1".to_owned()),
            jh_worker_code: None,
        };
        let value = serde_json::to_value(worker).unwrap();
        assert_eq!(value["workerId"], "worker-1");
        assert_eq!(value["userId"], "zhenhai-1");
        assert_eq!(value["workerCode"], "ningbo-1");
        assert!(value.get("jhWorkerCode").is_some());
        assert_eq!(value["del"], "0");
    }

    #[test]
    fn full_download_omits_incremental_delete_flag() {
        let row = (
            Uuid::new_v4(),
            Uuid::new_v4(),
            Some("测试人员".to_owned()),
            None,
            None,
            false,
            1,
            DateTime::from_timestamp(1_583_132_110, 0).unwrap(),
            None,
            None,
            None,
        );
        let value = serde_json::to_value(worker_from_row(row, false)).unwrap();
        assert!(value.get("del").is_none());
    }
}
