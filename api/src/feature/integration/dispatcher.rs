use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::{xinleda, yongxin_v2};

const SUPPORTED_PLATFORM_CODES: &[&str] = &[yongxin_v2::PLATFORM_CODE, xinleda::PLATFORM_CODE];

#[derive(Debug, FromRow)]
struct PlatformConfigRow {
    id: Uuid,
    project_id: Uuid,
    platform_type: String,
    config: Value,
    is_enabled: bool,
    is_deleted: bool,
    updated_at: chrono::DateTime<chrono::Utc>,
}

pub async fn dispatch(
    pool: &PgPool,
    event_id: Uuid,
    project_id: Uuid,
    event_type: &str,
    aggregate_type: &str,
    aggregate_id: Uuid,
    payload: &Value,
) -> Result<(), sqlx::Error> {
    if event_type == "integration.binding.bootstrap" {
        return bootstrap_binding(pool, project_id, aggregate_id, payload).await;
    }

    let configs = sqlx::query_as::<_, PlatformConfigRow>(
        r#"
        SELECT id, project_id, platform_type, config, is_enabled, is_deleted, updated_at
        FROM construction_platform_configs
        WHERE project_id = $1
          AND is_deleted = FALSE
          AND is_enabled = TRUE
          AND platform_type = ANY($2)
        ORDER BY created_at, id
        "#,
    )
    .bind(project_id)
    .bind(SUPPORTED_PLATFORM_CODES)
    .fetch_all(pool)
    .await?;

    for config in configs {
        if payload
            .get("platform_config_id")
            .and_then(Value::as_str)
            .and_then(|value| Uuid::parse_str(value).ok())
            .is_some_and(|config_id| config_id != config.id)
        {
            continue;
        }
        if !event_enabled(&config.config, event_type) {
            continue;
        }
        let binding_id = ensure_binding(pool, &config).await?;
        for operation in operations_for_event(&config.platform_type, event_type, payload) {
            enqueue_job(
                pool,
                event_id,
                binding_id,
                project_id,
                &config.platform_type,
                operation,
                aggregate_type,
                aggregate_id,
                payload,
            )
            .await?;
        }
    }

    Ok(())
}

