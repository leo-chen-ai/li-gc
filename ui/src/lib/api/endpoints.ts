export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/auth/login",
    REGISTER: "/auth/register",
    REFRESH: "/auth/refresh",
    LOGOUT: "/auth/logout",
    ME: "/auth/me",
    CHANGE_PASSWORD: "/auth/change-password",
    SESSIONS: "/auth/sessions",
  },
  USER: {
    ME: "/users/me",
    UPDATE: "/users/me",
  },
  UPLOADS: "/uploads",
  OCR: {
    ID_CARD: "/ocr/id-card",
  },
  ADMIN: {
    USERS: "/admin/users",
    ROLES: "/admin/roles",
    ROLE_DELETE: (id: string) => `/admin/roles/${id}`,
    ROLE_MENUS: (id: string) => `/admin/roles/${id}/menus`,
    UPLOADS: "/admin/uploads",
    LOG_LEVEL: "/admin/log/level",
    STATS: "/admin/stats",
    USER_ROLE: (id: string) => `/admin/users/${id}/role`,
    API_KEYS: "/admin/api-keys",
    API_KEY_REVOKE: (id: string) => `/admin/api-keys/${id}/revoke`,
    API_KEY_DELETE: (id: string) => `/admin/api-keys/${id}`,
    PROJECTS: "/admin/projects",
    PROJECT_OPTIONS: "/admin/projects/options",
    PROJECT: (id: string) => `/admin/projects/${id}`,
    PROJECT_UNITS: (projectId: string) => `/admin/projects/${projectId}/units`,
    PROJECT_UNIT: (projectId: string, unitId: string) =>
      `/admin/projects/${projectId}/units/${unitId}`,
    PROJECT_TEAMS: (projectId: string) => `/admin/projects/${projectId}/teams`,
    PROJECT_TEAM: (projectId: string, teamId: string) =>
      `/admin/projects/${projectId}/teams/${teamId}`,
    PROJECT_WORKERS: (projectId: string) => `/admin/projects/${projectId}/workers`,
    PROJECT_WORKER: (projectId: string, workerId: string) =>
      `/admin/projects/${projectId}/workers/${workerId}`,
    PROJECT_ATTENDANCE: (projectId: string) =>
      `/admin/projects/${projectId}/attendance-records`,
    PROJECT_ATTENDANCE_RECORD: (projectId: string, attendanceId: string) =>
      `/admin/projects/${projectId}/attendance-records/${attendanceId}`,
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
    ATTENDANCE_DEVICE_ISSUE_REPORTS: "/admin/attendance-device-issue-reports",
    ATTENDANCE_DEVICE_ISSUE_REPORT: (reportId: string) =>
      `/admin/attendance-device-issue-reports/${reportId}`,
  },
} as const;
