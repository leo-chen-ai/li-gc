use std::time::Duration;

use serde_json::{Value, json};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use tokio::time::sleep;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::{
    feature::{admin::construction::handler, integration::dispatcher},
    state::AppState,
};

const WORKER_COUNT: usize = 4;
const POLL_INTERVAL: Duration = Duration::from_millis(500);
const MAX_ATTEMPTS: i32 = 5;

const WORKER_RECONCILE_EVENT: &str = "ningbo.worker.reconcile";
const TEAM_SYNC_EVENT: &str = "ningbo.team.sync";
const TEAM_EXIT_EVENT: &str = "ningbo.team.exit";
const DEVICE_WORKER_RECONCILE_EVENT: &str = "attendance_device.worker.reconcile";
const GENERIC_EVENTS: &[&str] = &[
    "construction.project.changed",
    "construction.unit.changed",
    "construction.team.changed",
    "construction.worker.changed",
    "construction.attendance.created",
    "integration.binding.bootstrap",
];

#[derive(Debug, FromRow)]
struct ClaimedEvent {
    id: Uuid,
    project_id: Option<Uuid>,
    event_type: String,
    aggregate_type: String,
    aggregate_id: Option<Uuid>,
    payload: Value,
    attempts: i32,
}

pub fn spawn_integration_outbox_workers(state: AppState) {
    for worker_index in 0..WORKER_COUNT {
        let state = state.clone();
        tokio::spawn(async move {
            let worker_name = format!("integration-outbox-{worker_index}");
            info!(worker = %worker_name, "integration outbox worker started");
            loop {
                match process_one_pending(&state, &worker_name).await {
                    Ok(true) => {}
                    Ok(false) => sleep(POLL_INTERVAL).await,
                    Err(error) => {
                        error!(worker = %worker_name, error = %error, "integration outbox claim failed");
                        sleep(Duration::from_secs(2)).await;
                    }
                }
            }
        });
    }
}

/// Process at most one due outbox event.
///
/// Production workers call this in a loop; integration tests and maintenance
/// tools can call it deterministically to drain a finite queue.
pub async fn process_one_pending(state: &AppState, worker_name: &str) -> Result<bool, sqlx::Error> {
    let Some(event) = claim_event(state.db.pool(), worker_name).await? else {
        return Ok(false);
    };
    process_claimed_event(state, event).await;
    Ok(true)
}

pub async fn enqueue_worker_reconcile(
    pool: &PgPool,
    project_id: Uuid,
    worker_id: Uuid,
    force_exit: bool,
) -> Result<(), sqlx::Error> {
    enqueue_event(
        pool,
        project_id,
        WORKER_RECONCILE_EVENT,
        "worker",
        worker_id,
        json!({ "force_exit": force_exit }),
    )
    .await
}

pub async fn enqueue_team_sync(
    pool: &PgPool,
    project_id: Uuid,
    team_id: Uuid,
) -> Result<(), sqlx::Error> {
    enqueue_event(
        pool,
        project_id,
        TEAM_SYNC_EVENT,
        "team",
        team_id,
        json!({}),
    )
    .await
}

pub async fn enqueue_unit_sync(
    pool: &PgPool,
    project_id: Uuid,
    unit_id: Uuid,
) -> Result<(), sqlx::Error> {
    enqueue_event(
        pool,
        project_id,
        "construction.unit.changed",
        "unit",
        unit_id,
        json!({ "operation": "repair" }),
    )
    .await
}

pub async fn enqueue_worker_platform_repair(
    pool: &PgPool,
    project_id: Uuid,
    worker_id: Uuid,
    platform_config_id: Uuid,
    entry_exit_changed: bool,
) -> Result<(), sqlx::Error> {
    enqueue_event(
        pool,
        project_id,
        "construction.worker.changed",
        "worker",
        worker_id,
        json!({
            "operation": "repair",
            "platform_config_id": platform_config_id,
            "entry_exit_changed": entry_exit_changed,
        }),
    )
    .await
}

pub async fn enqueue_attendance_platform_repair(
    pool: &PgPool,
    project_id: Uuid,
    attendance_id: Uuid,
    platform_config_id: Uuid,
    requested_by_user_id: Uuid,
) -> Result<(), sqlx::Error> {
    enqueue_event(
        pool,
        project_id,
        "construction.attendance.created",
        "attendance",
        attendance_id,
        json!({
            "operation": "repair",
            "source": "manual_yongxin_repair",
            "platform_config_id": platform_config_id,
            "requested_by_user_id": requested_by_user_id,
        }),
    )
    .await
}

