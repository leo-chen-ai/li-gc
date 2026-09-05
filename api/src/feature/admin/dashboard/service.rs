use sqlx::PgPool;
use uuid::Uuid;

use crate::feature::auth::{AuthUser, Role};

use super::dto::*;

/// Helper: append project-access scope clause.
/// For admins, no filter; for non-admin users, restrict to user_managed_projects.
fn project_scope_where(auth_user: &AuthUser, base: &str) -> String {
    if auth_user.roles.contains(&Role::Admin) {
        format!("{base} WHERE p.is_deleted = FALSE")
    } else {
        format!(
            "{base} WHERE p.is_deleted = FALSE \
             AND EXISTS (SELECT 1 FROM user_managed_projects ump \
                         WHERE ump.user_id = '{}' AND ump.project_id = p.id)",
            auth_user.user_id
        )
    }
}

// ─── Overview ───────────────────────────────────────────────────────────────

pub async fn get_overview(
    pool: &PgPool,
    auth_user: &AuthUser,
) -> Result<DashboardOverviewResponse, sqlx::Error> {
    let (project_stats, worker_stats, today_attendance, device_count) = tokio::try_join!(
        fetch_project_stats(pool, auth_user),
        fetch_worker_stats(pool, auth_user),
        fetch_today_attendance(pool, auth_user),
        fetch_device_count(pool, auth_user),
    )?;

    Ok(DashboardOverviewResponse {
        project_total: project_stats.0,
        status_preparation: project_stats.1,
        status_in_progress: project_stats.2,
        status_completed: project_stats.3,
        status_finished: project_stats.4,
        status_stopped: project_stats.5,
        status_approved: project_stats.6,
        total_registered: worker_stats.0,
        total_active: worker_stats.1,
        total_management: worker_stats.2,
        total_party_member: worker_stats.3,
        today_attendance,
        device_count,
    })
}

/// Returns (total, preparation, in_progress, completed, finished, stopped, approved)
async fn fetch_project_stats(
    pool: &PgPool,
    auth_user: &AuthUser,
) -> Result<(i64, i64, i64, i64, i64, i64, i64), sqlx::Error> {
    let base = "SELECT \
        COUNT(*)::bigint, \
        COUNT(*) FILTER (WHERE p.status = 3)::bigint, \
        COUNT(*) FILTER (WHERE p.status = 5)::bigint, \
        COUNT(*) FILTER (WHERE p.status = 6)::bigint, \
        COUNT(*) FILTER (WHERE p.status = 8)::bigint, \
        COUNT(*) FILTER (WHERE p.status = 7)::bigint, \
        COUNT(*) FILTER (WHERE p.status = 0)::bigint \
        FROM construction_projects p";
    let sql = project_scope_where(auth_user, base);
    let row = sqlx::query_as::<_, (i64, i64, i64, i64, i64, i64, i64)>(&sql)
        .fetch_one(pool)
        .await?;
    Ok(row)
}

/// Returns (total_registered, total_active, total_management, total_party_member)
async fn fetch_worker_stats(
    pool: &PgPool,
    auth_user: &AuthUser,
) -> Result<(i64, i64, i64, i64), sqlx::Error> {
    let scope = if auth_user.roles.contains(&Role::Admin) {
        "WHERE w.is_deleted = FALSE AND p.is_deleted = FALSE"
    } else {
        "WHERE w.is_deleted = FALSE AND p.is_deleted = FALSE \
         AND EXISTS (SELECT 1 FROM user_managed_projects ump \
                     WHERE ump.user_id = $1 AND ump.project_id = w.project_id)"
    };
    let sql = format!(
        "SELECT \
            COUNT(*)::bigint, \
            COUNT(*) FILTER (WHERE w.work_status = 1)::bigint, \
            COUNT(*) FILTER (WHERE w.worker_type = 1001)::bigint, \
            COUNT(*) FILTER (WHERE w.political_status = 2)::bigint \
         FROM construction_workers w \
         JOIN construction_projects p ON p.id = w.project_id \
         {scope}"
    );

    if auth_user.roles.contains(&Role::Admin) {
        sqlx::query_as::<_, (i64, i64, i64, i64)>(&sql)
            .fetch_one(pool)
            .await
    } else {
        sqlx::query_as::<_, (i64, i64, i64, i64)>(&sql)
            .bind(auth_user.user_id)
            .fetch_one(pool)
            .await
    }
}

