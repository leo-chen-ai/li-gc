import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminService } from "@/lib/api";
import type { CreateAdminUserRequest } from "@/features/admin/types/admin-types";
import { adminKeys } from "./use-users-list";

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateAdminUserRequest) => adminService.createUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  });
}
