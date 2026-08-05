import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { managedAttendanceService } from "./services";
import type {
  ManagedAttendanceConfigPayload,
  ManagedAttendanceListFilters,
  ManagedAttendancePhotoGroupPayload,
} from "./types";

export const managedAttendanceKeys = {
  all: ["managed-attendance"] as const,
  photoGroupsRoot: () =>
    [...managedAttendanceKeys.all, "photo-groups"] as const,
  photoGroups: (filters?: ManagedAttendanceListFilters) =>
    [...managedAttendanceKeys.photoGroupsRoot(), filters ?? {}] as const,
  configsRoot: () => [...managedAttendanceKeys.all, "configs"] as const,
  configs: (filters?: ManagedAttendanceListFilters) =>
    [...managedAttendanceKeys.configsRoot(), filters ?? {}] as const,
  recordsRoot: () => [...managedAttendanceKeys.all, "records"] as const,
  records: (filters?: ManagedAttendanceListFilters) =>
    [...managedAttendanceKeys.recordsRoot(), filters ?? {}] as const,
};

export function useManagedAttendancePhotoGroupsQuery(
  filters?: ManagedAttendanceListFilters,
) {
  return useQuery({
    queryKey: managedAttendanceKeys.photoGroups(filters),
    queryFn: () => managedAttendanceService.listPhotoGroups(filters),
  });
}

export function useCreateManagedAttendancePhotoGroupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ManagedAttendancePhotoGroupPayload) =>
      managedAttendanceService.createPhotoGroup(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedAttendanceKeys.photoGroupsRoot(),
      });
    },
  });
}

export function useUpdateManagedAttendancePhotoGroupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      photoGroupId,
      payload,
    }: {
      photoGroupId: string;
      payload: ManagedAttendancePhotoGroupPayload;
    }) => managedAttendanceService.updatePhotoGroup(photoGroupId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedAttendanceKeys.photoGroupsRoot(),
      });
      queryClient.invalidateQueries({
        queryKey: managedAttendanceKeys.configsRoot(),
      });
    },
  });
}

export function useDeleteManagedAttendancePhotoGroupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: managedAttendanceService.deletePhotoGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedAttendanceKeys.photoGroupsRoot(),
      });
      queryClient.invalidateQueries({
        queryKey: managedAttendanceKeys.configsRoot(),
      });
    },
  });
}

export function useManagedAttendanceConfigsQuery(
  filters?: ManagedAttendanceListFilters,
) {
  return useQuery({
    queryKey: managedAttendanceKeys.configs(filters),
    queryFn: () => managedAttendanceService.listConfigs(filters),
    refetchInterval: 15_000,
  });
}

export function useCreateManagedAttendanceConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ManagedAttendanceConfigPayload) =>
      managedAttendanceService.createConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedAttendanceKeys.configsRoot(),
      });
    },
  });
}

export function useUpdateManagedAttendanceConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      configId,
      payload,
    }: {
      configId: string;
      payload: ManagedAttendanceConfigPayload;
    }) => managedAttendanceService.updateConfig(configId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedAttendanceKeys.configsRoot(),
      });
      queryClient.invalidateQueries({
        queryKey: managedAttendanceKeys.recordsRoot(),
      });
    },
  });
}

export function useDeleteManagedAttendanceConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: managedAttendanceService.deleteConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedAttendanceKeys.configsRoot(),
      });
      queryClient.invalidateQueries({
        queryKey: managedAttendanceKeys.recordsRoot(),
      });
    },
  });
}

export function useGenerateManagedAttendanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ configId, month }: { configId: string; month: string }) =>
      managedAttendanceService.generateRecords(configId, month),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedAttendanceKeys.recordsRoot(),
      });
      queryClient.invalidateQueries({
        queryKey: managedAttendanceKeys.configsRoot(),
      });
    },
  });
}

export function useManagedAttendanceRecordsQuery(
  filters?: ManagedAttendanceListFilters,
) {
  return useQuery({
    queryKey: managedAttendanceKeys.records(filters),
    queryFn: () => managedAttendanceService.listRecords(filters),
    refetchInterval: 15_000,
  });
}
