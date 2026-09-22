use async_trait::async_trait;
use chrono::NaiveDate;
use sqlx::{PgPool, QueryBuilder, Postgres};
use uuid::Uuid;

use super::dto::{
    CompositedPair, CompositeTask, PhotoGroupBackground, PhotoGroupPhoto, PhotoGroupStats,
    PhotoGroupSummary,
};

/// 仓库层错误：只区分「查不到」和「数据库错误」，业务校验放在 handler。
#[derive(Debug, thiserror::Error)]
pub enum PhotoRepositoryError {
    #[error("照片处理组不存在")]
    GroupNotFound,

    #[error("照片不存在")]
    PhotoNotFound,

    #[error("数据库错误: {0}")]
    Database(#[from] sqlx::Error),
}

pub type PhotoResult<T> = Result<T, PhotoRepositoryError>;

/// 待写入的人像照片（原图已在 handler 归一化到对象存储）。
pub struct NewGroupPhoto {
    pub project_id: Uuid,
    pub worker_id: Option<Uuid>,
    pub worker_name: String,
    pub attendance_record_id: Option<Uuid>,
    pub attendance_date: NaiveDate,
    pub direction: i16,
    pub photo_url: String,
    pub sort_index: i32,
}

/// worker 侧领取到的任务。
pub struct ClaimedTask {
    pub id: Uuid,
    pub group_id: Uuid,
    pub total_count: i32,
    pub output_size: String,
    pub prompt_text: Option<String>,
    pub cancel_requested: bool,
}

/// 可拉取的考勤照片原始行；缩略图由 handler 生成，避免把整批原图下发到前端。
#[derive(Debug, sqlx::FromRow)]
pub struct AttendancePhotoRow {
    pub attendance_record_id: Uuid,
    pub project_id: Uuid,
    pub worker_id: Uuid,
    pub worker_name: String,
    pub attendance_date: NaiveDate,
    pub trigger_time: chrono::DateTime<chrono::Utc>,
    pub direction: i16,
    /// 原始考勤照片地址：可能是 http(s) 外链，也可能是 data:image/...;base64, 数据。
    pub photo_url: String,
}

/// worker 侧逐张合成需要的数据。
pub struct CompositeRow {
    pub id: Uuid,
    pub direction: i16,
    pub photo_url: String,
}

/// 后台 worker 专用仓库。
#[async_trait]
pub trait PhotoRepository: Send + Sync {
    async fn list_groups(
        &self,
        pool: &PgPool,
        page: i64,
        page_size: i64,
        keyword: Option<&str>,
    ) -> PhotoResult<(Vec<PhotoGroupSummary>, i64)>;

    async fn group_exists(&self, pool: &PgPool, group_id: Uuid) -> PhotoResult<bool>;

    async fn group_profile(
        &self,
        pool: &PgPool,
        group_id: Uuid,
    ) -> PhotoResult<(String, Option<String>)>;

    async fn create_group(
        &self,
        pool: &PgPool,
        name: &str,
        remark: Option<&str>,
        created_by: Option<Uuid>,
    ) -> PhotoResult<Uuid>;

    async fn update_group(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        name: Option<&str>,
        remark: Option<&str>,
    ) -> PhotoResult<()>;

    async fn soft_delete_group(&self, pool: &PgPool, group_id: Uuid) -> PhotoResult<()>;

    async fn list_photos(&self, pool: &PgPool, group_id: Uuid) -> PhotoResult<Vec<PhotoGroupPhoto>>;

    async fn list_backgrounds(
        &self,
        pool: &PgPool,
        group_id: Uuid,
    ) -> PhotoResult<Vec<PhotoGroupBackground>>;

    async fn group_stats(&self, pool: &PgPool, group_id: Uuid) -> PhotoResult<PhotoGroupStats>;

    async fn background_exists(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        direction: i16,
    ) -> PhotoResult<bool>;

    async fn max_sort_index(&self, pool: &PgPool, group_id: Uuid) -> PhotoResult<i32>;

    /// 组内已有的（考勤记录, 方向）指纹，用于加入时去重。
    /// 前端已经按同样的键过滤过，这里再兜一层，避免两个标签页同时加入产生重复行。
    async fn existing_photo_keys(
        &self,
        pool: &PgPool,
        group_id: Uuid,
    ) -> PhotoResult<Vec<(Option<Uuid>, i16)>>;

    async fn insert_photos(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        photos: &[NewGroupPhoto],
    ) -> PhotoResult<u64>;

    async fn soft_delete_photo(&self, pool: &PgPool, group_id: Uuid, photo_id: Uuid)
    -> PhotoResult<()>;

    async fn upsert_background(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        direction: i16,
        photo_url: &str,
        object_key: Option<&str>,
        remark: Option<&str>,
    ) -> PhotoResult<Uuid>;

    async fn soft_delete_background(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        direction: i16,
    ) -> PhotoResult<()>;

    async fn count_attendance_photos(
        &self,
        pool: &PgPool,
        project_id: Option<Uuid>,
        worker_id: Option<Uuid>,
        date_from: Option<NaiveDate>,
        date_to: Option<NaiveDate>,
        direction: Option<i16>,
        restrict_to_user: Option<Uuid>,
    ) -> PhotoResult<i64>;

