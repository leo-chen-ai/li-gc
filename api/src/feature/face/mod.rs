//! 人脸识别服务客户端 + 人脸异步入库队列（考勤机模式）。
//!
//! - 人脸库按项目隔离，存储在 face-service 的 `data/<project_id>/` 下。
//! - 工人头像创建/变更时写入 `construction_face_enrollments` 队列，
//!   由后台 worker 异步推送到 face-service，避免阻塞接口请求。

use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::state::AppState;
pub mod logs;

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

#[derive(Debug, Deserialize, Serialize)]
pub struct RecognitionCandidate {
    pub person_id: String,
    #[serde(default)]
    pub name: String,
    pub score: f64,
}

#[derive(Debug, Deserialize, Serialize)]
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
    #[serde(default)]
    pub threshold: Option<f64>,
    #[serde(default)]
    pub elapsed_ms: Option<i64>,
    #[serde(default)]
    pub library_size: Option<i64>,
    #[serde(default)]
    pub diagnostics: serde_json::Value,
    #[serde(default)]
    pub candidates: Option<Vec<RecognitionCandidate>>,
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
    let status = response.status();
    response
        .json::<RecognizeResponse>()
        .await
        .map_err(|error| format!("人脸服务响应解析失败（HTTP {status}）：{error}"))
}

/// 项目是否已开启至少一个考勤机模式考勤点。
pub async fn project_machine_mode_enabled(pool: &PgPool, project_id: Uuid) -> bool {
    project_machine_mode_enabled_checked(pool, project_id)
        .await
        .unwrap_or(false)
}