async fn fetch_today_attendance(pool: &PgPool, auth_user: &AuthUser) -> Result<i64, sqlx::Error> {
    let scope = if auth_user.roles.contains(&Role::Admin) {
        "WHERE a.is_deleted = FALSE AND p.is_deleted = FALSE \
         AND a.direction = 0 AND a.trigger_time >= CURRENT_DATE"
    } else {
        "WHERE a.is_deleted = FALSE AND p.is_deleted = FALSE \
         AND a.direction = 0 AND a.trigger_time >= CURRENT_DATE \
         AND EXISTS (SELECT 1 FROM user_managed_projects ump \
                     WHERE ump.user_id = $1 AND ump.project_id = a.project_id)"
    };
    let sql = format!(
        "SELECT COUNT(DISTINCT a.worker_id)::bigint \
         FROM construction_attendance_records a \
         JOIN construction_projects p ON p.id = a.project_id \
         {scope}"
    );

    if auth_user.roles.contains(&Role::Admin) {
        sqlx::query_scalar::<_, i64>(&sql).fetch_one(pool).await
    } else {
        sqlx::query_scalar::<_, i64>(&sql)
            .bind(auth_user.user_id)
            .fetch_one(pool)
            .await
    }
}

async fn fetch_device_count(pool: &PgPool, auth_user: &AuthUser) -> Result<i64, sqlx::Error> {
    let scope = if auth_user.roles.contains(&Role::Admin) {
        "WHERE d.is_deleted = FALSE AND p.is_deleted = FALSE"
    } else {
        "WHERE d.is_deleted = FALSE AND p.is_deleted = FALSE \
         AND EXISTS (SELECT 1 FROM user_managed_projects ump \
                     WHERE ump.user_id = $1 AND ump.project_id = d.project_id)"
    };
    let sql = format!(
        "SELECT COUNT(*)::bigint \
         FROM construction_attendance_devices d \
         JOIN construction_projects p ON p.id = d.project_id \
         {scope}"
    );

    if auth_user.roles.contains(&Role::Admin) {
        sqlx::query_scalar::<_, i64>(&sql).fetch_one(pool).await
    } else {
        sqlx::query_scalar::<_, i64>(&sql)
            .bind(auth_user.user_id)
            .fetch_one(pool)
            .await
    }
}

// ─── Map Projects ───────────────────────────────────────────────────────────

pub async fn get_map_projects(
    pool: &PgPool,
    auth_user: &AuthUser,
) -> Result<Vec<MapProjectItem>, sqlx::Error> {
    let base = "SELECT p.id, p.name, p.longitude, p.latitude, \
        p.map_poi_name, p.map_address, p.status, \
        p.contractor, p.manager, p.manager_phone \
        FROM construction_projects p";
    // 不在这里按坐标过滤：地图组件前端会自行剔除无坐标项，
    // 而项目看板切换器等消费方需要权限范围内的完整项目列表。
    let sql = project_scope_where(auth_user, base);

    let rows = sqlx::query_as::<_, MapProjectRow>(&sql)
        .fetch_all(pool)
        .await?;

    Ok(rows
        .into_iter()
        .map(|r| MapProjectItem {
            id: r.id,
            name: r.name.unwrap_or_default(),
            longitude: r.longitude,
            latitude: r.latitude,
            map_poi_name: r.map_poi_name,
            map_address: r.map_address,
            status: r.status,
            general_contractor: r.contractor,
            project_manager: r.manager,
            project_manager_phone: r.manager_phone,
        })
        .collect())
}

#[derive(sqlx::FromRow)]
struct MapProjectRow {
    id: Uuid,
    name: Option<String>,
    longitude: Option<String>,
    latitude: Option<String>,
    map_poi_name: Option<String>,
    map_address: Option<String>,
    status: Option<i32>,
    contractor: Option<String>,
    manager: Option<String>,
    manager_phone: Option<String>,
}

// ─── Smart Site ─────────────────────────────────────────────────────────────

