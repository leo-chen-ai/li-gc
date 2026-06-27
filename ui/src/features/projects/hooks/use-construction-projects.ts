import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { constructionProjectService } from "../services/construction-project-service";
import type {
  ConstructionAttendanceDeviceIssueReportPayload,
  ConstructionAttendanceDevicePayload,
  ConstructionAttendancePayload,
  ConstructionContractTemplatePayload,
  ConstructionModuleListFilters,
  ConstructionPlatformConfigPayload,
  ConstructionPlatformLogPayload,
  ConstructionProjectContractTemplatePayload,
  ConstructionProjectListFilters,
  ConstructionProjectPayload,
  ConstructionResourceListFilters,
  ConstructionTeamPayload,
  ConstructionUnitPayload,
  ConstructionWageBatchPayload,
  ConstructionWageImportPayload,
  ConstructionWageListFilters,
  ConstructionWorkHourConfigPayload,
  ConstructionWorkerPayload,
} from "../types/construction-types";

export const constructionProjectKeys = {
  all: ["construction-projects"] as const,
  lists: () => [...constructionProjectKeys.all, "list"] as const,
  listPage: (filters?: ConstructionProjectListFilters) =>
    [...constructionProjectKeys.all, "list-page", filters ?? {}] as const,
  options: (keyword: string) =>
    [...constructionProjectKeys.all, "options", keyword] as const,
  detail: (projectId: string) =>
    [...constructionProjectKeys.all, "detail", projectId] as const,
  unitsRoot: (projectId: string) =>
    [...constructionProjectKeys.detail(projectId), "units"] as const,
  units: (projectId: string, filters?: ConstructionResourceListFilters) =>
    [...constructionProjectKeys.unitsRoot(projectId), filters ?? {}] as const,
  allUnits: (projectId: string) =>
    [...constructionProjectKeys.unitsRoot(projectId), "all"] as const,
  unit: (projectId: string, unitId: string) =>
    [...constructionProjectKeys.unitsRoot(projectId), unitId] as const,
  teamsRoot: (projectId: string) =>
    [...constructionProjectKeys.detail(projectId), "teams"] as const,
  teams: (projectId: string, filters?: ConstructionResourceListFilters) =>
    [...constructionProjectKeys.teamsRoot(projectId), filters ?? {}] as const,
  allTeams: (projectId: string) =>
    [...constructionProjectKeys.teamsRoot(projectId), "all"] as const,
  team: (projectId: string, teamId: string) =>
    [...constructionProjectKeys.teamsRoot(projectId), teamId] as const,
  workersRoot: (projectId: string) =>
    [...constructionProjectKeys.detail(projectId), "workers"] as const,
  workers: (projectId: string, filters?: ConstructionResourceListFilters) =>
    [...constructionProjectKeys.workersRoot(projectId), filters ?? {}] as const,
  allWorkers: (projectId: string) =>
    [...constructionProjectKeys.workersRoot(projectId), "all"] as const,
  worker: (projectId: string, workerId: string) =>
    [...constructionProjectKeys.workersRoot(projectId), workerId] as const,
  attendanceRoot: (projectId: string) =>
    [...constructionProjectKeys.detail(projectId), "attendance"] as const,
  attendance: (projectId: string, filters?: ConstructionResourceListFilters) =>
    [...constructionProjectKeys.attendanceRoot(projectId), filters ?? {}] as const,
  attendanceCalendar: (projectId: string, month: string) =>
    [...constructionProjectKeys.attendanceRoot(projectId), "calendar", month] as const,
  allAttendance: (projectId: string) =>
    [...constructionProjectKeys.attendanceRoot(projectId), "all"] as const,
  attendanceRecord: (projectId: string, attendanceId: string) =>
    [...constructionProjectKeys.attendanceRoot(projectId), attendanceId] as const,
  wageBatches: (projectId: string, filters?: ConstructionWageListFilters) =>
    [...constructionProjectKeys.detail(projectId), "wage-batches", filters ?? {}] as const,
  wageBatch: (projectId: string, batchId: string) =>
    [...constructionProjectKeys.detail(projectId), "wage-batches", batchId] as const,
  attendanceDevicesRoot: (projectId: string) =>
    [...constructionProjectKeys.detail(projectId), "attendance-devices"] as const,
  attendanceDevices: (projectId: string, filters?: ConstructionResourceListFilters) =>
    [...constructionProjectKeys.attendanceDevicesRoot(projectId), filters ?? {}] as const,
  attendanceDevice: (projectId: string, deviceId: string) =>
    [...constructionProjectKeys.attendanceDevicesRoot(projectId), "record", deviceId] as const,
  attendanceDeviceIssueReportsRoot: () =>
    [...constructionProjectKeys.all, "attendance-device-issue-reports"] as const,
  attendanceDeviceIssueReports: (filters?: ConstructionModuleListFilters) =>
    [...constructionProjectKeys.attendanceDeviceIssueReportsRoot(), filters ?? {}] as const,
  attendanceDeviceIssueReport: (reportId: string) =>
    [...constructionProjectKeys.attendanceDeviceIssueReportsRoot(), reportId] as const,
  contractTemplatesRoot: () =>
    [...constructionProjectKeys.all, "contract-templates"] as const,
  contractTemplates: (filters?: ConstructionModuleListFilters) =>
    [...constructionProjectKeys.contractTemplatesRoot(), filters ?? {}] as const,
  projectContractTemplateConfig: (projectId: string) =>
    [...constructionProjectKeys.detail(projectId), "contract-template-config"] as const,
  workHourConfigsRoot: () =>
    [...constructionProjectKeys.all, "work-hour-configs"] as const,
  workHourConfigs: (filters?: ConstructionModuleListFilters) =>
    [...constructionProjectKeys.workHourConfigsRoot(), filters ?? {}] as const,
  platformConfigsRoot: () =>
    [...constructionProjectKeys.all, "platform-configs"] as const,
  platformConfigs: (filters?: ConstructionModuleListFilters) =>
    [...constructionProjectKeys.platformConfigsRoot(), filters ?? {}] as const,
  platformLogsRoot: () =>
    [...constructionProjectKeys.all, "platform-logs"] as const,
  platformLogs: (filters?: ConstructionModuleListFilters) =>
    [...constructionProjectKeys.platformLogsRoot(), filters ?? {}] as const,
  overview: () => [...constructionProjectKeys.all, "overview"] as const,
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

export function useProjectsPageQuery(filters?: ConstructionProjectListFilters) {
  return useQuery({
    queryKey: constructionProjectKeys.listPage(filters),
    queryFn: () => constructionProjectService.listProjectPage(filters),
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
      queryClient.invalidateQueries({ queryKey: constructionProjectKeys.all });
    },
  });
}

