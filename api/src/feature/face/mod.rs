//! 人脸识别服务客户端 + 人脸异步入库队列（考勤机模式）。
//!
//! - 人脸库按项目隔离，存储在 face-service 的 `data/<project_id>/` 下。
//! - 工人头像创建/变更时写入 `construction_face_enrollments` 队列，
//!   由后台 worker 异步推送到 face-service，避免阻塞接口请求。

use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::state::AppState;

#[derive(Debug, Serialize)]
struct EnrollRequest<'a> {
    project_id: &'a str,
    person_id: &'a str,
    name: &'a str,
    image: &'a str,
}

#[derive(Debug, Deserialize)]
pub struct EnrollResponse {
    pub ok: bool,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RecognizeResponse {
    pub ok: bool,
    #[serde(default)]
    pub matched: bool,
    #[serde(default)]
    pub person_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub score: Option<f64>,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

fn http_client(state: &AppState) -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(
            state.config.face.face_service_timeout_secs,
        ))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn base_url(state: &AppState) -> String {
    state
        .config
        .face
        .face_service_url
        .trim_end_matches('/')
        .to_string()
}

/// 注册/更新人脸到项目人脸库。
pub async fn enroll_face(
    state: &AppState,
    project_id: Uuid,
    worker_id: Uuid,
    worker_name: &str,
    image_base64: &str,
) -> Result<(), String> {
    let url = format!("{}/api/faces/enroll", base_url(state));
    let response = http_client(state)
        .post(url)
        .json(&EnrollRequest {
            project_id: &project_id.to_string(),
            person_id: &worker_id.to_string(),
            name: worker_name,
            image: image_base64,
        })
        .send()
        .await
        .map_err(|error| format!("人脸服务请求失败：{error}"))?;
    let body: EnrollResponse = response
        .json()
        .await
        .map_err(|error| format!("人脸服务响应解析失败：{error}"))?;
    if body.ok {
        Ok(())
    } else {
        Err(body.error.unwrap_or_else(|| "人脸注册失败".to_string()))
    }
}

/// 从项目人脸库删除人脸。
pub async fn delete_face(
    state: &AppState,
    project_id: Uuid,
    worker_id: Uuid,
) -> Result<(), String> {
    let url = format!("{}/api/faces/delete", base_url(state));
    let response = http_client(state)
        .post(url)
        .json(&serde_json::json!({
            "project_id": project_id.to_string(),
            "person_id": worker_id.to_string(),
        }))
        .send()
        .await
        .map_err(|error| format!("人脸服务请求失败：{error}"))?;
    let body: EnrollResponse = response
        .json()
        .await
        .map_err(|error| format!("人脸服务响应解析失败：{error}"))?;
    if body.ok {
        Ok(())
    } else {
        Err(body.error.unwrap_or_else(|| "人脸删除失败".to_string()))
    }
}

/// 1:N 识别：返回项目人脸库中匹配到的工人。
pub async fn recognize_face(
    state: &AppState,
    project_id: Uuid,
    image_base64: &str,
) -> Result<RecognizeResponse, String> {
    let url = format!("{}/api/recognize", base_url(state));
    let response = http_client(state)
        .post(url)
        .json(&serde_json::json!({
            "project_id": project_id.to_string(),
            "image": image_base64,
        }))
        .send()
        .await
        .map_err(|error| format!("人脸服务请求失败：{error}"))?;
    response
        .json::<RecognizeResponse>()
        .await
        .map_err(|error| format!("人脸服务响应解析失败：{error}"))
}

/// 项目是否已开启至少一个考勤机模式考勤点。
pub async fn project_machine_mode_enabled(pool: &PgPool, project_id: Uuid) -> bool {
    sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM construction_attendance_points
            WHERE project_id = $1 AND is_deleted = FALSE AND machine_mode_enabled = TRUE
        )
        "#,
    )
    .bind(project_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false)
}

/// 写入人脸入库队列（幂等：同一工人同一动作存在待处理任务时跳过）。
pub async fn enqueue_face_enrollment(
    pool: &PgPool,
    project_id: Uuid,
    worker_id: Uuid,
    action: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO construction_face_enrollments (project_id, worker_id, action)
        VALUES ($1, $2, $3)
        ON CONFLICT (worker_id, action)
            WHERE status IN ('pending', 'processing')
            DO NOTHING
        "#,
    )
    .bind(project_id)
    .bind(worker_id)
    .bind(action)
    .execute(pool)
    .await?;
    Ok(())
}