pub async fn get_smart_site(
    pool: &PgPool,
    auth_user: &AuthUser,
) -> Result<SmartSiteResponse, sqlx::Error> {
    let device_count = fetch_device_count(pool, auth_user).await?;

    let module_defs = [
        ("attendance_device", "考勤机"),
        ("real_name", "实名制"),
        ("video_monitor", "视频监控"),
        ("env_monitor", "环境监测"),
        ("tower_crane", "塔吊监测"),
        ("elevator", "升降机监测"),
        ("deep_pit", "深基坑监测"),
        ("high_formwork", "高支模监测"),
        ("dust_control", "扬尘管控"),
        ("water_control", "水控"),
        ("elec_control", "电控"),
        ("smart_helmet", "智能安全帽"),
        ("ai_camera", "AI 摄像头"),
        ("vehicle", "车辆管理"),
        ("material", "物料管理"),
        ("quality_check", "质量检查"),
        ("safety_check", "安全检查"),
        ("led_board", "LED 公告屏"),
        ("broadcast", "语音广播"),
        ("access_gate", "门禁闸机"),
        ("worker_edu", "工人教育"),
        ("contract", "合同管理"),
        ("salary", "薪资管理"),
        ("document", "文档管理"),
    ];

    let modules = module_defs
        .iter()
        .map(|(key, name)| SmartSiteModule {
            key: key.to_string(),
            name: name.to_string(),
            count: if *key == "attendance_device" {
                device_count
            } else {
                0
            },
        })
        .collect();

    Ok(SmartSiteResponse {
        device_count,
        modules,
    })
}

// ─── Alerts (placeholder) ──────────────────────────────────────────────────

pub fn get_alerts_30d() -> Alert30dResponse {
    Alert30dResponse {
        pending: 3,
        resolved: 12,
        no_risk: 8,
        low_risk: 5,
        medium_risk: 2,
        high_risk: 0,
    }
}

pub fn get_alerts_today() -> AlertTodayResponse {
    AlertTodayResponse {
        items: vec![
            AlertTodayItem {
                label: "管理人员出勤预警".into(),
                count: 2,
                color: "#00d4ff".into(),
            },
            AlertTodayItem {
                label: "人证不相似预警".into(),
                count: 5,
                color: "#00d4ff".into(),
            },
            AlertTodayItem {
                label: "手机定位关闭预警".into(),
                count: 1,
                color: "#00d4ff".into(),
            },
            AlertTodayItem {
                label: "手机进程终止预警".into(),
                count: 8,
                color: "#00d4ff".into(),
            },
        ],
    }
}

// ─── Attendance 30d (global) ────────────────────────────────────────────────

pub async fn get_attendance_30d(
    pool: &PgPool,
    auth_user: &AuthUser,
) -> Result<Vec<Attendance30dPoint>, sqlx::Error> {
    let scope = if auth_user.roles.contains(&Role::Admin) {
        "WHERE a.is_deleted = FALSE AND p.is_deleted = FALSE \
         AND a.direction = 0 AND a.trigger_time >= CURRENT_DATE - INTERVAL '29 days'"
    } else {
        "WHERE a.is_deleted = FALSE AND p.is_deleted = FALSE \
         AND a.direction = 0 AND a.trigger_time >= CURRENT_DATE - INTERVAL '29 days' \
         AND EXISTS (SELECT 1 FROM user_managed_projects ump \
                     WHERE ump.user_id = $1 AND ump.project_id = a.project_id)"
    };

    let sql = format!(
        "SELECT TO_CHAR(d.day, 'YYYY-MM-DD') AS date, \
                COALESCE(c.cnt, 0)::bigint AS count \
         FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day'::interval) AS d(day) \
         LEFT JOIN ( \
             SELECT DATE(a.trigger_time) AS day, COUNT(DISTINCT a.worker_id) AS cnt \
             FROM construction_attendance_records a \
             JOIN construction_projects p ON p.id = a.project_id \
             {scope} \
             GROUP BY DATE(a.trigger_time) \
         ) c ON c.day = d.day \
         ORDER BY d.day"
    );

    if auth_user.roles.contains(&Role::Admin) {
        sqlx::query_as::<_, Attendance30dRow>(&sql)
            .fetch_all(pool)
            .await
    } else {
        sqlx::query_as::<_, Attendance30dRow>(&sql)
            .bind(auth_user.user_id)
            .fetch_all(pool)
            .await
    }
    .map(|rows| {
        rows.into_iter()
            .map(|r| Attendance30dPoint {
                date: r.date,
                count: r.count,
            })
            .collect()
    })
}

