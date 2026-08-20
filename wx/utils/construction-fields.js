// 籍贯推断改用全国省市数据，保留同名导出供旧调用方使用
const { inferNativePlaceFromAddress } = require("./china-regions.js");

const yesNoOptions = [
  { label: "是", value: "true" },
  { label: "否", value: "false" },
];

const deviceTypeOptions = [
  { label: "海厂家", value: "海厂家" },
  { label: "弹厂家", value: "弹厂家" },
  { label: "芊熠厂家", value: "芊熠厂家" },
];

const companyTypeOptions = [
  { label: "总承包单位", value: "1" },
  { label: "监理", value: "2" },
  { label: "劳务分包", value: "3" },
  { label: "建设单位", value: "4" },
  { label: "专业分包", value: "5" },
  { label: "设备分包", value: "6" },
  { label: "材料分包", value: "7" },
  { label: "后勤服务", value: "8" },
  { label: "特殊服务", value: "9" },
  { label: "勘察", value: "10" },
  { label: "设计单位", value: "11" },
  { label: "其它", value: "12" },
];

const salaryCalcTypeOptions = [
  { label: "按上级配置", value: "0" },
  { label: "按日", value: "1" },
  { label: "按月", value: "2" },
  { label: "按周", value: "3" },
  { label: "劳务派遣合同", value: "4" },
  { label: "按小时", value: "5" },
  { label: "计件", value: "6" },
  { label: "按量", value: "7" },
  { label: "其他", value: "9" },
];

const unitSalaryCalcTypeOptions = salaryCalcTypeOptions.filter((item) => item.value !== "0");

const quantityUnitTypeOptions = [
  { label: "平方", value: "1" },
  { label: "米", value: "2" },
  { label: "吨", value: "3" },
  { label: "件", value: "4" },
  { label: "套", value: "5" },
  { label: "立方", value: "6" },
];

const workTypeOptions = [
  { label: "钢筋工", value: "1" },
  { label: "木工", value: "2" },
  { label: "安装工", value: "3" },
  { label: "架子工", value: "4" },
  { label: "混凝土工", value: "5" },
  { label: "瓦工", value: "6" },
  { label: "电工", value: "7" },
  { label: "焊工", value: "8" },
  { label: "水工", value: "9" },
  { label: "测量工", value: "10" },
  { label: "抹灰工", value: "11" },
  { label: "油漆工", value: "12" },
  { label: "防水工", value: "13" },
  { label: "机械司机", value: "14" },
  { label: "其他", value: "900" },
];

// 班组工种多一个项目管理部（1001），与 Web 端保持一致：管理班组时只能选它
const teamWorkTypeOptions = [{ label: "项目管理部", value: "1001" }].concat(workTypeOptions);

const workerTypeOptions = [
  { label: "建筑工人", value: "1" },
  { label: "管理人员", value: "1001" },
  { label: "其他", value: "9" },
];

const politicalStatusOptions = [
  { label: "群众", value: "1" },
  { label: "中共党员", value: "2" },
  { label: "中共预备党员", value: "3" },
  { label: "共青团员", value: "4" },
  { label: "民主党派", value: "5" },
  { label: "其他", value: "9" },
];

const managerTypeOptions = [
  { label: "项目经理", value: "1" },
  { label: "技术负责人", value: "2" },
  { label: "施工员", value: "3" },
  { label: "质量员", value: "4" },
  { label: "安全员", value: "5" },
  { label: "材料员", value: "6" },
  { label: "资料员", value: "7" },
  { label: "劳资专管员", value: "8" },
  { label: "实名制专管员", value: "9" },
  { label: "其他", value: "99" },
];

const educationOptions = [
  { label: "小学", value: "1" },
  { label: "初中", value: "2" },
  { label: "高中", value: "3" },
  { label: "中专", value: "4" },
  { label: "大专", value: "5" },
  { label: "本科", value: "6" },
  { label: "硕士及以上", value: "7" },
  { label: "其他", value: "9" },
];

