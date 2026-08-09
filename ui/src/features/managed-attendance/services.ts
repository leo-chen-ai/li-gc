import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";
import type {
  ManagedAttendanceConfig,
  ManagedAttendanceConfigListResponse,
  ManagedAttendanceConfigPayload,
  ManagedAttendanceGenerateResult,
  ManagedAttendanceListFilters,
  ManagedAttendancePhotoGroup,
  ManagedAttendancePhotoGroupListResponse,
  ManagedAttendancePhotoGroupPayload,
  ManagedAttendanceRecordListResponse,
  ManagedAttendanceResendDayResult,
} from "./types";

function unwrapData<T>(response: ApiResponse<T>, fallbackMessage: string): T {
  if (response.data == null) {
    throw new Error(fallbackMessage);
  }
  return response.data;
}

export const managedAttendanceService = {
  listPhotoGroups: async (
    filters?: ManagedAttendanceListFilters
  ): Promise<ManagedAttendancePhotoGroupListResponse> => {
    const response = await apiClient.get<ApiResponse<ManagedAttendancePhotoGroupListResponse>>(
      API_ENDPOINTS.ADMIN.MANAGED_ATTENDANCE_PHOTO_GROUPS,
      { params: filters }
    );
    return unwrapData(response.data, "获取托管照片组失败");
  },

  createPhotoGroup: async (
    payload: ManagedAttendancePhotoGroupPayload
  ): Promise<ManagedAttendancePhotoGroup> => {
    const response = await apiClient.post<ApiResponse<ManagedAttendancePhotoGroup>>(
      API_ENDPOINTS.ADMIN.MANAGED_ATTENDANCE_PHOTO_GROUPS,
      payload
    );
    return unwrapData(response.data, "新增托管照片组失败");
  },

  updatePhotoGroup: async (
    photoGroupId: string,
    payload: ManagedAttendancePhotoGroupPayload
  ): Promise<ManagedAttendancePhotoGroup> => {
    const response = await apiClient.patch<ApiResponse<ManagedAttendancePhotoGroup>>(
      API_ENDPOINTS.ADMIN.MANAGED_ATTENDANCE_PHOTO_GROUP(photoGroupId),
      payload
    );
    return unwrapData(response.data, "修改托管照片组失败");
  },

  deletePhotoGroup: async (photoGroupId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.MANAGED_ATTENDANCE_PHOTO_GROUP(photoGroupId)
    );
  },

  listConfigs: async (
    filters?: ManagedAttendanceListFilters
  ): Promise<ManagedAttendanceConfigListResponse> => {
    const response = await apiClient.get<ApiResponse<ManagedAttendanceConfigListResponse>>(
      API_ENDPOINTS.ADMIN.MANAGED_ATTENDANCE_CONFIGS,
      { params: filters }
    );
    return unwrapData(response.data, "获取托管配置失败");
  },

  createConfig: async (
    payload: ManagedAttendanceConfigPayload
  ): Promise<ManagedAttendanceConfig> => {
    const response = await apiClient.post<ApiResponse<ManagedAttendanceConfig>>(
      API_ENDPOINTS.ADMIN.MANAGED_ATTENDANCE_CONFIGS,
      payload
    );
    return unwrapData(response.data, "新增托管配置失败");
  },

  updateConfig: async (
    configId: string,
    payload: ManagedAttendanceConfigPayload
  ): Promise<ManagedAttendanceConfig> => {
    const response = await apiClient.patch<ApiResponse<ManagedAttendanceConfig>>(
      API_ENDPOINTS.ADMIN.MANAGED_ATTENDANCE_CONFIG(configId),
      payload
    );
    return unwrapData(response.data, "修改托管配置失败");
  },

  deleteConfig: async (configId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.MANAGED_ATTENDANCE_CONFIG(configId)
    );
  },

  generateRecords: async (
    configId: string,
    month: string
  ): Promise<ManagedAttendanceGenerateResult> => {
    const response = await apiClient.post<ApiResponse<ManagedAttendanceGenerateResult>>(
      API_ENDPOINTS.ADMIN.MANAGED_ATTENDANCE_GENERATE(configId),
      { month }
    );
    return unwrapData(response.data, "生成托管记录失败");
  },

  resendDay: async (
    configId: string,
    attendanceDate: string
  ): Promise<ManagedAttendanceResendDayResult> => {
    const response = await apiClient.post<ApiResponse<ManagedAttendanceResendDayResult>>(
      API_ENDPOINTS.ADMIN.MANAGED_ATTENDANCE_RESEND_DAY(configId),
      { attendance_date: attendanceDate }
    );
    return unwrapData(response.data, "手动补发失败");
  },

  listRecords: async (
    filters?: ManagedAttendanceListFilters
  ): Promise<ManagedAttendanceRecordListResponse> => {
    const response = await apiClient.get<ApiResponse<ManagedAttendanceRecordListResponse>>(
      API_ENDPOINTS.ADMIN.MANAGED_ATTENDANCE_RECORDS,
      { params: filters }
    );
    return unwrapData(response.data, "获取托管记录失败");
  },
};
