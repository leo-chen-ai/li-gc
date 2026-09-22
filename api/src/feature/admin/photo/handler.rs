use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
};
use std::sync::Arc;

use crate::{
    feature::auth::{AuthUser, Role},
    infrastructure::web::{
        response::{ApiError, ApiResult, ApiSuccess, codes::generic},
        trimmed_json::TrimmedJson,
    },
    state::AppState,
};

use super::dto::{
    AddPhotosRequest, AttendancePhotoResponse, CompositeTask, CompositedPairResponse,
    CreateGroupRequest, PhotoGroupDetail, PhotoGroupListResponse, SetBackgroundRequest,
    StartCompositeRequest, UpdateGroupRequest,
};
use super::repository::{NewGroupPhoto, PhotoRepository, PhotoRepositoryError, PhotoRepositoryImpl};
use super::{
    AttendancePhotoParams, CompositedPairParams, PhotoGroupListParams, internal_error,
    invalid_input, not_found, parse_required_direction, parse_uuid,
};

/// 单次最多加入组的照片数，防止一次性把整月原始照片灌进对象存储。
const MAX_ADD_PHOTOS_PER_REQUEST: usize = 200;

fn repo() -> Arc<PhotoRepositoryImpl> {
    Arc::new(PhotoRepositoryImpl::new())
}

fn db_error(error: sqlx::Error) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::INTERNAL_SERVER_ERROR)
        .with_error_code(generic::INTERNAL)
        .with_message(format!("照片处理数据库操作失败: {error}"))
}

fn repository_error(error: PhotoRepositoryError) -> ApiError {
    match error {
        PhotoRepositoryError::GroupNotFound => not_found("照片处理组不存在或已删除"),
        PhotoRepositoryError::PhotoNotFound => not_found("照片不存在或已删除"),
        PhotoRepositoryError::Database(error) => db_error(error),
    }
}

/// 非系统管理员只能访问 `user_managed_projects` 授权的项目。
/// 这是 AGENTS.md 权限记忆要求的后端查询层过滤，不能只靠前端。
fn restrict_to_user(auth_user: &AuthUser) -> Option<uuid::Uuid> {
    if auth_user.roles.contains(&Role::Admin) {
        None
    } else {
        Some(auth_user.user_id)
    }
}

fn ok_page(
    items: Vec<super::dto::PhotoGroupSummary>,
    total: i64,
    page: i64,
    page_size: i64,
) -> ApiResult<PhotoGroupListResponse> {
    Ok(ApiSuccess::default().with_data(PhotoGroupListResponse {
        items,
        total,
        page,
        page_size,
    }))
}

/// GET /api/v1/admin/photo-processing/groups
pub async fn list_groups(
    State(state): State<AppState>,
    Query(params): Query<PhotoGroupListParams>,
) -> ApiResult<PhotoGroupListResponse> {
    let (items, total) = repo()
        .list_groups(
            state.db.pool(),
            params.page(),
            params.page_size(),
            params.keyword(),
        )
        .await
        .map_err(repository_error)?;
    ok_page(items, total, params.page(), params.page_size())
}

/// POST /api/v1/admin/photo-processing/groups
pub async fn create_group(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    TrimmedJson(body): TrimmedJson<CreateGroupRequest>,
) -> ApiResult<PhotoGroupDetail> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(invalid_input("组名称不能为空"));
    }
    if name.chars().count() > 200 {
        return Err(invalid_input("组名称不能超过 200 个字符"));
    }
    let remark = body
        .remark
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let id = repo()
        .create_group(state.db.pool(), name, remark, Some(auth_user.user_id))
        .await
        .map_err(repository_error)?;
    load_group_detail(&state, id).await
}

/// GET /api/v1/admin/photo-processing/groups/{id}
pub async fn get_group(
    State(state): State<AppState>,
    Path(group_id): Path<String>,
) -> ApiResult<PhotoGroupDetail> {
    let group_id = parse_uuid(&group_id, "组ID")?;
    load_group_detail(&state, group_id).await
}

