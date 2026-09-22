//! 照片处理 AI 合成后台 worker。
//!
//! 跑在 API 进程内（`main.rs` 的 `background_workers_enabled` 分支里 spawn），
//! 通过 `photo_composite_tasks` 的租约领任务，单张约 14 秒，任务内并发
//! `PHOTO_COMPOSITE_CONCURRENCY`（默认 3）把一批 60 张压到 5 分钟左右。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use base64::{Engine as _, engine::general_purpose};
use uuid::Uuid;

use crate::state::AppState;

use super::composite::{CompositeClient, store_composite_result};
use super::repository::{ClaimedTask, CompositeRow, PhotoRepository, PhotoRepositoryImpl};

/// 单张人像压缩目标：既保住五官细节，也别把 multipart 请求撑得过大。
const PERSON_IMAGE_MAX_BYTES: usize = 2 * 1024 * 1024;
/// 背景图一般是大场景图，给到 4 MiB。
const BACKGROUND_IMAGE_MAX_BYTES: usize = 4 * 1024 * 1024;
/// 外部图片下载上限，和甬建码那条链路保持一致。
const DOWNLOAD_MAX_BYTES: usize = 15 * 1024 * 1024;
/// 拉取列表的缩略图大小：一页 200 张也就 4MB data URI。
const PREVIEW_IMAGE_MAX_BYTES: usize = 20 * 1024;

const WORKER_ID: &str = "photo-composite-worker";

pub fn spawn_photo_composite_worker(state: AppState) {
    let Some(client) = build_client(&state) else {
        // 没配密钥时不启动轮询：worker 领了任务也只能全部标记失败，
        // 反而把 attempt_count 刷上去。配置好密钥后重启 API 即可。
        tracing::warn!("未配置 EPHONE_AI_API_KEY，照片处理AI合成worker不启动");
        return;
    };

    let repository = Arc::new(PhotoRepositoryImpl::new());
    let client = Arc::new(client);
    let poll_seconds = state.config.photo_composite.poll_seconds.max(1);
    tracing::info!(
        poll_seconds,
        concurrency = state.config.photo_composite.concurrency,
        "照片处理AI合成worker已启动"
    );
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(poll_seconds));
        loop {
            ticker.tick().await;
            if let Err(error) =
                run_once(&state, Arc::clone(&repository), Arc::clone(&client)).await
            {
                tracing::error!(error = %error, "照片处理AI合成worker本轮执行失败");
            }
        }
    });
}

fn build_client(state: &AppState) -> Option<CompositeClient> {
    let client = CompositeClient::new(state.config.photo_composite.clone());
    client.is_enabled().then_some(client)
}

async fn run_once(
    state: &AppState,
    repository: Arc<PhotoRepositoryImpl>,
    client: Arc<CompositeClient>,
) -> Result<(), String> {
    let pool = state.db.pool();
    let lease_secs = state.config.photo_composite.lease_secs.max(30) as i64;
    let Some(task) = repository
        .claim_task(pool, WORKER_ID, lease_secs)
        .await
        .map_err(|error| format!("领取合成任务失败: {error}"))?
    else {
        return Ok(());
    };

    execute_task(state, repository, client, Arc::new(task)).await
}

async fn execute_task(
    state: &AppState,
    repository: Arc<PhotoRepositoryImpl>,
    client: Arc<CompositeClient>,
    task: Arc<ClaimedTask>,
) -> Result<(), String> {
    let pool = state.db.pool();
    let lease_secs = state.config.photo_composite.lease_secs.max(30) as i64;
    let rows = repository
        .load_composite_rows(pool, task.id)
        .await
        .map_err(|error| format!("读取待合成照片失败: {error}"))?;

    if task.cancel_requested {
        repository
            .finish_task(pool, task.id, 0, 0, 0, "cancelled", Some("任务在开始前被取消"))
            .await
            .map_err(|error| format!("结束已取消任务失败: {error}"))?;
        return Ok(());
    }

    // 背景图按方向只取一次，避免 60 张照片重复读同一张大图。
    let mut backgrounds: HashMap<i16, Vec<u8>> = HashMap::new();
    let mut background_errors: HashMap<i16, String> = HashMap::new();
    for direction in [super::DIRECTION_IN, super::DIRECTION_OUT] {
        match load_background(state, repository.as_ref(), task.group_id, direction).await {
            Ok(Some(bytes)) => {
                backgrounds.insert(direction, bytes);
            }
            Ok(None) => {}
            Err(error) => {
                background_errors.insert(direction, error);
            }
        }
    }

    let concurrency = state.config.photo_composite.concurrency.max(1);
    let mut success = 0_i32;
    let mut failed = 0_i32;
    let mut skipped = 0_i32;
    let mut cancelled = false;

    for chunk in rows.chunks(concurrency) {
        // 每批之间检查取消与续约。
        let cancel_requested = repository
            .task_cancel_requested(pool, task.id)
            .await
            .map_err(|error| format!("读取任务状态失败: {error}"))?;
        if cancel_requested {
            cancelled = true;
            break;
        }
        repository
            .renew_lease(pool, task.id, WORKER_ID, lease_secs)
            .await
            .map_err(|error| format!("续租失败: {error}"))?;

        let mut handles = Vec::with_capacity(chunk.len());
        for row in chunk {
            handles.push(tokio::spawn(composite_one(
                state.clone(),
                Arc::clone(&repository),
                Arc::clone(&client),
                Arc::clone(&task),
                CompositeRow {
                    id: row.id,
                    direction: row.direction,
                    photo_url: row.photo_url.clone(),
                },
                backgrounds.get(&row.direction).cloned(),
                background_errors.get(&row.direction).cloned(),
            )));
        }

        for handle in handles {
            match handle.await {
                Ok(Outcome::Done) => success += 1,
                Ok(Outcome::Skipped) => skipped += 1,
                Ok(Outcome::Failed) => failed += 1,
                Err(error) => {
                    failed += 1;
                    tracing::error!(error = %error, "合成子任务panic");
                }
            }
        }
    }

    let status = if cancelled { "cancelled" } else { "completed" };
    let summary = if cancelled {
        Some(format!(
            "已取消：成功 {success}、失败 {failed}、跳过 {skipped}"
        ))
    } else {
        None
    };
    repository
        .finish_task(pool, task.id, success, failed, skipped, status, summary.as_deref())
        .await
        .map_err(|error| format!("结束合成任务失败: {error}"))?;
    Ok(())
}