    async fn list_attendance_photos(
        &self,
        pool: &PgPool,
        project_id: Option<Uuid>,
        worker_id: Option<Uuid>,
        date_from: Option<NaiveDate>,
        date_to: Option<NaiveDate>,
        direction: Option<i16>,
        limit: i64,
        restrict_to_user: Option<Uuid>,
    ) -> PhotoResult<Vec<AttendancePhotoRow>>;

    async fn create_task(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        total_count: i32,
        output_size: &str,
        prompt_text: Option<&str>,
        created_by: Option<Uuid>,
    ) -> PhotoResult<Uuid>;

    /// 发起新一轮合成：把指定范围的照片归位为 pending 并盖上本任务 ID，
    /// 返回本轮要合成的张数。`include_success=false` 时只重试失败/跳过/待合成的照片。
    async fn prepare_run(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        task_id: Uuid,
        include_success: bool,
    ) -> PhotoResult<i64>;

    /// worker 只领取已经有照片挂载的任务，避免和 `prepare_run` 抢跑。
    async fn set_task_total(&self, pool: &PgPool, task_id: Uuid, total: i32) -> PhotoResult<()>;

    async fn find_task(&self, pool: &PgPool, task_id: Uuid) -> PhotoResult<Option<CompositeTask>>;

    async fn latest_task(
        &self,
        pool: &PgPool,
        group_id: Uuid,
    ) -> PhotoResult<Option<CompositeTask>>;

    async fn request_cancel_task(&self, pool: &PgPool, task_id: Uuid) -> PhotoResult<()>;

    /// worker 每批之间查询一次，比把整个任务行读回来更轻。
    async fn task_cancel_requested(&self, pool: &PgPool, task_id: Uuid) -> PhotoResult<bool>;

    async fn list_composited_pairs(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        worker_id: Option<Uuid>,
        project_id: Option<Uuid>,
    ) -> PhotoResult<(Vec<CompositedPair>, i64)>;

    async fn claim_task(
        &self,
        pool: &PgPool,
        claimed_by: &str,
        lease_secs: i64,
    ) -> PhotoResult<Option<ClaimedTask>>;

    async fn load_composite_rows(
        &self,
        pool: &PgPool,
        task_id: Uuid,
    ) -> PhotoResult<Vec<CompositeRow>>;

    async fn renew_lease(
        &self,
        pool: &PgPool,
        task_id: Uuid,
        claimed_by: &str,
        lease_secs: i64,
    ) -> PhotoResult<()>;

    async fn mark_photo_success(
        &self,
        pool: &PgPool,
        photo_id: Uuid,
        task_id: Uuid,
        photo_url: &str,
        object_key: &str,
        generation_id: Option<&str>,
    ) -> PhotoResult<()>;

    async fn mark_photo_failed(
        &self,
        pool: &PgPool,
        photo_id: Uuid,
        task_id: Uuid,
        error: &str,
    ) -> PhotoResult<()>;

    async fn mark_photo_skipped(
        &self,
        pool: &PgPool,
        photo_id: Uuid,
        task_id: Uuid,
        reason: &str,
    ) -> PhotoResult<()>;

    async fn finish_task(
        &self,
        pool: &PgPool,
        task_id: Uuid,
        success_count: i32,
        failed_count: i32,
        skipped_count: i32,
        status: &str,
        error_summary: Option<&str>,
    ) -> PhotoResult<()>;

}

/// 把「可访问项目」限制推进 SQL：`Some(user_id)` 表示只允许该用户被授权的项目，
/// `None` 表示系统管理员不限制。
/// 这是 AGENTS.md 权限记忆要求的后端查询层过滤，不能只靠前端。
fn push_accessible_projects(
    query: &mut QueryBuilder<'_, Postgres>,
    restrict_to_user: Option<Uuid>,
) {
    let Some(user_id) = restrict_to_user else {
        return;
    };
    query
        .push(" AND EXISTS (SELECT 1 FROM user_managed_projects ump WHERE ump.user_id = ");
    query.push_bind(user_id);
    query.push(" AND ump.project_id = r.project_id)");
}

/// 真实考勤照片的公共过滤条件（照抄 `historical_attendance_photo_pairs` 的排除项）：
/// 排除生成记录、只认设备打卡、要求设备号非空、必须有照片。
const ATTENDANCE_PHOTO_FILTER: &str = r#"
    AND r.is_deleted = FALSE
    AND r.is_generated = FALSE
    AND r.is_managed_generated = FALSE
    AND COALESCE(r.record_type, 'device') = 'device'
    AND NULLIF(BTRIM(COALESCE(r.serial_number, r.equipment_id)), '') IS NOT NULL
    AND COALESCE(NULLIF(photo.photo_data, ''), NULLIF(r.photo_path, '')) IS NOT NULL
"#;

/// 拉取考勤照片的筛选条件；项目范围在后端查询层过滤（AGENTS.md 权限记忆）。
fn push_attendance_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    project_id: Option<Uuid>,
    worker_id: Option<Uuid>,
    date_from: Option<NaiveDate>,
    date_to: Option<NaiveDate>,
    direction: Option<i16>,
    restrict_to_user: Option<Uuid>,
) {
    if let Some(project_id) = project_id {
        query.push(" AND r.project_id = ");
        query.push_bind(project_id);
    }
    if let Some(worker_id) = worker_id {
        query.push(" AND r.worker_id = ");
        query.push_bind(worker_id);
    }
    if let Some(date_from) = date_from {
        query.push(
            " AND (r.trigger_time AT TIME ZONE 'Asia/Shanghai')::date >= ",
        );
        query.push_bind(date_from);
    }
    if let Some(date_to) = date_to {
        query.push(" AND (r.trigger_time AT TIME ZONE 'Asia/Shanghai')::date <= ");
        query.push_bind(date_to);
    }
    if let Some(direction) = direction {
        query.push(" AND r.direction = ");
        query.push_bind(direction);
    }
    query.push(ATTENDANCE_PHOTO_FILTER);
    push_accessible_projects(query, restrict_to_user);
}