async fn load_group_detail(state: &AppState, group_id: uuid::Uuid) -> ApiResult<PhotoGroupDetail> {
    let repository = repo();
    let pool = state.db.pool();
    let (name, remark) = repository
        .group_profile(pool, group_id)
        .await
        .map_err(repository_error)?;
    let photos = repository
        .list_photos(pool, group_id)
        .await
        .map_err(repository_error)?;
    let backgrounds = repository
        .list_backgrounds(pool, group_id)
        .await
        .map_err(repository_error)?;
    let stats = repository
        .group_stats(pool, group_id)
        .await
        .map_err(repository_error)?;
    let latest_task = repository
        .latest_task(pool, group_id)
        .await
        .map_err(repository_error)?;
    Ok(ApiSuccess::default().with_data(PhotoGroupDetail {
        id: group_id,
        name,
        remark,
        photos,
        backgrounds,
        stats,
        latest_task,
    }))
}

/// PATCH /api/v1/admin/photo-processing/groups/{id}
pub async fn update_group(
    State(state): State<AppState>,
    Path(group_id): Path<String>,
    TrimmedJson(body): TrimmedJson<UpdateGroupRequest>,
) -> ApiResult<PhotoGroupDetail> {
    let group_id = parse_uuid(&group_id, "组ID")?;
    if let Some(name) = body.name.as_deref().map(str::trim) {
        if name.is_empty() {
            return Err(invalid_input("组名称不能为空"));
        }
        if name.chars().count() > 200 {
            return Err(invalid_input("组名称不能超过 200 个字符"));
        }
    }
    let name = body.name.as_deref().map(str::trim).filter(|v| !v.is_empty());
    let remark = body.remark.as_deref().map(str::trim);
    repo()
        .update_group(state.db.pool(), group_id, name, remark)
        .await
        .map_err(repository_error)?;
    load_group_detail(&state, group_id).await
}

/// DELETE /api/v1/admin/photo-processing/groups/{id}
pub async fn delete_group(
    State(state): State<AppState>,
    Path(group_id): Path<String>,
) -> ApiResult<serde_json::Value> {
    let group_id = parse_uuid(&group_id, "组ID")?;
    repo()
        .soft_delete_group(state.db.pool(), group_id)
        .await
        .map_err(repository_error)?;
    Ok(ApiSuccess::default().with_data(serde_json::json!({ "deleted": true })))
}

/// GET /api/v1/admin/photo-processing/groups/{id}/photos
pub async fn list_group_photos(
    State(state): State<AppState>,
    Path(group_id): Path<String>,
) -> ApiResult<serde_json::Value> {
    let group_id = parse_uuid(&group_id, "组ID")?;
    let photos = repo()
        .list_photos(state.db.pool(), group_id)
        .await
        .map_err(repository_error)?;
    Ok(ApiSuccess::default().with_data(serde_json::json!({ "items": photos })))
}