pub async fn enqueue_team_exit(
    pool: &PgPool,
    project_id: Uuid,
    team_id: Uuid,
) -> Result<(), sqlx::Error> {
    enqueue_event(
        pool,
        project_id,
        TEAM_EXIT_EVENT,
        "team",
        team_id,
        json!({}),
    )
    .await
}

pub async fn enqueue_worker_device_reconcile(
    pool: &PgPool,
    project_id: Uuid,
    worker_id: Uuid,
    action: &str,
) -> Result<(), sqlx::Error> {
    enqueue_event(
        pool,
        project_id,
        DEVICE_WORKER_RECONCILE_EVENT,
        "worker",
        worker_id,
        json!({ "action": action }),
    )
    .await
}

pub async fn enqueue_domain_event_tx(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    event_type: &str,
    aggregate_type: &str,
    aggregate_id: Uuid,
    payload: Value,
    dedupe_key: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO integration_outbox_events (
            project_id, event_type, aggregate_type, aggregate_id,
            payload, status, dedupe_key
        )
        VALUES ($1, $2, $3, $4, $5, 'pending', $6)
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
        "#,
    )
    .bind(project_id)
    .bind(event_type)
    .bind(aggregate_type)
    .bind(aggregate_id)
    .bind(payload)
    .bind(dedupe_key)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn enqueue_event(
    pool: &PgPool,
    project_id: Uuid,
    event_type: &str,
    aggregate_type: &str,
    aggregate_id: Uuid,
    payload: Value,
) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    let updated = sqlx::query(
        r#"
        UPDATE integration_outbox_events
        SET payload = $5,
            attempts = 0,
            last_error = NULL,
            locked_by = NULL,
            locked_until = NULL,
            updated_at = NOW()
        WHERE project_id = $1
          AND event_type = $2
          AND aggregate_type = $3
          AND aggregate_id = $4
          AND status = 'pending'
        "#,
    )
    .bind(project_id)
    .bind(event_type)
    .bind(aggregate_type)
    .bind(aggregate_id)
    .bind(&payload)
    .execute(&mut *transaction)
    .await?;

    if updated.rows_affected() == 0 {
        sqlx::query(
            r#"
            INSERT INTO integration_outbox_events (
                project_id, event_type, aggregate_type, aggregate_id, payload, status
            )
            VALUES ($1, $2, $3, $4, $5, 'pending')
            "#,
        )
        .bind(project_id)
        .bind(event_type)
        .bind(aggregate_type)
        .bind(aggregate_id)
        .bind(payload)
        .execute(&mut *transaction)
        .await?;
    }

    transaction.commit().await
}

