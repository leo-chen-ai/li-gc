mod common;

use chrono::{NaiveDate, TimeZone, Utc};
use quax::feature::{
    admin::system_warning::{
        refresh_device_offline_warnings, refresh_management_team_attendance_warnings,
    },
    auth::{Role, utils::jwt::create_token_pair},
};
use uuid::Uuid;

use common::{build_test_app_with_pool, get_authed};

fn token(user_id: Uuid, role: Role) -> String {
    create_token_pair(user_id, "warnings@example.com", &[role])
        .expect("token")
        .access_token
}

#[tokio::test]
async fn warnings_are_generated_once_and_filtered_by_managed_projects() {
    let (app, pool, _container) = build_test_app_with_pool().await;
    let allowed_project = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_projects (name, status) VALUES ('授权预警项目', 5) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let denied_project = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_projects (name, status) VALUES ('未授权预警项目', 5) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let unit_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_units (project_id, company_name) VALUES ($1, '预警单位') RETURNING id",
    )
    .bind(allowed_project)
    .fetch_one(&pool)
    .await
    .unwrap();
    let team_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_teams (project_id, unit_id, name, work_type, is_manage_team) VALUES ($1, $2, '管理班组', 1001, TRUE) RETURNING id",
    )
    .bind(allowed_project)
    .bind(unit_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let missing_worker = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_workers (project_id, unit_id, team_id, name, work_status) VALUES ($1, $2, $3, '未打卡人员', 1) RETURNING id",
    )
    .bind(allowed_project)
    .bind(unit_id)
    .bind(team_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let attended_worker = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_workers (project_id, unit_id, team_id, name, work_status) VALUES ($1, $2, $3, '已打卡人员', 1) RETURNING id",
    )
    .bind(allowed_project)
    .bind(unit_id)
    .bind(team_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let warning_date = NaiveDate::from_ymd_opt(2026, 8, 12).unwrap();
    let warning_time = Utc.with_ymd_and_hms(2026, 8, 12, 6, 0, 0).unwrap();
    sqlx::query("INSERT INTO construction_attendance_records (worker_id, project_id, trigger_time) VALUES ($1, $2, $3)")
        .bind(attended_worker)
        .bind(allowed_project)
        .bind(warning_time - chrono::Duration::hours(1))
        .execute(&pool)
        .await
        .unwrap();
    let device_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_attendance_devices (project_id, device_name, serial_number, online_status, last_seen_at, last_online_at) VALUES ($1, '南门考勤机', 'WARN-SN-1', 'offline', NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '40 minutes') RETURNING id",
    )
    .bind(allowed_project)
    .fetch_one(&pool)
    .await
    .unwrap();

    refresh_management_team_attendance_warnings(&pool, warning_date, warning_time)
        .await
        .unwrap();
    refresh_management_team_attendance_warnings(&pool, warning_date, warning_time)
        .await
        .unwrap();
    refresh_device_offline_warnings(&pool).await.unwrap();

    let missing_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM system_warning_records WHERE worker_id = $1",
    )
    .bind(missing_worker)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(missing_count, 1);
    let attended_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM system_warning_records WHERE worker_id = $1",
    )
    .bind(attended_worker)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(attended_count, 0);
    let device_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM system_warning_records WHERE device_id = $1 AND resolved_at IS NULL",
    )
    .bind(device_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(device_count, 1);

    let denied_device = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO construction_attendance_devices (project_id, device_name, serial_number) VALUES ($1, '未授权设备', 'WARN-SN-2') RETURNING id",
    )
    .bind(denied_project)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO system_warning_records (warning_type, project_id, device_id, warning_date, occurred_at, title, message) VALUES ('device_offline', $1, $2, $3, $4, '未授权预警', '不可见')")
        .bind(denied_project)
        .bind(denied_device)
        .bind(warning_date)
        .bind(warning_time)
        .execute(&pool)
        .await
        .unwrap();

    let user_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO users (email, username, role, is_active, email_verified) VALUES ($1, $2, 'user', TRUE, TRUE) RETURNING id",
    )
    .bind(format!("warning-{}@example.com", Uuid::new_v4()))
    .bind(format!("warning-{}", Uuid::new_v4()))
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO user_managed_projects (user_id, project_id) VALUES ($1, $2)")
        .bind(user_id)
        .bind(allowed_project)
        .execute(&pool)
        .await
        .unwrap();

    let (status, body) = get_authed(
        app.clone(),
        "/api/v1/management/warnings?page=1&page_size=10",
        &token(user_id, Role::User),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 2);
    assert!(
        body["data"]["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| row["project_id"] == allowed_project.to_string())
    );

    let reporting_user_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO users (email, username, role, is_active, email_verified) VALUES ($1, $2, 'shujubaosong', TRUE, TRUE) RETURNING id",
    )
    .bind(format!("report-warning-{}@example.com", Uuid::new_v4()))
    .bind(format!("report-warning-{}", Uuid::new_v4()))
    .fetch_one(&pool)
    .await
    .unwrap();
    let (status, _) = get_authed(
        app.clone(),
        "/api/v1/management/warnings?page=1&page_size=10",
        &token(reporting_user_id, Role::User),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::FORBIDDEN);

    let (status, body) = get_authed(
        app,
        "/api/v1/management/warnings?page=1&page_size=10",
        &token(Uuid::new_v4(), Role::Admin),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "{body}");
    assert_eq!(body["data"]["total"], 3);
}
