import { useQuery } from "@tanstack/react-query";

import { adminService } from "@/lib/api";

export const uploadKeys = {
  all: ["admin", "uploads"] as const,
};

export function useUploadsList() {
  return useQuery({
    queryKey: uploadKeys.all,
    queryFn: adminService.getUploads,
    staleTime: 30 * 1000,
  });
}
