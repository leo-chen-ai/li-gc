import type {
  CompositeTask,
  PhotoDirection,
  PhotoGroupStats,
  PhotoCompositeStatus,
} from "./types";

export const DIRECTION_IN: PhotoDirection = 0;
export const DIRECTION_OUT: PhotoDirection = 1;

const DIRECTION_LABELS: Record<PhotoDirection, string> = {
  0: "进场",
  1: "出场",
};

const COMPOSITE_STATUS_LABELS: Record<PhotoCompositeStatus, string> = {
  pending: "待合成",
  success: "已合成",
  failed: "合成失败",
  skipped: "已跳过",
};

const TASK_STATUS_LABELS: Record<CompositeTask["status"], string> = {
  pending: "排队中",
  running: "合成中",
  completed: "已完成",
  failed: "已失败",
  cancelled: "已取消",
};

export function directionLabel(direction: PhotoDirection): string {
  return DIRECTION_LABELS[direction] ?? String(direction);
}

export function compositeStatusLabel(status: string): string {
  return COMPOSITE_STATUS_LABELS[status as PhotoCompositeStatus] ?? status;
}

export function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABELS[status as CompositeTask["status"]] ?? status;
}

/** 合成任务是否还在跑，用于前端决定要不要继续轮询。 */
export function isTaskActive(task: CompositeTask | null): boolean {
  return task?.status === "pending" || task?.status === "running";
}

/** 已处理（成功+失败+跳过）占总数比例，0～100 的整数。 */
export function taskProgressPercent(task: CompositeTask): number {
  if (task.total_count <= 0) {
    return task.status === "completed" ? 100 : 0;
  }
  const done = task.success_count + task.failed_count + task.skipped_count;
  return Math.min(100, Math.max(0, Math.round((done / task.total_count) * 100)));
}

export function emptyStats(): PhotoGroupStats {
  return { total: 0, pending: 0, success: 0, failed: 0, skipped: 0 };
}

/** 组内照片的身份键：同一人同一天同一方向算同一张，避免重复加入。 */
export function photoDedupeKey(photo: {
  attendance_record_id?: string | null;
  project_id: string;
  worker_id?: string | null;
  attendance_date: string;
  direction: PhotoDirection;
}): string {
  // worker_id 可能是 null/undefined，统一成空串，避免同一个键出现两种写法。
  const worker = photo.worker_id ?? "";
  return [
    photo.attendance_record_id ?? "",
    photo.project_id,
    worker,
    photo.attendance_date,
    photo.direction,
  ].join("::");
}

/** 按 URL 去重追加，保证已有照片组内容不会在同步时重复下发。 */
export function mergePhotoUrls(
  existing: readonly string[],
  incoming: readonly string[]
): string[] {
  const merged = [...existing];
  const seen = new Set(merged.filter(Boolean));
  for (const url of incoming) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    merged.push(url);
  }
  return merged;
}

/** 去掉空串，`in_photos`/`out_photos` 存库前必须走这一步。 */
export function normalizePhotoUrls(photos: readonly string[]): string[] {
  return photos.filter((url) => Boolean(url));
}

/**
 * 把勾选的成对合成照片并进托管照片组。
 *
 * 托管侧 `in_photos`/`out_photos` 是按数组下标配对的，所以必须分别按 URL 去重后
 * 重新对齐下标；直接 append 会让进/出错位，把一个工人的进场照配到另一个出场照上。
 * 已有的空位（只有进或只有出）也按原样保留位置。
 */
export function mergeCompositedPairs(
  existing: readonly { inPhoto: string; outPhoto: string }[],
  picked: readonly { in_photo: string; out_photo: string }[],
): { inPhoto: string; outPhoto: string }[] {
  const kept = existing.filter((pair) => pair.inPhoto || pair.outPhoto);
  const inPhotos = mergePhotoUrls(
    kept.map((pair) => pair.inPhoto),
    picked.map((pair) => pair.in_photo),
  );
  const outPhotos = mergePhotoUrls(
    kept.map((pair) => pair.outPhoto),
    picked.map((pair) => pair.out_photo),
  );
  const count = Math.max(inPhotos.length, outPhotos.length, 1);
  return Array.from({ length: count }, (_, index) => ({
    inPhoto: inPhotos[index] || "",
    outPhoto: outPhotos[index] || "",
  }));
}

/** 一组成对照片 + 未配对数量 → 用户看得懂的提示。 */
export function describeCompositedPairs(unpairedCount: number): string {
  if (unpairedCount <= 0) return "";
  return `另有 ${unpairedCount} 张已合成照片没凑齐进/出一对，不会同步过去`;
}

/** 从列表里按 id 取出背景图；进场/出场各一张，后台按 direction 分。 */
export function findBackground<T extends { direction: PhotoDirection }>(
  backgrounds: readonly T[],
  direction: PhotoDirection
): T | undefined {
  return backgrounds.find((item) => item.direction === direction);
}
