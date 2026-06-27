export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type UploadFileRecord = {
  id: string;
  biz_type: string | null;
  biz_id: string | null;
  field_key: string | null;
  original_filename: string | null;
  object_key: string;
  bucket: string | null;
  endpoint: string | null;
  public_base_url: string;
  public_url: string;
  storage_driver: string;
  content_type: string | null;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
};

export type IdCardOcrSide = "front" | "back";

export type IdCardOcrResult = {
  side: IdCardOcrSide;
  fields: Record<string, string>;
  raw: unknown;
};

export type ConstructionProject = {
  id: string;
  owner_user_id: string | null;
  is_deleted: boolean;
  name: string | null;
  address_code: string | null;
  street: string | null;
  start_date: string | null;
  finish_date: string | null;
  invest_total: number | null;
  investment_nature: number | null;
  labor_cost: number | null;
  status: number | null;
  category: number | null;
  industry: number | null;
  address: string | null;
  longitude: string | null;
  latitude: string | null;
  work_permit: string | null;
  supervision_area: string | null;
  contractor: string | null;
  contractor_credit_code: string | null;
  manager: string | null;
  manager_phone: string | null;
  contract_principal: string | null;
  contract_principal_id_card: string | null;
  contract_principal_phone: string | null;
  party_a: string | null;
  legal_representative: string | null;
  legal_representative_id_card: string | null;
  company_office_address: string | null;
  company_phone: string | null;
  bid_notice: string | null;
  build_unit: string | null;
  build_unit_credit_code: string | null;
  labor_subcontractor: string | null;
  labor_subcontractor_credit_code: string | null;
  build_nature: number | null;
  build_scale: number | null;
  acreage: number | null;
  length: number | null;
  purpose: number | null;
  progress_type: number | null;
  real_name_manager: string | null;
  real_name_manager_phone: string | null;
  labor_manager: string | null;
  labor_manager_phone: string | null;
  complaint_phone: string | null;
  labor_complaint_phone: string | null;
  company_complaint_phone: string | null;
  project_complaint_phone: string | null;
  nationality: string | null;
  manager_id_card: string | null;
  labor_manager_id_card: string | null;
  contract_amount: number | null;
  injury_insurance_number: string | null;
  margin_amount: number | null;
  pay_date: string | null;
  margin_photos: string | null;
  injury_insurance_photos: string | null;
  payment_guarantee_photos: string | null;
  contract_number: string | null;
  contract_prefix: string | null;
  party_a_seal: string | null;
  legal_representative_seal: string | null;
  address_code_list: string | null;
  supervision_area_list: string | null;
  bid_notice_file: JsonValue | null;
  margin_photos_file: JsonValue | null;
  injury_insurance_photos_file: JsonValue | null;
  payment_guarantee_photos_file: JsonValue | null;
  is_inspected: boolean;
  is_handheld_device_enabled: boolean;
  unit_count?: number;
  team_count?: number;
  worker_count?: number;
  attendance_today?: number;
  attendance_rate?: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionProjectOption = {
  id: string;
  name: string | null;
  work_permit: string | null;
  status: number | null;
  address: string | null;
  address_code_list: string | null;
  build_unit: string | null;
  contractor: string | null;
  updated_at: string;
};

export type ConstructionUnit = {
  id: string;
  owner_user_id: string | null;
  is_deleted: boolean;
  project_id: string;
  company_name: string | null;
  company_credit_code: string | null;
  company_type: number | null;
  register_date: string | null;
  register_area: string | null;
  company_address: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  manager_id_card: string | null;
  legal_person_name: string | null;
  legal_person_id_card: string | null;
  company_phone: string | null;
  contract_amount: number | null;
  attachment: string | null;
  register_area_list: string | null;
  attachment_file: JsonValue | null;
  timer_set_a: number | null;
  timer_set_b: number | null;
  timer_set_c: number | null;
  salary_calc_type: number | null;
  quantity_unit_type: number | null;
  seal_photo: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionTeam = {
  id: string;
  owner_user_id: string | null;
  is_deleted: boolean;
  project_id: string;
  unit_id: string;
  name: string | null;
  work_type: number | null;
  is_manage_team: boolean;
  settlement_type: number | null;
  quantity_unit_type: number | null;
  remark: string | null;
  attendance_start_time: string | null;
  attendance_end_time: string | null;
  attendance_is_next_day: boolean;
  leader_id: string | null;
  leader_name: string | null;
  leader_phone: string | null;
  leader_id_card: string | null;
  team_no: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionWorker = {
  id: string;
  owner_user_id: string | null;
  is_deleted: boolean;
  project_id: string;
  unit_id: string;
  team_id: string;
  id_card: string | null;
  name: string | null;
  gender: number;
  nation: string | null;
  visa_office: string | null;
  address: string | null;
  validity_period: string | null;
  ocr_photo: string | null;
  work_type: number | null;
  worker_type: number | null;
  political_status: number | null;
  education: number | null;
  settlement_type: number | null;
  quantity_unit_type: number | null;
  unit_price: number | null;
  salary_bank_card: string | null;
  salary_bank: string | null;
  has_insurance: boolean;
  has_major_medical_history: boolean;
  current_address: string | null;
  dormitory_id: string | null;
  id_card_back_file: string | null;
  phone: string | null;
  is_manage_team: boolean;
  is_key_personnel: boolean;
  avatar: string | null;
  work_status: number;
  labor_contract_file: JsonValue | null;
  settlement_file: JsonValue | null;
  exit_time: string | null;
  auth_status: number;
  auth_fail_reason: string | null;
  manager_type: string | null;
  validity_period_end: string | null;
  entry_time: string | null;
  signature_photo: string | null;
  signature_time: string | null;
  native_place: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionAttendanceRecord = {
  id: string;
  is_deleted: boolean;
  worker_id: string;
  project_id: string;
  direction: number;
  trigger_time: string;
  equipment_id: string | null;
  serial_number: string | null;
  photo_path: string | null;
  overall_photo: string | null;
  closeup_photo: string | null;
  original_time: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionAttendanceCalendarDay = {
  day: number;
  first_in_record_id: string | null;
  first_in_time: string | null;
  last_out_record_id: string | null;
  last_out_time: string | null;
  working_hours: number | null;
  work_point: number | null;
  work_hour_algorithm: string | null;
};

export type ConstructionAttendanceCalendarRow = {
  worker_id: string;
  worker_name: string | null;
  team_id: string | null;
  team_name: string | null;
  total_working_hours: number | null;
  total_work_point: number | null;
  days: ConstructionAttendanceCalendarDay[];
};

export type ConstructionAttendanceCalendarResponse = {
  items: ConstructionAttendanceCalendarRow[];
  month: string;
  view: "calendar";
};

export type ConstructionAttendanceDevice = {
  id: string;
  is_deleted: boolean;
  project_id: string;
  device_type: string;
  serial_number: string | null;
  device_name: string | null;
  direction: number;
  remark: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionAttendanceDeviceIssueAction = "create" | "update" | "delete";
export type ConstructionAttendanceDeviceIssueStatus = "pending" | "success" | "failed";

export type ConstructionAttendanceDeviceIssueReport = {
  id: string;
  is_deleted: boolean;
  project_id: string;
  project_name?: string | null;
  worker_id: string | null;
  attendance_device_id: string | null;
  worker_name: string | null;
  worker_id_card: string | null;
  worker_phone: string | null;
  avatar_url: string | null;
  device_name: string | null;
  serial_number: string | null;
  device_type: string | null;
  action: ConstructionAttendanceDeviceIssueAction;
  status: ConstructionAttendanceDeviceIssueStatus;
  issued_at: string;
  message: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionWageStatus = "draft" | "confirmed" | "paid" | "imported";

export type ConstructionWageSummary = {
  employee_count: number;
  payable_amount_cents: number;
  paid_amount_cents: number;
  unpaid_amount_cents: number;
};

export type ConstructionWageItem = {
  id: string;
  batch_id: string;
  project_id: string;
  is_deleted: boolean;
  worker_id: string | null;
  worker_name: string | null;
  id_card: string | null;
  team_name: string | null;
  attendance_days: string | null;
  monthly_settlement: string | null;
  daily_settlement: string | null;
  wage_card_number: string | null;
  wage_bank: string | null;
  payable_amount_cents: number;
  paid_amount_cents: number;
  adjustment_amount_cents: number;
  unpaid_amount_cents: number;
  adjustment_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionWageBatch = {
  id: string;
  is_deleted: boolean;
  project_id: string;
  payroll_month: string;
  company_name: string | null;
  employee_count: number;
  payable_amount_cents: number;
  paid_amount_cents: number;
  unpaid_amount_cents: number;
  status: ConstructionWageStatus;
  remark: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  items?: ConstructionWageItem[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionWageListResponse = {
  items: ConstructionWageBatch[];
  total: number;
  page: number;
  page_size: number;
  summary: ConstructionWageSummary;
};

export type ConstructionResourceListResponse<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type ConstructionContractTemplate = {
  id: string;
  is_deleted: boolean;
  name: string;
  code: string | null;
  content: string;
  template_file: JsonValue | null;
  template_file_object_key: string | null;
  template_file_name: string | null;
  template_file_content_type: string | null;
  is_enabled: boolean;
  is_default: boolean;
  remark: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionProjectContractTemplateConfig = {
  id: string;
  project_id: string;
  template_id: string | null;
  is_deleted: boolean;
  remark: string | null;
  template_name?: string | null;
  template_code?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionWorkHourConfig = {
  id: string;
  project_id: string;
  project_name?: string | null;
  is_deleted: boolean;
  name: string;
  algorithm_type: string;
  rules: JsonValue;
  is_enabled: boolean;
  remark: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionPlatformConfig = {
  id: string;
  project_id: string;
  project_name?: string | null;
  is_deleted: boolean;
  platform_name: string;
  platform_type: string;
  config: JsonValue;
  is_enabled: boolean;
  remark: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionPlatformLog = {
  id: string;
  project_id: string;
  project_name?: string | null;
  platform_config_id: string | null;
  is_deleted: boolean;
  platform_name: string | null;
  operation: string;
  direction: string;
  status: "success" | "failed" | "pending" | string;
  request_count: number;
  success_count: number;
  failure_count: number;
  message: string | null;
  payload: JsonValue | null;
  occurred_at: string;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConstructionPlatformLogSummary = {
  today_request_count: number;
  today_success_count: number;
  today_failure_count: number;
  today_log_count: number;
};

export type ConstructionPlatformLogListResponse =
  ConstructionResourceListResponse<ConstructionPlatformLog> & {
    summary: ConstructionPlatformLogSummary;
  };

export type ConstructionModuleListFilters = {
  page?: number;
  page_size?: number;
  keyword?: string;
  project_id?: string;
  status?: string;
  platform_type?: string;
  action?: string;
};

export type ConstructionOverviewMetric = {
  status?: number | string | null;
  count: number;
  date?: string;
};

export type ConstructionOverview = {
  project_count: number;
  unit_count: number;
  team_count: number;
  worker_count: number;
  today_attendance_count: number;
  wage_payable_amount_cents: number;
  wage_paid_amount_cents: number;
  wage_unpaid_amount_cents?: number;
  wage_paid_rate_basis_points?: number;
  attendance_7day_count?: number;
  attendance_7day_average?: number;
  project_active_count?: number;
  project_other_count?: number;
  platform_success_count?: number;
  platform_failed_count?: number;
  platform_success_rate_basis_points?: number;
  contract_template_count?: number;
  work_hour_config_count?: number;
  platform_config_count?: number;
  platform_today_request_count: number;
  project_status_distribution: ConstructionOverviewMetric[];
  attendance_trend: Array<{ date: string; count: number }>;
  platform_status_distribution: Array<{ status: string; count: number }>;
};

export type ConstructionResourceListFilters = {
  view?: "list" | "calendar";
  page?: number;
  page_size?: number;
  keyword?: string;
  unit_id?: string;
  team_id?: string;
  company_type?: number;
  salary_calc_type?: number;
  work_type?: number;
  settlement_type?: number;
  work_status?: number;
  direction?: number;
  attendance_date?: string;
  month?: string;
  attendance_month?: string;
  attendance_configured?: boolean;
};

export type ConstructionProjectListFilters = {
  page?: number;
  page_size?: number;
  keyword?: string;
  status?: number;
};

export type ConstructionWageListFilters = {
  payroll_month?: string;
  status?: string;
  page?: number;
  page_size?: number;
};

export type ConstructionWageItemPayload = {
  worker_id?: string;
  worker_name?: string;
  id_card: string;
  team_name?: string;
  attendance_days?: string;
  monthly_settlement?: string;
  daily_settlement?: string;
  wage_card_number?: string;
  wage_bank?: string;
  payable_amount_cents: number;
  paid_amount_cents: number;
  adjustment_amount_cents?: number;
  unpaid_amount_cents?: number;
  adjustment_reason?: string;
};

export type ConstructionWageBatchPayload = {
  payroll_month: string;
  company_name?: string;
  employee_count?: number;
  payable_amount_cents?: number;
  paid_amount_cents?: number;
  unpaid_amount_cents?: number;
  status?: ConstructionWageStatus;
  remark?: string;
  rows?: ConstructionWageItemPayload[];
};

export type ConstructionWageImportPayload = {
  payroll_month: string;
  company_name?: string;
  status?: ConstructionWageStatus;
  rows: ConstructionWageItemPayload[];
};

export type ConstructionContractTemplatePayload = Partial<
  Pick<
    ConstructionContractTemplate,
    | "name"
    | "code"
    | "content"
    | "template_file"
    | "template_file_object_key"
    | "template_file_name"
    | "template_file_content_type"
    | "is_enabled"
    | "is_default"
    | "remark"
  >
>;

export type ConstructionProjectContractTemplatePayload = {
  template_id: string | null;
  remark?: string | null;
};

export type ConstructionWorkHourConfigPayload = Partial<
  Pick<
    ConstructionWorkHourConfig,
    "project_id" | "name" | "algorithm_type" | "rules" | "is_enabled" | "remark"
  >
>;

export type ConstructionPlatformConfigPayload = Partial<
  Pick<
    ConstructionPlatformConfig,
    "project_id" | "platform_name" | "platform_type" | "config" | "is_enabled" | "remark"
  >
>;

export type ConstructionPlatformLogPayload = Partial<
  Pick<
    ConstructionPlatformLog,
    | "project_id"
    | "platform_config_id"
    | "platform_name"
    | "operation"
    | "direction"
    | "status"
    | "request_count"
    | "success_count"
    | "failure_count"
    | "message"
    | "payload"
    | "occurred_at"
  >
>;

type WritableKeys =
  | "id"
  | "owner_user_id"
  | "is_deleted"
  | "project_id"
  | "created_at"
  | "updated_at"
  | "deleted_at";

export type ConstructionProjectPayload = Partial<
  Omit<ConstructionProject, WritableKeys>
>;
export type ConstructionUnitPayload = Partial<Omit<ConstructionUnit, WritableKeys>>;
export type ConstructionTeamPayload = Partial<Omit<ConstructionTeam, WritableKeys>>;
export type ConstructionWorkerPayload = Partial<Omit<ConstructionWorker, WritableKeys>>;
export type ConstructionAttendancePayload = Partial<
  Omit<ConstructionAttendanceRecord, WritableKeys>
>;
export type ConstructionAttendanceDevicePayload = Partial<
  Omit<ConstructionAttendanceDevice, WritableKeys>
>;
export type ConstructionAttendanceDeviceIssueReportPayload = Partial<
  Pick<
    ConstructionAttendanceDeviceIssueReport,
    | "project_id"
    | "worker_id"
    | "attendance_device_id"
    | "worker_name"
    | "worker_id_card"
    | "worker_phone"
    | "avatar_url"
    | "device_name"
    | "serial_number"
    | "device_type"
    | "action"
    | "status"
    | "issued_at"
    | "message"
    | "remark"
  >
>;
