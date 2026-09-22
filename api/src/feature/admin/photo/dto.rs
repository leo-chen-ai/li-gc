use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;



/// POST /groups
#[derive(Debug, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub remark: Option<String>,
}

/// PATCH /groups/{id}
#[derive(Debug, Deserialize)]
pub struct UpdateGroupRequest {
    pub name: Option<String>,
    pub remark: Option<String>,
}

/// 组列表项。
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PhotoGroupSummary {
    pub id: Uuid,
    pub name: String,
    pub remark: Option<String>,
    pub photo_count: i64,
    pub pending_count: i64,
    pub success_count: i64,
    pub failed_count: i64,
    pub skipped_count: i64,
    pub has_in_background: bool,
    pub has_out_background: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 组分页响应。
#[derive(Debug, Serialize)]
pub struct PhotoGroupListResponse {
    pub items: Vec<PhotoGroupSummary>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

/// 组内一张人像照片。
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PhotoGroupPhoto {
    pub id: Uuid,
    pub project_id: Uuid,
    pub project_name: Option<String>,
    pub worker_id: Option<Uuid>,
    pub worker_name: String,
    pub attendance_record_id: Option<Uuid>,
    pub attendance_date: NaiveDate,
    pub direction: i16,
    /// 归一化后存进对象存储的人像地址（oss 公网 URL 或本地 media URL）。
    pub photo_url: String,
    pub sort_index: i32,
    pub composite_status: String,
    pub composite_photo_url: Option<String>,
    pub composite_error: Option<String>,
    pub composited_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// 组背景图，进场/出场各一条。
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PhotoGroupBackground {
    pub id: Uuid,
    pub direction: i16,
    pub photo_url: String,
    pub remark: Option<String>,
}

/// 组详情：照片 + 背景 + 统计 + 最近一次任务。
#[derive(Debug, Serialize)]
pub struct PhotoGroupDetail {
    pub id: Uuid,
    pub name: String,
    pub remark: Option<String>,
    pub photos: Vec<PhotoGroupPhoto>,
    pub backgrounds: Vec<PhotoGroupBackground>,
    pub stats: PhotoGroupStats,
    pub latest_task: Option<CompositeTask>,
}

#[derive(Debug, Serialize, Default, Clone, Copy, sqlx::FromRow)]
pub struct PhotoGroupStats {
    pub total: i64,
    pub pending: i64,
    pub success: i64,
    pub failed: i64,
    pub skipped: i64,
}

/// PUT /groups/{id}/backgrounds/{direction}
#[derive(Debug, Deserialize)]
pub struct SetBackgroundRequest {
    pub photo_url: String,
    /// 上传接口返回的 `object_key`；不传时按 `photo_url` 反查 `upload_files`。
    pub object_key: Option<String>,
    pub remark: Option<String>,
}

/// POST /groups/{id}/photos —— 从「拉取考勤照片」结果里批量挑中。
#[derive(Debug, Deserialize)]
pub struct AddPhotosRequest {
    pub photos: Vec<AddPhotoItem>,
}

#[derive(Debug, Deserialize)]
pub struct AddPhotoItem {
    pub attendance_record_id: Option<Uuid>,
    pub project_id: Uuid,
    pub worker_id: Option<Uuid>,
    pub worker_name: String,
    /// YYYY-MM-DD
    pub attendance_date: String,
    /// 0=进场、1=出场
    pub direction: i16,
    /// 原始考勤照片地址，可能是 http(s) 外链或 data:image/...;base64, 数据。
    pub photo_url: String,
}

impl AddPhotoItem {
    pub fn attendance_date(&self) -> Result<NaiveDate, super::ApiError> {
        super::parse_date(Some(self.attendance_date.as_str()), "attendance_date")?
            .ok_or_else(|| super::invalid_input("attendance_date 不能为空"))
    }

    pub fn direction(&self) -> Result<i16, super::ApiError> {
        match self.direction {
            super::DIRECTION_IN | super::DIRECTION_OUT => Ok(self.direction),
            other => Err(super::invalid_input(format!(
                "direction 只能是 0（进场）或 1（出场），收到：{other}"
            ))),
        }
    }
}

/// GET /attendance-photos —— 可拉取的真实考勤照片。
#[derive(Debug, Serialize)]
pub struct AttendancePhotoItem {
    pub attendance_record_id: Uuid,
    pub project_id: Uuid,
    pub worker_id: Uuid,
    pub worker_name: String,
    pub attendance_date: NaiveDate,
    pub trigger_time: DateTime<Utc>,
    pub direction: i16,
    /// 缩略图 data URI（JPEG ≤ 20KB），仅供前端预览勾选，避免把整批原图下发。
    pub preview_photo: String,
    /// 原始地址，加入组时按这个解析原图。
    pub photo_url: String,
}

#[derive(Debug, Serialize)]
pub struct AttendancePhotoResponse {
    pub items: Vec<AttendancePhotoItem>,
    pub total: i64,
}

/// POST /groups/{id}/composite
#[derive(Debug, Deserialize)]
pub struct StartCompositeRequest {
    /// 输出尺寸，宽高需均能被 16 整除；留空默认 1024x1536。
    pub output_size: Option<String>,
    /// 自定义提示词；留空用内置的按方向区分的默认提示词。
    pub prompt: Option<String>,
    /// `all` = 连上次成功的也重跑；其它值（含缺省）= 只跑待合成/失败/跳过的照片。
    pub mode: Option<String>,
}

impl StartCompositeRequest {
    pub fn resolved_output_size(&self) -> String {
        self.output_size
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("1024x1536")
            .to_string()
    }

    pub fn resolved_prompt(&self) -> Option<String> {
        self.prompt
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    }

    pub fn resolved_mode(&self) -> &str {
        match self.mode.as_deref().map(str::trim) {
            Some("all") => "all",
            _ => "incremental",
        }
    }
}

/// 合成任务。
#[derive(Debug, Serialize, Clone, sqlx::FromRow)]
pub struct CompositeTask {
    pub id: Uuid,
    pub group_id: Uuid,
    pub status: String,
    pub total_count: i32,
    pub success_count: i32,
    pub failed_count: i32,
    pub skipped_count: i32,
    pub output_size: String,
    pub prompt_text: Option<String>,
    pub error_summary: Option<String>,
    pub cancel_requested: bool,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

/// GET /groups/{id}/composited-pairs —— 给考勤托管侧同步用。
/// 字段名对齐 `ManagedAttendancePhotoPair`，前端可直接复用同一套渲染。
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct CompositedPair {
    pub attendance_date: NaiveDate,
    pub pair_index: i64,
    pub in_photo: String,
    pub out_photo: String,
    pub in_time: Option<DateTime<Utc>>,
    pub out_time: Option<DateTime<Utc>>,
    pub in_count: i64,
    pub out_count: i64,
}

#[derive(Debug, Serialize)]
pub struct CompositedPairResponse {
    pub items: Vec<CompositedPair>,
    /// 组内已合成成功但没凑齐进/出一对的照片条数，供前端提示用户。
    pub unpaired_count: i64,
}
