import { STUDIO_CLIENT_VERSION, validateStudioResult } from "./protocol";
import { apiClient } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";

export type PhotoPair = { in_image: string; out_image?: string; out_error?: string; entry_layer?: string; pipeline?: string };
type Job = { job_id: string; status: "running" | "completed" | "failed"; result?: PhotoPair; error?: string };
export class PhotoJobError extends Error {
  readonly resumable: boolean;
  constructor(message: string, resumable: boolean) { super(message); this.resumable = resumable; }
}
function retryable(error: unknown): boolean {
  const e = error as { code?: number | string; response?: { status: number } };
  const code = e?.response?.status ?? Number(e?.code);
  return !Number.isFinite(code) || code === 0 || code === 429 || code >= 500;
}
function message(error: unknown): string {
  return (error as { message?: string })?.message || "生成请求失败";
}
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 3000));

// 每条请求只查询状态，避免长时间等图被网关断开。
// POST重试复用request_id，后端保证不会重复提交付费任务。
export async function generatePhotoPair(payload: object, requestId: string): Promise<PhotoPair> {
  let started = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await apiClient.post<ApiResponse<Job>>("/admin/photo-processing/generation-jobs", { ...payload, client_version: STUDIO_CLIENT_VERSION, request_id: requestId }, { timeout: 20000 });
      started = true;
      break;
    } catch (error) {
      if (!retryable(error)) throw new PhotoJobError(message(error), false);
      if (attempt < 2) await pause();
    }
  }
  if (!started) throw new PhotoJobError("网络暂时不可用，点击重试可继续查询原任务", true);
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await apiClient.get<ApiResponse<Job>>(`/admin/photo-processing/generation-jobs/${requestId}`, { timeout: 15000 });
      const job = response.data.data;
      if (!job) throw new PhotoJobError("未返回任务状态", true);
      if (job.status === "failed") throw new PhotoJobError(job.error || "生成失败", false);
      if (job.status === "completed") {
        if (!job.result?.in_image) throw new PhotoJobError("未返回进场图片", false);
        try { validateStudioResult(job.result, (payload as { prepare_scenes?: boolean }).prepare_scenes === true); }
        catch (error) { throw new PhotoJobError(message(error), false); }
        return job.result;
      }
    } catch (error) {
      if (error instanceof PhotoJobError) throw error;
      if (!retryable(error)) throw new PhotoJobError(message(error), false);
      // 仅查询重试；网络恢复后读取原任务，不生成第二次。
    }
    await pause();
  }
  throw new PhotoJobError("等待结果较久，点击重试可继续查询原任务", true);
}
