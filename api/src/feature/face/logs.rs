use crate::{
    feature::auth::{AuthUser, Role},
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

fn ensure_admin(user: &AuthUser) -> Result<(), ApiError> {
    if !user.roles.contains(&Role::Admin) {
        return Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_message("仅 admin 可查看人脸识别日志"));
    }
    Ok(())
}

fn db_error(e: sqlx::Error) -> ApiError {
    ApiError::default().log_only(e)
}

pub async fn photo_bytes(data: &str, limit: usize) -> Result<Vec<u8>, String> {
    let encoded = data.split_once(',').map(|(_, v)| v).unwrap_or(data);
    if encoded.len() > 12 * 1024 * 1024 {
        return Err("照片超过调试存储大小限制".into());
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "照片Base64无法解码".to_owned())?;
    crate::infrastructure::image_compression::compress_to_jpeg_below_async(bytes, limit)
        .await
        .map_err(|_| "照片格式无效或无法压缩".into())
}

pub async fn begin(
    pool: &PgPool,
    project: Uuid,
    point: Uuid,
    actor: Uuid,
    image: &str,
) -> Result<Uuid, ApiError> {
    let photo = photo_bytes(image, 200 * 1024).await;
    let (bytes, details) = match photo {
        Ok(bytes) => (Some(bytes), json!({})),
        Err(error) => (None, json!({"photo_error":error})),
    };
    sqlx::query_scalar("INSERT INTO construction_face_recognition_logs(project_id,point_id,actor_user_id,photo,details) VALUES($1,$2,$3,$4,$5) RETURNING id")
        .bind(project).bind(point).bind(actor).bind(bytes).bind(details).fetch_one(pool).await.map_err(db_error)
}

pub async fn finish(
    pool: &PgPool,
    id: Uuid,
    status: &str,
    reason: &str,
    mut details: Value,
    elapsed: i64,
) -> Result<(), sqlx::Error> {
    let crop = details
        .get_mut("recognition")
        .and_then(|v| v.get_mut("diagnostics"))
        .and_then(Value::as_object_mut)
        .and_then(|v| v.remove("crop_image"));
    let crop = match crop.and_then(|v| v.as_str().map(str::to_owned)) {
        Some(value) => match photo_bytes(&value, 120 * 1024).await {
            Ok(bytes) => Some(bytes),
            Err(error) => {
                details["crop_photo_error"] = json!(error);
                None
            }
        },
        None => None,
    };
    sqlx::query("UPDATE construction_face_recognition_logs SET status=$2,reason=$3,details=details || $4,crop_photo=$5,elapsed_ms=$6,finished_at=NOW() WHERE id=$1")
        .bind(id).bind(status).bind(reason).bind(details).bind(crop).bind(elapsed).execute(pool).await?;
    Ok(())
}

#[derive(Deserialize, Default)]
pub struct Filters {
    pub project_id: Option<Uuid>,
    pub status: Option<String>,
    pub q: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Query(f): Query<Filters>,
) -> ApiResult<Value> {
    ensure_admin(&user)?;
    let page = f.page.unwrap_or(1).clamp(1, 100000);
    let size = f.page_size.unwrap_or(20).clamp(1, 100);
    let keyword =
        f.q.unwrap_or_default()
            .chars()
            .take(100)
            .collect::<String>();
    let sql = r#"WITH filtered AS (
        SELECT l.id,l.project_id,l.point_id,l.status,l.reason,l.details,l.elapsed_ms,l.created_at,l.finished_at,
               p.name AS project_name,ap.name AS point_name,
               l.photo IS NOT NULL AND l.created_at>NOW()-INTERVAL '7 days' AS has_photo,
               l.crop_photo IS NOT NULL AND l.created_at>NOW()-INTERVAL '7 days' AS has_crop
        FROM construction_face_recognition_logs l JOIN construction_projects p ON p.id=l.project_id
        LEFT JOIN construction_attendance_points ap ON ap.id=l.point_id AND ap.project_id=l.project_id
        WHERE p.is_deleted=FALSE AND l.created_at>NOW()-INTERVAL '30 days'
          AND ($1 OR EXISTS(SELECT 1 FROM user_managed_projects u WHERE u.project_id=l.project_id AND u.user_id=$2))
          AND ($3::uuid IS NULL OR l.project_id=$3)
          AND ($4::text IS NULL OR l.status=$4)
          AND ($5='' OR p.name ILIKE '%'||$5||'%' OR l.reason ILIKE '%'||$5||'%' OR l.details->'result'->>'worker_name' ILIKE '%'||$5||'%')
    ), paged AS (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT $6 OFFSET $7)
    SELECT jsonb_build_object('total',(SELECT COUNT(*) FROM filtered),'items',COALESCE((SELECT jsonb_agg(to_jsonb(paged) ORDER BY created_at DESC,id DESC) FROM paged),'[]'::jsonb))"#;
    let data: Value = sqlx::query_scalar(sql)
        .bind(user.roles.contains(&Role::Admin))
        .bind(user.user_id)
        .bind(f.project_id)
        .bind(f.status.filter(|s| !s.is_empty()))
        .bind(keyword)
        .bind(size)
        .bind((page - 1) * size)
        .fetch_one(state.db.pool())
        .await
        .map_err(db_error)?;
    Ok(ApiSuccess::default().with_data(data))
}

pub async fn photos(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Response, ApiError> {
    ensure_admin(&user)?;
    // 照片在SQL层同时检查菜单后的项目范围，禁止猜ID跨项目读取。
    let row: Option<(Option<Vec<u8>>,Option<Vec<u8>>)> = sqlx::query_as(r#"
        SELECT l.photo,l.crop_photo FROM construction_face_recognition_logs l
        JOIN construction_projects p ON p.id=l.project_id
        WHERE l.id=$1 AND p.is_deleted=FALSE AND l.created_at>NOW()-INTERVAL '7 days'
        AND ($2 OR EXISTS(SELECT 1 FROM user_managed_projects u WHERE u.project_id=l.project_id AND u.user_id=$3))
    "#).bind(id).bind(user.roles.contains(&Role::Admin)).bind(user.user_id).fetch_optional(state.db.pool()).await.map_err(db_error)?;
    let (photo, crop) = row.ok_or_else(|| {
        ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("照片不存在、已过期或无权访问")
    })?;
    let encode = |v: Option<Vec<u8>>| {
        v.map(|bytes| format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes)))
    };
    Ok((
        [
            (header::CACHE_CONTROL, "no-store"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        Json(json!({"success":true,"data":{"photo":encode(photo),"crop":encode(crop)}})),
    )
        .into_response())
}

pub async fn cleanup(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE construction_face_recognition_logs SET photo=NULL,crop_photo=NULL WHERE created_at<NOW()-INTERVAL '7 days' AND (photo IS NOT NULL OR crop_photo IS NOT NULL)").execute(pool).await?;
    sqlx::query(
        "DELETE FROM construction_face_recognition_logs WHERE created_at<NOW()-INTERVAL '30 days'",
    )
    .execute(pool)
    .await?;
    sqlx::query("UPDATE construction_face_recognition_logs SET status='interrupted',reason='处理超时或服务中断，未取得最终结果',finished_at=NOW() WHERE status='processing' AND created_at<NOW()-INTERVAL '10 minutes'").execute(pool).await?;
    Ok(())
}