pub(crate) async fn project_machine_mode_enabled_checked(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<bool, sqlx::Error> {
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
}

/// 合并同一工人同一动作的请求；版本递增确保处理中更新头像不会漏同步。
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
            DO UPDATE SET revision = construction_face_enrollments.revision + 1,
                          attempt_count = 0, last_error = NULL
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

/// 点位开关、入库及清库共用跨进程项目锁，防止清理后被正在执行的任务写回。
pub async fn lock_project(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<sqlx::Transaction<'_, sqlx::Postgres>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 7100))")
        .bind(project_id.to_string())
        .execute(&mut *tx)
        .await?;
    Ok(tx)
}

async fn clear_project(state: &AppState, project_id: Uuid) -> Result<(), String> {
    let response = http_client(state)
        .post(format!("{}/api/faces/clear-project", base_url(state)))
        .json(&serde_json::json!({"project_id": project_id}))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let result: EnrollResponse = response.json().await.map_err(|e| e.to_string())?;
    if result.ok {
        Ok(())
    } else {
        Err(result.error.unwrap_or_else(|| "清理人脸库失败".into()))
    }
}

async fn cleanup_disabled_projects(state: &AppState) -> Result<(), sqlx::Error> {
    // 包含已删除点位，确保最后一个点位删除后仍会清理；失败下轮继续。
    let projects = sqlx::query_scalar::<_, Uuid>(
        "SELECT DISTINCT p.project_id FROM construction_attendance_points p WHERE NOT EXISTS (SELECT 1 FROM construction_attendance_points active WHERE active.project_id=p.project_id AND active.is_deleted=FALSE AND active.machine_mode_enabled=TRUE)"
    ).fetch_all(state.db.pool()).await?;
    for project_id in projects {
        let lock = lock_project(state.db.pool(), project_id).await?;
        if !project_machine_mode_enabled_checked(state.db.pool(), project_id).await? {
            match clear_project(state, project_id).await {
                Ok(()) => {
                    sqlx::query("UPDATE construction_face_enrollments SET status='cancelled', last_error='项目考勤机模式已关闭，人脸库已清理', updated_at=NOW() WHERE project_id=$1 AND status <> 'cancelled'")
                        .bind(project_id).execute(state.db.pool()).await?;
                }
                Err(error) => {
                    tracing::warn!(%project_id, %error, "project face cleanup failed; will retry")
                }
            }
        }
        lock.commit().await?;
    }
    Ok(())
}

pub async fn sync_summary(
    state: &AppState,
    project_id: Uuid,
) -> Result<serde_json::Value, sqlx::Error> {
    let enabled = project_machine_mode_enabled_checked(state.db.pool(), project_id).await?;
    let rows = sqlx::query_as::<_, (Uuid, String, Option<String>, Option<i32>, Option<String>)>(
        "SELECT w.id, COALESCE(w.name,''), latest.status, latest.attempt_count, latest.last_error FROM construction_workers w LEFT JOIN LATERAL (SELECT status, attempt_count, last_error FROM construction_face_enrollments e WHERE e.worker_id=w.id AND e.project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1) latest ON TRUE WHERE w.project_id=$1 AND w.is_deleted=FALSE AND NULLIF(TRIM(COALESCE(w.avatar,'')),'') IS NOT NULL"
    ).bind(project_id).fetch_all(state.db.pool()).await?;
    let remote = async {
        http_client(state)
            .get(format!("{}/api/faces", base_url(state)))
            .query(&[("project_id", project_id.to_string())])
            .send()
            .await?
            .error_for_status()?
            .json::<serde_json::Value>()
            .await
    }
    .await;
    let (ids, service_error) = match remote {
        Ok(value) if value["ok"] == true && value["items"].is_array() => (
            Some(
                value["items"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter_map(|item| item["person_id"].as_str().map(str::to_owned))
                    .collect::<std::collections::HashSet<_>>(),
            ),
            None,
        ),
        Ok(_) => (None, Some("人脸服务返回异常，无法确认入库数量".to_owned())),
        Err(_) => (None, Some("人脸服务暂不可用，无法确认入库数量".to_owned())),
    };
    let mut queued = 0;
    let mut processing = 0;
    let mut failures = Vec::new();
    for (id, name, status, attempts, error) in &rows {
        if !enabled {
            continue;
        }
        match status.as_deref() {
            Some("processing") => processing+=1,
            Some("pending") => queued+=1,
            Some("failed") if attempts.unwrap_or(0)<MAX_ATTEMPTS => queued+=1,
            Some("failed") => failures.push(serde_json::json!({"worker_id":id,"name":name,"reason":error.as_deref().unwrap_or("人脸同步失败")})),
            _ => (),
        }
    }
    let synced = ids.as_ref().map(|ids| {
        rows.iter()
            .filter(|(id, _, _, _, _)| ids.contains(&id.to_string()))
            .count()
    });
    Ok(
        serde_json::json!({"enabled":enabled,"total":rows.len(),"synced":synced,"queued":queued,"processing":processing,"failed":failures.len(),"failures":failures,"service_error":service_error,"cleanup_pending":!enabled && ids.as_ref().is_some_and(|ids| !ids.is_empty())}),
    )
}

/// 后台 worker：轮询人脸入库队列并推送到 face-service。
pub fn spawn_face_enrollment_worker(state: AppState) {
    let log_state = state.clone();
    tokio::spawn(async move {
        let mut timer = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            timer.tick().await;
            if let Err(error) = logs::cleanup(log_state.db.pool()).await {
                tracing::error!(%error, "face recognition log retention failed");
            }
        }
    });
    let cleanup_state = state.clone();
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(30));
        loop {
            ticker.tick().await;
            if let Err(error) = cleanup_disabled_projects(&cleanup_state).await {
                tracing::error!(%error, "face cleanup tick failed; will retry");
            }
        }
    });
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
    let tasks = sqlx::query_as::<_, (Uuid, Uuid, Uuid)>(
        r#"
        WITH due AS (
            SELECT id
            FROM construction_face_enrollments
            WHERE (status IN ('pending', 'failed') OR (status='processing' AND updated_at < NOW()-INTERVAL '10 minutes'))
              AND attempt_count < $1
              AND EXISTS (SELECT 1 FROM construction_attendance_points p WHERE p.project_id=construction_face_enrollments.project_id AND p.is_deleted=FALSE AND p.machine_mode_enabled=TRUE)
            ORDER BY created_at
            LIMIT 20
            FOR UPDATE SKIP LOCKED
        )
        UPDATE construction_face_enrollments fe
        SET status = 'processing', updated_at = NOW()
        FROM due
        WHERE fe.id = due.id
        RETURNING fe.id, fe.project_id, fe.worker_id
        "#,
    )
    .bind(MAX_ATTEMPTS)
    .fetch_all(pool)
    .await?;

    for (task_id, project_id, worker_id) in tasks {
        let lock = lock_project(pool, project_id).await?;
        // 已领取任务可能在等待项目锁期间被清库流程取消。
        let still_processing = sqlx::query_scalar::<_, bool>("SELECT EXISTS (SELECT 1 FROM construction_face_enrollments WHERE id=$1 AND status='processing')")
            .bind(task_id).fetch_one(pool).await?;
        if !still_processing {
            lock.commit().await?;
            continue;
        }
        if !project_machine_mode_enabled_checked(pool, project_id).await? {
            sqlx::query("UPDATE construction_face_enrollments SET status='cancelled',updated_at=NOW() WHERE id=$1")
                .bind(task_id).execute(pool).await?;
            lock.commit().await?;
            continue;
        }
        // 获取锁后才读取最新人员信息，旧的 delete/upsert 任务均以当前状态为准。
        let current = sqlx::query_as::<_, (i64, Option<String>, Option<String>, bool)>(
            "SELECT e.revision,w.name,w.avatar,w.is_deleted FROM construction_face_enrollments e JOIN construction_workers w ON w.id=e.worker_id AND w.project_id=e.project_id WHERE e.id=$1 AND e.status='processing'"
        ).bind(task_id).fetch_optional(pool).await?;
        let Some((revision, worker_name, avatar, deleted)) = current else {
            lock.commit().await?;
            continue;
        };
        let avatar = avatar.unwrap_or_default();
        let result = if deleted || avatar.trim().is_empty() {
            delete_face(state, project_id, worker_id).await
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

        finish_enrollment(pool, task_id, revision, result.err()).await?;
        lock.commit().await?;
    }
    Ok(())
}

/// 原子结算；同步期间头像发生变化时，旧结果只会将任务重新排队。
pub async fn finish_enrollment(
    pool: &PgPool,
    task_id: Uuid,
    revision: i64,
    error: Option<String>,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"
        UPDATE construction_face_enrollments SET
            status = CASE WHEN revision <> $2 THEN 'pending'
                          WHEN $3::text IS NULL THEN 'synced'
                          WHEN attempt_count + 1 >= $4 THEN 'failed' ELSE 'pending' END,
            attempt_count = CASE WHEN revision <> $2 THEN 0
                                 WHEN $3::text IS NOT NULL THEN attempt_count + 1 ELSE attempt_count END,
            last_error = CASE WHEN revision <> $2 THEN NULL ELSE $3 END,
            synced_at = CASE WHEN revision = $2 AND $3::text IS NULL THEN NOW() ELSE synced_at END,
            updated_at = NOW()
        WHERE id = $1 AND status = 'processing'
    "#).bind(task_id).bind(revision).bind(error).bind(MAX_ATTEMPTS).execute(pool).await?;
    Ok(())
}