export function useUpdateProjectMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionProjectPayload) =>
      constructionProjectService.updateProject(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: constructionProjectKeys.all });
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
      queryClient.invalidateQueries({ queryKey: constructionProjectKeys.all });
    },
  });
}

export function useProjectUnitsQuery(
  projectId: string,
  filters?: ConstructionResourceListFilters
) {
  return useQuery({
    queryKey: constructionProjectKeys.units(projectId, filters),
    queryFn: () => constructionProjectService.listUnits(projectId, filters),
    enabled: canQueryProject(projectId),
  });
}

export function useProjectAllUnitsQuery(projectId: string) {
  return useQuery({
    queryKey: constructionProjectKeys.allUnits(projectId),
    queryFn: () => constructionProjectService.listAllUnits(projectId),
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
        queryKey: constructionProjectKeys.unitsRoot(projectId),
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
        queryKey: constructionProjectKeys.unitsRoot(projectId),
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
        queryKey: constructionProjectKeys.unitsRoot(projectId),
      });
    },
  });
}

export function useProjectTeamsQuery(
  projectId: string,
  filters?: ConstructionResourceListFilters
) {
  return useQuery({
    queryKey: constructionProjectKeys.teams(projectId, filters),
    queryFn: () => constructionProjectService.listTeams(projectId, filters),
    enabled: canQueryProject(projectId),
  });
}

export function useProjectAllTeamsQuery(projectId: string) {
  return useQuery({
    queryKey: constructionProjectKeys.allTeams(projectId),
    queryFn: () => constructionProjectService.listAllTeams(projectId),
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
        queryKey: constructionProjectKeys.teamsRoot(projectId),
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
        queryKey: constructionProjectKeys.teamsRoot(projectId),
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
        queryKey: constructionProjectKeys.teamsRoot(projectId),
      });
    },
  });
}

export function useProjectWorkersQuery(
  projectId: string,
  filters?: ConstructionResourceListFilters
) {
  return useQuery({
    queryKey: constructionProjectKeys.workers(projectId, filters),
    queryFn: () => constructionProjectService.listWorkers(projectId, filters),
    enabled: canQueryProject(projectId),
  });
}