/// POST /api/v1/admin/photo-processing/groups/{id}/photos
///
/// 加入组时会把原始照片（可能是 data URI、OSS 外链或厂家直链）解析后
/// **归一化存进对象存储**：这样组详情接口不会把几 MB 的 data URI 下发给前端，
/// 合成 worker 也不用再处理混合格式。
pub async fn add_group_photos(
    State(state): State<AppState>,
    Path(group_id): Path<String>,
    TrimmedJson(body): TrimmedJson<AddPhotosRequest>,
) -> ApiResult<serde_json::Value> {
    let group_id = parse_uuid(&group_id, "组ID")?;
    if body.photos.is_empty() {
        return Err(invalid_input("请至少选择一张照片"));
    }
    if body.photos.len() > MAX_ADD_PHOTOS_PER_REQUEST {
        return Err(invalid_input(format!(
            "一次最多加入 {MAX_ADD_PHOTOS_PER_REQUEST} 张照片，当前选择了 {} 张",
            body.photos.len()
        )));
    }

    let repository = repo();
    let pool = state.db.pool();
    repository
        .group_exists(pool, group_id)
        .await
        .map_err(repository_error)?
        .then_some(())
        .ok_or_else(|| not_found("照片处理组不存在或已删除"))?;

    let mut prepared = Vec::with_capacity(body.photos.len());
    let mut failures = Vec::new();
    for item in &body.photos {
        let direction = item.direction()?;
        let attendance_date = item.attendance_date()?;
        let worker_name = item.worker_name.trim();
        if worker_name.is_empty() {
            failures.push(format!("{} 的照片缺少工人姓名", item.attendance_date));
            continue;
        }
        if item.photo_url.trim().is_empty() {
            failures.push(format!(
                "{worker_name} {} 的照片地址为空",
                item.attendance_date
            ));
            continue;
        }
        match resolve_and_store_photo(&state, group_id, item.photo_url.trim()).await {
            Ok(photo_url) => prepared.push(NewGroupPhoto {
                project_id: item.project_id,
                worker_id: item.worker_id,
                worker_name: worker_name.to_string(),
                attendance_record_id: item.attendance_record_id,
                attendance_date,
                direction,
                photo_url,
                sort_index: 0,
            }),
            Err(error) => failures.push(format!(
                "{worker_name} {} {}：{error}",
                item.attendance_date,
                super::direction_label(direction)
            )),
        }
    }

    let existing = repository
        .existing_photo_keys(pool, group_id)
        .await
        .map_err(repository_error)?;
    let existing: std::collections::HashSet<(Option<uuid::Uuid>, i16)> =
        existing.into_iter().collect();

    let start = repository
        .max_sort_index(pool, group_id)
        .await
        .map_err(repository_error)?;
    let mut offset = 0_i32;
    let mut skipped = 0_usize;
    let mut deduped = Vec::with_capacity(prepared.len());
    for photo in prepared {
        if existing.contains(&(photo.attendance_record_id, photo.direction)) {
            skipped += 1;
            continue;
        }
        offset += 1;
        let mut photo = photo;
        photo.sort_index = start + offset;
        deduped.push(photo);
    }
    let inserted = repository
        .insert_photos(pool, group_id, &deduped)
        .await
        .map_err(repository_error)?;

    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "added": inserted,
        "skipped": skipped,
        "failed": failures,
    })))
}

/// 把一张原始考勤照片解析成字节并存入对象存储，返回归一化后的地址。
async fn resolve_and_store_photo(
    state: &AppState,
    group_id: uuid::Uuid,
    photo_url: &str,
) -> Result<String, String> {
    let bytes = super::composite_worker::resolve_import_photo_bytes(state, photo_url).await?;
    let object_key = format!(
        "uploads/photo-processing/{group_id}/original/{}.jpg",
        uuid::Uuid::new_v4()
    );
    state
        .storage
        .put(&object_key, bytes::Bytes::from(bytes), "image/jpeg")
        .await
        .map_err(|error| format!("保存照片失败: {error}"))?;
    Ok(state.storage.public_url(&object_key))
}

/// DELETE /api/v1/admin/photo-processing/groups/{id}/photos/{photo_id}
pub async fn delete_group_photo(
    State(state): State<AppState>,
    Path((group_id, photo_id)): Path<(String, String)>,
) -> ApiResult<serde_json::Value> {
    let group_id = parse_uuid(&group_id, "组ID")?;
    let photo_id = parse_uuid(&photo_id, "照片ID")?;
    repo()
        .soft_delete_photo(state.db.pool(), group_id, photo_id)
        .await
        .map_err(repository_error)?;
    Ok(ApiSuccess::default().with_data(serde_json::json!({ "deleted": true })))
}

/// PUT /api/v1/admin/photo-processing/groups/{id}/backgrounds/{direction}
pub async fn set_background(
    State(state): State<AppState>,
    Path((group_id, direction)): Path<(String, String)>,
    TrimmedJson(body): TrimmedJson<SetBackgroundRequest>,
) -> ApiResult<serde_json::Value> {
    let group_id = parse_uuid(&group_id, "组ID")?;
    let direction = parse_required_direction(&direction)?;
    if body.photo_url.is_empty() {
        return Err(invalid_input("背景图地址不能为空"));
    }
    let object_key = match body.object_key.as_deref() {
        Some(key) if !key.is_empty() => Some(key.to_string()),
        _ => lookup_object_key(state.db.pool(), &body.photo_url).await,
    };
    let remark = body.remark.as_deref().filter(|value| !value.is_empty());
    let id = repo()
        .upsert_background(
            state.db.pool(),
            group_id,
            direction,
            &body.photo_url,
            object_key.as_deref(),
            remark,
        )
        .await
        .map_err(repository_error)?;
    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "id": id,
        "direction": direction,
    })))
}