/// 项目开启考勤机模式时，为全部在册有头像的工人批量入库。
pub async fn enqueue_project_face_enrollments(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"
        INSERT INTO construction_face_enrollments (project_id, worker_id, action)
        SELECT $1, w.id, 'upsert'
        FROM construction_workers w
        WHERE w.project_id = $1
          AND w.is_deleted = FALSE
          AND NULLIF(TRIM(COALESCE(w.avatar, '')), '') IS NOT NULL
        ON CONFLICT (worker_id, action)
            WHERE status IN ('pending', 'processing')
            DO NOTHING
        "#,
    )
    .bind(project_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

const MAX_ATTEMPTS: i32 = 5;

/// 后台 worker：轮询人脸入库队列并推送到 face-service。
pub fn spawn_face_enrollment_worker(state: AppState) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            ticker.tick().await;
            if let Err(error) = process_pending_enrollments(&state).await {
                tracing::error!(error = %error, "face enrollment worker tick failed");
            }
        }
    });
}

async fn process_pending_enrollments(state: &AppState) -> Result<(), sqlx::Error> {
    let pool = state.db.pool();
    // 工人已被删除的 upsert 任务直接标记失败，避免队列堆积（delete 动作不受影响）。
    sqlx::query(
        r#"
        UPDATE construction_face_enrollments fe
        SET status = 'failed', last_error = '工人已删除', attempt_count = 99, updated_at = NOW()
        WHERE fe.status IN ('pending', 'failed')
          AND fe.action <> 'delete'
          AND NOT EXISTS (
              SELECT 1 FROM construction_workers w
              WHERE w.id = fe.worker_id AND w.is_deleted = FALSE
          )
        "#,
    )
    .execute(pool)
    .await?;

    let tasks = sqlx::query_as::<_, (Uuid, Uuid, Uuid, String, i32, Option<String>, Option<String>)>(
        r#"
        WITH due AS (
            SELECT id
            FROM construction_face_enrollments
            WHERE status IN ('pending', 'failed')
              AND attempt_count < $1
            ORDER BY created_at
            LIMIT 20
            FOR UPDATE SKIP LOCKED
        )
        UPDATE construction_face_enrollments fe
        SET status = 'processing', updated_at = NOW()
        FROM due
        WHERE fe.id = due.id
          AND (
              fe.action = 'delete'
              OR EXISTS (
                  SELECT 1 FROM construction_workers w
                  WHERE w.id = fe.worker_id AND w.is_deleted = FALSE
              )
          )
        RETURNING fe.id, fe.project_id, fe.worker_id, fe.action, fe.attempt_count,
                  (SELECT w.name FROM construction_workers w WHERE w.id = fe.worker_id),
                  (SELECT w.avatar FROM construction_workers w WHERE w.id = fe.worker_id)
        "#,
    )
    .bind(MAX_ATTEMPTS)
    .fetch_all(pool)
    .await?;

    for (task_id, project_id, worker_id, action, attempt_count, worker_name, avatar) in tasks {
        let avatar = avatar.unwrap_or_default();
        let result = if action == "delete" {
            delete_face(state, project_id, worker_id).await
        } else if avatar.trim().is_empty() {
            Err("工人头像为空，无法入库".to_string())
        } else {
            match crate::feature::admin::construction::handler::load_worker_image_base64(
                state,
                avatar.trim(),
                2 * 1024 * 1024,
                "工人头像",
            )
            .await
            {
                Ok(image_base64) => {
                    enroll_face(
                        state,
                        project_id,
                        worker_id,
                        worker_name.as_deref().unwrap_or(""),
                        &image_base64,
                    )
                    .await
                }
                Err(error) => Err(error),
            }
        };

        match result {
            Ok(()) => {
                sqlx::query(
                    "UPDATE construction_face_enrollments SET status='synced', synced_at=NOW(), last_error=NULL, updated_at=NOW() WHERE id=$1",
                )
                .bind(task_id)
                .execute(pool)
                .await?;
            }
            Err(error) => {
                let next_status = if attempt_count + 1 >= MAX_ATTEMPTS {
                    "failed"
                } else {
                    "pending"
                };
                sqlx::query(
                    "UPDATE construction_face_enrollments SET status=$2, attempt_count=attempt_count+1, last_error=$3, updated_at=NOW() WHERE id=$1",
                )
                .bind(task_id)
                .bind(next_status)
                .bind(error)
                .execute(pool)
                .await?;
            }
        }
    }
    Ok(())
}