enum Outcome {
    Done,
    Skipped,
    Failed,
}

#[allow(clippy::too_many_arguments)]
async fn composite_one(
    state: AppState,
    repository: Arc<PhotoRepositoryImpl>,
    client: Arc<CompositeClient>,
    task: Arc<ClaimedTask>,
    row: CompositeRow,
    background: Option<Vec<u8>>,
    background_error: Option<String>,
) -> Outcome {
    let pool = state.db.pool();

    let Some(background) = background else {
        let reason = background_error.unwrap_or_else(|| {
            format!(
                "缺少{}背景图，请先在「背景图」页上传",
                super::direction_label(row.direction)
            )
        });
        if let Err(error) = repository
            .mark_photo_skipped(pool, row.id, task.id, &reason)
            .await
        {
            tracing::error!(error = %error, photo_id = %row.id, "标记照片跳过失败");
        }
        return Outcome::Skipped;
    };

    let person = match resolve_image_bytes(
        &state,
        &row.photo_url,
        PERSON_IMAGE_MAX_BYTES,
        "考勤人像照片",
    )
    .await
    {
        Ok(bytes) => bytes,
        Err(error) => {
            if let Err(db_error) = repository
                .mark_photo_failed(pool, row.id, task.id, &error)
                .await
            {
                tracing::error!(error = %db_error, photo_id = %row.id, "标记照片失败出错");
            }
            return Outcome::Failed;
        }
    };

    let output = match client
        .compose(
            &person,
            &background,
            row.direction,
            task.prompt_text.as_deref(),
        )
        .await
    {
        Ok(output) => output,
        Err(error) => {
            let message = error.to_string();
            if let Err(db_error) = repository
                .mark_photo_failed(pool, row.id, task.id, &message)
                .await
            {
                tracing::error!(error = %db_error, photo_id = %row.id, "标记照片失败出错");
            }
            return Outcome::Failed;
        }
    };

    let (photo_url, object_key) =
        match store_composite_result(&*state.storage, task.group_id, task.id, output.bytes).await {
            Ok(result) => result,
            Err(error) => {
                if let Err(db_error) = repository
                    .mark_photo_failed(pool, row.id, task.id, &error)
                    .await
                {
                    tracing::error!(error = %db_error, photo_id = %row.id, "标记照片失败出错");
                }
                return Outcome::Failed;
            }
        };

    if let Err(error) = repository
        .mark_photo_success(
            pool,
            row.id,
            task.id,
            &photo_url,
            &object_key,
            output.generation_id.as_deref(),
        )
        .await
    {
        tracing::error!(error = %error, photo_id = %row.id, "写入合成结果失败");
        return Outcome::Failed;
    }
    Outcome::Done
}

/// 读某方向的背景图字节；没有配置时返回 Ok(None)，读取失败返回 Err(原因)。
async fn load_background(
    state: &AppState,
    repository: &PhotoRepositoryImpl,
    group_id: Uuid,
    direction: i16,
) -> Result<Option<Vec<u8>>, String> {
    let pool = state.db.pool();
    let backgrounds = repository
        .list_backgrounds(pool, group_id)
        .await
        .map_err(|error| format!("读取背景图记录失败: {error}"))?;
    let Some(background) = backgrounds
        .into_iter()
        .find(|item| item.direction == direction)
    else {
        return Ok(None);
    };
    let bytes = resolve_image_bytes(
        state,
        &background.photo_url,
        BACKGROUND_IMAGE_MAX_BYTES,
        &format!("{}背景图", super::direction_label(direction)),
    )
    .await?;
    Ok(Some(bytes))
}

