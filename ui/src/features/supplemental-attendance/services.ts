import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";
import type {
  SupplementalAttendanceListFilters,
  SupplementalAttendanceListResponse,
  SupplementalAttendanceDispatchLog,
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

  async deleteRecords(recordIds: string[]): Promise<{ deleted_count: number }> {
    const response = await apiClient.delete<ApiResponse<{ deleted_count: number }>>(
      API_ENDPOINTS.MANAGEMENT.SUPPLEMENTAL_ATTENDANCE_RECORDS,
      { data: { record_ids: recordIds } },
    );
    if (!response.data.data) throw new Error("批量删除下发记录失败");
    return response.data.data;
  },

  async getDispatchLog(jobId: string): Promise<SupplementalAttendanceDispatchLog> {
    const response = await apiClient.get<ApiResponse<SupplementalAttendanceDispatchLog>>(
      `${API_ENDPOINTS.MANAGEMENT.SUPPLEMENTAL_ATTENDANCE_RECORDS}/${jobId}/log`,
    );
    if (!response.data.data) throw new Error("获取详细发送日志失败");
    return response.data.data;
  },
};
