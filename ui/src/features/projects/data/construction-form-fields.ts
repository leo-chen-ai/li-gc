type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ConstructionFormState = Record<string, string>;

export type ConstructionFormOption = {
  label: string;
  value: string;
};

export type ConstructionFormField = {
  key: string;
  label: string;
  valueType: "string" | "number" | "boolean" | "json" | "date" | "datetime";
  control?: "input" | "select" | "textarea" | "upload" | "region";
  uploadKind?: "image" | "file";
  uploadMultiple?: boolean;
  required?: boolean;
  hidden?: boolean;
  defaultValue?: string;
  section?: string;
  placeholder?: string;
  options?: ConstructionFormOption[];
  optionsSource?: "units" | "teams" | "workers";
  wide?: boolean;
};

export type ConstructionPayloadValue = string | number | boolean | JsonValue | null;
export type ConstructionPayload = Record<string, ConstructionPayloadValue>;

const yesNoOptions: ConstructionFormOption[] = [
  { label: "是", value: "true" },
  { label: "否", value: "false" },
];

const projectStatusOptions: ConstructionFormOption[] = [
  { label: "筹备", value: "3" },
  { label: "在建", value: "5" },
  { label: "完工", value: "6" },
  { label: "停工", value: "7" },
  { label: "竣工", value: "8" },
];

const investmentNatureOptions: ConstructionFormOption[] = [
  { label: "政府", value: "2" },
  { label: "非政府", value: "1" },
];

const projectCategoryOptions: ConstructionFormOption[] = [
  { label: "房屋建筑工程", value: "9" },
  { label: "市政公用工程", value: "10" },
  { label: "机电安装工程", value: "11" },
  { label: "铁路工程", value: "12" },
  { label: "公路工程", value: "13" },
  { label: "港口与航道工程", value: "14" },
  { label: "水利水电工程", value: "15" },
  { label: "电力工程", value: "16" },
  { label: "矿山工程", value: "17" },
  { label: "冶炼工程", value: "18" },
  { label: "化工石油工程", value: "19" },
  { label: "通信工程", value: "20" },
  { label: "其他", value: "21" },
  { label: "城管", value: "22" },
];

const industryOptions: ConstructionFormOption[] = [
  { label: "住建行业", value: "23" },
  { label: "交通行业", value: "24" },
  { label: "水利行业", value: "25" },
  { label: "装饰装修行业", value: "26" },
];

const buildNatureOptions: ConstructionFormOption[] = [
  { label: "新建", value: "27" },
  { label: "改建", value: "28" },
  { label: "扩建", value: "29" },
  { label: "恢复", value: "30" },
  { label: "迁建", value: "31" },
  { label: "拆除", value: "32" },
  { label: "其他", value: "33" },
];

const buildScaleOptions: ConstructionFormOption[] = [
  { label: "大型", value: "34" },
  { label: "中型", value: "35" },
  { label: "小型", value: "36" },
];

const projectPurposeOptions: ConstructionFormOption[] = [
  { label: "居住建筑", value: "37" },
  { label: "居住建筑配套工程", value: "38" },
  { label: "公共建筑", value: "39" },
  { label: "办公建筑", value: "40" },
  { label: "商业建筑", value: "41" },
  { label: "旅游建筑", value: "42" },
  { label: "科教文卫建筑", value: "43" },
  { label: "交通运输类", value: "44" },
  { label: "通信建筑", value: "45" },
  { label: "公共建筑配套工程", value: "46" },
  { label: "商住楼", value: "47" },
  { label: "农业建筑", value: "48" },
  { label: "农业建筑配套工程", value: "49" },
  { label: "工业建筑", value: "50" },
  { label: "工业建筑配套工程", value: "51" },
  { label: "其他", value: "52" },
  { label: "给水", value: "53" },
  { label: "排水", value: "54" },
];

