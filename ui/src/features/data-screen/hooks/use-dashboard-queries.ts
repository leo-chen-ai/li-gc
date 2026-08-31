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

// 1 minute polling for overview data
export function useDashboardOverview() {
  return useQuery({
    queryKey: dashboardKeys.overview(),
    queryFn: () => dashboardService.getOverview(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    structuralSharing: true,
  });
}

export function useDashboardProjectsMap() {
  return useQuery({
    queryKey: dashboardKeys.projectsMap(),
    queryFn: () => dashboardService.getProjectsMap(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    structuralSharing: true,
  });
}

export function useDashboardSmartSite() {
  return useQuery({
    queryKey: dashboardKeys.smartSite(),
    queryFn: () => dashboardService.getSmartSite(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    structuralSharing: true,
  });
}

export function useDashboardAlerts30d() {
  return useQuery({
    queryKey: dashboardKeys.alerts30d(),
    queryFn: () => dashboardService.getAlerts30d(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    structuralSharing: true,
  });
}

export function useDashboardAlertsToday() {
  return useQuery({
    queryKey: dashboardKeys.alertsToday(),
    queryFn: () => dashboardService.getAlertsToday(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    structuralSharing: true,
  });
}

export function useDashboardAttendance30d() {
  return useQuery({
    queryKey: dashboardKeys.attendance30d(),
    queryFn: () => dashboardService.getAttendance30d(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    structuralSharing: true,
  });
}

export function useProjectBoard(projectId: string) {
  return useQuery({
    queryKey: dashboardKeys.projectBoard(projectId),
    queryFn: () => dashboardService.getProjectBoard(projectId),
    refetchInterval: 60_000,
    staleTime: 30_000,
    structuralSharing: true,
    enabled: !!projectId,
  });
}

// 5 second polling for attendance feed
export function useAttendanceFeed(projectId: string) {
  return useQuery({
    queryKey: dashboardKeys.attendanceFeed(projectId),
    queryFn: () => dashboardService.getAttendanceFeed(projectId, 100),
    refetchInterval: 5_000,
    staleTime: 3_000,
    structuralSharing: true,
    enabled: !!projectId,
  });
}

export function useProjectAttendance30d(projectId: string) {
  return useQuery({
    queryKey: dashboardKeys.projectAttendance30d(projectId),
    queryFn: () => dashboardService.getProjectAttendance30d(projectId),
    refetchInterval: 60_000,
    staleTime: 30_000,
    structuralSharing: true,
    enabled: !!projectId,
  });
}

export function useTodayHourly(projectId: string) {
  return useQuery({
    queryKey: dashboardKeys.todayHourly(projectId),
    queryFn: () => dashboardService.getTodayHourly(projectId),
    refetchInterval: 60_000,
    staleTime: 30_000,
    structuralSharing: true,
    enabled: !!projectId,
  });
}
