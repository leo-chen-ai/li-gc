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
    PROJECT_ATTENDANCE_DEVICES: (projectId: string) =>
      `/admin/projects/${projectId}/attendance-devices`,
    PROJECT_ATTENDANCE_DEVICE: (projectId: string, deviceId: string) =>
      `/admin/projects/${projectId}/attendance-devices/${deviceId}`,
  },
} as const;