const salaryBankOptions = [
  "中国工商银行",
  "中国农业银行",
  "中国银行",
  "中国建设银行",
  "交通银行",
  "中国邮政储蓄银行",
  "招商银行",
  "中信银行",
  "浦发银行",
  "江苏银行",
  "南京银行",
  "其他",
].map((value) => ({ label: value, value }));

const workStatusOptions = [
  { label: "在场", value: "1" },
  { label: "离场", value: "2" },
];

const genderOptions = [
  { label: "女", value: "0" },
  { label: "男", value: "1" },
];

const attendanceDirectionOptions = [
  { label: "进场", value: "0" },
  { label: "出场", value: "1" },
];

const deviceDirectionOptions = [
  { label: "进场", value: "0" },
  { label: "出场", value: "1" },
  { label: "通用", value: "2" },
];

const unitFields = [
  { key: "company_name", label: "单位名称", valueType: "string", required: true, section: "基础信息" },
  { key: "company_credit_code", label: "统一社会信用代码", valueType: "string", required: true, section: "基础信息" },
  { key: "company_type", label: "单位类型", valueType: "number", control: "select", required: true, section: "基础信息", options: companyTypeOptions },
  { key: "register_date", label: "注册日期", valueType: "date", required: true, section: "基础信息" },
  { key: "register_area", label: "注册区域", valueType: "string", control: "region", required: true, regionNameKey: "register_area_list", regionRequireDistrict: true, section: "基础信息", wide: true },
  { key: "register_area_list", label: "注册区域名称", valueType: "string", required: true, section: "基础信息", hidden: true },
  { key: "company_address", label: "单位地址", valueType: "string", required: true, section: "基础信息", wide: true },
  { key: "company_phone", label: "单位电话", valueType: "string", required: true, section: "基础信息" },
  { key: "manager_name", label: "负责人", valueType: "string", required: true, section: "负责人" },
  { key: "manager_phone", label: "负责人手机号", valueType: "string", required: true, section: "负责人" },
  { key: "manager_id_card", label: "负责人身份证", valueType: "string", required: true, section: "负责人" },
  { key: "legal_person_name", label: "法人姓名", valueType: "string", required: true, section: "负责人" },
  { key: "legal_person_id_card", label: "法人身份证", valueType: "string", section: "负责人" },
  { key: "contract_amount", label: "合同金额", valueType: "number", section: "合同计薪" },
  { key: "salary_calc_type", label: "计薪方式", valueType: "number", control: "select", section: "合同计薪", options: unitSalaryCalcTypeOptions },
  { key: "quantity_unit_type", label: "计量单位", valueType: "number", control: "select", section: "合同计薪", options: quantityUnitTypeOptions },
  { key: "attachment_file", label: "附件", valueType: "json", control: "upload", uploadKind: "image", uploadMultiple: true, section: "资料附件", wide: true },
  { key: "seal_photo", label: "印章图片", valueType: "string", control: "upload", uploadKind: "image", section: "资料附件" },
];

const teamFields = [
  { key: "is_manage_team", label: "是否管理班组", valueType: "boolean", control: "select", defaultValue: "false", section: "基础信息", options: yesNoOptions },
  { key: "unit_id", label: "参建单位", valueType: "string", control: "select", required: true, section: "基础信息", optionsSource: "units" },
  { key: "name", label: "班组名称", valueType: "string", required: true, section: "基础信息" },
  { key: "work_type", label: "工种", valueType: "number", control: "select", required: true, managementTeamType: true, section: "基础信息", options: teamWorkTypeOptions },
  { key: "settlement_type", label: "结算方式", valueType: "number", control: "select", section: "结算考勤", options: salaryCalcTypeOptions },
  { key: "quantity_unit_type", label: "计量单位", valueType: "number", control: "select", section: "结算考勤", options: quantityUnitTypeOptions },
  { key: "attendance_start_time", label: "考勤开始时间", valueType: "string", defaultValue: "06:00", section: "结算考勤" },
  { key: "attendance_end_time", label: "考勤结束时间", valueType: "string", defaultValue: "18:00", section: "结算考勤" },
  { key: "attendance_is_next_day", label: "考勤跨天", valueType: "boolean", control: "select", defaultValue: "false", section: "结算考勤", options: yesNoOptions },
  { key: "leader_id", label: "班组长", valueType: "string", control: "select", section: "班组长", optionsSource: "workers" },
  { key: "leader_name", label: "班组长姓名", valueType: "string", section: "班组长", hidden: true },
  { key: "leader_phone", label: "班组长手机号", valueType: "string", section: "班组长", hidden: true },
  { key: "leader_id_card", label: "班组长身份证", valueType: "string", section: "班组长", hidden: true },
  { key: "remark", label: "备注", valueType: "string", control: "textarea", section: "班组长", wide: true },
];

