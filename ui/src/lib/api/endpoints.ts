export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/auth/login",
    REGISTER: "/auth/register",
    REGISTRATION_LEADS: "/auth/registration-leads",
    REFRESH: "/auth/refresh",
    LOGOUT: "/auth/logout",
    ME: "/auth/me",
    CHANGE_PASSWORD: "/auth/change-password",
    SESSIONS: "/auth/sessions",
    SCAN_LOGIN_SESSIONS: "/auth/scan-login/sessions",
    SCAN_LOGIN_SESSION: (scanToken: string) =>
      `/auth/scan-login/sessions/${encodeURIComponent(scanToken)}`,
    SCAN_LOGIN_QR: (scanToken: string) =>
      `/auth/scan-login/sessions/${encodeURIComponent(scanToken)}/qr.svg`,
  },
  USER: {
    ME: "/users/me",
    UPDATE: "/users/me",
  },
  UPLOADS: "/uploads",
  OCR: {
    ID_CARD: "/ocr/id-card",
  },
  MANAGEMENT: {
    ROLE_PERMISSIONS: "/management/role-permissions",
    PROJECTS: "/management/projects",
    PROJECT_OPTIONS: "/management/projects/options",
    PROJECT: (projectId: string) => `/management/projects/${projectId}`,
    PROJECT_UNITS: (projectId: string) => `/management/projects/${projectId}/units`,
    PROJECT_UNITS_REPAIR_REPORTING: (projectId: string) =>
      `/management/projects/${projectId}/units/reporting/repair`,
    PROJECT_UNIT: (projectId: string, unitId: string) =>
      `/management/projects/${projectId}/units/${unitId}`,
    PROJECT_TEAMS: (projectId: string) => `/management/projects/${projectId}/teams`,
    PROJECT_TEAMS_REPAIR_REPORTING: (projectId: string) =>
      `/management/projects/${projectId}/teams/reporting/repair`,
    PROJECT_TEAM: (projectId: string, teamId: string) =>
      `/management/projects/${projectId}/teams/${teamId}`,
    PROJECT_WORKERS: (projectId: string) => `/management/projects/${projectId}/workers`,
    PROJECT_WORKERS_REPAIR_REPORTING: (projectId: string) =>
      `/management/projects/${projectId}/workers/reporting/repair`,
    PROJECT_WORKERS_EXPORT: (projectId: string) =>
      `/management/projects/${projectId}/workers/export`,
    PROJECT_WORKER: (projectId: string, workerId: string) =>
      `/management/projects/${projectId}/workers/${workerId}`,
    PROJECT_WORKER_CONTRACT_DOWNLOAD: (projectId: string, workerId: string) =>
      `/management/projects/${projectId}/workers/${workerId}/contract-download`,
    PROJECT_ATTENDANCE: (projectId: string) =>
      `/management/projects/${projectId}/attendance-records`,
    PROJECT_ATTENDANCE_YONGXIN_REPAIR: (projectId: string) =>
      `/management/projects/${projectId}/attendance-records/yongxin-repair`,
    PROJECT_ATTENDANCE_YONGXIN_REPAIR_PREVIEW: (projectId: string) =>
      `/management/projects/${projectId}/attendance-records/yongxin-repair/preview`,
    PROJECT_ATTENDANCE_EXPORT: (projectId: string) =>
      `/management/projects/${projectId}/attendance-records/export`,
    PROJECT_ATTENDANCE_RECORD: (projectId: string, attendanceId: string) =>
      `/management/projects/${projectId}/attendance-records/${attendanceId}`,
    PROJECT_WAGE_BATCHES: (projectId: string) =>
      `/management/projects/${projectId}/wage-batches`,
    PROJECT_WAGE_BATCH: (projectId: string, batchId: string) =>
      `/management/projects/${projectId}/wage-batches/${batchId}`,
    PROJECT_WAGE_IMPORT: (projectId: string) =>
      `/management/projects/${projectId}/wage-batches/import`,
    PROJECT_WAGE_EXPORT: (projectId: string) =>
      `/management/projects/${projectId}/wage-batches/export`,
    PROJECT_ATTENDANCE_DEVICES: (projectId: string) =>
      `/management/projects/${projectId}/attendance-devices`,
    PROJECT_ATTENDANCE_DEVICE: (projectId: string, deviceId: string) =>
      `/management/projects/${projectId}/attendance-devices/${deviceId}`,
    PROJECT_ATTENDANCE_DEVICE_ISSUE_WORKERS: (projectId: string, deviceId: string) =>
      `/management/projects/${projectId}/attendance-devices/${deviceId}/issue-workers`,
    PROJECT_ATTENDANCE_POINTS: (projectId: string) =>
      `/management/projects/${projectId}/attendance-points`,
    PROJECT_ATTENDANCE_POINT: (projectId: string, pointId: string) =>
      `/management/projects/${projectId}/attendance-points/${pointId}`,
    ATTENDANCE_DEVICE_ISSUE_REPORTS: "/management/attendance-device-issue-reports",
    ATTENDANCE_DEVICE_ISSUE_REPORT: (reportId: string) =>
      `/management/attendance-device-issue-reports/${reportId}`,
    SUPPLEMENTAL_ATTENDANCE_RECORDS: "/management/supplemental-attendance/records",
    PERSONNEL_WORKERS: "/management/personnel-workers",
    PERSONNEL_WORKER: (workerId: string) =>
      `/management/personnel-workers/${workerId}`,
  },
  ADMIN: {
    USERS: "/admin/users",
    ROLES: "/admin/roles",
    ROLE_DELETE: (id: string) => `/admin/roles/${id}`,
    ROLE_MENUS: (id: string) => `/admin/roles/${id}/menus`,
    UPLOADS: "/admin/uploads",
    LOG_LEVEL: "/admin/log/level",
    STATS: "/admin/stats",
    REGISTRATION_LEADS: "/admin/registration-leads",
    USER_PROJECTS: (id: string) => `/admin/users/${id}/projects`,
    USER_ROLE: (id: string) => `/admin/users/${id}/role`,
    USER: (id: string) => `/admin/users/${id}`,
    USER_PASSWORD: (id: string) => `/admin/users/${id}/password`,
    API_KEYS: "/admin/api-keys",
    API_KEY_REVOKE: (id: string) => `/admin/api-keys/${id}/revoke`,
    API_KEY_DELETE: (id: string) => `/admin/api-keys/${id}`,
    PROJECTS: "/admin/projects",
    PROJECT_OPTIONS: "/admin/projects/options",
    PROJECT: (id: string) => `/admin/projects/${id}`,
    PROJECT_UNITS: (projectId: string) => `/admin/projects/${projectId}/units`,
    PROJECT_UNITS_REPAIR_REPORTING: (projectId: string) =>
      `/admin/projects/${projectId}/units/reporting/repair`,
    PROJECT_UNIT: (projectId: string, unitId: string) =>
      `/admin/projects/${projectId}/units/${unitId}`,
    PROJECT_TEAMS: (projectId: string) => `/admin/projects/${projectId}/teams`,
    PROJECT_TEAMS_REPAIR_REPORTING: (projectId: string) =>
      `/admin/projects/${projectId}/teams/reporting/repair`,
    PROJECT_TEAM: (projectId: string, teamId: string) =>
      `/admin/projects/${projectId}/teams/${teamId}`,
    PROJECT_WORKERS: (projectId: string) => `/admin/projects/${projectId}/workers`,
    PROJECT_WORKERS_REPAIR_REPORTING: (projectId: string) =>
      `/admin/projects/${projectId}/workers/reporting/repair`,
    PROJECT_WORKERS_EXPORT: (projectId: string) =>
      `/admin/projects/${projectId}/workers/export`,
    PROJECT_WORKER: (projectId: string, workerId: string) =>
      `/admin/projects/${projectId}/workers/${workerId}`,
    PROJECT_ATTENDANCE: (projectId: string) =>
      `/admin/projects/${projectId}/attendance-records`,
    PROJECT_ATTENDANCE_YONGXIN_REPAIR: (projectId: string) =>
      `/admin/projects/${projectId}/attendance-records/yongxin-repair`,
    PROJECT_ATTENDANCE_YONGXIN_REPAIR_PREVIEW: (projectId: string) =>
      `/admin/projects/${projectId}/attendance-records/yongxin-repair/preview`,
    PROJECT_ATTENDANCE_EXPORT: (projectId: string) =>
      `/admin/projects/${projectId}/attendance-records/export`,
    PROJECT_ATTENDANCE_RECORD: (projectId: string, attendanceId: string) =>
      `/admin/projects/${projectId}/attendance-records/${attendanceId}`,
    PROJECT_ATTENDANCE_GENERATOR_PREVIEW: (projectId: string) =>
      `/admin/projects/${projectId}/attendance-generator/preview`,
    PROJECT_ATTENDANCE_GENERATOR_COMMIT: (projectId: string) =>
      `/admin/projects/${projectId}/attendance-generator/commit`,
    PROJECT_WAGE_BATCHES: (projectId: string) =>
      `/admin/projects/${projectId}/wage-batches`,
    PROJECT_WAGE_BATCH: (projectId: string, batchId: string) =>
      `/admin/projects/${projectId}/wage-batches/${batchId}`,
    PROJECT_WAGE_IMPORT: (projectId: string) =>
      `/admin/projects/${projectId}/wage-batches/import`,
    PROJECT_WAGE_EXPORT: (projectId: string) =>
      `/admin/projects/${projectId}/wage-batches/export`,
    PROJECT_WORKER_CONTRACT_DOWNLOAD: (projectId: string, workerId: string) =>
      `/admin/projects/${projectId}/workers/${workerId}/contract-download`,
    PROJECT_CONTRACT_TEMPLATE_CONFIG: (projectId: string) =>
      `/admin/projects/${projectId}/contract-template`,
    CONTRACT_TEMPLATES: "/admin/contract-templates",
    CONTRACT_TEMPLATE: (templateId: string) =>
      `/admin/contract-templates/${templateId}`,
    WORK_HOUR_CONFIGS: "/admin/work-hour-configs",
    WORK_HOUR_CONFIG: (configId: string) =>
      `/admin/work-hour-configs/${configId}`,
    PLATFORM_CONFIGS: "/admin/platform-configs",
    PLATFORM_CONFIG: (configId: string) =>
      `/admin/platform-configs/${configId}`,
    PLATFORM_LOGS: "/admin/platform-logs",
    PLATFORM_LOG: (logId: string) => `/admin/platform-logs/${logId}`,
    PLATFORM_JOB_RETRY: (jobId: string) => `/admin/platform-jobs/${jobId}/retry`,
    CONSTRUCTION_OVERVIEW: "/admin/construction-overview",
    ENTERPRISE_CUSTOMERS: "/admin/enterprise-customers",
    ENTERPRISE_CUSTOMERS_EXPORT: "/admin/enterprise-customers/export",
    ENTERPRISE_CUSTOMER: (customerId: string) =>
      `/admin/enterprise-customers/${customerId}`,
    ENTERPRISE_CUSTOMER_SUMMARY: (customerId: string) =>
      `/admin/enterprise-customers/${customerId}/summary`,
    ENTERPRISE_OWN_ENTITIES: "/admin/enterprise-own-entities",
    ENTERPRISE_OWN_ENTITIES_EXPORT: "/admin/enterprise-own-entities/export",
    ENTERPRISE_OWN_ENTITY: (entityId: string) =>
      `/admin/enterprise-own-entities/${entityId}`,
    ENTERPRISE_PROJECTS: "/admin/enterprise-projects",
    ENTERPRISE_PROJECTS_EXPORT: "/admin/enterprise-projects/export",
    ENTERPRISE_PROJECT: (projectId: string) =>
      `/admin/enterprise-projects/${projectId}`,
    ENTERPRISE_PROJECT_SUMMARY: (projectId: string) =>
      `/admin/enterprise-projects/${projectId}/summary`,
    ENTERPRISE_PROJECT_RECORDS: (projectId: string, module: string) =>
      `/admin/enterprise-projects/${projectId}/${module}`,
    ENTERPRISE_PROJECT_RECORD: (projectId: string, module: string, recordId: string) =>
      `/admin/enterprise-projects/${projectId}/${module}/${recordId}`,
    ENTERPRISE_PROJECT_RECORDS_EXPORT: (projectId: string, module: string) =>
      `/admin/enterprise-projects/${projectId}/${module}/export`,
    PROJECT_ATTENDANCE_DEVICES: (projectId: string) =>
      `/admin/projects/${projectId}/attendance-devices`,
    PROJECT_ATTENDANCE_DEVICE: (projectId: string, deviceId: string) =>
      `/admin/projects/${projectId}/attendance-devices/${deviceId}`,
    PROJECT_ATTENDANCE_DEVICE_ISSUE_WORKERS: (projectId: string, deviceId: string) =>
      `/admin/projects/${projectId}/attendance-devices/${deviceId}/issue-workers`,
    PROJECT_ATTENDANCE_POINTS: (projectId: string) =>
      `/admin/projects/${projectId}/attendance-points`,
    PROJECT_ATTENDANCE_POINT: (projectId: string, pointId: string) =>
      `/admin/projects/${projectId}/attendance-points/${pointId}`,
    ATTENDANCE_DEVICE_ISSUE_REPORTS: "/admin/attendance-device-issue-reports",
    ATTENDANCE_DEVICE_ISSUE_REPORT: (reportId: string) =>
      `/admin/attendance-device-issue-reports/${reportId}`,
    ATTENDANCE_ALERT_CONFIGS: "/admin/attendance-alert-configs",
    ATTENDANCE_ALERT_CONFIG: (configId: string) =>
      `/admin/attendance-alert-configs/${configId}`,
    ATTENDANCE_ALERT_LOGS: "/admin/attendance-alert-logs",
    ATTENDANCE_ALERT_RUN: "/admin/attendance-alerts/run",
    REPORT_FORWARD_SUMMARY: "/management/report-forward/summary",
    REPORT_FORWARD_CONFIGS: "/management/report-forward/configs",
    REPORT_FORWARD_CONFIG: (configId: string) => `/management/report-forward/configs/${configId}`,
    REPORT_FORWARD_CONFIG_RUNS: (configId: string) => `/management/report-forward/configs/${configId}/runs`,
    REPORT_FORWARD_RUNS: "/management/report-forward/runs",
    REPORT_FORWARD_RUN: (runId: string) => `/management/report-forward/runs/${runId}`,
    REPORT_FORWARD_RUN_CANCEL: (runId: string) => `/management/report-forward/runs/${runId}/cancel`,
    REPORT_FORWARD_RUN_RETRY: (runId: string) => `/management/report-forward/runs/${runId}/retry`,
    REPORT_FORWARD_ITEMS: "/management/report-forward/items",
    REPORT_FORWARD_ITEMS_EXPORT: (runId: string) => `/management/report-forward/runs/${runId}/items/export`,
    REPORT_FORWARD_ARTIFACT_DOWNLOAD: (artifactId: string) => `/management/report-forward/artifacts/${artifactId}/download`,
    MANAGED_ATTENDANCE_PHOTO_GROUPS: "/admin/managed-attendance/photo-groups",
    MANAGED_ATTENDANCE_PHOTO_GROUP: (photoGroupId: string) =>
      `/admin/managed-attendance/photo-groups/${photoGroupId}`,
    MANAGED_ATTENDANCE_CONFIGS: "/admin/managed-attendance/configs",
    MANAGED_ATTENDANCE_CONFIG: (configId: string) =>
      `/admin/managed-attendance/configs/${configId}`,
    MANAGED_ATTENDANCE_GENERATE: (configId: string) =>
      `/admin/managed-attendance/configs/${configId}/generate`,
    MANAGED_ATTENDANCE_RESEND_DAY: (configId: string) =>
      `/admin/managed-attendance/configs/${configId}/resend-day`,
    MANAGED_ATTENDANCE_RECORDS: "/admin/managed-attendance/records",
  },
  DASHBOARD: {
    OVERVIEW: "/dashboard/overview",
    PROJECTS_MAP: "/dashboard/projects/map",
    SMART_SITE: "/dashboard/smart-site",
    ALERTS_30D: "/dashboard/alerts/30d",
    ALERTS_TODAY: "/dashboard/alerts/today",
    ATTENDANCE_30D: "/dashboard/attendance/30d",
    PROJECT_BOARD: (projectId: string) => `/dashboard/projects/${projectId}/board`,
    PROJECT_ATTENDANCE_FEED: (projectId: string) =>
      `/dashboard/projects/${projectId}/attendance/feed`,
    PROJECT_ATTENDANCE_30D: (projectId: string) =>
      `/dashboard/projects/${projectId}/attendance/30d`,
    PROJECT_ATTENDANCE_TODAY_HOURLY: (projectId: string) =>
      `/dashboard/projects/${projectId}/attendance/today-hourly`,
  },
} as const;