async fn bootstrap_binding(
    pool: &PgPool,
    project_id: Uuid,
    config_id: Uuid,
    event_payload: &Value,
) -> Result<(), sqlx::Error> {
    let config = sqlx::query_as::<_, PlatformConfigRow>(
        r#"
        SELECT id, project_id, platform_type, config, is_enabled, is_deleted, updated_at
        FROM construction_platform_configs
        WHERE id = $1 AND project_id = $2
        "#,
    )
    .bind(config_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    let platform_type = config
        .as_ref()
        .map(|row| row.platform_type.clone())
        .or_else(|| {
            event_payload
                .get("platform_type")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        });
    let Some(platform_type) = platform_type else {
        return Ok(());
    };
    if !SUPPORTED_PLATFORM_CODES.contains(&platform_type.as_str()) {
        return Ok(());
    }

    let Some(config) = config else {
        disable_binding(pool, config_id).await?;
        return Ok(());
    };
    if config.is_deleted || !config.is_enabled {
        disable_binding(pool, config_id).await?;
        return Ok(());
    }

    let binding_id = ensure_binding(pool, &config).await?;
    let version = config.updated_at.timestamp_millis();
    let operation = bootstrap_operation(&platform_type);
    sqlx::query(
        r#"
        INSERT INTO integration_jobs (
            project_id, binding_id, platform_code, operation, entity_type,
            local_entity_id, idempotency_key, request_payload, status,
            attempt_count, max_attempts, next_attempt_at
        )
        VALUES ($1, $2, $3, $4, 'project', $1, $5, $6, 'pending', 0, 5, NOW())
        ON CONFLICT (idempotency_key) DO NOTHING
        "#,
    )
    .bind(project_id)
    .bind(binding_id)
    .bind(&platform_type)
    .bind(operation)
    .bind(format!("{binding_id}:{operation}:{version}"))
    .bind(json!({
        "platform_config_id": config.id,
        "config_version": version,
    }))
    .execute(pool)
    .await?;

    if platform_type == xinleda::PLATFORM_CODE {
        sqlx::query(
            r#"
            INSERT INTO integration_jobs (
                project_id, binding_id, platform_code, operation, entity_type,
                local_entity_id, idempotency_key, request_payload, status,
                attempt_count, max_attempts, next_attempt_at
            )
            VALUES ($1, $2, $3, 'safeguard.sync', 'project', $1, $4, $5,
                    'pending', 0, 5, NOW())
            ON CONFLICT (idempotency_key) DO NOTHING
            "#,
        )
        .bind(project_id)
        .bind(binding_id)
        .bind(&platform_type)
        .bind(format!("{binding_id}:safeguard.sync:{version}"))
        .bind(json!({
            "platform_config_id": config.id,
            "config_version": version,
        }))
        .execute(pool)
        .await?;
    }

    enqueue_bootstrap_events(pool, &config).await
}

async fn enqueue_bootstrap_events(
    pool: &PgPool,
    config: &PlatformConfigRow,
) -> Result<(), sqlx::Error> {
    let version = config.updated_at.timestamp_millis();
    let config_id = config.id;
    let project_id = config.project_id;

    for (table, entity_type) in [
        ("construction_units", "unit"),
        ("construction_teams", "team"),
        ("construction_workers", "worker"),
    ] {
        if !event_enabled(
            &config.config,
            &format!("construction.{entity_type}.changed"),
        ) {
            continue;
        }
        let statement = format!(
            r#"
            INSERT INTO integration_outbox_events (
                project_id, event_type, aggregate_type, aggregate_id,
                payload, status, dedupe_key
            )
            SELECT project_id, $1, $2, id,
                   jsonb_build_object(
                       'operation', 'bootstrap',
                       'platform_config_id', $3::uuid,
                       'occurred_at', NOW()
                   ),
                   'pending',
                   $4 || ':' || id::text
            FROM {table}
            WHERE project_id = $5 AND is_deleted = FALSE
            ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
            "#,
        );
        sqlx::query(&statement)
            .bind(format!("construction.{entity_type}.changed"))
            .bind(entity_type)
            .bind(config_id)
            .bind(format!("bootstrap:{config_id}:{version}:{entity_type}"))
            .bind(project_id)
            .execute(pool)
            .await?;
    }

    if event_enabled(&config.config, "construction.attendance.created") {
        let backfill_from = config
            .config
            .get("attendance_backfill_from")
            .and_then(Value::as_str)
            .and_then(|raw| chrono::DateTime::parse_from_rfc3339(raw).ok())
            .map(|value| value.with_timezone(&chrono::Utc))
            .unwrap_or_else(chrono::Utc::now);
        sqlx::query(
            r#"
            INSERT INTO integration_outbox_events (
                project_id, event_type, aggregate_type, aggregate_id,
                payload, status, dedupe_key
            )
            SELECT record.project_id,
                   'construction.attendance.created',
                   'attendance',
                   record.id,
                   jsonb_build_object(
                       'operation', 'bootstrap',
                       'source', 'mqtt_rec_push',
                       'platform_config_id', $1::uuid,
                       'occurred_at', NOW()
                   ),
                   'pending',
                   $2 || ':' || record.id::text
            FROM construction_attendance_records record
            WHERE record.project_id = $3
              AND record.is_deleted = FALSE
              AND ($4::timestamptz IS NULL OR record.trigger_time >= $4)
              AND EXISTS (
                  SELECT 1
                  FROM construction_attendance_record_photos photo
                  WHERE photo.attendance_record_id = record.id
                    AND photo.source = 'mqtt_rec_push'
                    AND BTRIM(photo.photo_data) <> ''
              )
            ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
            "#,
        )
        .bind(config_id)
        .bind(format!("bootstrap:{config_id}:{version}:attendance"))
        .bind(project_id)
        .bind(backfill_from)
        .execute(pool)
        .await?;
    }

    Ok(())
}

async fn ensure_binding(pool: &PgPool, config: &PlatformConfigRow) -> Result<Uuid, sqlx::Error> {
    let enabled_events = enabled_events(&config.platform_type, &config.config);
    let mut tx = pool.begin().await?;
    let previous = sqlx::query_as::<_, (Uuid, Value)>(
        r#"
        SELECT binding.id, binding.config
        FROM integration_project_bindings binding
        WHERE binding.platform_config_id = $1
          AND binding.is_deleted = FALSE
        FOR UPDATE
        "#,
    )
    .bind(config.id)
    .fetch_optional(&mut *tx)
    .await?;
    let credentials_changed = previous.as_ref().is_some_and(|(_, old_config)| {
        binding_identity(old_config) != binding_identity(&config.config)
    });

    let binding_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO integration_project_bindings (
            project_id, platform_id, platform_config_id, external_project_id, base_url,
            credentials, config, enabled_events, is_enabled, remark
        )
        SELECT $1, platform.id, $2, $3, $4, $5, $5, $6, TRUE,
               '由项目平台配置自动维护'
        FROM integration_platforms platform
        WHERE platform.code = $7 AND platform.is_deleted = FALSE
        ON CONFLICT (platform_config_id) WHERE is_deleted = FALSE AND platform_config_id IS NOT NULL
        DO UPDATE SET
            external_project_id = EXCLUDED.external_project_id,
            base_url = EXCLUDED.base_url,
            credentials = EXCLUDED.credentials,
            config = EXCLUDED.config,
            enabled_events = EXCLUDED.enabled_events,
            is_enabled = TRUE,
            updated_at = NOW()
        RETURNING id
        "#,
    )
    .bind(config.project_id)
    .bind(config.id)
    .bind(config_string(
        &config.config,
        &["project_code", "projectCode"],
    ))
    .bind(config_string(
        &config.config,
        &["base_url", "url", "endpoint"],
    ))
    .bind(&config.config)
    .bind(enabled_events)
    .bind(&config.platform_type)
    .fetch_one(&mut *tx)
    .await?;

    if credentials_changed {
        sqlx::query(
            r#"
            UPDATE integration_entity_mappings
            SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
            WHERE binding_id = $1 AND is_deleted = FALSE
            "#,
        )
        .bind(binding_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("DELETE FROM integration_media_mappings WHERE binding_id = $1")
            .bind(binding_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            r#"
            UPDATE integration_jobs
            SET status = 'disabled', last_error = '平台账号或项目对接码已变更',
                completed_at = NOW(), locked_by = NULL, locked_until = NULL,
                updated_at = NOW()
            WHERE binding_id = $1
              AND status NOT IN ('success', 'completed', 'failed', 'delivery_unknown', 'disabled')
            "#,
        )
        .bind(binding_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(binding_id)
}

async fn disable_binding(pool: &PgPool, platform_config_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE integration_project_bindings
        SET is_enabled = FALSE, updated_at = NOW()
        WHERE platform_config_id = $1
          AND is_deleted = FALSE
        "#,
    )
    .bind(platform_config_id)
    .execute(pool)
    .await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn enqueue_job(
    pool: &PgPool,
    event_id: Uuid,
    binding_id: Uuid,
    project_id: Uuid,
    platform_code: &str,
    operation: &str,
    entity_type: &str,
    local_entity_id: Uuid,
    event_payload: &Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO integration_jobs (
            project_id, binding_id, outbox_event_id, platform_code,
            operation, entity_type, local_entity_id, idempotency_key,
            request_payload, status, attempt_count, max_attempts, next_attempt_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 0, 5, NOW())
        ON CONFLICT (idempotency_key) DO NOTHING
        "#,
    )
    .bind(project_id)
    .bind(binding_id)
    .bind(event_id)
    .bind(platform_code)
    .bind(operation)
    .bind(entity_type)
    .bind(local_entity_id)
    .bind(format!("{binding_id}:{event_id}:{operation}"))
    .bind(json!({
        "event_type": format!("construction.{entity_type}.changed"),
        "event": event_payload,
    }))
    .execute(pool)
    .await?;
    Ok(())
}

fn operations_for_event<'a>(
    platform_type: &str,
    event_type: &str,
    payload: &'a Value,
) -> Vec<&'a str> {
    match event_type {
        "construction.project.changed" if platform_type == xinleda::PLATFORM_CODE => {
            vec!["project.sync"]
        }
        "construction.unit.changed" => vec!["unit.sync"],
        "construction.team.changed" => vec!["team.sync"],
        "construction.worker.changed" => {
            if payload.get("operation").and_then(Value::as_str) == Some("delete") {
                vec!["entry_exit.sync"]
            } else if payload
                .get("entry_exit_changed")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                vec!["worker.sync", "entry_exit.sync"]
            } else {
                vec!["worker.sync"]
            }
        }
        "construction.attendance.created" => vec!["attendance.sync"],
        _ => Vec::new(),
    }
}

