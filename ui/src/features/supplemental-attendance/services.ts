import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";
import type {
  SupplementalAttendanceListFilters,
  SupplementalAttendanceListResponse,
} from "./types";

export const supplementalAttendanceService = {
  async listRecords(
    filters: SupplementalAttendanceListFilters,
  ): Promise<SupplementalAttendanceListResponse> {
    const response = await apiClient.get<
      ApiResponse<SupplementalAttendanceListResponse>
    >(API_ENDPOINTS.MANAGEMENT.SUPPLEMENTAL_ATTENDANCE_RECORDS, {
      params: filters,
    });

    if (!response.data.data) {
      throw new Error("获取补考勤记录失败");
    }
    return response.data.data;
  },
};