async fn claim_event(
    pool: &PgPool,
    worker_name: &str,
) -> Result<Option<ClaimedEvent>, sqlx::Error> {
    sqlx::query_as::<_, ClaimedEvent>(
        r#"
        WITH candidate AS (
            SELECT event.id
            FROM integration_outbox_events event
            WHERE event.event_type IN (
                    'ningbo.worker.reconcile',
                    'ningbo.team.sync',
                    'ningbo.team.exit',
                    'attendance_device.worker.reconcile',
                    'construction.project.changed',
                    'construction.unit.changed',
                    'construction.team.changed',
                    'construction.worker.changed',
                    'construction.attendance.created',
                    'integration.binding.bootstrap'
                  )
              AND (
                    (event.status = 'pending' AND (event.locked_until IS NULL OR event.locked_until <= NOW()))
                    OR (event.status = 'processing' AND event.locked_until <= NOW())
                  )
              AND NOT EXISTS (
                    SELECT 1
                    FROM integration_outbox_events active
                    WHERE active.id <> event.id
                      AND active.aggregate_type = event.aggregate_type
                      AND active.aggregate_id = event.aggregate_id
                      AND active.status = 'processing'
                      AND active.locked_until > NOW()
                  )
              AND NOT EXISTS (
                    SELECT 1
                    FROM integration_outbox_events earlier
                    WHERE earlier.id <> event.id
                      AND earlier.aggregate_type = event.aggregate_type
                      AND earlier.aggregate_id = event.aggregate_id
                      AND earlier.event_type IN (
                            'ningbo.worker.reconcile',
                            'ningbo.team.sync',
                            'ningbo.team.exit',
                            'attendance_device.worker.reconcile',
                            'construction.project.changed',
                            'construction.unit.changed',
                            'construction.team.changed',
                            'construction.worker.changed',
                            'construction.attendance.created',
                            'integration.binding.bootstrap'
                          )
                      AND earlier.status IN ('pending', 'processing')
                      AND (earlier.created_at, earlier.id) < (event.created_at, event.id)
                  )
            ORDER BY event.created_at, event.id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        UPDATE integration_outbox_events event
        SET status = 'processing',
            locked_by = $1,
            locked_until = NOW() + INTERVAL '15 minutes',
            attempts = event.attempts + 1,
            updated_at = NOW()
        FROM candidate
        WHERE event.id = candidate.id
        RETURNING event.id, event.project_id, event.event_type,
                  event.aggregate_type, event.aggregate_id, event.payload, event.attempts
        "#,
    )
    .bind(worker_name)
    .fetch_optional(pool)
    .await
}

async fn process_claimed_event(state: &AppState, event: ClaimedEvent) {
    let Some(project_id) = event.project_id else {
        fail_event(state.db.pool(), &event, "第三方同步事件缺少项目 ID", false).await;
        return;
    };
    let Some(aggregate_id) = event.aggregate_id else {
        fail_event(
            state.db.pool(),
            &event,
            "第三方同步事件缺少业务对象 ID",
            false,
        )
        .await;
        return;
    };

    let result: Result<(), String> = match event.event_type.as_str() {
        WORKER_RECONCILE_EVENT => {
            let force_exit = event
                .payload
                .get("force_exit")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            handler::reconcile_worker_to_ningbo_platforms(state, aggregate_id, force_exit)
                .await
                .map_err(|error| error.message)
        }
        TEAM_SYNC_EVENT => {
            handler::sync_new_team_to_ningbo_platforms(state.db.pool(), aggregate_id)
                .await
                .map_err(|error| error.message)
        }
        TEAM_EXIT_EVENT => {
            handler::exit_team_from_ningbo_platforms(state.db.pool(), project_id, aggregate_id)
                .await
                .map_err(|error| error.message)
        }
        DEVICE_WORKER_RECONCILE_EVENT => {
            let action = event
                .payload
                .get("action")
                .and_then(Value::as_str)
                .filter(|action| matches!(*action, "update" | "delete"))
                .unwrap_or("update");
            handler::reconcile_worker_to_attendance_devices(
                state,
                project_id,
                aggregate_id,
                action,
            )
            .await
        }
        event_type if GENERIC_EVENTS.contains(&event_type) => dispatcher::dispatch(
            state.db.pool(),
            event.id,
            project_id,
            event_type,
            &event.aggregate_type,
            aggregate_id,
            &event.payload,
        )
        .await
        .map_err(|error| error.to_string()),
        _ => Ok(()),
    };

    match result {
        Ok(()) => {
            if let Err(error) = complete_event(state.db.pool(), event.id).await {
                error!(event_id = %event.id, error = %error, "failed to complete integration outbox event");
            }
        }
        Err(error) => {
            let retry = event.attempts < MAX_ATTEMPTS;
            fail_event(state.db.pool(), &event, &error, retry).await;
        }
    }
}

async fn complete_event(pool: &PgPool, event_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE integration_outbox_events
        SET status = 'completed',
            published_at = NOW(),
            locked_by = NULL,
            locked_until = NULL,
            last_error = NULL,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(event_id)
    .execute(pool)
    .await?;
    Ok(())
}

async fn fail_event(pool: &PgPool, event: &ClaimedEvent, message: &str, retry: bool) {
    let status = if retry { "pending" } else { "failed" };
    let locked_until = retry.then(|| chrono::Utc::now() + chrono::Duration::seconds(15));
    if let Err(error) = sqlx::query(
        r#"
        UPDATE integration_outbox_events
        SET status = $2,
            locked_by = NULL,
            locked_until = $3,
            last_error = $4,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(event.id)
    .bind(status)
    .bind(locked_until)
    .bind(message)
    .execute(pool)
    .await
    {
        error!(event_id = %event.id, error = %error, "failed to record integration outbox failure");
        return;
    }
    warn!(
        event_id = %event.id,
        event_type = %event.event_type,
        attempt = event.attempts,
        retry,
        error = %message,
        "integration outbox event failed"
    );
}
