import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminService } from "@/lib/api";
import type { CreateRoleRequest } from "@/features/admin/types/admin-types";

export const roleKeys = {
  all: ["admin", "roles"] as const,
};

export function useRolesList(enabled = true) {
  return useQuery({
    queryKey: roleKeys.all,
    queryFn: adminService.getRoles,
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateRoleRequest) => adminService.createRole(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.all });
    },
  });
}

export function useUpdateRoleMenus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roleId, menuKeys }: { roleId: string; menuKeys: string[] }) =>
      adminService.updateRoleMenus(roleId, menuKeys),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.all });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roleId: string) => adminService.deleteRole(roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.all });
    },
  });
}
