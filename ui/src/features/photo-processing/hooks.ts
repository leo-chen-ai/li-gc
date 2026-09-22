import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";

import { photoProcessingService } from "./services";
import { isTaskActive } from "./lib";
import type {
  AttendancePhotoFilters,
  PhotoDirection,
  PhotoGroupPhotoPayload,
  StartCompositePayload,
} from "./types";

export const photoProcessingKeys = {
  all: ["photo-processing"] as const,
  groupsRoot: () => [...photoProcessingKeys.all, "groups"] as const,
  groups: (params?: Record<string, unknown>) =>
    [...photoProcessingKeys.groupsRoot(), params ?? {}] as const,
  groupDetail: (groupId: string) =>
    [...photoProcessingKeys.groupsRoot(), "detail", groupId] as const,
  compositedPairs: (groupId: string, workerId: string) =>
    [...photoProcessingKeys.groupsRoot(), "composited-pairs", groupId, workerId] as const,
  compositeTask: (taskId: string) =>
    [...photoProcessingKeys.all, "composite-tasks", taskId] as const,
};

export function usePhotoGroupListQuery(params?: {
  page?: number;
  page_size?: number;
  keyword?: string;
}) {
  return useQuery({
    queryKey: photoProcessingKeys.groups(params),
    queryFn: () => photoProcessingService.listGroups(params),
  });
}

export function usePhotoGroupDetailQuery(groupId?: string) {
  return useQuery({
    queryKey: photoProcessingKeys.groupDetail(groupId ?? ""),
    queryFn: () => photoProcessingService.getGroup(groupId as string),
    enabled: Boolean(groupId),
  });
}

export function useAttendancePhotosQuery(
  filters: AttendancePhotoFilters | null,
) {
  return useQuery({
    queryKey: [
      ...photoProcessingKeys.all,
      "attendance-photos",
      filters ?? {},
    ],
    queryFn: () => photoProcessingService.listAttendancePhotos(filters as AttendancePhotoFilters),
    enabled: Boolean(filters?.project_id && filters?.worker_id),
    placeholderData: keepPreviousData,
  });
}

export function useCreatePhotoGroupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; remark?: string }) =>
      photoProcessingService.createGroup(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: photoProcessingKeys.groupsRoot() });
    },
  });
}

export function useUpdatePhotoGroupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      payload,
    }: {
      groupId: string;
      payload: { name?: string; remark?: string };
    }) => photoProcessingService.updateGroup(groupId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: photoProcessingKeys.groupsRoot() });
    },
  });
}

export function useDeletePhotoGroupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => photoProcessingService.deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: photoProcessingKeys.groupsRoot() });
    },
  });
}

export function useAddPhotoGroupPhotosMutation(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photos: PhotoGroupPhotoPayload[]) =>
      photoProcessingService.addPhotos(groupId, photos),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: photoProcessingKeys.groupDetail(groupId),
      });
      queryClient.invalidateQueries({ queryKey: photoProcessingKeys.groupsRoot() });
    },
  });
}

export function useDeletePhotoGroupPhotoMutation(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) =>
      photoProcessingService.deletePhoto(groupId, photoId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: photoProcessingKeys.groupDetail(groupId),
      });
      queryClient.invalidateQueries({ queryKey: photoProcessingKeys.groupsRoot() });
    },
  });
}

export function useSetBackgroundMutation(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      direction,
      payload,
    }: {
      direction: PhotoDirection;
      payload: { photo_url: string; object_key?: string; remark?: string };
    }) => photoProcessingService.setBackground(groupId, direction, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: photoProcessingKeys.groupDetail(groupId),
      });
      queryClient.invalidateQueries({ queryKey: photoProcessingKeys.groupsRoot() });
    },
  });
}

export function useDeleteBackgroundMutation(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (direction: PhotoDirection) =>
      photoProcessingService.deleteBackground(groupId, direction),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: photoProcessingKeys.groupDetail(groupId),
      });
      queryClient.invalidateQueries({ queryKey: photoProcessingKeys.groupsRoot() });
    },
  });
}

export function useStartCompositeMutation(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StartCompositePayload) =>
      photoProcessingService.startComposite(groupId, payload),
    onSuccess: (task) => {
      queryClient.setQueryData(
        photoProcessingKeys.groupDetail(groupId),
        (current: unknown) =>
          current && typeof current === "object"
            ? { ...(current as Record<string, unknown>), latest_task: task }
            : current
      );
    },
  });
}

export function useCompositeTaskQuery(taskId?: string) {
  return useQuery({
    queryKey: photoProcessingKeys.compositeTask(taskId ?? ""),
    queryFn: () => photoProcessingService.getCompositeTask(taskId as string),
    enabled: Boolean(taskId),
    // 单张约 14 秒，1 秒轮询一版足够细腻，任务结束后自动停。
    refetchInterval: (query) =>
      isTaskActive(query.state.data ?? null) ? 1000 : false,
  });
}

export function useCancelCompositeTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      photoProcessingService.cancelCompositeTask(taskId),
    onSuccess: (task) => {
      queryClient.invalidateQueries({
        queryKey: photoProcessingKeys.compositeTask(task.id),
      });
      queryClient.invalidateQueries({ queryKey: photoProcessingKeys.groupsRoot() });
    },
  });
}

export function useCompositedPairsQuery(groupId?: string, workerId?: string) {
  return useQuery({
    queryKey: photoProcessingKeys.compositedPairs(groupId ?? "", workerId ?? ""),
    queryFn: () =>
      photoProcessingService.listCompositedPairs(groupId as string, workerId as string),
    enabled: Boolean(groupId && workerId),
  });
}
