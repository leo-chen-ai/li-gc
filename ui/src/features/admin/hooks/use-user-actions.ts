import { useMutation, useQueryClient } from "@tanstack/react-query";

import { adminService } from "@/lib/api";
import { adminKeys } from "./use-users-list";

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ userId, newPassword }: { userId: string; newPassword: string }) =>
      adminService.resetUserPassword(userId, newPassword),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: adminService.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  });
}