pub struct PhotoRepositoryImpl;

impl PhotoRepositoryImpl {
    pub fn new() -> Self {
        Self
    }

    /// 已合成成功但没凑齐进/出一对的条数，供同步预览提示用户。
    async fn unpaired_success_count(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        worker_id: Option<Uuid>,
        project_id: Option<Uuid>,
    ) -> PhotoResult<i64> {
        let mut query = QueryBuilder::<Postgres>::new(
            r#"
            WITH ranked AS (
                SELECT
                    p.id,
                    p.worker_id,
                    p.attendance_date,
                    p.direction,
                    ROW_NUMBER() OVER (
                        PARTITION BY p.worker_id, p.attendance_date, p.direction
                        ORDER BY p.sort_index, p.created_at, p.id
                    ) AS pair_index
                FROM photo_processing_group_photos p
                WHERE p.group_id = "#,
        );
        query.push_bind(group_id);
        query.push(
            r#"
              AND p.is_deleted = FALSE
              AND p.composite_status = 'success'
              AND p.composite_photo_url IS NOT NULL
            "#,
        );
        if let Some(worker_id) = worker_id {
            query.push(" AND p.worker_id = ");
            query.push_bind(worker_id);
        }
        if let Some(project_id) = project_id {
            query.push(" AND p.project_id = ");
            query.push_bind(project_id);
        }
        // 「没凑成对」的定义必须和 list_composited_pairs 的配对口径一致：
        // 同一工人 + 同一天 + 反方向存在同一个 pair_index。
        query.push(
            r#"
            )
            SELECT COUNT(*)
            FROM ranked r
            WHERE NOT EXISTS (
                SELECT 1
                FROM ranked other
                WHERE other.direction <> r.direction
                  AND other.attendance_date = r.attendance_date
                  AND other.worker_id IS NOT DISTINCT FROM r.worker_id
                  AND other.pair_index = r.pair_index
            )
            "#,
        );
        let total: i64 = query.build_query_scalar().fetch_one(pool).await?;
        Ok(total)
    }
}

impl Default for PhotoRepositoryImpl {
    fn default() -> Self {
        Self::new()
    }
}

/// 考勤照片查询的公共片段：LATERAL 取一张最像「人像」的照片（优先 closeup）。
const ATTENDANCE_PHOTO_SOURCE: &str = r#"
    FROM construction_attendance_records r
    LEFT JOIN LATERAL (
        SELECT p.photo_data
        FROM construction_attendance_record_photos p
        WHERE p.attendance_record_id = r.id
          AND p.photo_kind IN ('closeup', 'snapshot')
          AND NULLIF(BTRIM(p.photo_data), '') IS NOT NULL
        ORDER BY (p.photo_kind = 'closeup') DESC,
                 (p.source = 'admin_upload') ASC,
                 p.created_at DESC,
                 p.id DESC
        LIMIT 1
    ) photo ON TRUE
    JOIN construction_workers w ON w.id = r.worker_id
    WHERE TRUE
"#;

/// `photo_composite_tasks` 的列清单，find/latest 共用。
const TASK_COLUMNS: &str = r#"
    SELECT
        id, group_id, status, total_count, success_count, failed_count, skipped_count,
        output_size, prompt_text, error_summary, cancel_requested,
        created_at, started_at, completed_at
    FROM photo_composite_tasks
"#;