const workerFields = [
  { key: "unit_id", label: "参建单位", valueType: "string", control: "select", required: true, section: "班组归属", optionsSource: "units" },
  { key: "team_id", label: "所属班组", valueType: "string", control: "select", required: true, section: "班组归属", optionsSource: "teams" },
  { key: "avatar", label: "照片", valueType: "string", control: "upload", uploadKind: "image", section: "证件照片" },
  { key: "ocr_photo", label: "识别身份证正面", valueType: "string", control: "upload", uploadKind: "image", section: "证件照片" },
  { key: "id_card_back_file", label: "识别身份证反面", valueType: "string", control: "upload", uploadKind: "image", section: "证件照片" },
  { key: "signature_photo", label: "人员签字", valueType: "string", control: "upload", uploadKind: "image", signaturePad: true, section: "证件照片" },
  { key: "signature_time", label: "签名日期", valueType: "date", section: "证件照片" },
  { key: "name", label: "姓名", valueType: "string", required: true, section: "基础信息" },
  { key: "phone", label: "电话", valueType: "string", required: true, section: "基础信息" },
  { key: "gender", label: "性别", valueType: "number", control: "select", defaultValue: "1", section: "基础信息", options: genderOptions },
  { key: "id_card", label: "身份证号", valueType: "string", section: "基础信息" },
  { key: "nation", label: "民族", valueType: "string", section: "基础信息" },
  { key: "address", label: "住址", valueType: "string", control: "textarea", section: "基础信息", wide: true },
  { key: "native_place", label: "籍贯", valueType: "number", control: "nativePlace", section: "基础信息" },
  { key: "validity_period", label: "开始日期", valueType: "string", section: "基础信息" },
  { key: "validity_period_end", label: "结束日期", valueType: "string", section: "基础信息" },
  { key: "visa_office", label: "签发机关", valueType: "string", section: "基础信息" },
  { key: "is_manage_team", label: "是否带班", valueType: "boolean", control: "select", defaultValue: "false", section: "基础信息", options: yesNoOptions },
  { key: "is_key_personnel", label: "重点人员", valueType: "boolean", control: "select", defaultValue: "false", section: "基础信息", options: yesNoOptions },
  { key: "work_type", label: "工种", valueType: "number", control: "select", required: true, section: "基础信息", options: workTypeOptions },
  { key: "worker_type", label: "工人类型", valueType: "number", control: "select", required: true, defaultValue: "1", section: "基础信息", options: workerTypeOptions },
  { key: "political_status", label: "政治面貌", valueType: "number", control: "select", required: true, section: "基础信息", options: politicalStatusOptions },
  { key: "manager_type", label: "管理人员类型", valueType: "string", control: "select", required: true, visibleWhenWorkerType: "1001", section: "基础信息", options: managerTypeOptions },
  { key: "settlement_type", label: "结算方式", valueType: "number", control: "select", section: "结算银行卡", options: salaryCalcTypeOptions },
  { key: "quantity_unit_type", label: "计量单位", valueType: "number", control: "select", section: "结算银行卡", options: quantityUnitTypeOptions },
  { key: "unit_price", label: "单价", valueType: "number", section: "结算银行卡" },
  { key: "salary_bank_card", label: "工资银行卡", valueType: "string", section: "结算银行卡" },
  { key: "salary_bank", label: "工资银行", valueType: "string", control: "select", section: "结算银行卡", options: salaryBankOptions },
  { key: "education", label: "文化程度", valueType: "number", control: "select", hidden: true, section: "保险与状态", options: educationOptions },
  { key: "has_major_medical_history", label: "重大病史", valueType: "boolean", control: "select", defaultValue: "false", hidden: true, section: "保险与状态", options: yesNoOptions },
  { key: "current_address", label: "现住址", valueType: "string", control: "textarea", hidden: true, section: "保险与状态", wide: true },
  { key: "has_insurance", label: "工伤或意外伤害保险是否购买", valueType: "boolean", control: "select", defaultValue: "false", hidden: true, section: "保险与状态", options: yesNoOptions },
  { key: "work_status", label: "在场状态", valueType: "number", control: "select", defaultValue: "1", hidden: true, section: "保险与状态", options: workStatusOptions },
  { key: "entry_time", label: "进场日期", valueType: "date", hidden: true, section: "保险与状态" },
  { key: "exit_time", label: "退场日期", valueType: "date", hidden: true, section: "保险与状态" },
  { key: "dormitory_id", label: "宿舍 ID", valueType: "string", section: "资料附件" },
  { key: "settlement_file", label: "离场结算单", valueType: "json", control: "upload", uploadKind: "file", uploadMultiple: true, section: "资料附件", wide: true },
  { key: "labor_contract_file", label: "劳动合同", valueType: "json", control: "upload", uploadKind: "file", uploadMultiple: true, section: "资料附件", wide: true },
];

