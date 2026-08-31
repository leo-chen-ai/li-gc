import { apiClient, API_ENDPOINTS } from "@/lib/api";

function unwrapData<T>(res: { data: { data: T } }): T {
  return res.data.data;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type DashboardOverview = {
  projectTotal: number;
  statusPreparation: number;
  statusInProgress: number;
  statusCompleted: number;
  statusFinished: number;
  statusStopped: number;
  statusApproved: number;
  totalRegistered: number;
  totalActive: number;
  totalManagement: number;
  totalPartyMember: number;
  todayAttendance: number;
  deviceCount: number;
};

export type MapProject = {
  id: string;
  name: string;
  longitude: string | null;
  latitude: string | null;
  mapPoiName: string | null;
  mapAddress: string | null;
  status: number | null;
  generalContractor: string | null;
  projectManager: string | null;
  projectManagerPhone: string | null;
};

export type SmartSiteModule = { key: string; name: string; count: number };
export type SmartSiteData = { deviceCount: number; modules: SmartSiteModule[] };

export type Alert30d = {
  pending: number;
  resolved: number;
  noRisk: number;
  lowRisk: number;
  mediumRisk: number;
  highRisk: number;
};

export type AlertTodayItem = { label: string; count: number; color: string };
export type AlertToday = { items: AlertTodayItem[] };

export type Attendance30dPoint = { date: string; count: number };

export type BoardProjectInfo = {
  id: string;
  name: string;
  status: number | null;
  contractor: string | null;
  projectManager: string | null;
  projectManagerPhone: string | null;
  startDate: string | null;
  endDate: string | null;
  area: string | null;
  investmentAmount: string | null;
  totalWorkers: number;
  activeWorkers: number;
};

export type BoardTeamAttendance = {
  teamName: string;
  attendanceCount: number;
  onSiteCount: number;
  totalCount: number;
  attendanceRate: number;
};

export type BoardWorkerTypeCount = {
  workerType: number;
  workerTypeName: string;
  count: number;
};

export type ProjectBoard = {
  project: BoardProjectInfo;
  teamAttendance: BoardTeamAttendance[];
  workerTypeDistribution: BoardWorkerTypeCount[];
  dailyAvgAttendance: number;
  todayAttendanceCount: number;
};

export type AttendanceFeedItem = {
  id: string;
  workerName: string;
  workerPhotoUrl: string | null;
  triggerTime: string;
  equipmentName: string | null;
  direction: number;
};

export type TodayHourlyPoint = { hour: number; count: number };

// ── API calls ──────────────────────────────────────────────────────────────

export const dashboardService = {
  async getOverview(): Promise<DashboardOverview> {
    const res = await apiClient.get(API_ENDPOINTS.DASHBOARD.OVERVIEW);
    return unwrapData(res);
  },

  async getProjectsMap(): Promise<MapProject[]> {
    const res = await apiClient.get(API_ENDPOINTS.DASHBOARD.PROJECTS_MAP);
    return unwrapData(res);
  },

  async getSmartSite(): Promise<SmartSiteData> {
    const res = await apiClient.get(API_ENDPOINTS.DASHBOARD.SMART_SITE);
    return unwrapData(res);
  },

  async getAlerts30d(): Promise<Alert30d> {
    const res = await apiClient.get(API_ENDPOINTS.DASHBOARD.ALERTS_30D);
    return unwrapData(res);
  },

  async getAlertsToday(): Promise<AlertToday> {
    const res = await apiClient.get(API_ENDPOINTS.DASHBOARD.ALERTS_TODAY);
    return unwrapData(res);
  },

  async getAttendance30d(): Promise<Attendance30dPoint[]> {
    const res = await apiClient.get(API_ENDPOINTS.DASHBOARD.ATTENDANCE_30D);
    return unwrapData(res);
  },

  async getProjectBoard(projectId: string): Promise<ProjectBoard> {
    const res = await apiClient.get(API_ENDPOINTS.DASHBOARD.PROJECT_BOARD(projectId));
    return unwrapData(res);
  },

  async getAttendanceFeed(projectId: string, limit = 50): Promise<AttendanceFeedItem[]> {
    const res = await apiClient.get(
      API_ENDPOINTS.DASHBOARD.PROJECT_ATTENDANCE_FEED(projectId),
      { params: { limit } },
    );
    return unwrapData(res);
  },

  async getProjectAttendance30d(projectId: string): Promise<Attendance30dPoint[]> {
    const res = await apiClient.get(
      API_ENDPOINTS.DASHBOARD.PROJECT_ATTENDANCE_30D(projectId),
    );
    return unwrapData(res);
  },

  async getTodayHourly(projectId: string): Promise<TodayHourlyPoint[]> {
    const res = await apiClient.get(
      API_ENDPOINTS.DASHBOARD.PROJECT_ATTENDANCE_TODAY_HOURLY(projectId),
    );
    return unwrapData(res);
  },
};
