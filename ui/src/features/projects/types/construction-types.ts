type JsonValue =
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
