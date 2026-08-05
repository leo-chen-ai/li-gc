use chrono::{Datelike, FixedOffset, NaiveDate, Utc};
use tokio::time::{Duration, interval};
use uuid::Uuid;

use crate::state::AppState;

use super::construction::handler::generate_managed_records_for_month;

/// 每小时检查一次；北京时间每月最后一天为所有已启用托管人员生成下月记录。
pub fn spawn_managed_attendance_scheduler(state: AppState) {
    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_secs(60 * 60));
        loop {
            ticker.tick().await;
            let timezone = FixedOffset::east_opt(8 * 3600).expect("valid UTC+8 offset");
            let today = Utc::now().with_timezone(&timezone).date_naive();
            let Some(month) = target_generation_month(today) else {
                continue;
            };
            if let Err(error) = generate_enabled_configs(&state, month).await {
                tracing::error!(%error, %month, "managed attendance monthly generation failed");
            }
        }
    });
}

fn target_generation_month(today: NaiveDate) -> Option<NaiveDate> {
    let tomorrow = today.succ_opt()?;
    if tomorrow.month() == today.month() {
        return None;
    }
    NaiveDate::from_ymd_opt(tomorrow.year(), tomorrow.month(), 1)
}

async fn generate_enabled_configs(state: &AppState, month: NaiveDate) -> Result<(), sqlx::Error> {
    let next_month = if month.month() == 12 {
        NaiveDate::from_ymd_opt(month.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(month.year(), month.month() + 1, 1)
    }
    .expect("valid next month");
    let config_ids = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT c.id
        FROM construction_managed_attendance_configs c
        JOIN construction_workers w ON w.id = c.worker_id AND w.is_deleted = FALSE
        WHERE c.is_deleted = FALSE AND c.is_enabled = TRUE
          AND NOT EXISTS (
              SELECT 1
              FROM construction_managed_attendance_records r
              WHERE r.config_id = c.id AND r.is_deleted = FALSE
                AND r.attendance_date >= $1 AND r.attendance_date < $2
          )
        ORDER BY c.id
        "#,
    )
    .bind(month)
    .bind(next_month)
    .fetch_all(state.db.pool())
    .await?;

    let total = config_ids.len();
    let mut succeeded = 0_usize;
    for config_id in config_ids {
        match generate_managed_records_for_month(state.db.pool(), config_id, month).await {
            Ok(_) => succeeded += 1,
            Err(error) => {
                tracing::error!(%config_id, %month, ?error, "failed to generate managed attendance config")
            }
        }
    }
    tracing::info!(%month, total, succeeded, "managed attendance next-month generation completed");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_last_day_targets_next_month() {
        assert_eq!(
            target_generation_month(NaiveDate::from_ymd_opt(2026, 8, 30).unwrap()),
            None
        );
        assert_eq!(
            target_generation_month(NaiveDate::from_ymd_opt(2026, 8, 31).unwrap()),
            NaiveDate::from_ymd_opt(2026, 9, 1)
        );
        assert_eq!(
            target_generation_month(NaiveDate::from_ymd_opt(2026, 12, 31).unwrap()),
            NaiveDate::from_ymd_opt(2027, 1, 1)
        );
    }
}