#[derive(sqlx::FromRow)]
struct Attendance30dRow {
    date: String,
    count: i64,
}

// ─── Project Board ──────────────────────────────────────────────────────────

pub async fn get_project_board(
    pool: &PgPool,
    auth_user: &AuthUser,
    project_id: Uuid,
) -> Result<Option<ProjectBoardResponse>, sqlx::Error> {
    // Verify access
    let accessible = check_project_access(pool, auth_user, project_id).await?;
    if !accessible {
        return Ok(None);
    }

    let (project_info, team_attendance, worker_type_dist, daily_avg, today_count) = tokio::try_join!(
        fetch_board_project_info(pool, project_id),
        fetch_board_team_attendance(pool, project_id),
        fetch_board_worker_types(pool, project_id),
        fetch_board_daily_avg(pool, project_id),
        fetch_board_today_count(pool, project_id),
    )?;

    Ok(Some(ProjectBoardResponse {
        project: project_info,
        team_attendance,
        worker_type_distribution: worker_type_dist,
        daily_avg_attendance: daily_avg,
        today_attendance_count: today_count,
    }))
}

async fn check_project_access(
    pool: &PgPool,
    auth_user: &AuthUser,
    project_id: Uuid,
) -> Result<bool, sqlx::Error> {
    if auth_user.roles.contains(&Role::Admin) {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM construction_projects WHERE id = $1 AND is_deleted = FALSE)"
        )
        .bind(project_id)
        .fetch_one(pool)
        .await
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS( \
                SELECT 1 FROM construction_projects p \
                JOIN user_managed_projects ump ON ump.project_id = p.id \
                WHERE p.id = $1 AND p.is_deleted = FALSE AND ump.user_id = $2 \
            )",
        )
        .bind(project_id)
        .bind(auth_user.user_id)
        .fetch_one(pool)
        .await
    }
}

