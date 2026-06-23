import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { constructionProjectService } from "../services/construction-project-service";
import type {
  ConstructionAttendanceDevicePayload,
  ConstructionAttendancePayload,
  ConstructionProjectPayload,
  ConstructionTeamPayload,
  ConstructionUnitPayload,
  ConstructionWorkerPayload,
} from "../types/construction-types";

export const constructionProjectKeys = {
  all: ["construction-projects"] as const,
  lists: () => [...constructionProjectKeys.all, "list"] as const,
  options: (keyword: string) =>
    [...constructionProjectKeys.all, "options", keyword] as const,
  detail: (projectId: string) =>
    [...constructionProjectKeys.all, "detail", projectId] as const,
  units: (projectId: string) =>
    [...constructionProjectKeys.detail(projectId), "units"] as const,
  unit: (projectId: string, unitId: string) =>
    [...constructionProjectKeys.units(projectId), unitId] as const,
  teams: (projectId: string) =>
    [...constructionProjectKeys.detail(projectId), "teams"] as const,
  team: (projectId: string, teamId: string) =>
    [...constructionProjectKeys.teams(projectId), teamId] as const,
  workers: (projectId: string) =>
    [...constructionProjectKeys.detail(projectId), "workers"] as const,
  worker: (projectId: string, workerId: string) =>
    [...constructionProjectKeys.workers(projectId), workerId] as const,
  attendance: (projectId: string) =>
    [...constructionProjectKeys.detail(projectId), "attendance"] as const,
  attendanceRecord: (projectId: string, attendanceId: string) =>
    [...constructionProjectKeys.attendance(projectId), attendanceId] as const,
  attendanceDevices: (projectId: string) =>
    [...constructionProjectKeys.detail(projectId), "attendance-devices"] as const,
  attendanceDevice: (projectId: string, deviceId: string) =>
    [...constructionProjectKeys.attendanceDevices(projectId), deviceId] as const,
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canQueryProject(projectId: string) {
  return UUID_PATTERN.test(projectId);
}

export function useProjectsQuery() {
  return useQuery({
    queryKey: constructionProjectKeys.lists(),
    queryFn: constructionProjectService.listProjects,
  });
}

export function useProjectOptionsQuery(keyword = "") {
  const normalizedKeyword = keyword.trim();

  return useQuery({
    queryKey: constructionProjectKeys.options(normalizedKeyword),
    queryFn: () =>
      constructionProjectService.listProjectOptions({
        q: normalizedKeyword || undefined,
        limit: 30,
      }),
    staleTime: 30_000,
  });
}

export function useProjectQuery(projectId: string) {
  return useQuery({
    queryKey: constructionProjectKeys.detail(projectId),
    queryFn: () => constructionProjectService.getProject(projectId),
    enabled: canQueryProject(projectId),
  });
}

export function useCreateProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionProjectPayload) =>
      constructionProjectService.createProject(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: constructionProjectKeys.lists() });
    },
  });
}

export function useUpdateProjectMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionProjectPayload) =>
      constructionProjectService.updateProject(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: constructionProjectKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.detail(projectId),
      });
    },
  });
}

export function useDeleteProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) =>
      constructionProjectService.deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: constructionProjectKeys.lists() });
    },
  });
}

export function useProjectUnitsQuery(projectId: string) {
  return useQuery({
    queryKey: constructionProjectKeys.units(projectId),
    queryFn: () => constructionProjectService.listUnits(projectId),
    enabled: canQueryProject(projectId),
  });
}

export function useCreateUnitMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionUnitPayload) =>
      constructionProjectService.createUnit(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.units(projectId),
      });
    },
  });
}

export function useUpdateUnitMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      unitId,
      payload,
    }: {
      unitId: string;
      payload: ConstructionUnitPayload;
    }) =>
      constructionProjectService.updateUnit(projectId, unitId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.units(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.unit(projectId, variables.unitId),
      });
    },
  });
}