const progressTypeOptions: ConstructionFormOption[] = [
  { label: "开工条件审查", value: "68" },
  { label: "桩基工程", value: "69" },
  { label: "基坑工程", value: "70" },
  { label: "主体30%", value: "71" },
  { label: "主体80%", value: "72" },
  { label: "预验收扫尾", value: "73" },
  { label: "装饰装修", value: "1263" },
  { label: "预验收扫尾", value: "1264" },
];

export const projectFormFields: ConstructionFormField[] = [
  { key: "name", label: "项目名称", valueType: "string", required: true, section: "基本信息" },
  {
    key: "status",
    label: "项目状态",
    valueType: "number",
    control: "select",
    defaultValue: "5",
    section: "基本信息",
    options: projectStatusOptions,
  },
  { key: "work_permit", label: "施工许可证", valueType: "string", section: "基本信息" },
  { key: "start_date", label: "开工日期", valueType: "date", section: "基本信息" },
  { key: "finish_date", label: "竣工日期", valueType: "date", section: "基本信息" },
  { key: "address_code", label: "行政区划", valueType: "string", control: "region", section: "基本信息", wide: true },
  { key: "address_code_list", label: "行政区划名称", valueType: "string", section: "基本信息", hidden: true },
  { key: "street", label: "街道", valueType: "string", section: "基本信息", hidden: true },
  { key: "address", label: "项目地址", valueType: "string", section: "基本信息", wide: true },

  { key: "invest_total", label: "总投资", valueType: "number", section: "基本信息" },
  {
    key: "investment_nature",
    label: "投资性质",
    valueType: "number",
    control: "select",
    section: "基本信息",
    options: investmentNatureOptions,
  },
  { key: "labor_cost", label: "总劳务费", valueType: "number", section: "基本信息" },
  {
    key: "category",
    label: "项目分类",
    valueType: "number",
    control: "select",
    section: "基本信息",
    options: projectCategoryOptions,
  },
  {
    key: "industry",
    label: "所属行业",
    valueType: "number",
    control: "select",
    section: "基本信息",
    options: industryOptions,
  },
  {
    key: "build_nature",
    label: "建设性质",
    valueType: "number",
    control: "select",
    section: "其他信息",
    options: buildNatureOptions,
  },
  {
    key: "build_scale",
    label: "建设规模",
    valueType: "number",
    control: "select",
    section: "其他信息",
    options: buildScaleOptions,
  },
  { key: "acreage", label: "建筑面积", valueType: "number", section: "其他信息" },
  { key: "length", label: "长度", valueType: "number", section: "其他信息" },
  {
    key: "purpose",
    label: "用途",
    valueType: "number",
    control: "select",
    section: "其他信息",
    options: projectPurposeOptions,
  },
  {
    key: "progress_type",
    label: "进度类型",
    valueType: "number",
    control: "select",
    section: "其他信息",
    options: progressTypeOptions,
  },
  { key: "contract_amount", label: "合同金额", valueType: "number", section: "额外信息" },
  { key: "margin_amount", label: "保证金金额", valueType: "number", section: "额外信息" },
  { key: "pay_date", label: "支付日期", valueType: "date", section: "额外信息" },

  { key: "contractor", label: "总承包单位", valueType: "string", section: "单位信息" },
  { key: "contractor_credit_code", label: "总承包信用代码", valueType: "string", section: "单位信息" },
  { key: "build_unit", label: "建设单位", valueType: "string", section: "单位信息" },
  { key: "build_unit_credit_code", label: "建设单位信用代码", valueType: "string", section: "单位信息" },
  { key: "labor_subcontractor", label: "劳务分包单位", valueType: "string", section: "单位信息" },
  { key: "labor_subcontractor_credit_code", label: "劳务分包信用代码", valueType: "string", section: "单位信息" },
  { key: "party_a", label: "甲方", valueType: "string", section: "单位信息" },
  { key: "legal_representative", label: "法定代表人", valueType: "string", section: "单位信息" },
  { key: "legal_representative_id_card", label: "法人身份证", valueType: "string", section: "单位信息" },
  { key: "company_office_address", label: "公司办公地址", valueType: "string", section: "单位信息", wide: true },
  { key: "company_phone", label: "公司电话", valueType: "string", section: "单位信息" },
  { key: "bid_notice", label: "中标通知书", valueType: "string", section: "单位信息" },

  { key: "manager", label: "项目经理", valueType: "string", section: "单位信息" },
  { key: "manager_phone", label: "项目经理手机号", valueType: "string", section: "单位信息" },
  { key: "manager_id_card", label: "项目经理身份证", valueType: "string", section: "额外信息" },
  { key: "contract_principal", label: "合同负责人", valueType: "string", section: "单位信息" },
  { key: "contract_principal_id_card", label: "合同负责人身份证", valueType: "string", section: "额外信息" },
  { key: "contract_principal_phone", label: "合同负责人手机号", valueType: "string", section: "单位信息" },
  { key: "real_name_manager", label: "实名制专管员", valueType: "string", section: "其他信息" },
  { key: "real_name_manager_phone", label: "实名制专管员手机号", valueType: "string", section: "其他信息" },
  { key: "labor_manager", label: "劳资专管员", valueType: "string", section: "其他信息" },
  { key: "labor_manager_phone", label: "劳资专管员手机号", valueType: "string", section: "其他信息" },
  { key: "labor_manager_id_card", label: "劳资专管员身份证", valueType: "string", section: "额外信息" },
  { key: "complaint_phone", label: "投诉电话", valueType: "string", section: "其他信息" },
  { key: "labor_complaint_phone", label: "劳资投诉电话", valueType: "string", section: "其他信息" },
  { key: "company_complaint_phone", label: "公司投诉电话", valueType: "string", section: "其他信息" },
  { key: "project_complaint_phone", label: "项目投诉电话", valueType: "string", section: "其他信息" },
  { key: "nationality", label: "国籍", valueType: "string", section: "额外信息" },

  { key: "injury_insurance_number", label: "工伤保险编号", valueType: "string", section: "额外信息" },
  { key: "margin_photos", label: "保证金图片", valueType: "string", control: "upload", uploadKind: "image", section: "额外信息" },
  { key: "injury_insurance_photos", label: "工伤保险图片", valueType: "string", control: "upload", uploadKind: "image", section: "额外信息" },
  { key: "payment_guarantee_photos", label: "支付担保图片", valueType: "string", control: "upload", uploadKind: "image", section: "额外信息" },
  { key: "contract_number", label: "合同编号", valueType: "string", section: "额外信息" },
  { key: "contract_prefix", label: "合同前缀", valueType: "string", section: "额外信息" },
  { key: "party_a_seal", label: "甲方印章", valueType: "string", control: "upload", uploadKind: "image", section: "额外信息" },
  { key: "legal_representative_seal", label: "法人印章", valueType: "string", control: "upload", uploadKind: "image", section: "额外信息" },
  { key: "bid_notice_file", label: "中标通知书文件", valueType: "json", control: "upload", uploadKind: "file", uploadMultiple: true, section: "额外信息", wide: true },
  { key: "margin_photos_file", label: "保证金文件", valueType: "json", control: "upload", uploadKind: "image", uploadMultiple: true, section: "额外信息", wide: true },
  { key: "injury_insurance_photos_file", label: "工伤保险文件", valueType: "json", control: "upload", uploadKind: "image", uploadMultiple: true, section: "额外信息", wide: true },
  { key: "payment_guarantee_photos_file", label: "支付担保文件", valueType: "json", control: "upload", uploadKind: "file", uploadMultiple: true, section: "额外信息", wide: true },
];

