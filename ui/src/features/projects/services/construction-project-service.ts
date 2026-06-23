import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";
import type {
  ConstructionAttendanceDevice,
  ConstructionAttendanceDevicePayload,
  ConstructionAttendancePayload,
  ConstructionAttendanceRecord,
  IdCardOcrResult,
  IdCardOcrSide,
  ConstructionProject,
  ConstructionProjectOption,
  ConstructionProjectPayload,
  ConstructionTeam,
  ConstructionTeamPayload,
  ConstructionUnit,
  ConstructionUnitPayload,
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

  listUnits: async (projectId: string): Promise<ConstructionUnit[]> => {
    const response = await apiClient.get<ApiResponse<ConstructionUnit[]>>(
      API_ENDPOINTS.ADMIN.PROJECT_UNITS(projectId)
    );

    return unwrapData(response.data, "获取参建单位失败");
  },

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

  listTeams: async (projectId: string): Promise<ConstructionTeam[]> => {
    const response = await apiClient.get<ApiResponse<ConstructionTeam[]>>(
      API_ENDPOINTS.ADMIN.PROJECT_TEAMS(projectId)
    );

    return unwrapData(response.data, "获取班组失败");
  },

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

  listWorkers: async (projectId: string): Promise<ConstructionWorker[]> => {
    const response = await apiClient.get<ApiResponse<ConstructionWorker[]>>(
      API_ENDPOINTS.ADMIN.PROJECT_WORKERS(projectId)
    );

    return unwrapData(response.data, "获取项目工人失败");
  },

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
    projectId: string
  ): Promise<ConstructionAttendanceRecord[]> => {
    const response = await apiClient.get<ApiResponse<ConstructionAttendanceRecord[]>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE(projectId)
    );

    return unwrapData(response.data, "获取考勤记录失败");
  },

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

  listAttendanceDevices: async (
    projectId: string
  ): Promise<ConstructionAttendanceDevice[]> => {
    const response = await apiClient.get<ApiResponse<ConstructionAttendanceDevice[]>>(
      API_ENDPOINTS.ADMIN.PROJECT_ATTENDANCE_DEVICES(projectId)
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
};
