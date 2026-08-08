import type { ConstructionResourceListResponse } from "@/features/projects/types/construction-types";

export type ManagedAttendanceShift = "day" | "night";

export type ManagedAttendanceConfigLike = {
  monthly_attendance_days: number;
  shift: ManagedAttendanceShift | string;
  check_in_time: string;
  check_out_time: string;
};

export type ManagedAttendancePhotoGroupLike = {
  generation_status: string;
  in_photos?: string[] | null;
  out_photos?: string[] | null;
};

export type ManagedAttendancePhotoGroup = ManagedAttendancePhotoGroupLike & {
  id: string;
  project_id: string;
  project_name?: string | null;
  name: string;
  remark?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ManagedAttendancePhotoGroupPayload = {
  project_id: string;
  name: string;
  generation_status?: string;
  in_photos: string[];
  out_photos: string[];
  remark?: string | null;
};

export type ManagedAttendanceConfig = ManagedAttendanceConfigLike & {
  id: string;
  project_id: string;
  project_name?: string | null;
  worker_id: string;
  worker_name?: string | null;
  worker_id_card?: string | null;
  attendance_device_id?: string | null;
  attendance_device_name?: string | null;
  attendance_device_serial_number?: string | null;
  attendance_device_type?: string | null;
  photo_group_id?: string | null;
  photo_group_name?: string | null;
  team_name?: string | null;
  in_photos?: string[] | null;
  out_photos?: string[] | null;
  managed_record_count?: number;
  last_generated_at?: string | null;
  last_generated_month?: string | null;
  pending_count?: number;
  success_count?: number;
  failed_count?: number;
  is_enabled: boolean;
  remark?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ManagedAttendanceConfigPayload = {
  project_id: string;
  worker_id: string;
  attendance_device_id?: string | null;
  photo_group_id?: string | null;
  monthly_attendance_days: number;
  shift: ManagedAttendanceShift;
  check_in_time: string;
  check_out_time: string;
  is_enabled: boolean;
  remark?: string | null;
};

export type ManagedAttendanceRecord = {
  id: string;
  config_id: string;
  project_id: string;
  project_name?: string | null;
  worker_id: string;
  worker_name?: string | null;
  worker_id_card_mask?: string | null;
  photo_group_id?: string | null;
  photo_group_name?: string | null;
  attendance_date: string;
  direction: 0 | 1;
  shift: ManagedAttendanceShift;
  planned_at: string;
  photo_url?: string | null;
  status: string;
  dispatch_status: "pending" | "processing" | "success" | "failed" | "skipped";
  dispatched_at?: string | null;
  dispatch_message?: string | null;
  error_message?: string | null;
};

export type ManagedAttendanceListFilters = {
  project_id?: string;
  worker_id?: string;
  config_id?: string;
  keyword?: string;
  status?: string;
  month?: string;
  page?: number;
  page_size?: number;
};

export type ManagedAttendanceGenerateResult = {
  config_id: string;
  month: string;
  attendance_days: number;
  generated_count: number;
};

export type ManagedAttendancePhotoGroupListResponse =
  ConstructionResourceListResponse<ManagedAttendancePhotoGroup>;
export type ManagedAttendanceConfigListResponse =
  ConstructionResourceListResponse<ManagedAttendanceConfig>;
export type ManagedAttendanceRecordListResponse =
  ConstructionResourceListResponse<ManagedAttendanceRecord>;
