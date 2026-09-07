import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "../api/dashboard-api";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  overview: () => [...dashboardKeys.all, "overview"] as const,
  projectsMap: () => [...dashboardKeys.all, "projectsMap"] as const,
  smartSite: () => [...dashboardKeys.all, "smartSite"] as const,
  alerts30d: () => [...dashboardKeys.all, "alerts30d"] as const,
  alertsToday: () => [...dashboardKeys.all, "alertsToday"] as const,
  attendance30d: () => [...dashboardKeys.all, "attendance30d"] as const,
  projectBoard: (id: string) => [...dashboardKeys.all, "board", id] as const,
  attendanceFeed: (id: string) => [...dashboardKeys.all, "feed", id] as const,
  projectAttendance30d: (id: string) => [...dashboardKeys.all, "projectAttendance30d", id] as const,
  todayHourly: (id: string) => [...dashboardKeys.all, "todayHourly", id] as const,
};

// 大屏通用：约 1 分钟轮询
const DASHBOARD_REFETCH_MS = 60_000;
const DASHBOARD_STALE_MS = 30_000;
// 今日出勤流水更频繁
const FEED_REFETCH_MS = 30_000;
const FEED_STALE_MS = 15_000;

export function useDashboardOverview() {
  return useQuery({
    queryKey: dashboardKeys.overview(),
    queryFn: () => dashboardService.getOverview(),
    refetchInterval: DASHBOARD_REFETCH_MS,
    staleTime: DASHBOARD_STALE_MS,
    structuralSharing: true,
  });
}

export function useDashboardProjectsMap() {
  return useQuery({
    queryKey: dashboardKeys.projectsMap(),
    queryFn: () => dashboardService.getProjectsMap(),
    refetchInterval: DASHBOARD_REFETCH_MS,
    staleTime: DASHBOARD_STALE_MS,
    structuralSharing: true,
  });
}

export function useDashboardSmartSite() {
  return useQuery({
    queryKey: dashboardKeys.smartSite(),
    queryFn: () => dashboardService.getSmartSite(),
    refetchInterval: DASHBOARD_REFETCH_MS,
    staleTime: DASHBOARD_STALE_MS,
    structuralSharing: true,
  });
}

export function useDashboardAlerts30d() {
  return useQuery({
    queryKey: dashboardKeys.alerts30d(),
    queryFn: () => dashboardService.getAlerts30d(),
    refetchInterval: DASHBOARD_REFETCH_MS,
    staleTime: DASHBOARD_STALE_MS,
    structuralSharing: true,
  });
}

export function useDashboardAlertsToday() {
  return useQuery({
    queryKey: dashboardKeys.alertsToday(),
    queryFn: () => dashboardService.getAlertsToday(),
    refetchInterval: DASHBOARD_REFETCH_MS,
    staleTime: DASHBOARD_STALE_MS,
    structuralSharing: true,
  });
}

export function useDashboardAttendance30d() {
  return useQuery({
    queryKey: dashboardKeys.attendance30d(),
    queryFn: () => dashboardService.getAttendance30d(),
    refetchInterval: DASHBOARD_REFETCH_MS,
    staleTime: DASHBOARD_STALE_MS,
    structuralSharing: true,
  });
}

export function useProjectBoard(projectId: string) {
  return useQuery({
    queryKey: dashboardKeys.projectBoard(projectId),
    queryFn: () => dashboardService.getProjectBoard(projectId),
    refetchInterval: DASHBOARD_REFETCH_MS,
    staleTime: DASHBOARD_STALE_MS,
    structuralSharing: true,
    enabled: !!projectId,
  });
}

/** 今日出勤流水：30s 轮询；列表侧做增量合并，避免整表闪烁 */
export function useAttendanceFeed(projectId: string) {
  return useQuery({
    queryKey: dashboardKeys.attendanceFeed(projectId),
    queryFn: () => dashboardService.getAttendanceFeed(projectId, 100),
    refetchInterval: FEED_REFETCH_MS,
    staleTime: FEED_STALE_MS,
    structuralSharing: true,
    enabled: !!projectId,
  });
}

export function useProjectAttendance30d(projectId: string) {
  return useQuery({
    queryKey: dashboardKeys.projectAttendance30d(projectId),
    queryFn: () => dashboardService.getProjectAttendance30d(projectId),
    refetchInterval: DASHBOARD_REFETCH_MS,
    staleTime: DASHBOARD_STALE_MS,
    structuralSharing: true,
    enabled: !!projectId,
  });
}

export function useTodayHourly(projectId: string) {
  return useQuery({
    queryKey: dashboardKeys.todayHourly(projectId),
    queryFn: () => dashboardService.getTodayHourly(projectId),
    refetchInterval: DASHBOARD_REFETCH_MS,
    staleTime: DASHBOARD_STALE_MS,
    structuralSharing: true,
    enabled: !!projectId,
  });
}