export const unitFormFields: ConstructionFormField[] = [
  { key: "company_name", label: "单位名称", valueType: "string", required: true, section: "基础信息" },
  { key: "company_credit_code", label: "统一社会信用代码", valueType: "string", section: "基础信息" },
  { key: "company_type", label: "单位类型", valueType: "number", section: "基础信息" },
  { key: "register_date", label: "注册日期", valueType: "date", section: "基础信息" },
  { key: "register_area", label: "注册区域", valueType: "string", section: "基础信息" },
  { key: "register_area_list", label: "注册区域名称", valueType: "string", section: "基础信息" },
  { key: "company_address", label: "单位地址", valueType: "string", section: "基础信息", wide: true },
  { key: "company_phone", label: "单位电话", valueType: "string", section: "基础信息" },
  { key: "manager_name", label: "负责人", valueType: "string", section: "负责人" },
  { key: "manager_phone", label: "负责人手机号", valueType: "string", section: "负责人" },
  { key: "manager_id_card", label: "负责人身份证", valueType: "string", section: "负责人" },
  { key: "legal_person_name", label: "法人姓名", valueType: "string", section: "负责人" },
  { key: "legal_person_id_card", label: "法人身份证", valueType: "string", section: "负责人" },
  { key: "contract_amount", label: "合同金额", valueType: "number", section: "合同计薪" },
  { key: "salary_calc_type", label: "计薪方式", valueType: "number", section: "合同计薪" },
  { key: "quantity_unit_type", label: "计量单位", valueType: "number", section: "合同计薪" },
  { key: "timer_set_a", label: "计时设置 A", valueType: "number", section: "合同计薪" },
  { key: "timer_set_b", label: "计时设置 B", valueType: "number", section: "合同计薪" },
  { key: "timer_set_c", label: "计时设置 C", valueType: "number", section: "合同计薪" },
  { key: "attachment", label: "附件", valueType: "string", control: "upload", uploadKind: "file", section: "资料附件" },
  { key: "attachment_file", label: "附件文件", valueType: "json", control: "upload", uploadKind: "file", uploadMultiple: true, section: "资料附件", wide: true },
  { key: "seal_photo", label: "印章图片", valueType: "string", control: "upload", uploadKind: "image", section: "资料附件" },
];

