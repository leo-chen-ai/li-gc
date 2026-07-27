use axum::{
    Json, Router,
    extract::{Query, State, rejection::QueryRejection},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::state::AppState;

const B_VENDOR_DEVICE_TYPE: &str = "B厂家";

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
    Router::new().route("/workers", get(download_workers))
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
    data: Vec<T>,
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
) -> Result<Json<VendorResponse<VendorWorker>>, VendorError> {
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
        event: "workers",
    }))
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
    let device_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM construction_attendance_devices
        WHERE is_deleted = FALSE
          AND device_type = $1
          AND BTRIM(serial_number) = $2
        "#,
    )
    .bind(B_VENDOR_DEVICE_TYPE)
    .bind(device_id)
    .fetch_one(pool)
    .await
    .map_err(|error| VendorError::internal(error.to_string()))?;

    match device_count {
        0 => Err(VendorError::not_found("deviceId对应的B厂家设备不存在")),
        1 => Ok(()),
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
}

impl VendorError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: 400,
            message: message.into(),
        }
    }

    fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: 404,
            message: message.into(),
        }
    }

    fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            code: 409,
            message: message.into(),
        }
    }

    fn internal(details: impl std::fmt::Display) -> Self {
        tracing::error!(target: "device_vendor_b", error = %details, "B厂家人员下载接口失败");
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: 500,
            message: "服务内部错误".to_owned(),
        }
    }
}

impl IntoResponse for VendorError {
    fn into_response(self) -> Response {
        let body = VendorResponse::<VendorWorker> {
            success: false,
            code: self.code,
            message: self.message,
            time: Utc::now().timestamp(),
            data: Vec::new(),
            event: "workers",
        };
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
