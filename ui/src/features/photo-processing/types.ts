import type { ManagedAttendancePhotoPair } from "@/features/managed-attendance/types";

/** 0=进场、1=出场，与 construction_attendance_records.direction 同语义 */
export type PhotoDirection = 0 | 1;

export type PhotoGroupSummary = {
  id: string;
  name: string;
  remark: string | null;
  photo_count: number;
  pending_count: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  has_in_background: boolean;
  has_out_background: boolean;
  created_at: string;
  updated_at: string;
};

export type PhotoGroupListResponse = {
  items: PhotoGroupSummary[];
  total: number;
  page: number;
  page_size: number;
};

export type PhotoGroupPhoto = {
  id: string;
  project_id: string;
  project_name: string | null;
  worker_id: string | null;
  worker_name: string;
  attendance_record_id: string | null;
  attendance_date: string;
  direction: PhotoDirection;
  photo_url: string;
  sort_index: number;
  composite_status: PhotoCompositeStatus;
  composite_photo_url: string | null;
  composite_error: string | null;
  composited_at: string | null;
  created_at: string;
};

export type PhotoGroupBackground = {
  id: string;
  direction: PhotoDirection;
  photo_url: string;
  remark: string | null;
};

export type PhotoGroupStats = {
  total: number;
  pending: number;
  success: number;
  failed: number;
  skipped: number;
};

export type CompositeTask = {
  id: string;
  group_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  total_count: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  output_size: string;
  prompt_text: string | null;
  error_summary: string | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type PhotoGroupDetail = {
  id: string;
  name: string;
  remark: string | null;
  photos: PhotoGroupPhoto[];
  backgrounds: PhotoGroupBackground[];
  stats: PhotoGroupStats;
  latest_task: CompositeTask | null;
};

export type AttendancePhotoItem = {
  attendance_record_id: string;
  project_id: string;
  worker_id: string;
  worker_name: string;
  attendance_date: string;
  trigger_time: string;
  direction: PhotoDirection;
  /** 缩略图 data URI，仅用于勾选预览 */
  preview_photo: string;
  /** 原始地址，加入组时按这个解析原图 */
  photo_url: string;
};

export type AttendancePhotoResponse = {
  items: AttendancePhotoItem[];
  total: number;
};

export type AttendancePhotoFilters = {
  project_id: string;
  worker_id: string;
  date_from?: string;
  date_to?: string;
  direction?: PhotoDirection | "";
  limit?: number;
};

/** 待加入组的照片，字段名与 AddPhotoItem 对齐 */
export type PhotoGroupPhotoPayload = {
  attendance_record_id: string | null;
  project_id: string;
  worker_id: string | null;
  worker_name: string;
  attendance_date: string;
  direction: PhotoDirection;
  photo_url: string;
};

/** 批量加入的返回：新增条数、因组内已存在而跳过的条数、以及逐条失败原因 */
export type AddPhotosResult = {
  added: number;
  skipped: number;
  failed: string[];
};

export type StartCompositePayload = {
  output_size?: string;
  prompt?: string;
  mode?: "incremental" | "all";
};

export type CompositedPair = ManagedAttendancePhotoPair;

export type CompositedPairResponse = {
  items: CompositedPair[];
  unpaired_count: number;
};

export type PhotoCompositeStatus = "pending" | "success" | "failed" | "skipped";