async fn fetch_board_project_info(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<BoardProjectInfo, sqlx::Error> {
    let row = sqlx::query_as::<_, BoardProjectRow>(
        "SELECT p.id, p.name, p.status, p.contractor, p.manager, p.manager_phone, \
                p.start_date::text AS start_date, p.finish_date::text AS finish_date, p.address, p.invest_total, \
                (SELECT COUNT(*)::bigint FROM construction_workers w WHERE w.project_id = p.id AND w.is_deleted = FALSE) AS total_workers, \
                (SELECT COUNT(*)::bigint FROM construction_workers w WHERE w.project_id = p.id AND w.is_deleted = FALSE AND w.work_status = 1) AS active_workers \
         FROM construction_projects p \
         WHERE p.id = $1 AND p.is_deleted = FALSE"
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(BoardProjectInfo {
        id: row.id,
        name: row.name.unwrap_or_default(),
        status: row.status,
        contractor: row.contractor,
        project_manager: row.manager,
        project_manager_phone: row.manager_phone,
        start_date: row.start_date,
        end_date: row.finish_date,
        area: row.address,
        investment_amount: row.invest_total.map(|v| v.to_string()),
        total_workers: row.total_workers,
        active_workers: row.active_workers,
    })
}

#[derive(sqlx::FromRow)]
struct BoardProjectRow {
    id: Uuid,
    name: Option<String>,
    status: Option<i32>,
    contractor: Option<String>,
    manager: Option<String>,
    manager_phone: Option<String>,
    start_date: Option<String>,
    finish_date: Option<String>,
    address: Option<String>,
    invest_total: Option<i64>,
    total_workers: i64,
    active_workers: i64,
}

async fn fetch_board_team_attendance(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<Vec<BoardTeamAttendance>, sqlx::Error> {
    sqlx::query_as::<_, BoardTeamRow>(
        "SELECT \
            t.name AS team_name, \
            COALESCE(att.cnt, 0)::bigint AS attendance_count, \
            COALESCE(site.cnt, 0)::bigint AS on_site_count, \
            (SELECT COUNT(*)::bigint FROM construction_workers w \
             WHERE w.team_id = t.id AND w.is_deleted = FALSE AND w.work_status = 1) AS total_count \
         FROM construction_teams t \
         LEFT JOIN ( \
             SELECT w.team_id, COUNT(DISTINCT a.worker_id) AS cnt \
             FROM construction_attendance_records a \
             JOIN construction_workers w ON w.id = a.worker_id \
             WHERE a.project_id = $1 AND a.is_deleted = FALSE AND a.direction = 0 \
                   AND a.trigger_time >= CURRENT_DATE \
             GROUP BY w.team_id \
         ) att ON att.team_id = t.id \
         LEFT JOIN ( \
             SELECT w.team_id, COUNT(DISTINCT a.worker_id) AS cnt \
             FROM construction_attendance_records a \
             JOIN construction_workers w ON w.id = a.worker_id \
             WHERE a.project_id = $1 AND a.is_deleted = FALSE AND a.direction = 0 \
                   AND a.trigger_time >= CURRENT_DATE \
                   AND NOT EXISTS ( \
                       SELECT 1 FROM construction_attendance_records a2 \
                       WHERE a2.project_id = $1 AND a2.worker_id = a.worker_id \
                             AND a2.is_deleted = FALSE AND a2.direction = 1 \
                             AND a2.trigger_time >= CURRENT_DATE \
                             AND a2.trigger_time > a.trigger_time \
                   ) \
             GROUP BY w.team_id \
         ) site ON site.team_id = t.id \
         WHERE t.project_id = $1 AND t.is_deleted = FALSE \
         ORDER BY t.name",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|r| {
                let total = r.total_count;
                let rate = if total > 0 {
                    (r.attendance_count as f64 / total as f64 * 100.0).round()
                } else {
                    0.0
                };
                BoardTeamAttendance {
                    team_name: r.team_name.unwrap_or_default(),
                    attendance_count: r.attendance_count,
                    on_site_count: r.on_site_count,
                    total_count: total,
                    attendance_rate: rate,
                }
            })
            .collect()
    })
}

#[derive(sqlx::FromRow)]
struct BoardTeamRow {
    team_name: Option<String>,
    attendance_count: i64,
    on_site_count: i64,
    total_count: i64,
}

async fn fetch_board_worker_types(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<Vec<BoardWorkerTypeCount>, sqlx::Error> {
    sqlx::query_as::<_, BoardWorkerTypeRow>(
        "SELECT COALESCE(w.worker_type, 0) AS worker_type, COUNT(*)::bigint AS count \
         FROM construction_workers w \
         WHERE w.project_id = $1 AND w.is_deleted = FALSE AND w.work_status = 1 \
         GROUP BY w.worker_type",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|r| {
                let name = match r.worker_type {
                    1 => "建筑工人",
                    1001 => "管理人员",
                    _ => "其他",
                };
                BoardWorkerTypeCount {
                    worker_type: r.worker_type,
                    worker_type_name: name.to_string(),
                    count: r.count,
                }
            })
            .collect()
    })
}

#[derive(sqlx::FromRow)]
struct BoardWorkerTypeRow {
    worker_type: i32,
    count: i64,
}

async fn fetch_board_daily_avg(pool: &PgPool, project_id: Uuid) -> Result<f64, sqlx::Error> {
    let row = sqlx::query_as::<_, (i64, i64)>(
        "SELECT \
            COALESCE(SUM(c.cnt), 0)::bigint AS total, \
            GREATEST(COUNT(DISTINCT c.day), 1)::bigint AS days \
         FROM ( \
             SELECT DATE(a.trigger_time) AS day, COUNT(DISTINCT a.worker_id) AS cnt \
             FROM construction_attendance_records a \
             WHERE a.project_id = $1 AND a.is_deleted = FALSE AND a.direction = 0 \
                   AND a.trigger_time >= CURRENT_DATE - INTERVAL '29 days' \
             GROUP BY DATE(a.trigger_time) \
         ) c",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(if row.1 > 0 {
        row.0 as f64 / row.1 as f64
    } else {
        0.0
    })
}

async fn fetch_board_today_count(pool: &PgPool, project_id: Uuid) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(DISTINCT a.worker_id)::bigint \
         FROM construction_attendance_records a \
         WHERE a.project_id = $1 AND a.is_deleted = FALSE AND a.direction = 0 \
               AND a.trigger_time >= CURRENT_DATE",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await
}

// ─── Attendance Feed ────────────────────────────────────────────────────────

