export type SupplementalAttendanceSendStatus =
  "unassigned" | "pending" | "processing" | "delivered" | "failed" | "skipped";

export type SupplementalAttendanceDeviceStatus =
  "pending" | "accepted" | "success" | "failed";

export type SupplementalAttendanceRecord = {
  id: string;
  config_id: string;
  project_id: string;
  project_name: string | null;
  worker_id: string;
  worker_name: string | null;
  worker_id_card_mask: string | null;
  attendance_date: string;
  direction: 0 | 1;
  shift: string;
  planned_at: string;
  photo_url: string | null;
  device_id: string | null;
  device_name: string | null;
  device_sn: string | null;
  device_type: string | null;
  device_job_id: string | null;
  device_adapter: string | null;
  send_status: SupplementalAttendanceSendStatus;
  send_attempt_count: number;
  sent_at: string | null;
  send_message: string | null;
  device_result_status: SupplementalAttendanceDeviceStatus | null;
  device_result_code: string | null;
  device_result_message: string | null;
  device_reported_at: string | null;
};

export type SupplementalAttendanceSummary = {
  total: number;
  unassigned: number;
  pending_send: number;
  sent: number;
  device_success: number;
  device_failed: number;
};

export type SupplementalAttendanceListResponse = {
  items: SupplementalAttendanceRecord[];
  total: number;
  page: number;
  page_size: number;
  summary: SupplementalAttendanceSummary;
};

export type SupplementalAttendanceListFilters = {
  page: number;
  page_size: number;
  project_id?: string;
  keyword?: string;
  month?: string;
  send_status?: SupplementalAttendanceSendStatus;
  device_status?: SupplementalAttendanceDeviceStatus;
};