#[async_trait]
impl PhotoRepository for PhotoRepositoryImpl {
    async fn list_groups(
        &self,
        pool: &PgPool,
        page: i64,
        page_size: i64,
        keyword: Option<&str>,
    ) -> PhotoResult<(Vec<PhotoGroupSummary>, i64)> {
        let offset = (page - 1).max(0) * page_size;

        let mut count_query = QueryBuilder::<Postgres>::new(
            "SELECT COUNT(*) FROM photo_processing_groups g WHERE g.is_deleted = FALSE",
        );
        push_group_keyword(&mut count_query, keyword);
        let total: i64 = count_query.build_query_scalar().fetch_one(pool).await?;

        let mut query = QueryBuilder::<Postgres>::new(
            r#"
            SELECT
                g.id,
                g.name,
                g.remark,
                g.created_at,
                g.updated_at,
                COUNT(p.id) FILTER (WHERE p.is_deleted = FALSE) AS photo_count,
                COUNT(p.id) FILTER (WHERE p.is_deleted = FALSE AND p.composite_status = 'pending') AS pending_count,
                COUNT(p.id) FILTER (WHERE p.is_deleted = FALSE AND p.composite_status = 'success') AS success_count,
                COUNT(p.id) FILTER (WHERE p.is_deleted = FALSE AND p.composite_status = 'failed') AS failed_count,
                COUNT(p.id) FILTER (WHERE p.is_deleted = FALSE AND p.composite_status = 'skipped') AS skipped_count,
                EXISTS (
                    SELECT 1 FROM photo_processing_group_backgrounds b
                    WHERE b.group_id = g.id AND b.direction = 0 AND b.is_deleted = FALSE
                ) AS has_in_background,
                EXISTS (
                    SELECT 1 FROM photo_processing_group_backgrounds b
                    WHERE b.group_id = g.id AND b.direction = 1 AND b.is_deleted = FALSE
                ) AS has_out_background
            FROM photo_processing_groups g
            LEFT JOIN photo_processing_group_photos p ON p.group_id = g.id
            WHERE g.is_deleted = FALSE
            "#,
        );
        push_group_keyword(&mut query, keyword);
        query.push(" GROUP BY g.id ORDER BY g.created_at DESC LIMIT ");
        query.push_bind(page_size);
        query.push(" OFFSET ");
        query.push_bind(offset);

        let items = query
            .build_query_as::<PhotoGroupSummary>()
            .fetch_all(pool)
            .await?;
        Ok((items, total))
    }

