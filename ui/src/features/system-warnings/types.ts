export type SystemWarningType = "device_offline" | "management_team_no_attendance";

export type SystemWarning = {
  id: string;
  warning_type: SystemWarningType;
  project_id: string;
  project_name?: string | null;
  device_id?: string | null;
  device_name?: string | null;
  serial_number?: string | null;
  worker_id?: string | null;
  worker_name?: string | null;
  team_name?: string | null;
  warning_date: string;
  occurred_at: string;
  title: string;
  message: string;
  details: Record<string, unknown>;
  resolved_at?: string | null;
  created_at: string;
};

export type SystemWarningFilters = {
  page?: number;
  page_size?: number;
  warning_type?: SystemWarningType;
  status?: "active" | "resolved";
  project_id?: string;
  keyword?: string;
};

export type SystemWarningList = {
  items: SystemWarning[];
  total: number;
  page: number;
  page_size: number;
};
