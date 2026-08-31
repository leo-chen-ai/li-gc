use serde::Serialize;

/// GET /api/v1/dashboard/overview
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardOverviewResponse {
    pub project_total: i64,
    pub status_preparation: i64,
    pub status_in_progress: i64,
    pub status_completed: i64,
    pub status_finished: i64,
    pub status_stopped: i64,
    pub status_approved: i64,

    pub total_registered: i64,
    pub total_active: i64,
    pub total_management: i64,
    pub total_party_member: i64,

    pub today_attendance: i64,
    pub device_count: i64,
}

/// GET /api/v1/dashboard/projects/map
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapProjectItem {
    pub id: uuid::Uuid,
    pub name: String,
    pub longitude: Option<String>,
    pub latitude: Option<String>,
    pub map_poi_name: Option<String>,
    pub map_address: Option<String>,
    pub status: Option<i32>,
    pub general_contractor: Option<String>,
    pub project_manager: Option<String>,
    pub project_manager_phone: Option<String>,
}

/// GET /api/v1/dashboard/smart-site
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartSiteResponse {
    pub device_count: i64,
    pub modules: Vec<SmartSiteModule>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartSiteModule {
    pub key: String,
    pub name: String,
    pub count: i64,
}

/// GET /api/v1/dashboard/alerts/30d
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Alert30dResponse {
    pub pending: i64,
    pub resolved: i64,
    pub no_risk: i64,
    pub low_risk: i64,
    pub medium_risk: i64,
    pub high_risk: i64,
}

/// GET /api/v1/dashboard/alerts/today
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertTodayResponse {
    pub items: Vec<AlertTodayItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertTodayItem {
    pub label: String,
    pub count: i64,
    pub color: String,
}

/// GET /api/v1/dashboard/attendance/30d
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attendance30dPoint {
    pub date: String,
    pub count: i64,
}

/// GET /api/v1/dashboard/projects/:id/board
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBoardResponse {
    pub project: BoardProjectInfo,
    pub team_attendance: Vec<BoardTeamAttendance>,
    pub worker_type_distribution: Vec<BoardWorkerTypeCount>,
    pub daily_avg_attendance: f64,
    pub today_attendance_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardProjectInfo {
    pub id: uuid::Uuid,
    pub name: String,
    pub status: Option<i32>,
    pub contractor: Option<String>,
    pub project_manager: Option<String>,
    pub project_manager_phone: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub area: Option<String>,
    pub investment_amount: Option<String>,
    pub total_workers: i64,
    pub active_workers: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardTeamAttendance {
    pub team_name: String,
    pub attendance_count: i64,
    pub on_site_count: i64,
    pub total_count: i64,
    pub attendance_rate: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardWorkerTypeCount {
    pub worker_type: i32,
    pub worker_type_name: String,
    pub count: i64,
}

/// GET /api/v1/dashboard/projects/:id/attendance/feed
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceFeedItem {
    pub id: uuid::Uuid,
    pub worker_name: String,
    pub worker_photo_url: Option<String>,
    pub trigger_time: String,
    pub equipment_name: Option<String>,
    pub direction: i16,
}

/// GET /api/v1/dashboard/projects/:id/attendance/30d
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAttendance30dPoint {
    pub date: String,
    pub count: i64,
}

/// GET /api/v1/dashboard/projects/:id/attendance/today-hourly
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayHourlyPoint {
    pub hour: i32,
    pub count: i64,
}