export const teamFormFields: ConstructionFormField[] = [
  { key: "unit_id", label: "参建单位", valueType: "string", control: "select", required: true, section: "基础信息", optionsSource: "units" },
  { key: "name", label: "班组名称", valueType: "string", required: true, section: "基础信息" },
  { key: "team_no", label: "班组编号", valueType: "string", section: "基础信息" },
  { key: "work_type", label: "工种", valueType: "number", section: "基础信息" },
  { key: "is_manage_team", label: "是否管理班组", valueType: "boolean", control: "select", defaultValue: "false", section: "基础信息", options: yesNoOptions },
  { key: "settlement_type", label: "结算方式", valueType: "number", section: "结算考勤" },
  { key: "quantity_unit_type", label: "计量单位", valueType: "number", section: "结算考勤" },
  { key: "attendance_start_time", label: "考勤开始时间", valueType: "string", defaultValue: "06:00", section: "结算考勤" },
  { key: "attendance_end_time", label: "考勤结束时间", valueType: "string", defaultValue: "18:00", section: "结算考勤" },
  { key: "attendance_is_next_day", label: "考勤跨天", valueType: "boolean", control: "select", defaultValue: "false", section: "结算考勤", options: yesNoOptions },
  { key: "leader_id", label: "班组长 ID", valueType: "string", section: "班组长" },
  { key: "leader_name", label: "班组长姓名", valueType: "string", section: "班组长" },
  { key: "leader_phone", label: "班组长手机号", valueType: "string", section: "班组长" },
  { key: "leader_id_card", label: "班组长身份证", valueType: "string", section: "班组长" },
  { key: "remark", label: "备注", valueType: "string", control: "textarea", section: "班组长", wide: true },
];

