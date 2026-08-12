import { apiClient } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";
import type { SystemWarningFilters, SystemWarningList } from "./types";

export async function listSystemWarnings(filters: SystemWarningFilters): Promise<SystemWarningList> {
  const response = await apiClient.get<ApiResponse<SystemWarningList>>("/management/warnings", {
    params: filters,
  });
  if (!response.data.data) throw new Error("获取预警记录失败");
  return response.data.data;
}