/// DELETE /api/v1/admin/photo-processing/groups/{id}/backgrounds/{direction}
///
/// 注意：对象存储的 `delete` 对京东云 OSS 是空操作，这里只做数据库软删，
/// UI 不要向用户承诺「文件已从存储删除」。
pub async fn delete_background(
    State(state): State<AppState>,
    Path((group_id, direction)): Path<(String, String)>,
) -> ApiResult<serde_json::Value> {
    let group_id = parse_uuid(&group_id, "组ID")?;
    let direction = parse_required_direction(&direction)?;
    repo()
        .soft_delete_background(state.db.pool(), group_id, direction)
        .await
        .map_err(repository_error)?;
    Ok(ApiSuccess::default().with_data(serde_json::json!({
        "deleted": true,
        "direction": direction,
    })))
}

async fn lookup_object_key(pool: &sqlx::PgPool, public_url: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>(
        r#"
        SELECT object_key
        FROM upload_files
        WHERE public_url = $1 AND is_deleted = FALSE
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(public_url)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
}

/// GET /api/v1/admin/photo-processing/attendance-photos
///
/// 返回可拉取的真实考勤照片。`preview_photo` 是 20KB 缩略图 data URI，
/// 原图只在真正加入组时才下载归档，避免一页 200 张原图把接口打爆。
pub async fn list_attendance_photos(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Query(params): Query<AttendancePhotoParams>,
) -> ApiResult<AttendancePhotoResponse> {
    let direction = params.direction()?;
    let date_from = params.date_from()?;
    let date_to = params.date_to()?;
    if let (Some(from), Some(to)) = (date_from, date_to)
        && from > to
    {
        return Err(invalid_input("开始日期不能晚于结束日期"));
    }

    let repository = repo();
    let pool = state.db.pool();
    let restrict = restrict_to_user(&auth_user);

    let total = repository
        .count_attendance_photos(
            pool,
            params.project_id,
            params.worker_id,
            date_from,
            date_to,
            direction,
            restrict,
        )
        .await
        .map_err(repository_error)?;
    let rows = repository
        .list_attendance_photos(
            pool,
            params.project_id,
            params.worker_id,
            date_from,
            date_to,
            direction,
            params.limit(),
            restrict,
        )
        .await
        .map_err(repository_error)?;

    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let preview = super::composite_worker::resolve_preview_data_uri(&state, &row.photo_url)
            .await
            .unwrap_or_default();
        items.push(super::dto::AttendancePhotoItem {
            attendance_record_id: row.attendance_record_id,
            project_id: row.project_id,
            worker_id: row.worker_id,
            worker_name: row.worker_name,
            attendance_date: row.attendance_date,
            trigger_time: row.trigger_time,
            direction: row.direction,
            preview_photo: preview,
            photo_url: row.photo_url,
        });
    }

    Ok(ApiSuccess::default().with_data(AttendancePhotoResponse { items, total }))
}

/// POST /api/v1/admin/photo-processing/groups/{id}/composite
///
/// 立即返回 status=pending 的任务；实际合成由 API 进程内 worker 异步执行，
/// 前端轮询 `GET /composite-tasks/{id}` 看进度。
pub async fn start_composite(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(group_id): Path<String>,
    TrimmedJson(body): TrimmedJson<StartCompositeRequest>,
) -> ApiResult<CompositeTask> {
    let group_id = parse_uuid(&group_id, "组ID")?;
    let repository = repo();
    let pool = state.db.pool();
    repository
        .group_exists(pool, group_id)
        .await
        .map_err(repository_error)?
        .then_some(())
        .ok_or_else(|| not_found("照片处理组不存在或已删除"))?;

    let output_size = body.resolved_output_size();
    if !is_supported_size(&output_size) {
        return Err(invalid_input(format!(
            "输出尺寸 {output_size} 不支持，宽高必须都能被 16 整除"
        )));
    }
    // `mode=all` 时连上次成功的也重跑一遍，用于换背景图后整体刷新。
    let include_success = body.resolved_mode() == "all";

    let prompt = body.resolved_prompt();
    let task_id = repository
        .create_task(
            pool,
            group_id,
            0,
            &output_size,
            prompt.as_deref(),
            Some(auth_user.user_id),
        )
        .await
        .map_err(repository_error)?;
    let total = repository
        .prepare_run(pool, group_id, task_id, include_success)
        .await
        .map_err(repository_error)? as i32;
    repository
        .set_task_total(pool, task_id, total)
        .await
        .map_err(repository_error)?;

    if total == 0 {
        let message = if include_success {
            "组内没有照片"
        } else {
            "组内没有待合成的照片（新加的照片或上次失败/跳过的照片才会进入合成）"
        };
        repository
            .finish_task(pool, task_id, 0, 0, 0, "completed", Some(message))
            .await
            .map_err(repository_error)?;
    }

    let task = repository
        .find_task(pool, task_id)
        .await
        .map_err(repository_error)?
        .ok_or_else(|| internal_error("合成任务创建后读取失败"))?;
    Ok(ApiSuccess::default().with_data(task))
}

