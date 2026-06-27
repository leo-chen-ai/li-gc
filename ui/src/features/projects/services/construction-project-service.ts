import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";
import type {
  ConstructionAttendanceDevice,
  ConstructionAttendanceDeviceIssueReport,
  ConstructionAttendanceDeviceIssueReportPayload,
  ConstructionAttendanceDevicePayload,
  ConstructionAttendanceCalendarResponse,
  ConstructionAttendancePayload,
  ConstructionAttendanceRecord,
  ConstructionContractTemplate,
  ConstructionContractTemplatePayload,
  ConstructionModuleListFilters,
  ConstructionOverview,
  ConstructionPlatformConfig,
  ConstructionPlatformConfigPayload,
  ConstructionPlatformLog,
  ConstructionPlatformLogListResponse,
  ConstructionPlatformLogPayload,
  IdCardOcrResult,
  IdCardOcrSide,
  ConstructionProjectContractTemplateConfig,
  ConstructionProjectContractTemplatePayload,
  ConstructionProject,
  ConstructionProjectListFilters,
  ConstructionProjectOption,
  ConstructionProjectPayload,
  ConstructionResourceListFilters,
  ConstructionResourceListResponse,
  ConstructionTeam,
  ConstructionTeamPayload,
  ConstructionUnit,
  ConstructionUnitPayload,
  ConstructionWageBatch,
  ConstructionWageBatchPayload,
  ConstructionWageImportPayload,
  ConstructionWageListFilters,
  ConstructionWageListResponse,
  ConstructionWorkHourConfig,
  ConstructionWorkHourConfigPayload,
  UploadFileRecord,
  ConstructionWorker,
  ConstructionWorkerPayload,
} from "../types/construction-types";

function unwrapData<T>(response: ApiResponse<T>, fallbackMessage: string): T {
  if (response.data == null) {
    throw new Error(fallbackMessage);
  }

  return response.data;
}

async function collectAllPages<T>(
  loadPage: (filters: ConstructionResourceListFilters) => Promise<ConstructionResourceListResponse<T>>
) {
  const pageSize = 100;
  const firstPage = await loadPage({ page: 1, page_size: pageSize });
  const items = [...firstPage.items];
  const total = firstPage.total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await loadPage({ page, page_size: pageSize });
    items.push(...nextPage.items);
  }

  return items;
}