export function useProjectAllWorkersQuery(projectId: string) {
  return useQuery({
    queryKey: constructionProjectKeys.allWorkers(projectId),
    queryFn: () => constructionProjectService.listAllWorkers(projectId),
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
        queryKey: constructionProjectKeys.workersRoot(projectId),
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
        queryKey: constructionProjectKeys.workersRoot(projectId),
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
        queryKey: constructionProjectKeys.workersRoot(projectId),
      });
    },
  });
}

export function useProjectAttendanceQuery(
  projectId: string,
  filters?: ConstructionResourceListFilters
) {
  return useQuery({
    queryKey: constructionProjectKeys.attendance(projectId, filters),
    queryFn: () => constructionProjectService.listAttendance(projectId, filters),
    enabled: canQueryProject(projectId),
  });
}

export function useProjectAttendanceCalendarQuery(projectId: string, month: string) {
  return useQuery({
    queryKey: constructionProjectKeys.attendanceCalendar(projectId, month),
    queryFn: () =>
      constructionProjectService.getAttendanceCalendar(projectId, {
        view: "calendar",
        month,
      }),
    enabled: canQueryProject(projectId),
  });
}

export function useProjectAllAttendanceQuery(projectId: string) {
  return useQuery({
    queryKey: constructionProjectKeys.allAttendance(projectId),
    queryFn: () => constructionProjectService.listAllAttendance(projectId),
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
        queryKey: constructionProjectKeys.attendanceRoot(projectId),
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
        queryKey: constructionProjectKeys.attendanceRoot(projectId),
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
        queryKey: constructionProjectKeys.attendanceRoot(projectId),
      });
    },
  });
}

export function useProjectWageBatchesQuery(
  projectId: string,
  filters?: ConstructionWageListFilters
) {
  return useQuery({
    queryKey: constructionProjectKeys.wageBatches(projectId, filters),
    queryFn: () => constructionProjectService.listWageBatches(projectId, filters),
    enabled: canQueryProject(projectId),
  });
}

export function useCreateWageBatchMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionWageBatchPayload) =>
      constructionProjectService.createWageBatch(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.detail(projectId),
      });
    },
  });
}

export function useUpdateWageBatchMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      batchId,
      payload,
    }: {
      batchId: string;
      payload: ConstructionWageBatchPayload;
    }) =>
      constructionProjectService.updateWageBatch(projectId, batchId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.detail(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.wageBatch(projectId, variables.batchId),
      });
    },
  });
}

export function useDeleteWageBatchMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (batchId: string) =>
      constructionProjectService.deleteWageBatch(projectId, batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.detail(projectId),
      });
    },
  });
}

export function useImportWageBatchMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionWageImportPayload) =>
      constructionProjectService.importWageBatch(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.detail(projectId),
      });
    },
  });
}

export function useProjectAttendanceDevicesQuery(projectId: string, filters?: ConstructionResourceListFilters) {
  return useQuery({
    queryKey: constructionProjectKeys.attendanceDevices(projectId, filters),
    queryFn: () => constructionProjectService.listAttendanceDevices(projectId, filters),
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
        queryKey: constructionProjectKeys.attendanceDevicesRoot(projectId),
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
        queryKey: constructionProjectKeys.attendanceDevicesRoot(projectId),
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
        queryKey: constructionProjectKeys.attendanceDevicesRoot(projectId),
      });
    },
  });
}

export function useAttendanceDeviceIssueReportsQuery(filters?: ConstructionModuleListFilters) {
  return useQuery({
    queryKey: constructionProjectKeys.attendanceDeviceIssueReports(filters),
    queryFn: () => constructionProjectService.listAttendanceDeviceIssueReports(filters),
  });
}

export function useAttendanceDeviceIssueReportQuery(reportId: string) {
  return useQuery({
    queryKey: constructionProjectKeys.attendanceDeviceIssueReport(reportId),
    queryFn: () => constructionProjectService.getAttendanceDeviceIssueReport(reportId),
    enabled: canQueryProject(reportId),
  });
}

export function useCreateAttendanceDeviceIssueReportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionAttendanceDeviceIssueReportPayload) =>
      constructionProjectService.createAttendanceDeviceIssueReport(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendanceDeviceIssueReportsRoot(),
      });
    },
  });
}

export function useUpdateAttendanceDeviceIssueReportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      reportId,
      payload,
    }: {
      reportId: string;
      payload: ConstructionAttendanceDeviceIssueReportPayload;
    }) =>
      constructionProjectService.updateAttendanceDeviceIssueReport(reportId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendanceDeviceIssueReportsRoot(),
      });
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendanceDeviceIssueReport(variables.reportId),
      });
    },
  });
}

export function useDeleteAttendanceDeviceIssueReportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: constructionProjectService.deleteAttendanceDeviceIssueReport,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendanceDeviceIssueReportsRoot(),
      });
    },
  });
}

export function useConstructionOverviewQuery() {
  return useQuery({
    queryKey: constructionProjectKeys.overview(),
    queryFn: constructionProjectService.getConstructionOverview,
  });
}

export function useContractTemplatesQuery(filters?: ConstructionModuleListFilters) {
  return useQuery({
    queryKey: constructionProjectKeys.contractTemplates(filters),
    queryFn: () => constructionProjectService.listContractTemplates(filters),
  });
}

export function useCreateContractTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionContractTemplatePayload) =>
      constructionProjectService.createContractTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.contractTemplatesRoot(),
      });
    },
  });
}

export function useUpdateContractTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      templateId,
      payload,
    }: {
      templateId: string;
      payload: ConstructionContractTemplatePayload;
    }) => constructionProjectService.updateContractTemplate(templateId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.contractTemplatesRoot(),
      });
    },
  });
}

export function useDeleteContractTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: constructionProjectService.deleteContractTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.contractTemplatesRoot(),
      });
    },
  });
}

export function useProjectContractTemplateConfigQuery(projectId: string) {
  return useQuery({
    queryKey: constructionProjectKeys.projectContractTemplateConfig(projectId),
    queryFn: () => constructionProjectService.getProjectContractTemplateConfig(projectId),
    enabled: canQueryProject(projectId),
  });
}

export function useUpsertProjectContractTemplateConfigMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionProjectContractTemplatePayload) =>
      constructionProjectService.upsertProjectContractTemplateConfig(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.projectContractTemplateConfig(projectId),
      });
    },
  });
}

export function useWorkHourConfigsQuery(filters?: ConstructionModuleListFilters) {
  return useQuery({
    queryKey: constructionProjectKeys.workHourConfigs(filters),
    queryFn: () => constructionProjectService.listWorkHourConfigs(filters),
  });
}

export function useCreateWorkHourConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionWorkHourConfigPayload) =>
      constructionProjectService.createWorkHourConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.workHourConfigsRoot(),
      });
    },
  });
}

export function useUpdateWorkHourConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      configId,
      payload,
    }: {
      configId: string;
      payload: ConstructionWorkHourConfigPayload;
    }) => constructionProjectService.updateWorkHourConfig(configId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.workHourConfigsRoot(),
      });
    },
  });
}

export function useDeleteWorkHourConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: constructionProjectService.deleteWorkHourConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.workHourConfigsRoot(),
      });
    },
  });
}

export function usePlatformConfigsQuery(filters?: ConstructionModuleListFilters) {
  return useQuery({
    queryKey: constructionProjectKeys.platformConfigs(filters),
    queryFn: () => constructionProjectService.listPlatformConfigs(filters),
  });
}

export function useCreatePlatformConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionPlatformConfigPayload) =>
      constructionProjectService.createPlatformConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.platformConfigsRoot(),
      });
    },
  });
}

export function useUpdatePlatformConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      configId,
      payload,
    }: {
      configId: string;
      payload: ConstructionPlatformConfigPayload;
    }) => constructionProjectService.updatePlatformConfig(configId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.platformConfigsRoot(),
      });
    },
  });
}

export function useDeletePlatformConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: constructionProjectService.deletePlatformConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.platformConfigsRoot(),
      });
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.platformLogsRoot(),
      });
    },
  });
}

export function usePlatformLogsQuery(filters?: ConstructionModuleListFilters) {
  return useQuery({
    queryKey: constructionProjectKeys.platformLogs(filters),
    queryFn: () => constructionProjectService.listPlatformLogs(filters),
  });
}

export function useCreatePlatformLogMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConstructionPlatformLogPayload) =>
      constructionProjectService.createPlatformLog(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.platformLogsRoot(),
      });
    },
  });
}

export function useUpdatePlatformLogMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      logId,
      payload,
    }: {
      logId: string;
      payload: ConstructionPlatformLogPayload;
    }) => constructionProjectService.updatePlatformLog(logId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.platformLogsRoot(),
      });
    },
  });
}

export function useDeletePlatformLogMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: constructionProjectService.deletePlatformLog,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.platformLogsRoot(),
      });
    },
  });
}