fn is_supported_size(size: &str) -> bool {
    let Some((width, height)) = size.split_once('x') else {
        return false;
    };
    let (Ok(width), Ok(height)) = (
        width.trim().parse::<u32>(),
        height.trim().parse::<u32>(),
    ) else {
        return false;
    };
    width > 0 && height > 0 && width % 16 == 0 && height % 16 == 0
}

/// GET /api/v1/admin/photo-processing/composite-tasks/{id}
pub async fn get_composite_task(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
) -> ApiResult<CompositeTask> {
    let task_id = parse_uuid(&task_id, "任务ID")?;
    let task = repo()
        .find_task(state.db.pool(), task_id)
        .await
        .map_err(repository_error)?
        .ok_or_else(|| not_found("合成任务不存在"))?;
    Ok(ApiSuccess::default().with_data(task))
}

/// POST /api/v1/admin/photo-processing/composite-tasks/{id}/cancel
pub async fn cancel_composite_task(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
) -> ApiResult<CompositeTask> {
    let task_id = parse_uuid(&task_id, "任务ID")?;
    let repository = repo();
    let pool = state.db.pool();
    // 已在执行的 worker 会在每批之间看到 cancel_requested 并收尾；
    // 已完成/失败/已取消的任务不允许再取消。
    repository
        .request_cancel_task(pool, task_id)
        .await
        .map_err(repository_error)?;
    let task = repository
        .find_task(pool, task_id)
        .await
        .map_err(repository_error)?
        .ok_or_else(|| not_found("合成任务不存在"))?;
    Ok(ApiSuccess::default().with_data(task))
}

/// GET /api/v1/admin/photo-processing/groups/{id}/composited-pairs
///
/// 给考勤托管侧「从照片处理同步」用：按 worker/project 过滤出成对的合成结果。
pub async fn list_composited_pairs(
    State(state): State<AppState>,
    Path(group_id): Path<String>,
    Query(params): Query<CompositedPairParams>,
) -> ApiResult<CompositedPairResponse> {
    let group_id = parse_uuid(&group_id, "组ID")?;
    let (items, unpaired_count) = repo()
        .list_composited_pairs(
            state.db.pool(),
            group_id,
            params.worker_id,
            params.project_id,
        )
        .await
        .map_err(repository_error)?;
    Ok(ApiSuccess::default().with_data(CompositedPairResponse {
        items,
        unpaired_count,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_size_must_be_divisible_by_16() {
        assert!(is_supported_size("1024x1536"));
        assert!(is_supported_size("512x512"));
        assert!(!is_supported_size("1000x1500"));
        assert!(!is_supported_size("1024"));
        assert!(!is_supported_size("axb"));
        assert!(!is_supported_size("0x0"));
    }

    #[test]
    fn composite_mode_defaults_to_incremental() {
        let body = StartCompositeRequest {
            output_size: None,
            prompt: None,
            mode: None,
        };
        assert_eq!(body.resolved_mode(), "incremental");
        assert_eq!(body.resolved_output_size(), "1024x1536");
        assert!(body.resolved_prompt().is_none());

        let all = StartCompositeRequest {
            output_size: Some("512x512".to_string()),
            prompt: Some("  自定义  ".to_string()),
            mode: Some("all".to_string()),
        };
        assert_eq!(all.resolved_mode(), "all");
        assert_eq!(all.resolved_output_size(), "512x512");
        assert_eq!(all.resolved_prompt().as_deref(), Some("自定义"));
    }
}
