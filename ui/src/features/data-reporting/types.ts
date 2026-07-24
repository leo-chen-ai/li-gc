export type LifecycleStatus = "draft" | "testing" | "production" | "paused";
export type RunStatus = "pending" | "running" | "cancelling" | "cancelled" | "success" | "partial_success" | "failed";
export type RunMode =
  | "production" | "test_source_login" | "test_project_list" | "test_download"
  | "test_transform" | "test_target_login" | "test_upload_validate" | "test_submit" | "test_full";

export interface ReportConfig {
  id: string;
  name: string;
  adapter: string;
  source_base_url: string;
  source_username: string;
  source_password_configured: boolean;
  source_password?: string;
  project_mode: "all" | "selected";
  include_projects: string[];
  exclude_projects: string[];
  target_base_url: string;
  target_username: string;
  target_password_configured: boolean;
  target_password?: string;
  verification_type: "feishu" | "manual";
  verification_configured: boolean;
  verification_config?: { app_id?: string; app_secret?: string; chat_id?: string; poll_interval?: number } | null;
  schedule_time: string;
  schedule_timezone: string;
  lifecycle_status: LifecycleStatus;
  is_enabled: boolean;
  next_run_at: string | null;
  settings: Record<string, unknown>;
  remark: string | null;
  active_run_count: number;
  created_at: string;
  updated_at: string;
}

export interface ReportConfigPayload {
  name: string;
  source_base_url: string;
  source_username: string;
  source_password?: string;
  project_mode: "all" | "selected";
  include_projects: string[];
  exclude_projects: string[];
  target_base_url: string;
  target_username: string;
  target_password?: string;
  verification_type: "feishu";
  verification_config?: { app_id: string; app_secret: string; chat_id: string; poll_interval: number };
  schedule_time: string;
  schedule_timezone: "Asia/Shanghai";
  lifecycle_status: LifecycleStatus;
  is_enabled: boolean;
  settings: { headless: boolean; upload_timeout_minutes: number; latest_entry_days: number };
  remark: string | null;
}

export interface WorkerStatus {
  worker_id: string;
  pod_name: string | null;
  status: "idle" | "busy" | "offline";
  current_run_id: string | null;
  worker_version: string | null;
  last_seen_at: string;
}

export interface ReportSummary {
  config_count: number;
  enabled_config_count: number;
  running_count: number;
  queued_count: number;
  today_success_count: number;
  today_failure_count: number;
  today_item_count: number;
  workers: WorkerStatus[];
}

export interface RunProject {
  id: string;
  external_project_name: string;
  status: string;
  current_stage: string;
  converted_row_count: number;
  upload_total_count: number;
  upload_success_count: number;
  upload_failure_count: number;
  target_receipt?: {
    person_details_available?: boolean;
    already_exists?: boolean;
  } | null;
  last_error: string | null;
}

export interface RunEvent {
  id: number;
  stage: string;
  level: "debug" | "info" | "warning" | "error";
  message: string;
  created_at: string;
}

export interface RunArtifact {
  id: string;
  artifact_type: string;
  original_filename: string;
  byte_size: number;
  sha256: string;
  created_at: string;
}

export interface ReportRun {
  id: string;
  config_id: string | null;
  config_name: string;
  trigger_type: string;
  run_mode: RunMode;
  status: RunStatus;
  current_stage: string;
  discovered_count: number;
  downloaded_count: number;
  converted_count: number;
  item_count: number;
  uploaded_count: number;
  success_count: number;
  failure_count: number;
  cancel_requested: boolean;
  claimed_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_summary: string | null;
  created_at: string;
  projects?: RunProject[];
  items?: ReportItem[];
  events?: RunEvent[];
  artifacts?: RunArtifact[];
}

export interface ReportItem {
  id: string;
  project_name: string;
  source_row_no: number | null;
  person_name: string;
  gender: string | null;
  identity_masked: string | null;
  phone_masked: string | null;
  status: string;
  target_result?: {
    status?: string;
    already_exists?: boolean;
    total_rows?: number;
    success_rows?: number;
    failure_rows?: number;
    person_details_available?: boolean;
  } | null;
  last_error: string | null;
  pushed_at: string | null;
}

export interface ResultCounts { all: number; success: number; failed: number; unknown: number }
export interface PageResult<T> { items: T[]; total: number; page: number; page_size: number; counts?: ResultCounts }