pub async fn get_attendance_feed(
    pool: &PgPool,
    auth_user: &AuthUser,
    project_id: Uuid,
    limit: i64,
) -> Result<Option<Vec<AttendanceFeedItem>>, sqlx::Error> {
    let accessible = check_project_access(pool, auth_user, project_id).await?;
    if !accessible {
        return Ok(None);
    }

    let rows = sqlx::query_as::<_, AttendanceFeedRow>(
        "SELECT a.id, w.name AS worker_name, w.avatar AS worker_photo_url, \
                TO_CHAR(a.trigger_time AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS trigger_time, \
                d.device_name AS equipment_name, a.direction \
         FROM construction_attendance_records a \
         JOIN construction_workers w ON w.id = a.worker_id \
         LEFT JOIN construction_attendance_devices d ON d.serial_number = a.serial_number AND d.project_id = a.project_id AND d.is_deleted = FALSE \
         WHERE a.project_id = $1 AND a.is_deleted = FALSE \
         ORDER BY a.trigger_time DESC \
         LIMIT $2"
    )
    .bind(project_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(Some(
        rows.into_iter()
            .map(|r| AttendanceFeedItem {
                id: r.id,
                worker_name: r.worker_name.unwrap_or_default(),
                worker_photo_url: r.worker_photo_url,
                trigger_time: r.trigger_time,
                equipment_name: r.equipment_name,
                direction: r.direction,
            })
            .collect(),
    ))
}

#[derive(sqlx::FromRow)]
struct AttendanceFeedRow {
    id: Uuid,
    worker_name: Option<String>,
    worker_photo_url: Option<String>,
    trigger_time: String,
    equipment_name: Option<String>,
    direction: i16,
}

// ─── Project Attendance 30d ─────────────────────────────────────────────────

pub async fn get_project_attendance_30d(
    pool: &PgPool,
    auth_user: &AuthUser,
    project_id: Uuid,
) -> Result<Option<Vec<ProjectAttendance30dPoint>>, sqlx::Error> {
    let accessible = check_project_access(pool, auth_user, project_id).await?;
    if !accessible {
        return Ok(None);
    }

    let rows = sqlx::query_as::<_, Attendance30dRow>(
        "SELECT TO_CHAR(d.day, 'YYYY-MM-DD') AS date, COALESCE(c.cnt, 0)::bigint AS count \
         FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day'::interval) AS d(day) \
         LEFT JOIN ( \
             SELECT DATE(a.trigger_time) AS day, COUNT(DISTINCT a.worker_id) AS cnt \
             FROM construction_attendance_records a \
             WHERE a.project_id = $1 AND a.is_deleted = FALSE AND a.direction = 0 \
                   AND a.trigger_time >= CURRENT_DATE - INTERVAL '29 days' \
             GROUP BY DATE(a.trigger_time) \
         ) c ON c.day = d.day \
         ORDER BY d.day"
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(Some(
        rows.into_iter()
            .map(|r| ProjectAttendance30dPoint {
                date: r.date,
                count: r.count,
            })
            .collect(),
    ))
}

// ─── Today Hourly ───────────────────────────────────────────────────────────

pub async fn get_today_hourly(
    pool: &PgPool,
    auth_user: &AuthUser,
    project_id: Uuid,
) -> Result<Option<Vec<TodayHourlyPoint>>, sqlx::Error> {
    let accessible = check_project_access(pool, auth_user, project_id).await?;
    if !accessible {
        return Ok(None);
    }

    let rows = sqlx::query_as::<_, TodayHourlyRow>(
        "SELECT \
            EXTRACT(HOUR FROM a.trigger_time AT TIME ZONE 'Asia/Shanghai')::int AS hour, \
            COUNT(DISTINCT a.worker_id)::bigint AS count \
         FROM construction_attendance_records a \
         WHERE a.project_id = $1 AND a.is_deleted = FALSE AND a.direction = 0 \
               AND a.trigger_time >= CURRENT_DATE \
         GROUP BY EXTRACT(HOUR FROM a.trigger_time AT TIME ZONE 'Asia/Shanghai') \
         ORDER BY hour",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(Some(
        rows.into_iter()
            .map(|r| TodayHourlyPoint {
                hour: r.hour,
                count: r.count,
            })
            .collect(),
    ))
}

#[derive(sqlx::FromRow)]
struct TodayHourlyRow {
    hour: i32,
    count: i64,
}