const attendanceFields = [
  { key: "worker_id", label: "工人", valueType: "string", control: "select", required: true, section: "基础信息", optionsSource: "workers" },
  { key: "direction", label: "进出方向", valueType: "number", control: "select", defaultValue: "0", section: "基础信息", options: attendanceDirectionOptions },
  { key: "trigger_time", label: "考勤时间", valueType: "datetime", required: true, section: "基础信息" },
  { key: "original_time", label: "原始时间", valueType: "string", section: "基础信息" },
  { key: "equipment_id", label: "设备 ID", valueType: "string", section: "设备照片" },
  { key: "serial_number", label: "设备序列号", valueType: "string", section: "设备照片" },
  { key: "photo_path", label: "照片路径", valueType: "string", control: "upload", uploadKind: "image", section: "设备照片" },
  { key: "overall_photo", label: "全景照片", valueType: "string", control: "upload", uploadKind: "image", section: "设备照片", wide: true },
  { key: "closeup_photo", label: "近景照片", valueType: "string", control: "upload", uploadKind: "image", section: "设备照片", wide: true },
];

const deviceFields = [
  { key: "device_type", label: "厂家类型", valueType: "string", control: "select", required: true, defaultValue: "海厂家", section: "基础信息", options: deviceTypeOptions },
  { key: "serial_number", label: "设备序列号", valueType: "string", required: true, section: "基础信息" },
  { key: "device_name", label: "设备名称", valueType: "string", required: true, section: "基础信息" },
  { key: "direction", label: "进出方向", valueType: "number", control: "select", defaultValue: "0", section: "基础信息", options: deviceDirectionOptions },
  { key: "remark", label: "备注", valueType: "string", control: "textarea", section: "基础信息", wide: true },
];

const fieldSets = {
  units: unitFields,
  teams: teamFields,
  workers: workerFields,
  attendance: attendanceFields,
  devices: deviceFields,
};

const optionSets = {
  companyTypeOptions,
  workTypeOptions,
  workerTypeOptions,
  managerTypeOptions,
  educationOptions,
  politicalStatusOptions,
  salaryCalcTypeOptions,
  workStatusOptions,
  attendanceDirectionOptions,
  deviceTypeOptions,
  deviceDirectionOptions,
};

function optionLabel(fields, key, value, fallback = "未填写") {
  if (value === null || value === undefined || value === "") return fallback;
  const field = fields.find((item) => item.key === key);
  const option = (field && field.options || []).find((item) => item.value === String(value));
  return option ? option.label : String(value);
}

module.exports = {
  fieldSets,
  optionSets,
  optionLabel,
  inferNativePlaceFromAddress,
};
