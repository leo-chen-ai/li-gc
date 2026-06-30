import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/lib/api";

export const adminKeys = {
  all: ["admin"] as const,
  users: () => [...adminKeys.all, "users"] as const,
  registrationLeads: () => [...adminKeys.all, "registration-leads"] as const,
};

export function useUsersList(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.users(),
    queryFn: adminService.getUsers,
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

export function useRegistrationLeads(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.registrationLeads(),
    queryFn: adminService.getRegistrationLeads,
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}