export const workerFormFields: ConstructionFormField[] = [
  { key: "unit_id", label: "参建单位", valueType: "string", control: "select", required: true, section: "基础信息", optionsSource: "units" },
  { key: "team_id", label: "所属班组", valueType: "string", control: "select", required: true, section: "基础信息", optionsSource: "teams" },
  { key: "name", label: "姓名", valueType: "string", required: true, section: "基础信息" },
  { key: "id_card", label: "身份证号", valueType: "string", section: "基础信息" },
  {
    key: "gender",
    label: "性别",
    valueType: "number",
    control: "select",
    defaultValue: "1",
    section: "基础信息",
    options: [
      { label: "女", value: "0" },
      { label: "男", value: "1" },
    ],
  },
  { key: "nation", label: "民族", valueType: "string", section: "基础信息" },
  { key: "phone", label: "手机号", valueType: "string", section: "基础信息" },
  { key: "address", label: "户籍地址", valueType: "string", section: "基础信息", wide: true },
  { key: "current_address", label: "现居地址", valueType: "string", section: "基础信息", wide: true },
  { key: "native_place", label: "籍贯", valueType: "number", section: "基础信息" },
  { key: "visa_office", label: "签发机关", valueType: "string", section: "证件资料" },
  { key: "validity_period", label: "证件有效期", valueType: "string", section: "证件资料" },
  { key: "validity_period_end", label: "证件有效期结束", valueType: "string", section: "证件资料" },
  { key: "ocr_photo", label: "身份证正面图片", valueType: "string", control: "upload", uploadKind: "image", section: "证件资料" },
  { key: "id_card_back_file", label: "身份证背面图片", valueType: "string", control: "upload", uploadKind: "image", section: "证件资料" },
  { key: "avatar", label: "头像", valueType: "string", control: "upload", uploadKind: "image", section: "证件资料" },
  { key: "signature_photo", label: "签名图片", valueType: "string", control: "upload", uploadKind: "image", section: "证件资料" },
  { key: "signature_time", label: "签名日期", valueType: "date", section: "证件资料" },
  { key: "work_type", label: "工种", valueType: "number", section: "用工信息" },
  { key: "worker_type", label: "工人类型", valueType: "number", section: "用工信息" },
  { key: "political_status", label: "政治面貌", valueType: "number", section: "用工信息" },
  { key: "education", label: "学历", valueType: "number", section: "用工信息" },
  { key: "manager_type", label: "管理人员类型", valueType: "string", section: "用工信息" },
  { key: "work_status", label: "在场状态", valueType: "number", defaultValue: "1", section: "用工信息" },
  { key: "auth_status", label: "实名状态", valueType: "number", defaultValue: "1", section: "用工信息" },
  { key: "auth_fail_reason", label: "认证失败原因", valueType: "string", section: "用工信息", wide: true },
  { key: "entry_time", label: "进场日期", valueType: "date", section: "用工信息" },
  { key: "exit_time", label: "退场日期", valueType: "date", section: "用工信息" },
  { key: "is_manage_team", label: "是否班组管理", valueType: "boolean", control: "select", defaultValue: "false", section: "用工信息", options: yesNoOptions },
  { key: "is_key_personnel", label: "是否关键人员", valueType: "boolean", control: "select", defaultValue: "false", section: "用工信息", options: yesNoOptions },
  { key: "settlement_type", label: "结算方式", valueType: "number", section: "薪资保险" },
  { key: "quantity_unit_type", label: "计量单位", valueType: "number", section: "薪资保险" },
  { key: "unit_price", label: "单价", valueType: "number", section: "薪资保险" },
  { key: "salary_bank_card", label: "工资卡号", valueType: "string", section: "薪资保险" },
  { key: "salary_bank", label: "开户行", valueType: "string", section: "薪资保险" },
  { key: "has_insurance", label: "是否参保", valueType: "boolean", control: "select", defaultValue: "false", section: "薪资保险", options: yesNoOptions },
  { key: "has_major_medical_history", label: "重大病史", valueType: "boolean", control: "select", defaultValue: "false", section: "薪资保险", options: yesNoOptions },
  { key: "dormitory_id", label: "宿舍 ID", valueType: "string", section: "资料附件" },
  { key: "labor_contract_file", label: "劳动合同", valueType: "json", control: "upload", uploadKind: "file", uploadMultiple: true, section: "资料附件", wide: true },
  { key: "settlement_file", label: "结算资料", valueType: "json", control: "upload", uploadKind: "file", uploadMultiple: true, section: "资料附件", wide: true },
];