/// 加入组时用：解析原始考勤照片并存成对象存储可托管的 JPEG 字节。
/// 压缩目标和合成时一致（2 MiB），保证入组合成效果与直接合成相同。
pub async fn resolve_import_photo_bytes(
    state: &AppState,
    photo_url: &str,
) -> Result<Vec<u8>, String> {
    resolve_image_bytes(state, photo_url, PERSON_IMAGE_MAX_BYTES, "考勤照片").await
}

/// 拉取列表用：生成 20KB 缩略图 data URI 供前端勾选预览。
/// 失败时返回 None，前端用占位图，不影响整批列表。
pub async fn resolve_preview_data_uri(state: &AppState, photo_url: &str) -> Option<String> {
    let bytes = resolve_image_bytes(state, photo_url, PREVIEW_IMAGE_MAX_BYTES, "考勤照片")
        .await
        .inspect_err(|error| tracing::debug!(error = %error, "生成考勤照片缩略图失败"))
        .ok()?;
    Some(format!(
        "data:image/jpeg;base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

/// 把「原始考勤照片/背景图地址」解析成可用于 AI 接口的 JPEG 字节。
///
/// 兼容三种来源：
/// 1. `data:image/...;base64,`（MQTT 上报的考勤照片常见格式）
/// 2. 系统 `upload_files` 里的记录（本地存储或 OSS，优先走 storage.get）
/// 3. 其它 http(s) 外链（厂家平台直链），直接下载
async fn resolve_image_bytes(
    state: &AppState,
    photo_url: &str,
    max_bytes: usize,
    label: &str,
) -> Result<Vec<u8>, String> {
    let trimmed = photo_url.trim();
    if trimmed.is_empty() {
        return Err(format!("{label}地址为空"));
    }

    if let Some((metadata, encoded)) = trimmed.split_once(',')
        && metadata.starts_with("data:image/")
        && metadata.ends_with(";base64")
    {
        let bytes = general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| format!("{label} Base64 格式错误"))?;
        return crate::infrastructure::image_compression::compress_to_jpeg_below_async(
            bytes, max_bytes,
        )
        .await
        .map_err(|error| format!("{label}{error}"));
    }

    let upload = sqlx::query_as::<_, (String, String)>(
        r#"
        SELECT object_key, storage_driver
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
    .map_err(|error| format!("读取{label}上传记录失败: {error}"))?;

    if let Some((object_key, storage_driver)) = upload {
        match state.storage.get(&object_key).await {
            Ok(bytes) => {
                return crate::infrastructure::image_compression::compress_to_jpeg_below_async(
                    bytes.to_vec(),
                    max_bytes,
                )
                .await
                .map_err(|error| format!("{label}{error}"));
            }
            Err(storage_error) if matches!(storage_driver.as_str(), "jdcloud_oss" | "s3") => {
                // OSS 内网读不到时退回公网地址下载（甬建码链路同款兜底）。
                tracing::debug!(
                    error = %storage_error,
                    driver = %storage_driver,
                    "{label}走对象存储读取失败，改用公网地址下载"
                );
            }
            Err(error) => return Err(format!("读取{label}失败: {error}")),
        }
    }

    let response = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|error| format!("创建{label}下载请求失败: {error}"))?
        .get(trimmed)
        .send()
        .await
        .map_err(|error| format!("下载{label}失败: {error}"))?
        .error_for_status()
        .map_err(|error| format!("下载{label}返回错误: {error}"))?;
    if response
        .content_length()
        .is_some_and(|size| size > DOWNLOAD_MAX_BYTES as u64)
    {
        return Err(format!("{label}超过 {} MiB 限制", DOWNLOAD_MAX_BYTES / 1024 / 1024));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取{label}响应失败: {error}"))?;
    if bytes.len() > DOWNLOAD_MAX_BYTES {
        return Err(format!("{label}超过 {} MiB 限制", DOWNLOAD_MAX_BYTES / 1024 / 1024));
    }
    crate::infrastructure::image_compression::compress_to_jpeg_below_async(
        bytes.to_vec(),
        max_bytes,
    )
    .await
    .map_err(|error| format!("{label}{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::repository::{NewGroupPhoto, PhotoRepositoryError};

    #[test]
    fn worker_id_is_stable() {
        assert_eq!(WORKER_ID, "photo-composite-worker");
    }

    #[test]
    fn new_group_photo_is_constructible() {
        // 编译期校验 handler 构造的参数顺序没有漂移。
        let photo = NewGroupPhoto {
            project_id: Uuid::nil(),
            worker_id: None,
            worker_name: "张三".to_string(),
            attendance_record_id: None,
            attendance_date: chrono::NaiveDate::from_ymd_opt(2026, 9, 22).unwrap(),
            direction: super::super::DIRECTION_IN,
            photo_url: "https://example.invalid/a.png".to_string(),
            sort_index: 1,
        };
        assert_eq!(photo.direction, 0);
        assert_eq!(photo.sort_index, 1);
    }

    #[test]
    fn repository_error_maps_to_message() {
        let error = PhotoRepositoryError::GroupNotFound;
        assert_eq!(error.to_string(), "照片处理组不存在");
    }
}