export function useDeleteUnitMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (unitId: string) =>
      constructionProjectService.deleteUnit(projectId, unitId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.units(projectId),
      });
    },
  });
}

export function useProjectTeamsQuery(projectId: string) {
  return useQuery({
    queryKey: constructionProjectKeys.teams(projectId),
    queryFn: () => constructionProjectService.listTeams(projectId),
    enabled: canQueryProject(projectId),
  });
}

export function useCreateTeamMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionTeamPayload) =>
      constructionProjectService.createTeam(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.teams(projectId),
      });
    },
  });
}

export function useUpdateTeamMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      teamId,
      payload,
    }: {
      teamId: string;
      payload: ConstructionTeamPayload;
    }) =>
      constructionProjectService.updateTeam(projectId, teamId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.teams(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.team(projectId, variables.teamId),
      });
    },
  });
}

export function useDeleteTeamMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (teamId: string) =>
      constructionProjectService.deleteTeam(projectId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.teams(projectId),
      });
    },
  });
}

export function useProjectWorkersQuery(projectId: string) {
  return useQuery({
    queryKey: constructionProjectKeys.workers(projectId),
    queryFn: () => constructionProjectService.listWorkers(projectId),
    enabled: canQueryProject(projectId),
  });
}

export function useCreateWorkerMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionWorkerPayload) =>
      constructionProjectService.createWorker(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.workers(projectId),
      });
    },
  });
}

export function useUpdateWorkerMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workerId,
      payload,
    }: {
      workerId: string;
      payload: ConstructionWorkerPayload;
    }) =>
      constructionProjectService.updateWorker(projectId, workerId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.workers(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.worker(projectId, variables.workerId),
      });
    },
  });
}

export function useDeleteWorkerMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workerId: string) =>
      constructionProjectService.deleteWorker(projectId, workerId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.workers(projectId),
      });
    },
  });
}

export function useProjectAttendanceQuery(projectId: string) {
  return useQuery({
    queryKey: constructionProjectKeys.attendance(projectId),
    queryFn: () => constructionProjectService.listAttendance(projectId),
    enabled: canQueryProject(projectId),
  });
}

export function useCreateAttendanceMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionAttendancePayload) =>
      constructionProjectService.createAttendance(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendance(projectId),
      });
    },
  });
}

export function useUpdateAttendanceMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      attendanceId,
      payload,
    }: {
      attendanceId: string;
      payload: ConstructionAttendancePayload;
    }) =>
      constructionProjectService.updateAttendance(projectId, attendanceId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendance(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendanceRecord(
          projectId,
          variables.attendanceId
        ),
      });
    },
  });
}

export function useDeleteAttendanceMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (attendanceId: string) =>
      constructionProjectService.deleteAttendance(projectId, attendanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendance(projectId),
      });
    },
  });
}

export function useProjectAttendanceDevicesQuery(projectId: string) {
  return useQuery({
    queryKey: constructionProjectKeys.attendanceDevices(projectId),
    queryFn: () => constructionProjectService.listAttendanceDevices(projectId),
    enabled: canQueryProject(projectId),
  });
}

export function useCreateAttendanceDeviceMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionAttendanceDevicePayload) =>
      constructionProjectService.createAttendanceDevice(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendanceDevices(projectId),
      });
    },
  });
}

export function useUpdateAttendanceDeviceMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      deviceId,
      payload,
    }: {
      deviceId: string;
      payload: ConstructionAttendanceDevicePayload;
    }) =>
      constructionProjectService.updateAttendanceDevice(projectId, deviceId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendanceDevices(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendanceDevice(projectId, variables.deviceId),
      });
    },
  });
}

export function useDeleteAttendanceDeviceMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (deviceId: string) =>
      constructionProjectService.deleteAttendanceDevice(projectId, deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendanceDevices(projectId),
      });
    },
  });
}