fn event_enabled(config: &Value, event_type: &str) -> bool {
    let key = match event_type {
        "construction.project.changed" => "sync_project",
        "construction.unit.changed" => "sync_units",
        "construction.team.changed" => "sync_teams",
        "construction.worker.changed" => "sync_workers",
        "construction.attendance.created" => "sync_attendance",
        _ => return false,
    };
    config
        .get("modules")
        .and_then(|modules| modules.get(key))
        .or_else(|| config.get(key))
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

fn enabled_events(platform_type: &str, config: &Value) -> Vec<String> {
    [
        ("construction.project.changed", "sync_project"),
        ("construction.unit.changed", "sync_units"),
        ("construction.team.changed", "sync_teams"),
        ("construction.worker.changed", "sync_workers"),
        ("construction.attendance.created", "sync_attendance"),
    ]
    .into_iter()
    .filter(|(event, _)| {
        *event != "construction.project.changed" || platform_type == xinleda::PLATFORM_CODE
    })
    .filter(|(_, key)| {
        config
            .get("modules")
            .and_then(|modules| modules.get(*key))
            .or_else(|| config.get(*key))
            .and_then(Value::as_bool)
            .unwrap_or(true)
    })
    .map(|(event, _)| event.to_owned())
    .collect()
}

fn config_string(config: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        config
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn binding_identity(
    config: &Value,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    (
        config_string(config, &["base_url", "url", "endpoint"]),
        config_string(config, &["project_code", "projectCode"]),
        config_string(
            config,
            &["app_key", "appKey", "AppKey", "app_id", "appid", "appId"],
        ),
        config_string(
            config,
            &["app_secret", "appSecret", "AppSecret", "appsecret"],
        ),
        config_string(config, &["mode", "runtime_mode", "environment"]),
    )
}

fn bootstrap_operation(platform_type: &str) -> &'static str {
    if platform_type == xinleda::PLATFORM_CODE {
        "project.sync"
    } else {
        "project.query"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modules_are_enabled_by_default_and_can_be_disabled_independently() {
        let config = json!({"modules": {"sync_attendance": false}});
        assert!(event_enabled(&config, "construction.worker.changed"));
        assert!(!event_enabled(&config, "construction.attendance.created"));
    }

    #[test]
    fn worker_delete_only_creates_exit_operation() {
        assert_eq!(
            operations_for_event(
                yongxin_v2::PLATFORM_CODE,
                "construction.worker.changed",
                &json!({"operation": "delete"})
            ),
            vec!["entry_exit.sync"]
        );
    }
}
