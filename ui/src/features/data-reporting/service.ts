import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiSuccess } from "@/lib/api/types";
import type {
  PageResult, ReportConfig, ReportConfigPayload, ReportItem, ReportRun, ReportSummary, RunMode,
} from "./types";

function data<T>(response: { data: ApiSuccess<T> }, fallback: T): T {
  return response.data.data ?? fallback;
}

export const reportService = {
  summary: async () => data(await apiClient.get<ApiSuccess<ReportSummary>>(API_ENDPOINTS.ADMIN.REPORT_FORWARD_SUMMARY), {} as ReportSummary),
  configs: async () => data(await apiClient.get<ApiSuccess<PageResult<ReportConfig>>>(API_ENDPOINTS.ADMIN.REPORT_FORWARD_CONFIGS, { params: { page: 1, page_size: 100 } }), { items: [], total: 0, page: 1, page_size: 100 }),
  config: async (id: string) => data(await apiClient.get<ApiSuccess<ReportConfig>>(API_ENDPOINTS.ADMIN.REPORT_FORWARD_CONFIG(id)), null as unknown as ReportConfig),
  createConfig: async (payload: ReportConfigPayload) => data(await apiClient.post<ApiSuccess<ReportConfig>>(API_ENDPOINTS.ADMIN.REPORT_FORWARD_CONFIGS, payload), null as unknown as ReportConfig),
  updateConfig: async (id: string, payload: ReportConfigPayload) => data(await apiClient.put<ApiSuccess<ReportConfig>>(API_ENDPOINTS.ADMIN.REPORT_FORWARD_CONFIG(id), payload), null as unknown as ReportConfig),
  deleteConfig: async (id: string) => { await apiClient.delete(API_ENDPOINTS.ADMIN.REPORT_FORWARD_CONFIG(id)); },
  runs: async (params: Record<string, unknown> = {}) => data(await apiClient.get<ApiSuccess<PageResult<ReportRun>>>(API_ENDPOINTS.ADMIN.REPORT_FORWARD_RUNS, { params: { page: 1, page_size: 100, ...params } }), { items: [], total: 0, page: 1, page_size: 100 }),
  run: async (id: string) => data(await apiClient.get<ApiSuccess<ReportRun>>(API_ENDPOINTS.ADMIN.REPORT_FORWARD_RUN(id)), null as unknown as ReportRun),
  createRun: async (configId: string, runMode: RunMode, options: Record<string, unknown> = {}) => data(await apiClient.post<ApiSuccess<ReportRun>>(API_ENDPOINTS.ADMIN.REPORT_FORWARD_CONFIG_RUNS(configId), { run_mode: runMode, options }), null as unknown as ReportRun),
  cancelRun: async (id: string) => data(await apiClient.post<ApiSuccess<ReportRun>>(API_ENDPOINTS.ADMIN.REPORT_FORWARD_RUN_CANCEL(id)), null as unknown as ReportRun),
  retryRun: async (id: string) => data(await apiClient.post<ApiSuccess<ReportRun>>(API_ENDPOINTS.ADMIN.REPORT_FORWARD_RUN_RETRY(id)), null as unknown as ReportRun),
  items: async (runId: string, page = 1, outcome = "all", keyword = "") => data(await apiClient.get<ApiSuccess<PageResult<ReportItem>>>(API_ENDPOINTS.ADMIN.REPORT_FORWARD_ITEMS, { params: { run_id: runId, page, page_size: 50, outcome, keyword } }), { items: [], total: 0, page, page_size: 50, counts: { all: 0, success: 0, failed: 0, unknown: 0 } }),
  exportItems: async (runId: string, outcome = "all", keyword = "") => {
    const response = await apiClient.get(API_ENDPOINTS.ADMIN.REPORT_FORWARD_ITEMS_EXPORT(runId), { params: { outcome, keyword }, responseType: "blob" });
    const disposition = String(response.headers["content-disposition"] || "");
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const filename = encoded ? decodeURIComponent(encoded) : "人员报送结果.xlsx";
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  },
  downloadArtifact: async (id: string, filename: string) => {
    const response = await apiClient.get(API_ENDPOINTS.ADMIN.REPORT_FORWARD_ARTIFACT_DOWNLOAD(id), { responseType: "blob" });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  },
  artifactBlob: async (id: string) => {
    const response = await apiClient.get<Blob>(API_ENDPOINTS.ADMIN.REPORT_FORWARD_ARTIFACT_DOWNLOAD(id), { responseType: "blob" });
    return response.data;
  },
};