export const attendanceFormFields: ConstructionFormField[] = [
  { key: "worker_id", label: "工人", valueType: "string", control: "select", required: true, section: "基础信息", optionsSource: "workers" },
  {
    key: "direction",
    label: "进出方向",
    valueType: "number",
    control: "select",
    defaultValue: "0",
    section: "基础信息",
    options: [
      { label: "进场", value: "0" },
      { label: "出场", value: "1" },
    ],
  },
  { key: "trigger_time", label: "考勤时间", valueType: "datetime", required: true, section: "基础信息" },
  { key: "original_time", label: "原始时间", valueType: "string", section: "基础信息" },
  { key: "equipment_id", label: "设备 ID", valueType: "string", section: "设备照片" },
  { key: "serial_number", label: "设备序列号", valueType: "string", section: "设备照片" },
  { key: "photo_path", label: "照片路径", valueType: "string", control: "upload", uploadKind: "image", section: "设备照片" },
  { key: "overall_photo", label: "全景照片", valueType: "string", control: "upload", uploadKind: "image", section: "设备照片", wide: true },
  { key: "closeup_photo", label: "近景照片", valueType: "string", control: "upload", uploadKind: "image", section: "设备照片", wide: true },
];

export function buildDefaultFormState(
  fields: ConstructionFormField[],
  overrides: ConstructionFormState = {}
): ConstructionFormState {
  return fields.reduce<ConstructionFormState>((state, field) => {
    state[field.key] = overrides[field.key] ?? field.defaultValue ?? "";
    return state;
  }, {});
}

export function buildFormStateFromRecord(
  fields: ConstructionFormField[],
  record: Record<string, unknown> | undefined,
  overrides: ConstructionFormState = {}
): ConstructionFormState {
  return fields.reduce<ConstructionFormState>((state, field) => {
    if (overrides[field.key] !== undefined) {
      state[field.key] = overrides[field.key];
      return state;
    }

    state[field.key] = valueToFormString(field, record?.[field.key]);
    return state;
  }, {});
}

export function buildPayloadFromForm(
  fields: ConstructionFormField[],
  state: ConstructionFormState
): ConstructionPayload {
  return fields.reduce<ConstructionPayload>((payload, field) => {
    const rawValue = state[field.key]?.trim() ?? "";

    if (field.required && rawValue.length === 0) {
      throw new Error(`请填写${field.label}`);
    }

    if (field.valueType === "boolean") {
      payload[field.key] = rawValue === "true";
      return payload;
    }

    if (rawValue.length === 0) {
      payload[field.key] = null;
      return payload;
    }

    if (field.valueType === "number") {
      const numberValue = Number(rawValue);
      if (!Number.isFinite(numberValue)) {
        throw new Error(`${field.label}必须是数字`);
      }
      payload[field.key] = numberValue;
      return payload;
    }

    if (field.valueType === "json") {
      try {
        payload[field.key] = JSON.parse(rawValue) as JsonValue;
      } catch {
        throw new Error(`${field.label}必须是有效 JSON`);
      }
      return payload;
    }

    if (field.valueType === "datetime") {
      const date = new Date(rawValue);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`${field.label}时间格式无效`);
      }
      payload[field.key] = date.toISOString();
      return payload;
    }

    payload[field.key] = rawValue;
    return payload;
  }, {});
}

export function getFieldsBySection(fields: ConstructionFormField[]) {
  return fields.filter((field) => !field.hidden).reduce<Array<{ section: string; fields: ConstructionFormField[] }>>(
    (sections, field) => {
      const section = field.section ?? "其他";
      const existing = sections.find((item) => item.section === section);
      if (existing) {
        existing.fields.push(field);
      } else {
        sections.push({ section, fields: [field] });
      }
      return sections;
    },
    []
  );
}

export function datetimeLocalNow() {
  return toDatetimeLocal(new Date().toISOString());
}

function valueToFormString(field: ConstructionFormField, value: unknown) {
  if (value == null) return field.defaultValue ?? "";
  if (field.valueType === "json") return JSON.stringify(value, null, 2);
  if (field.valueType === "datetime" && typeof value === "string") {
    return toDatetimeLocal(value);
  }
  return String(value);
}

function toDatetimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}
