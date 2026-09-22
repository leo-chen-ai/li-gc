pub mod composite;
pub mod composite_worker;
pub mod dto;
pub mod handler;
pub mod repository;
pub mod routes;

pub use routes::photo_routes;

use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::infrastructure::web::response::{ApiError, ApiResult, ApiSuccess};

/// 打卡方向：与 `construction_attendance_records.direction` 同语义。
pub const DIRECTION_IN: i16 = 0;
pub const DIRECTION_OUT: i16 = 1;

pub fn direction_label(direction: i16) -> &'static str {
    match direction {
        DIRECTION_IN => "进场",
        DIRECTION_OUT => "出场",
        _ => "未知",
    }
}

/// query / path 里的 direction 只接受 0（进场）或 1（出场）。
pub fn parse_direction(raw: Option<&str>) -> Result<Option<i16>, ApiError> {
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    parse_required_direction(raw).map(Some)
}

/// path 里的 direction 没有「全部」选项，必须是 0 或 1。
pub fn parse_required_direction(raw: &str) -> Result<i16, ApiError> {
    match raw.trim() {
        "0" => Ok(DIRECTION_IN),
        "1" => Ok(DIRECTION_OUT),
        other => Err(invalid_input(format!(
            "direction 只能是 0（进场）或 1（出场），收到：{other}"
        ))),
    }
}

pub fn parse_uuid(raw: &str, field: &str) -> Result<Uuid, ApiError> {
    Uuid::parse_str(raw.trim())
        .map_err(|_| invalid_input(format!("{field} 不是合法的 UUID")))
}

pub fn invalid_input(message: impl Into<String>) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::BAD_REQUEST)
        .with_message(message)
}

pub fn not_found(message: impl Into<String>) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::NOT_FOUND)
        .with_message(message)
}

pub fn internal_error(message: impl Into<String>) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::INTERNAL_SERVER_ERROR)
        .with_message(message)
}

pub fn ok<T: Serialize>(data: T) -> ApiResult<T> {
    Ok(ApiSuccess::default().with_data(data))
}

/// 组分页参数。
#[derive(Debug, Deserialize)]
pub struct PhotoGroupListParams {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub keyword: Option<String>,
}

impl PhotoGroupListParams {
    pub fn page(&self) -> i64 {
        self.page.unwrap_or(1).max(1)
    }

    pub fn page_size(&self) -> i64 {
        self.page_size.unwrap_or(20).clamp(1, 200)
    }

    pub fn keyword(&self) -> Option<&str> {
        self.keyword
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
    }
}

/// 拉取考勤照片的筛选条件。
#[derive(Debug, Deserialize)]
pub struct AttendancePhotoParams {
    pub project_id: Option<Uuid>,
    pub worker_id: Option<Uuid>,
    /// YYYY-MM-DD，与 `date_to` 都不传时默认最近 30 天。
    pub date_from: Option<String>,
    /// YYYY-MM-DD
    pub date_to: Option<String>,
    pub direction: Option<String>,
    pub limit: Option<i64>,
}

impl AttendancePhotoParams {
    pub fn limit(&self) -> i64 {
        self.limit.unwrap_or(200).clamp(1, 500)
    }

    pub fn direction(&self) -> Result<Option<i16>, ApiError> {
        parse_direction(self.direction.as_deref())
    }

    pub fn date_from(&self) -> Result<Option<chrono::NaiveDate>, ApiError> {
        parse_date(self.date_from.as_deref(), "date_from")
    }

    pub fn date_to(&self) -> Result<Option<chrono::NaiveDate>, ApiError> {
        parse_date(self.date_to.as_deref(), "date_to")
    }
}

pub fn parse_date(raw: Option<&str>, field: &str) -> Result<Option<chrono::NaiveDate>, ApiError> {
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    chrono::NaiveDate::parse_from_str(raw, "%Y-%m-%d")
        .map(Some)
        .map_err(|_| invalid_input(format!("{field} 需要 YYYY-MM-DD 格式，收到：{raw}")))
}

/// 同步预览按 worker 过滤（组是跨项目的，托管配置只对应单个工人）。
#[derive(Debug, Deserialize)]
pub struct CompositedPairParams {
    pub worker_id: Option<Uuid>,
    pub project_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct CompositeTaskParams {
    pub output_size: Option<String>,
    pub prompt: Option<String>,
}

impl CompositeTaskParams {
    pub fn output_size(&self) -> String {
        self.output_size
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("1024x1536")
            .to_string()
    }
}
