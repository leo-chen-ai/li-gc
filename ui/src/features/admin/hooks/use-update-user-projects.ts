import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminService } from "@/lib/api";
import { adminKeys } from "./use-users-list";

export function useUpdateUserProjects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, projectIds }: { userId: string; projectIds: string[] }) =>
      adminService.updateUserProjects(userId, projectIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  });
}
