import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";
import type {
  AddPhotosResult,
  AttendancePhotoFilters,
  AttendancePhotoResponse,
  CompositedPairResponse,
  CompositeTask,
  PhotoDirection,
  PhotoGroupDetail,
  PhotoGroupListResponse,
  PhotoGroupPhotoPayload,
  PhotoGroupSummary,
  StartCompositePayload,
} from "./types";

function unwrapData<T>(response: ApiResponse<T>, fallbackMessage: string): T {
  if (response.data == null) {
    throw new Error(fallbackMessage);
  }
  return response.data;
}

export const photoProcessingService = {
  listGroups: async (params?: {
    page?: number;
    page_size?: number;
    keyword?: string;
  }): Promise<PhotoGroupListResponse> => {
    const response = await apiClient.get<ApiResponse<PhotoGroupListResponse>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_GROUPS,
      { params },
    );
    return unwrapData(response.data, "获取照片处理组失败");
  },

  createGroup: async (payload: {
    name: string;
    remark?: string;
  }): Promise<PhotoGroupSummary> => {
    const response = await apiClient.post<ApiResponse<PhotoGroupSummary>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_GROUPS,
      payload,
    );
    return unwrapData(response.data, "创建照片处理组失败");
  },

  getGroup: async (groupId: string): Promise<PhotoGroupDetail> => {
    const response = await apiClient.get<ApiResponse<PhotoGroupDetail>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_GROUP(groupId),
    );
    return unwrapData(response.data, "获取照片处理组详情失败");
  },

  updateGroup: async (
    groupId: string,
    payload: { name?: string; remark?: string },
  ): Promise<PhotoGroupSummary> => {
    const response = await apiClient.patch<ApiResponse<PhotoGroupSummary>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_GROUP(groupId),
      payload,
    );
    return unwrapData(response.data, "修改照片处理组失败");
  },

  deleteGroup: async (groupId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_GROUP(groupId),
    );
  },

  addPhotos: async (
    groupId: string,
    photos: PhotoGroupPhotoPayload[],
  ): Promise<AddPhotosResult> => {
    const response = await apiClient.post<ApiResponse<AddPhotosResult>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_GROUP_PHOTOS(groupId),
      { photos },
    );
    return unwrapData(response.data, "加入照片处理组失败");
  },

  deletePhoto: async (groupId: string, photoId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_GROUP_PHOTO(groupId, photoId),
    );
  },

  setBackground: async (
    groupId: string,
    direction: PhotoDirection,
    payload: { photo_url: string; object_key?: string; remark?: string },
  ): Promise<{ id: string; direction: PhotoDirection }> => {
    const response = await apiClient.put<
      ApiResponse<{ id: string; direction: PhotoDirection }>
    >(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_GROUP_BACKGROUND(groupId, direction),
      payload,
    );
    return unwrapData(response.data, "上传背景图失败");
  },

  deleteBackground: async (groupId: string, direction: PhotoDirection): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_GROUP_BACKGROUND(groupId, direction),
    );
  },

  listAttendancePhotos: async (
    filters: AttendancePhotoFilters,
  ): Promise<AttendancePhotoResponse> => {
    const response = await apiClient.get<ApiResponse<AttendancePhotoResponse>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_ATTENDANCE_PHOTOS,
      { params: filters },
    );
    return unwrapData(response.data, "拉取考勤照片失败");
  },

  startComposite: async (
    groupId: string,
    payload: StartCompositePayload,
  ): Promise<CompositeTask> => {
    const response = await apiClient.post<ApiResponse<CompositeTask>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_GROUP_COMPOSITE(groupId),
      payload,
    );
    return unwrapData(response.data, "发起合成失败");
  },

  getCompositeTask: async (taskId: string): Promise<CompositeTask> => {
    const response = await apiClient.get<ApiResponse<CompositeTask>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_COMPOSITE_TASK(taskId),
    );
    return unwrapData(response.data, "获取合成任务失败");
  },

  cancelCompositeTask: async (taskId: string): Promise<CompositeTask> => {
    const response = await apiClient.post<ApiResponse<CompositeTask>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_COMPOSITE_TASK_CANCEL(taskId),
    );
    return unwrapData(response.data, "取消合成任务失败");
  },

  listCompositedPairs: async (
    groupId: string,
    workerId: string,
  ): Promise<CompositedPairResponse> => {
    const response = await apiClient.get<ApiResponse<CompositedPairResponse>>(
      API_ENDPOINTS.ADMIN.PHOTO_PROCESSING_GROUP_COMPOSITED_PAIRS(groupId),
      { params: { worker_id: workerId } },
    );
    return unwrapData(response.data, "获取合成照片失败");
  },
};