export const constructionProjectService = {
  recognizeIdCard: async (payload: {
    side: IdCardOcrSide;
    imageUrl?: string;
    imageBase64?: string;
  }): Promise<IdCardOcrResult> => {
    const response = await apiClient.post<ApiResponse<IdCardOcrResult>>(
      API_ENDPOINTS.OCR.ID_CARD,
      {
        side: payload.side,
        image_url: payload.imageUrl,
        image_base64: payload.imageBase64,
      }
    );

    return unwrapData(response.data, "身份证识别失败");
  },

  uploadFile: async (
    file: File,
    context: { bizType?: string; bizId?: string; fieldKey?: string }
  ): Promise<UploadFileRecord> => {
    const formData = new FormData();
    formData.append("file", file);
    if (context.bizType) formData.append("biz_type", context.bizType);
    if (context.bizId) formData.append("biz_id", context.bizId);
    if (context.fieldKey) formData.append("field_key", context.fieldKey);

    const response = await apiClient.post<ApiResponse<UploadFileRecord>>(
      API_ENDPOINTS.UPLOADS,
      formData,
      { headers: { "Content-Type": undefined } }
    );

    return unwrapData(response.data, "上传文件失败");
  },

  listProjects: async (): Promise<ConstructionProject[]> => {
    const response = await apiClient.get<ApiResponse<ConstructionProject[]>>(
      API_ENDPOINTS.ADMIN.PROJECTS
    );

    return unwrapData(response.data, "获取项目列表失败");
  },

  listProjectPage: async (
    filters?: ConstructionProjectListFilters
  ): Promise<ConstructionResourceListResponse<ConstructionProject>> => {
    const response = await apiClient.get<ApiResponse<ConstructionResourceListResponse<ConstructionProject>>>(
      API_ENDPOINTS.ADMIN.PROJECTS,
      { params: filters }
    );

    return unwrapData(response.data, "获取项目列表失败");
  },

  listProjectOptions: async (params?: {
    q?: string;
    limit?: number;
  }): Promise<ConstructionProjectOption[]> => {
    const response = await apiClient.get<ApiResponse<ConstructionProjectOption[]>>(
      API_ENDPOINTS.ADMIN.PROJECT_OPTIONS,
      { params }
    );

    return unwrapData(response.data, "获取项目选项失败");
  },

  getProject: async (projectId: string): Promise<ConstructionProject> => {
    const response = await apiClient.get<ApiResponse<ConstructionProject>>(
      API_ENDPOINTS.ADMIN.PROJECT(projectId)
    );

    return unwrapData(response.data, "获取项目详情失败");
  },

  createProject: async (
    payload: ConstructionProjectPayload
  ): Promise<ConstructionProject> => {
    const response = await apiClient.post<ApiResponse<ConstructionProject>>(
      API_ENDPOINTS.ADMIN.PROJECTS,
      payload
    );

    return unwrapData(response.data, "新增项目失败");
  },

  updateProject: async (
    projectId: string,
    payload: ConstructionProjectPayload
  ): Promise<ConstructionProject> => {
    const response = await apiClient.patch<ApiResponse<ConstructionProject>>(
      API_ENDPOINTS.ADMIN.PROJECT(projectId),
      payload
    );

    return unwrapData(response.data, "修改项目失败");
  },

  deleteProject: async (projectId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(API_ENDPOINTS.ADMIN.PROJECT(projectId));
  },

  listUnits: async (
    projectId: string,
    filters?: ConstructionResourceListFilters
  ): Promise<ConstructionResourceListResponse<ConstructionUnit>> => {
    const response = await apiClient.get<ApiResponse<ConstructionResourceListResponse<ConstructionUnit>>>(
      API_ENDPOINTS.ADMIN.PROJECT_UNITS(projectId),
      { params: filters }
    );

    return unwrapData(response.data, "获取参建单位失败");
  },

  listAllUnits: async (projectId: string): Promise<ConstructionUnit[]> =>
    collectAllPages((filters) =>
      constructionProjectService.listUnits(projectId, filters)
    ),

  getUnit: async (projectId: string, unitId: string): Promise<ConstructionUnit> => {
    const response = await apiClient.get<ApiResponse<ConstructionUnit>>(
      API_ENDPOINTS.ADMIN.PROJECT_UNIT(projectId, unitId)
    );

    return unwrapData(response.data, "获取参建单位详情失败");
  },

  createUnit: async (
    projectId: string,
    payload: ConstructionUnitPayload
  ): Promise<ConstructionUnit> => {
    const response = await apiClient.post<ApiResponse<ConstructionUnit>>(
      API_ENDPOINTS.ADMIN.PROJECT_UNITS(projectId),
      payload
    );

    return unwrapData(response.data, "新增参建单位失败");
  },

  updateUnit: async (
    projectId: string,
    unitId: string,
    payload: ConstructionUnitPayload
  ): Promise<ConstructionUnit> => {
    const response = await apiClient.patch<ApiResponse<ConstructionUnit>>(
      API_ENDPOINTS.ADMIN.PROJECT_UNIT(projectId, unitId),
      payload
    );

    return unwrapData(response.data, "修改参建单位失败");
  },

  deleteUnit: async (projectId: string, unitId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.PROJECT_UNIT(projectId, unitId)
    );
  },

  listTeams: async (
    projectId: string,
    filters?: ConstructionResourceListFilters
  ): Promise<ConstructionResourceListResponse<ConstructionTeam>> => {
    const response = await apiClient.get<ApiResponse<ConstructionResourceListResponse<ConstructionTeam>>>(
      API_ENDPOINTS.ADMIN.PROJECT_TEAMS(projectId),
      { params: filters }
    );

    return unwrapData(response.data, "获取班组失败");
  },

  listAllTeams: async (projectId: string): Promise<ConstructionTeam[]> =>
    collectAllPages((filters) =>
      constructionProjectService.listTeams(projectId, filters)
    ),

  getTeam: async (projectId: string, teamId: string): Promise<ConstructionTeam> => {
    const response = await apiClient.get<ApiResponse<ConstructionTeam>>(
      API_ENDPOINTS.ADMIN.PROJECT_TEAM(projectId, teamId)
    );

    return unwrapData(response.data, "获取班组详情失败");
  },

  createTeam: async (
    projectId: string,
    payload: ConstructionTeamPayload
  ): Promise<ConstructionTeam> => {
    const response = await apiClient.post<ApiResponse<ConstructionTeam>>(
      API_ENDPOINTS.ADMIN.PROJECT_TEAMS(projectId),
      payload
    );

    return unwrapData(response.data, "新增班组失败");
  },

  updateTeam: async (
    projectId: string,
    teamId: string,
    payload: ConstructionTeamPayload
  ): Promise<ConstructionTeam> => {
    const response = await apiClient.patch<ApiResponse<ConstructionTeam>>(
      API_ENDPOINTS.ADMIN.PROJECT_TEAM(projectId, teamId),
      payload
    );

    return unwrapData(response.data, "修改班组失败");
  },

  deleteTeam: async (projectId: string, teamId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.PROJECT_TEAM(projectId, teamId)
    );
  },

  listWorkers: async (
    projectId: string,
    filters?: ConstructionResourceListFilters
  ): Promise<ConstructionResourceListResponse<ConstructionWorker>> => {
    const response = await apiClient.get<ApiResponse<ConstructionResourceListResponse<ConstructionWorker>>>(
      API_ENDPOINTS.ADMIN.PROJECT_WORKERS(projectId),
      { params: filters }
    );

    return unwrapData(response.data, "获取项目工人失败");
  },

  listAllWorkers: async (projectId: string): Promise<ConstructionWorker[]> =>
    collectAllPages((filters) =>
      constructionProjectService.listWorkers(projectId, filters)
    ),

  getWorker: async (
    projectId: string,
    workerId: string
  ): Promise<ConstructionWorker> => {
    const response = await apiClient.get<ApiResponse<ConstructionWorker>>(
      API_ENDPOINTS.ADMIN.PROJECT_WORKER(projectId, workerId)
    );

    return unwrapData(response.data, "获取项目工人详情失败");
  },

  createWorker: async (
    projectId: string,
    payload: ConstructionWorkerPayload
  ): Promise<ConstructionWorker> => {
    const response = await apiClient.post<ApiResponse<ConstructionWorker>>(
      API_ENDPOINTS.ADMIN.PROJECT_WORKERS(projectId),
      payload
    );

    return unwrapData(response.data, "新增项目工人失败");
  },

  updateWorker: async (
    projectId: string,
    workerId: string,
    payload: ConstructionWorkerPayload
  ): Promise<ConstructionWorker> => {
    const response = await apiClient.patch<ApiResponse<ConstructionWorker>>(
      API_ENDPOINTS.ADMIN.PROJECT_WORKER(projectId, workerId),
      payload
    );

    return unwrapData(response.data, "修改项目工人失败");
  },

  deleteWorker: async (projectId: string, workerId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.PROJECT_WORKER(projectId, workerId)
    );
  },

  listAttendance: async (
    projectId: string,
    filters?: ConstructionResourceListFilters
  ): Promise<ConstructionResourceListResponse<ConstructionAttendanceRecord>> => {
    const response = await apiClient.get<ApiResponse<ConstructionResourceListResponse<ConstructionAttendanceRecord>>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE(projectId),
      { params: filters }
    );

    return unwrapData(response.data, "获取考勤记录失败");
  },

  getAttendanceCalendar: async (
    projectId: string,
    filters?: ConstructionResourceListFilters
  ): Promise<ConstructionAttendanceCalendarResponse> => {
    const response = await apiClient.get<ApiResponse<ConstructionAttendanceCalendarResponse>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE(projectId),
      { params: { ...filters, view: "calendar" } }
    );

    return unwrapData(response.data, "获取考勤月历失败");
  },

  listAllAttendance: async (projectId: string): Promise<ConstructionAttendanceRecord[]> =>
    collectAllPages((filters) =>
      constructionProjectService.listAttendance(projectId, filters)
    ),

  getAttendance: async (
    projectId: string,
    attendanceId: string
  ): Promise<ConstructionAttendanceRecord> => {
    const response = await apiClient.get<ApiResponse<ConstructionAttendanceRecord>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE_RECORD(projectId, attendanceId)
    );

    return unwrapData(response.data, "获取考勤详情失败");
  },

  createAttendance: async (
    projectId: string,
    payload: ConstructionAttendancePayload
  ): Promise<ConstructionAttendanceRecord> => {
    const response = await apiClient.post<ApiResponse<ConstructionAttendanceRecord>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE(projectId),
      payload
    );

    return unwrapData(response.data, "新增考勤记录失败");
  },

  updateAttendance: async (
    projectId: string,
    attendanceId: string,
    payload: ConstructionAttendancePayload
  ): Promise<ConstructionAttendanceRecord> => {
    const response = await apiClient.patch<ApiResponse<ConstructionAttendanceRecord>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE_RECORD(projectId, attendanceId),
      payload
    );

    return unwrapData(response.data, "修改考勤记录失败");
  },

  deleteAttendance: async (
    projectId: string,
    attendanceId: string
  ): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE_RECORD(projectId, attendanceId)
    );
  },

  listWageBatches: async (
    projectId: string,
    filters?: ConstructionWageListFilters
  ): Promise<ConstructionWageListResponse> => {
    const response = await apiClient.get<ApiResponse<ConstructionWageListResponse>>(
      API_ENDPOINTS.ADMIN.PROJECT_WAGE_BATCHES(projectId),
      { params: filters }
    );

    return unwrapData(response.data, "获取工资统计失败");
  },

  createWageBatch: async (
    projectId: string,
    payload: ConstructionWageBatchPayload
  ): Promise<ConstructionWageBatch> => {
    const response = await apiClient.post<ApiResponse<ConstructionWageBatch>>(
      API_ENDPOINTS.ADMIN.PROJECT_WAGE_BATCHES(projectId),
      payload
    );

    return unwrapData(response.data, "新增工资单失败");
  },

  updateWageBatch: async (
    projectId: string,
    batchId: string,
    payload: ConstructionWageBatchPayload
  ): Promise<ConstructionWageBatch> => {
    const response = await apiClient.patch<ApiResponse<ConstructionWageBatch>>(
      API_ENDPOINTS.ADMIN.PROJECT_WAGE_BATCH(projectId, batchId),
      payload
    );

    return unwrapData(response.data, "修改工资单失败");
  },

  deleteWageBatch: async (
    projectId: string,
    batchId: string
  ): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.PROJECT_WAGE_BATCH(projectId, batchId)
    );
  },

  downloadWorkerContract: async (
    projectId: string,
    workerId: string
  ): Promise<Blob> => {
    const response = await apiClient.get<Blob>(
      API_ENDPOINTS.ADMIN.PROJECT_WORKER_CONTRACT_DOWNLOAD(projectId, workerId),
      { responseType: "blob" }
    );

    return response.data;
  },

  listContractTemplates: async (
    filters?: ConstructionModuleListFilters
  ): Promise<ConstructionResourceListResponse<ConstructionContractTemplate>> => {
    const response = await apiClient.get<ApiResponse<ConstructionResourceListResponse<ConstructionContractTemplate>>>(
      API_ENDPOINTS.ADMIN.CONTRACT_TEMPLATES,
      { params: filters }
    );

    return unwrapData(response.data, "获取合同模板失败");
  },

  createContractTemplate: async (
    payload: ConstructionContractTemplatePayload
  ): Promise<ConstructionContractTemplate> => {
    const response = await apiClient.post<ApiResponse<ConstructionContractTemplate>>(
      API_ENDPOINTS.ADMIN.CONTRACT_TEMPLATES,
      payload
    );

    return unwrapData(response.data, "新增合同模板失败");
  },

  updateContractTemplate: async (
    templateId: string,
    payload: ConstructionContractTemplatePayload
  ): Promise<ConstructionContractTemplate> => {
    const response = await apiClient.patch<ApiResponse<ConstructionContractTemplate>>(
      API_ENDPOINTS.ADMIN.CONTRACT_TEMPLATE(templateId),
      payload
    );

    return unwrapData(response.data, "修改合同模板失败");
  },

  deleteContractTemplate: async (templateId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.CONTRACT_TEMPLATE(templateId)
    );
  },

  getProjectContractTemplateConfig: async (
    projectId: string
  ): Promise<ConstructionProjectContractTemplateConfig | null> => {
    const response = await apiClient.get<ApiResponse<ConstructionProjectContractTemplateConfig | null>>(
      API_ENDPOINTS.ADMIN.PROJECT_CONTRACT_TEMPLATE_CONFIG(projectId)
    );

    return response.data.data ?? null;
  },

  upsertProjectContractTemplateConfig: async (
    projectId: string,
    payload: ConstructionProjectContractTemplatePayload
  ): Promise<ConstructionProjectContractTemplateConfig> => {
    const response = await apiClient.put<ApiResponse<ConstructionProjectContractTemplateConfig>>(
      API_ENDPOINTS.ADMIN.PROJECT_CONTRACT_TEMPLATE_CONFIG(projectId),
      payload
    );

    return unwrapData(response.data, "保存项目默认模板失败");
  },

  listWorkHourConfigs: async (
    filters?: ConstructionModuleListFilters
  ): Promise<ConstructionResourceListResponse<ConstructionWorkHourConfig>> => {
    const response = await apiClient.get<ApiResponse<ConstructionResourceListResponse<ConstructionWorkHourConfig>>>(
      API_ENDPOINTS.ADMIN.WORK_HOUR_CONFIGS,
      { params: filters }
    );

    return unwrapData(response.data, "获取工时配置失败");
  },

  createWorkHourConfig: async (
    payload: ConstructionWorkHourConfigPayload
  ): Promise<ConstructionWorkHourConfig> => {
    const response = await apiClient.post<ApiResponse<ConstructionWorkHourConfig>>(
      API_ENDPOINTS.ADMIN.WORK_HOUR_CONFIGS,
      payload
    );

    return unwrapData(response.data, "新增工时配置失败");
  },

  updateWorkHourConfig: async (
    configId: string,
    payload: ConstructionWorkHourConfigPayload
  ): Promise<ConstructionWorkHourConfig> => {
    const response = await apiClient.patch<ApiResponse<ConstructionWorkHourConfig>>(
      API_ENDPOINTS.ADMIN.WORK_HOUR_CONFIG(configId),
      payload
    );

    return unwrapData(response.data, "修改工时配置失败");
  },

  deleteWorkHourConfig: async (configId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.WORK_HOUR_CONFIG(configId)
    );
  },

  listPlatformConfigs: async (
    filters?: ConstructionModuleListFilters
  ): Promise<ConstructionResourceListResponse<ConstructionPlatformConfig>> => {
    const response = await apiClient.get<ApiResponse<ConstructionResourceListResponse<ConstructionPlatformConfig>>>(
      API_ENDPOINTS.ADMIN.PLATFORM_CONFIGS,
      { params: filters }
    );

    return unwrapData(response.data, "获取平台配置失败");
  },

  createPlatformConfig: async (
    payload: ConstructionPlatformConfigPayload
  ): Promise<ConstructionPlatformConfig> => {
    const response = await apiClient.post<ApiResponse<ConstructionPlatformConfig>>(
      API_ENDPOINTS.ADMIN.PLATFORM_CONFIGS,
      payload
    );

    return unwrapData(response.data, "新增平台配置失败");
  },

  updatePlatformConfig: async (
    configId: string,
    payload: ConstructionPlatformConfigPayload
  ): Promise<ConstructionPlatformConfig> => {
    const response = await apiClient.patch<ApiResponse<ConstructionPlatformConfig>>(
      API_ENDPOINTS.ADMIN.PLATFORM_CONFIG(configId),
      payload
    );

    return unwrapData(response.data, "修改平台配置失败");
  },

  deletePlatformConfig: async (configId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.PLATFORM_CONFIG(configId)
    );
  },

  listPlatformLogs: async (
    filters?: ConstructionModuleListFilters
  ): Promise<ConstructionPlatformLogListResponse> => {
    const response = await apiClient.get<ApiResponse<ConstructionPlatformLogListResponse>>(
      API_ENDPOINTS.ADMIN.PLATFORM_LOGS,
      { params: filters }
    );

    return unwrapData(response.data, "获取平台日志失败");
  },

  createPlatformLog: async (
    payload: ConstructionPlatformLogPayload
  ): Promise<ConstructionPlatformLog> => {
    const response = await apiClient.post<ApiResponse<ConstructionPlatformLog>>(
      API_ENDPOINTS.ADMIN.PLATFORM_LOGS,
      payload
    );

    return unwrapData(response.data, "新增平台日志失败");
  },

  updatePlatformLog: async (
    logId: string,
    payload: ConstructionPlatformLogPayload
  ): Promise<ConstructionPlatformLog> => {
    const response = await apiClient.patch<ApiResponse<ConstructionPlatformLog>>(
      API_ENDPOINTS.ADMIN.PLATFORM_LOG(logId),
      payload
    );

    return unwrapData(response.data, "修改平台日志失败");
  },

  deletePlatformLog: async (logId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(API_ENDPOINTS.ADMIN.PLATFORM_LOG(logId));
  },

  getConstructionOverview: async (): Promise<ConstructionOverview> => {
    const response = await apiClient.get<ApiResponse<ConstructionOverview>>(
      API_ENDPOINTS.ADMIN.CONSTRUCTION_OVERVIEW
    );

    return unwrapData(response.data, "获取首页总览失败");
  },

  importWageBatch: async (
    projectId: string,
    payload: ConstructionWageImportPayload
  ): Promise<ConstructionWageBatch> => {
    const response = await apiClient.post<ApiResponse<ConstructionWageBatch>>(
      API_ENDPOINTS.ADMIN.PROJECT_WAGE_IMPORT(projectId),
      payload
    );

    return unwrapData(response.data, "导入工资单失败");
  },

  exportWageBatches: async (
    projectId: string,
    filters?: ConstructionWageListFilters
  ): Promise<Blob> => {
    const response = await apiClient.get<Blob>(
      API_ENDPOINTS.ADMIN.PROJECT_WAGE_EXPORT(projectId),
      {
        params: filters,
        responseType: "blob",
      }
    );

    return response.data;
  },

  listAttendanceDevices: async (
    projectId: string,
    filters?: ConstructionResourceListFilters
  ): Promise<ConstructionResourceListResponse<ConstructionAttendanceDevice>> => {
    const response = await apiClient.get<ApiResponse<ConstructionResourceListResponse<ConstructionAttendanceDevice>>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE_DEVICES(projectId),
      { params: filters }
    );

    return unwrapData(response.data, "获取考勤机绑定失败");
  },

  getAttendanceDevice: async (
    projectId: string,
    deviceId: string
  ): Promise<ConstructionAttendanceDevice> => {
    const response = await apiClient.get<ApiResponse<ConstructionAttendanceDevice>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE_DEVICE(projectId, deviceId)
    );

    return unwrapData(response.data, "获取考勤机绑定详情失败");
  },

  createAttendanceDevice: async (
    projectId: string,
    payload: ConstructionAttendanceDevicePayload
  ): Promise<ConstructionAttendanceDevice> => {
    const response = await apiClient.post<ApiResponse<ConstructionAttendanceDevice>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE_DEVICES(projectId),
      payload
    );

    return unwrapData(response.data, "新增考勤机绑定失败");
  },

  updateAttendanceDevice: async (
    projectId: string,
    deviceId: string,
    payload: ConstructionAttendanceDevicePayload
  ): Promise<ConstructionAttendanceDevice> => {
    const response = await apiClient.patch<ApiResponse<ConstructionAttendanceDevice>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE_DEVICE(projectId, deviceId),
      payload
    );

    return unwrapData(response.data, "修改考勤机绑定失败");
  },

  deleteAttendanceDevice: async (
    projectId: string,
    deviceId: string
  ): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE_DEVICE(projectId, deviceId)
    );
  },

  listAttendanceDeviceIssueReports: async (
    filters?: ConstructionModuleListFilters
  ): Promise<ConstructionResourceListResponse<ConstructionAttendanceDeviceIssueReport>> => {
    const response = await apiClient.get<ApiResponse<ConstructionResourceListResponse<ConstructionAttendanceDeviceIssueReport>>>(
      API_ENDPOINTS.ADMIN.ATTENDANCE_DEVICE_ISSUE_REPORTS,
      { params: filters }
    );

    return unwrapData(response.data, "获取考勤机人员下发报告失败");
  },

  getAttendanceDeviceIssueReport: async (
    reportId: string
  ): Promise<ConstructionAttendanceDeviceIssueReport> => {
    const response = await apiClient.get<ApiResponse<ConstructionAttendanceDeviceIssueReport>>(
      API_ENDPOINTS.ADMIN.ATTENDANCE_DEVICE_ISSUE_REPORT(reportId)
    );

    return unwrapData(response.data, "获取考勤机人员下发报告详情失败");
  },

  createAttendanceDeviceIssueReport: async (
    payload: ConstructionAttendanceDeviceIssueReportPayload
  ): Promise<ConstructionAttendanceDeviceIssueReport> => {
    const response = await apiClient.post<ApiResponse<ConstructionAttendanceDeviceIssueReport>>(
      API_ENDPOINTS.ADMIN.ATTENDANCE_DEVICE_ISSUE_REPORTS,
      payload
    );

    return unwrapData(response.data, "新增考勤机人员下发报告失败");
  },

  updateAttendanceDeviceIssueReport: async (
    reportId: string,
    payload: ConstructionAttendanceDeviceIssueReportPayload
  ): Promise<ConstructionAttendanceDeviceIssueReport> => {
    const response = await apiClient.patch<ApiResponse<ConstructionAttendanceDeviceIssueReport>>(
      API_ENDPOINTS.ADMIN.ATTENDANCE_DEVICE_ISSUE_REPORT(reportId),
      payload
    );

    return unwrapData(response.data, "修改考勤机人员下发报告失败");
  },

  deleteAttendanceDeviceIssueReport: async (reportId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.ATTENDANCE_DEVICE_ISSUE_REPORT(reportId)
    );
  },
};