    async fn group_exists(&self, pool: &PgPool, group_id: Uuid) -> PhotoResult<bool> {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (SELECT 1 FROM photo_processing_groups WHERE id = $1 AND is_deleted = FALSE)",
        )
        .bind(group_id)
        .fetch_one(pool)
        .await?;
        Ok(exists)
    }

    async fn group_profile(
        &self,
        pool: &PgPool,
        group_id: Uuid,
    ) -> PhotoResult<(String, Option<String>)> {
        let profile = sqlx::query_as::<_, (String, Option<String>)>(
            "SELECT name, remark FROM photo_processing_groups WHERE id = $1 AND is_deleted = FALSE",
        )
        .bind(group_id)
        .fetch_optional(pool)
        .await?
        .ok_or(PhotoRepositoryError::GroupNotFound)?;
        Ok(profile)
    }

    async fn create_group(
        &self,
        pool: &PgPool,
        name: &str,
        remark: Option<&str>,
        created_by: Option<Uuid>,
    ) -> PhotoResult<Uuid> {
        let id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO photo_processing_groups (name, remark, created_by)
            VALUES ($1, $2, $3)
            RETURNING id
            "#,
        )
        .bind(name)
        .bind(remark)
        .bind(created_by)
        .fetch_one(pool)
        .await?;
        Ok(id)
    }

    async fn update_group(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        name: Option<&str>,
        remark: Option<&str>,
    ) -> PhotoResult<()> {
        let result = sqlx::query(
            r#"
            UPDATE photo_processing_groups
            SET name = COALESCE($2, name),
                remark = COALESCE($3, remark),
                updated_at = NOW()
            WHERE id = $1 AND is_deleted = FALSE
            "#,
        )
        .bind(group_id)
        .bind(name)
        .bind(remark)
        .execute(pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(PhotoRepositoryError::GroupNotFound);
        }
        Ok(())
    }

    async fn soft_delete_group(&self, pool: &PgPool, group_id: Uuid) -> PhotoResult<()> {
        let mut tx = pool.begin().await?;
        sqlx::query(
            "UPDATE photo_processing_group_photos SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW() WHERE group_id = $1 AND is_deleted = FALSE",
        )
        .bind(group_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE photo_processing_group_backgrounds SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW() WHERE group_id = $1 AND is_deleted = FALSE",
        )
        .bind(group_id)
        .execute(&mut *tx)
        .await?;
        let result = sqlx::query(
            "UPDATE photo_processing_groups SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND is_deleted = FALSE",
        )
        .bind(group_id)
        .execute(&mut *tx)
        .await?;
        if result.rows_affected() == 0 {
            return Err(PhotoRepositoryError::GroupNotFound);
        }
        tx.commit().await?;
        Ok(())
    }

    async fn list_photos(&self, pool: &PgPool, group_id: Uuid) -> PhotoResult<Vec<PhotoGroupPhoto>> {
        let photos = sqlx::query_as::<_, PhotoGroupPhoto>(
            r#"
            SELECT
                p.id,
                p.project_id,
                pr.name AS project_name,
                p.worker_id,
                p.worker_name,
                p.attendance_record_id,
                p.attendance_date,
                p.direction,
                p.photo_url,
                p.sort_index,
                p.composite_status,
                p.composite_photo_url,
                p.composite_error,
                p.composited_at,
                p.created_at
            FROM photo_processing_group_photos p
            LEFT JOIN construction_projects pr ON pr.id = p.project_id
            WHERE p.group_id = $1 AND p.is_deleted = FALSE
            ORDER BY p.sort_index, p.created_at, p.id
            "#,
        )
        .bind(group_id)
        .fetch_all(pool)
        .await?;
        Ok(photos)
    }

    async fn list_backgrounds(
        &self,
        pool: &PgPool,
        group_id: Uuid,
    ) -> PhotoResult<Vec<PhotoGroupBackground>> {
        let backgrounds = sqlx::query_as::<_, PhotoGroupBackground>(
            r#"
            SELECT id, direction, photo_url, remark
            FROM photo_processing_group_backgrounds
            WHERE group_id = $1 AND is_deleted = FALSE
            ORDER BY direction
            "#,
        )
        .bind(group_id)
        .fetch_all(pool)
        .await?;
        Ok(backgrounds)
    }

    async fn group_stats(&self, pool: &PgPool, group_id: Uuid) -> PhotoResult<PhotoGroupStats> {
        let stats = sqlx::query_as::<_, PhotoGroupStats>(
            r#"
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE composite_status = 'pending') AS pending,
                COUNT(*) FILTER (WHERE composite_status = 'success') AS success,
                COUNT(*) FILTER (WHERE composite_status = 'failed') AS failed,
                COUNT(*) FILTER (WHERE composite_status = 'skipped') AS skipped
            FROM photo_processing_group_photos
            WHERE group_id = $1 AND is_deleted = FALSE
            "#,
        )
        .bind(group_id)
        .fetch_one(pool)
        .await?;
        Ok(stats)
    }

    async fn background_exists(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        direction: i16,
    ) -> PhotoResult<bool> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
                SELECT 1 FROM photo_processing_group_backgrounds
                WHERE group_id = $1 AND direction = $2 AND is_deleted = FALSE
            )
            "#,
        )
        .bind(group_id)
        .bind(direction)
        .fetch_one(pool)
        .await?;
        Ok(exists)
    }

    async fn max_sort_index(&self, pool: &PgPool, group_id: Uuid) -> PhotoResult<i32> {
        let max = sqlx::query_scalar::<_, Option<i32>>(
            "SELECT MAX(sort_index) FROM photo_processing_group_photos WHERE group_id = $1 AND is_deleted = FALSE",
        )
        .bind(group_id)
        .fetch_one(pool)
        .await?;
        Ok(max.unwrap_or(0))
    }

    async fn existing_photo_keys(
        &self,
        pool: &PgPool,
        group_id: Uuid,
    ) -> PhotoResult<Vec<(Option<Uuid>, i16)>> {
        let rows = sqlx::query_as::<_, (Option<Uuid>, i16)>(
            r#"
            SELECT attendance_record_id, direction
            FROM photo_processing_group_photos
            WHERE group_id = $1 AND is_deleted = FALSE
            "#,
        )
        .bind(group_id)
        .fetch_all(pool)
        .await?;
        Ok(rows)
    }

    async fn insert_photos(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        photos: &[NewGroupPhoto],
    ) -> PhotoResult<u64> {
        if photos.is_empty() {
            // push_values 空列表会让 QueryBuilder 生成非法 SQL，直接短路。
            return Ok(0);
        }
        let mut query = QueryBuilder::<Postgres>::new(
            r#"
            INSERT INTO photo_processing_group_photos (
                group_id, project_id, worker_id, worker_name, attendance_record_id,
                attendance_date, direction, photo_url, sort_index
            )
            "#,
        );
        query.push_values(photos, |mut row, photo| {
            row.push_bind(group_id)
                .push_bind(photo.project_id)
                .push_bind(photo.worker_id)
                .push_bind(photo.worker_name.as_str())
                .push_bind(photo.attendance_record_id)
                .push_bind(photo.attendance_date)
                .push_bind(photo.direction)
                .push_bind(photo.photo_url.as_str())
                .push_bind(photo.sort_index);
        });
        let result = query.build().execute(pool).await?;
        Ok(result.rows_affected())
    }

    async fn soft_delete_photo(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        photo_id: Uuid,
    ) -> PhotoResult<()> {
        let result = sqlx::query(
            r#"
            UPDATE photo_processing_group_photos
            SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND group_id = $2 AND is_deleted = FALSE
            "#,
        )
        .bind(photo_id)
        .bind(group_id)
        .execute(pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(PhotoRepositoryError::PhotoNotFound);
        }
        Ok(())
    }

    async fn upsert_background(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        direction: i16,
        photo_url: &str,
        object_key: Option<&str>,
        remark: Option<&str>,
    ) -> PhotoResult<Uuid> {
        // 同一方向只保留一张：先软删旧行再插新行（部分唯一索引的要求）。
        let mut tx = pool.begin().await?;
        sqlx::query(
            r#"
            UPDATE photo_processing_group_backgrounds
            SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
            WHERE group_id = $1 AND direction = $2 AND is_deleted = FALSE
            "#,
        )
        .bind(group_id)
        .bind(direction)
        .execute(&mut *tx)
        .await?;
        let id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO photo_processing_group_backgrounds (group_id, direction, photo_url, object_key, remark)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            "#,
        )
        .bind(group_id)
        .bind(direction)
        .bind(photo_url)
        .bind(object_key)
        .bind(remark)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(id)
    }

    async fn soft_delete_background(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        direction: i16,
    ) -> PhotoResult<()> {
        let result = sqlx::query(
            r#"
            UPDATE photo_processing_group_backgrounds
            SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
            WHERE group_id = $1 AND direction = $2 AND is_deleted = FALSE
            "#,
        )
        .bind(group_id)
        .bind(direction)
        .execute(pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(PhotoRepositoryError::PhotoNotFound);
        }
        Ok(())
    }

    async fn count_attendance_photos(
        &self,
        pool: &PgPool,
        project_id: Option<Uuid>,
        worker_id: Option<Uuid>,
        date_from: Option<NaiveDate>,
        date_to: Option<NaiveDate>,
        direction: Option<i16>,
        restrict_to_user: Option<Uuid>,
    ) -> PhotoResult<i64> {
        let mut query = QueryBuilder::<Postgres>::new("SELECT COUNT(*)");
        query.push(ATTENDANCE_PHOTO_SOURCE);
        push_attendance_filters(
            &mut query,
            project_id,
            worker_id,
            date_from,
            date_to,
            direction,
            restrict_to_user,
        );
        let total: i64 = query.build_query_scalar().fetch_one(pool).await?;
        Ok(total)
    }

    async fn list_attendance_photos(
        &self,
        pool: &PgPool,
        project_id: Option<Uuid>,
        worker_id: Option<Uuid>,
        date_from: Option<NaiveDate>,
        date_to: Option<NaiveDate>,
        direction: Option<i16>,
        limit: i64,
        restrict_to_user: Option<Uuid>,
    ) -> PhotoResult<Vec<AttendancePhotoRow>> {
        let mut query = QueryBuilder::<Postgres>::new(
            r#"
            SELECT
                r.id AS attendance_record_id,
                r.project_id,
                r.worker_id,
                w.name AS worker_name,
                (r.trigger_time AT TIME ZONE 'Asia/Shanghai')::date AS attendance_date,
                r.trigger_time,
                r.direction,
                COALESCE(NULLIF(photo.photo_data, ''), NULLIF(r.photo_path, '')) AS photo_url
            "#,
        );
        query.push(ATTENDANCE_PHOTO_SOURCE);
        push_attendance_filters(
            &mut query,
            project_id,
            worker_id,
            date_from,
            date_to,
            direction,
            restrict_to_user,
        );
        query.push(" ORDER BY r.trigger_time DESC, r.id DESC LIMIT ");
        query.push_bind(limit);

        let items = query
            .build_query_as::<AttendancePhotoRow>()
            .fetch_all(pool)
            .await?;
        Ok(items)
    }

    async fn create_task(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        total_count: i32,
        output_size: &str,
        prompt_text: Option<&str>,
        created_by: Option<Uuid>,
    ) -> PhotoResult<Uuid> {
        let id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO photo_composite_tasks (group_id, total_count, output_size, prompt_text, created_by)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            "#,
        )
        .bind(group_id)
        .bind(total_count)
        .bind(output_size)
        .bind(prompt_text)
        .bind(created_by)
        .fetch_one(pool)
        .await?;
        Ok(id)
    }

    async fn prepare_run(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        task_id: Uuid,
        include_success: bool,
    ) -> PhotoResult<i64> {
        // 重新合成是覆盖语义：上一轮的失败/跳过痕迹一并清掉，只保留成功结果
        // （除非显式选择全部重跑），避免用户对着半成品猜原因。
        let mut query = QueryBuilder::<Postgres>::new(
            r#"
            UPDATE photo_processing_group_photos
            SET composite_status = 'pending',
                composite_error = NULL,
                composite_photo_url = CASE WHEN "#,
        );
        query.push_bind(include_success);
        query.push(" THEN NULL ELSE composite_photo_url END, composite_object_key = CASE WHEN ");
        query.push_bind(include_success);
        query.push(
            r#" THEN NULL ELSE composite_object_key END,
                composite_generation_id = NULL,
                composited_at = NULL,
                composite_task_id = "#,
        );
        query.push_bind(task_id);
        query.push(", updated_at = NOW() WHERE group_id = ");
        query.push_bind(group_id);
        query.push(" AND is_deleted = FALSE AND (composite_status <> 'success' OR ");
        query.push_bind(include_success);
        query.push(")");

        let result = query.build().execute(pool).await?;
        Ok(result.rows_affected() as i64)
    }

    async fn set_task_total(&self, pool: &PgPool, task_id: Uuid, total: i32) -> PhotoResult<()> {
        sqlx::query("UPDATE photo_composite_tasks SET total_count = $2 WHERE id = $1")
            .bind(task_id)
            .bind(total)
            .execute(pool)
            .await?;
        Ok(())
    }

    async fn find_task(&self, pool: &PgPool, task_id: Uuid) -> PhotoResult<Option<CompositeTask>> {
        // WHERE 必须写在这里：TASK_COLUMNS 是共享片段，光 bind 不带占位符的话
        // bind 会被静默丢弃，返回表里任意一行。
        let sql = format!("{TASK_COLUMNS} WHERE id = $1");
        let task = sqlx::query_as::<_, CompositeTask>(&sql)
            .bind(task_id)
            .fetch_optional(pool)
            .await?;
        Ok(task)
    }

    async fn latest_task(
        &self,
        pool: &PgPool,
        group_id: Uuid,
    ) -> PhotoResult<Option<CompositeTask>> {
        let sql = format!("{TASK_COLUMNS} WHERE group_id = $1 ORDER BY created_at DESC LIMIT 1");
        let task = sqlx::query_as::<_, CompositeTask>(&sql)
            .bind(group_id)
            .fetch_optional(pool)
            .await?;
        Ok(task)
    }

    async fn request_cancel_task(&self, pool: &PgPool, task_id: Uuid) -> PhotoResult<()> {
        let result = sqlx::query(
            r#"
            UPDATE photo_composite_tasks
            SET cancel_requested = TRUE
            WHERE id = $1 AND status IN ('pending', 'running')
            "#,
        )
        .bind(task_id)
        .execute(pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(PhotoRepositoryError::PhotoNotFound);
        }
        Ok(())
    }

    async fn list_composited_pairs(
        &self,
        pool: &PgPool,
        group_id: Uuid,
        worker_id: Option<Uuid>,
        project_id: Option<Uuid>,
    ) -> PhotoResult<(Vec<CompositedPair>, i64)> {
        let mut query = QueryBuilder::<Postgres>::new(
            r#"
            WITH ranked AS (
                SELECT
                    p.id,
                    p.project_id,
                    p.worker_id,
                    p.attendance_date,
                    p.sort_index,
                    p.created_at,
                    p.composite_photo_url,
                    p.composited_at,
                    p.direction,
                    ROW_NUMBER() OVER (
                        PARTITION BY p.worker_id, p.attendance_date, p.direction
                        ORDER BY p.sort_index, p.created_at, p.id
                    ) AS pair_index,
                    COUNT(*) OVER (
                        PARTITION BY p.worker_id, p.attendance_date, p.direction
                    ) AS direction_count
                FROM photo_processing_group_photos p
                WHERE p.group_id = "#,
        );
        query.push_bind(group_id);
        query.push(
            r#"
                  AND p.is_deleted = FALSE
                  AND p.composite_status = 'success'
                  AND p.composite_photo_url IS NOT NULL
            "#,
        );
        // 组是跨项目全局组，过滤条件必须落在 CTE 里，
        // 否则进场张会被别人的出场张配上。
        if let Some(worker_id) = worker_id {
            query.push(" AND p.worker_id = ");
            query.push_bind(worker_id);
        }
        if let Some(project_id) = project_id {
            query.push(" AND p.project_id = ");
            query.push_bind(project_id);
        }
        query.push(
            r#"
            )
            SELECT
                incoming.attendance_date,
                incoming.pair_index,
                incoming.composite_photo_url AS in_photo,
                outgoing.composite_photo_url AS out_photo,
                incoming.composited_at AS in_time,
                outgoing.composited_at AS out_time,
                incoming.direction_count AS in_count,
                outgoing.direction_count AS out_count
            FROM ranked incoming
            JOIN ranked outgoing
              ON outgoing.worker_id IS NOT DISTINCT FROM incoming.worker_id
             AND outgoing.attendance_date = incoming.attendance_date
             AND outgoing.pair_index = incoming.pair_index
             AND outgoing.direction = 1
            WHERE incoming.direction = 0
            ORDER BY incoming.attendance_date DESC, incoming.pair_index ASC
            "#,
        );

        let items = query
            .build_query_as::<CompositedPair>()
            .fetch_all(pool)
            .await?;
        let unpaired = self
            .unpaired_success_count(pool, group_id, worker_id, project_id)
            .await?;
        Ok((items, unpaired))
    }

    async fn claim_task(
        &self,
        pool: &PgPool,
        claimed_by: &str,
        lease_secs: i64,
    ) -> PhotoResult<Option<ClaimedTask>> {
        let task = sqlx::query_as::<_, (Uuid, Uuid, i32, String, Option<String>, bool)>(
            r#"
            WITH due AS (
                SELECT id
                FROM photo_composite_tasks
                WHERE total_count > 0
                  AND (status = 'pending'
                       OR (status = 'running' AND lease_expires_at < NOW()))
                ORDER BY created_at
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            UPDATE photo_composite_tasks t
            SET status = 'running',
                claimed_by = $1,
                lease_expires_at = NOW() + make_interval(secs => $2),
                attempt_count = t.attempt_count + 1,
                started_at = COALESCE(t.started_at, NOW())
            FROM due
            WHERE t.id = due.id
            RETURNING t.id, t.group_id, t.total_count, t.output_size, t.prompt_text, t.cancel_requested
            "#,
        )
        .bind(claimed_by)
        .bind(lease_secs as f64)
        .fetch_optional(pool)
        .await?
        .map(
            |(id, group_id, total_count, output_size, prompt_text, cancel_requested)| ClaimedTask {
                id,
                group_id,
                total_count,
                output_size,
                prompt_text,
                cancel_requested,
            },
        );
        Ok(task)
    }

    async fn task_cancel_requested(&self, pool: &PgPool, task_id: Uuid) -> PhotoResult<bool> {
        let requested = sqlx::query_scalar::<_, bool>(
            "SELECT COALESCE(cancel_requested, FALSE) FROM photo_composite_tasks WHERE id = $1",
        )
        .bind(task_id)
        .fetch_optional(pool)
        .await?
        .unwrap_or(false);
        Ok(requested)
    }

    async fn load_composite_rows(
        &self,
        pool: &PgPool,
        task_id: Uuid,
    ) -> PhotoResult<Vec<CompositeRow>> {
        // 只处理被本任务盖章的照片：任务创建后再加进组的照片属于下一轮，
        // 不应该被这一轮顺带合成。
        let rows = sqlx::query_as::<_, (Uuid, i16, String)>(
            r#"
            SELECT id, direction, photo_url
            FROM photo_processing_group_photos
            WHERE composite_task_id = $1 AND is_deleted = FALSE AND composite_status = 'pending'
            ORDER BY sort_index, created_at, id
            "#,
        )
        .bind(task_id)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|(id, direction, photo_url)| CompositeRow {
            id,
            direction,
            photo_url,
        })
        .collect();
        Ok(rows)
    }

    async fn renew_lease(
        &self,
        pool: &PgPool,
        task_id: Uuid,
        claimed_by: &str,
        lease_secs: i64,
    ) -> PhotoResult<()> {
        sqlx::query(
            r#"
            UPDATE photo_composite_tasks
            SET lease_expires_at = NOW() + make_interval(secs => $3)
            WHERE id = $1 AND claimed_by = $2 AND status = 'running'
            "#,
        )
        .bind(task_id)
        .bind(claimed_by)
        .bind(lease_secs as f64)
        .execute(pool)
        .await?;
        Ok(())
    }

    async fn mark_photo_success(
        &self,
        pool: &PgPool,
        photo_id: Uuid,
        task_id: Uuid,
        photo_url: &str,
        object_key: &str,
        generation_id: Option<&str>,
    ) -> PhotoResult<()> {
        sqlx::query(
            r#"
            UPDATE photo_processing_group_photos
            SET composite_status = 'success',
                composite_photo_url = $2,
                composite_object_key = $3,
                composite_generation_id = $4,
                composite_error = NULL,
                composite_task_id = $5,
                composited_at = NOW(),
                updated_at = NOW()
            WHERE id = $1 AND composite_status = 'pending'
            "#,
        )
        .bind(photo_id)
        .bind(photo_url)
        .bind(object_key)
        .bind(generation_id)
        .bind(task_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    async fn mark_photo_failed(
        &self,
        pool: &PgPool,
        photo_id: Uuid,
        task_id: Uuid,
        error: &str,
    ) -> PhotoResult<()> {
        sqlx::query(
            r#"
            UPDATE photo_processing_group_photos
            SET composite_status = 'failed',
                composite_error = $3,
                composite_task_id = $2,
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(photo_id)
        .bind(task_id)
        .bind(error)
        .execute(pool)
        .await?;
        Ok(())
    }

    async fn mark_photo_skipped(
        &self,
        pool: &PgPool,
        photo_id: Uuid,
        task_id: Uuid,
        reason: &str,
    ) -> PhotoResult<()> {
        sqlx::query(
            r#"
            UPDATE photo_processing_group_photos
            SET composite_status = 'skipped',
                composite_error = $3,
                composite_task_id = $2,
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(photo_id)
        .bind(task_id)
        .bind(reason)
        .execute(pool)
        .await?;
        Ok(())
    }

    async fn finish_task(
        &self,
        pool: &PgPool,
        task_id: Uuid,
        success_count: i32,
        failed_count: i32,
        skipped_count: i32,
        status: &str,
        error_summary: Option<&str>,
    ) -> PhotoResult<()> {
        sqlx::query(
            r#"
            UPDATE photo_composite_tasks
            SET status = $2,
                success_count = $3,
                failed_count = $4,
                skipped_count = $5,
                error_summary = $6,
                completed_at = NOW(),
                lease_expires_at = NULL
            WHERE id = $1
            "#,
        )
        .bind(task_id)
        .bind(status)
        .bind(success_count)
        .bind(failed_count)
        .bind(skipped_count)
        .bind(error_summary)
        .execute(pool)
        .await?;
        Ok(())
    }
}

/// 组搜索关键字：名称或备注。
fn push_group_keyword(query: &mut QueryBuilder<'_, Postgres>, keyword: Option<&str>) {
    let Some(keyword) = keyword else {
        return;
    };
    query.push(" AND (g.name ILIKE ");
    query.push_bind(format!("%{keyword}%"));
    query.push(" OR COALESCE(g.remark, '') ILIKE ");
    query.push_bind(format!("%{keyword}%"));
    query.push(")");
}
