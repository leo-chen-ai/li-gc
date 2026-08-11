// Node 直跑测试时 JSON 导入必须带 import 属性；Vite/esbuild 同样支持
import addressData from "./china-address.json" with { type: "json" };

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
  control?: "input" | "select" | "textarea" | "upload" | "region" | "nativePlace";
  uploadKind?: "image" | "file";
  uploadMultiple?: boolean;
  signaturePad?: boolean;
  required?: boolean;
  hidden?: boolean;
  visibleWhenWorkerType?: string;
  defaultValue?: string;
  section?: string;
  placeholder?: string;
  step?: string;
  inputMode?: "numeric" | "decimal";
  options?: ConstructionFormOption[];
  optionsSource?: "units" | "teams" | "workers";
  searchable?: boolean;
  managementTeamType?: boolean;
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

const companyTypeOptions: ConstructionFormOption[] = [
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

const unitSalaryCalcTypeOptions: ConstructionFormOption[] = [
  { label: "按日", value: "1" },
  { label: "按月", value: "2" },
  { label: "按周", value: "3" },
  { label: "劳务派遣合同", value: "4" },
  { label: "按小时", value: "5" },
  { label: "计件", value: "6" },
  { label: "按量", value: "7" },
  { label: "其他", value: "9" },
];

const inheritedSalaryCalcTypeOptions: ConstructionFormOption[] = [
  { label: "按上级配置", value: "0" },
  ...unitSalaryCalcTypeOptions,
];

const quantityUnitTypeOptions: ConstructionFormOption[] = [
  { label: "平方", value: "1" },
  { label: "米", value: "2" },
  { label: "吨", value: "3" },
  { label: "件", value: "4" },
  { label: "套", value: "5" },
  { label: "立方", value: "6" },
];

const teamWorkTypeOptions: ConstructionFormOption[] = [
  { label: "项目管理部", value: "1001" },
  { label: "钢筋工", value: "1" },
  { label: "木工", value: "2" },
  { label: "机械设备安装工", value: "3" },
  { label: "架子工", value: "4" },
  { label: "混凝土工", value: "5" },
  { label: "砌筑工", value: "6" },
  { label: "建筑电工", value: "7" },
  { label: "电焊工", value: "8" },
  { label: "管道工", value: "9" },
  { label: "测量放线工", value: "10" },
  { label: "装饰装修工", value: "11" },
  { label: "防水工", value: "13" },
  { label: "挖掘铲运和桩工机械司机", value: "14" },
  { label: "模板工", value: "15" },
  { label: "通风工", value: "16" },
  { label: "安装起重工", value: "17" },
  { label: "安装钳工", value: "18" },
  { label: "电气设备安装调试工", value: "19" },
  { label: "变电安装工", value: "20" },
  { label: "司泵工", value: "21" },
  { label: "桩机操作工", value: "22" },
  { label: "起重信号工", value: "23" },
  { label: "建筑起重机械安装拆卸工", value: "24" },
  { label: "室内成套设施安装工", value: "25" },
  { label: "建筑门窗幕墙安装工", value: "26" },
  { label: "幕墙制作工", value: "27" },
  { label: "石工", value: "28" },
  { label: "除尘工", value: "29" },
  { label: "爆破工", value: "30" },
  { label: "线路架设工", value: "31" },
  { label: "古建筑传统石工", value: "32" },
  { label: "古建筑传统瓦工", value: "33" },
  { label: "古建筑传统彩画工", value: "34" },
  { label: "古建筑传统木工", value: "35" },
  { label: "古建筑传统油工", value: "36" },
  { label: "金属工", value: "37" },
  { label: "杂工", value: "38" },
  { label: "其它", value: "900" },
];

export const workerWorkTypeOptions: ConstructionFormOption[] = [
  { label: "砌筑工", value: "6" },
  { label: "钢筋工", value: "1" },
  { label: "架子工", value: "4" },
  { label: "混凝土工", value: "5" },
  { label: "模板工", value: "15" },
  { label: "机械设备安装工", value: "3" },
  { label: "通风工", value: "16" },
  { label: "安装起重工", value: "17" },
  { label: "安装钳工", value: "18" },
  { label: "电气设备安装调试工", value: "19" },
  { label: "管道工", value: "9" },
  { label: "变电安装工", value: "20" },
  { label: "建筑电工", value: "7" },
  { label: "司泵工", value: "21" },
  { label: "挖掘铲运和桩工机械司机", value: "14" },
  { label: "桩机操作工", value: "22" },
  { label: "起重信号工", value: "23" },
  { label: "建筑起重机械安装拆卸工", value: "24" },
  { label: "装饰装修工", value: "11" },
  { label: "室内成套设施安装工", value: "25" },
  { label: "建筑门窗幕墙安装工", value: "26" },
  { label: "幕墙制作工", value: "27" },
  { label: "防水工", value: "13" },
  { label: "木工", value: "2" },
  { label: "石工", value: "28" },
  { label: "电焊工", value: "8" },
  { label: "除尘工", value: "29" },
  { label: "爆破工", value: "30" },
  { label: "测量放线工", value: "10" },
  { label: "线路架设工", value: "31" },
  { label: "古建筑传统石工", value: "32" },
  { label: "古建筑传统瓦工", value: "33" },
  { label: "古建筑传统彩画工", value: "34" },
  { label: "古建筑传统木工", value: "35" },
  { label: "古建筑传统油工", value: "36" },
  { label: "金属工", value: "37" },
  { label: "杂工", value: "38" },
  { label: "管理人员", value: "1001" },
  { label: "其它", value: "900" },
];

const workerTypeOptions: ConstructionFormOption[] = [
  { label: "建筑工人", value: "1" },
  { label: "管理人员", value: "1001" },
  { label: "其他", value: "9" },
];

const politicalStatusOptions: ConstructionFormOption[] = [
  { label: "群众", value: "1" },
  { label: "中共党员", value: "2" },
  { label: "中共预备党员", value: "3" },
  { label: "共青团员", value: "4" },
  { label: "民主党派", value: "5" },
  { label: "其他", value: "9" },
];

const managerTypeOptions: ConstructionFormOption[] = [
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

const educationOptions: ConstructionFormOption[] = [
  { label: "小学", value: "1" },
  { label: "初中", value: "2" },
  { label: "高中", value: "3" },
  { label: "中专", value: "4" },
  { label: "大专", value: "5" },
  { label: "本科", value: "6" },
  { label: "硕士及以上", value: "7" },
  { label: "其他", value: "9" },
];

// 籍贯使用全国省市两级数据，存储值为 6 位区划码（市级如 330100，省级如 330000）
type NativePlaceRegion = { code: string; name: string; children?: NativePlaceRegion[] };

export const nativePlaceProvinces = (addressData as NativePlaceRegion[]).map((province) => ({
  code: province.code,
  name: province.name,
  cities: (province.children ?? []).map((city) => ({ code: city.code, name: city.name })),
}));

export function nativePlaceParts(value: string | number | null | undefined) {
  const code = String(value ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { province: null, city: null };
  const province = nativePlaceProvinces.find((item) => item.code === code.slice(0, 2)) ?? null;
  const city = province?.cities.find((item) => item.code === code.slice(0, 4)) ?? null;
  return { province, city };
}

export function nativePlaceLabel(value: string | number | null | undefined, fallback = ""): string {
  const { province, city } = nativePlaceParts(value);
  if (!province) return fallback;
  // 直辖市的市级节点是“市辖区”，展示时只保留省级名称
  if (!city || city.name === "市辖区") return province.name;
  return `${province.name}${city.name}`;
}

// 优先用身份证号前 6 位（户籍地区划码）推断籍贯，识别不到再回退地址文本匹配
export function inferNativePlace({ idCard, address }: { idCard?: string; address?: string }): string | null {
  const idPrefix = String(idCard ?? "").trim().slice(0, 6);
  if (/^\d{6}$/.test(idPrefix)) {
    const { province, city } = nativePlaceParts(idPrefix);
    if (city) return `${city.code}00`;
    if (province) return `${province.code}0000`;
  }
  return inferNativePlaceFromAddress(address ?? "");
}

export function inferNativePlaceFromAddress(address: string): string | null {
  const text = address.trim();
  if (!text) return null;

  let matchedCity: { code: string; name: string } | null = null;
  for (const province of nativePlaceProvinces) {
    for (const city of province.cities) {
      if (city.name === "市辖区" || city.name === "县") continue;
      const shortName = city.name.replace(/[市]$/, "");
      if (shortName.length < 2) continue;
      if (text.includes(city.name) || text.includes(shortName)) {
        if (!matchedCity || city.name.length > matchedCity.name.length) matchedCity = city;
      }
    }
  }
  if (matchedCity) return `${matchedCity.code}00`;

  const matchedProvince = nativePlaceProvinces.find((province) => {
    const shortName = province.name.replace(/(省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)$/, "");
    return text.includes(shortName);
  });
  return matchedProvince ? `${matchedProvince.code}0000` : null;
}

const salaryBankOptions: ConstructionFormOption[] = [
  { label: "中国工商银行", value: "中国工商银行" },
  { label: "中国农业银行", value: "中国农业银行" },
  { label: "中国银行", value: "中国银行" },
  { label: "中国建设银行", value: "中国建设银行" },
  { label: "交通银行", value: "交通银行" },
  { label: "中国邮政储蓄银行", value: "中国邮政储蓄银行" },
  { label: "招商银行", value: "招商银行" },
  { label: "中信银行", value: "中信银行" },
  { label: "浦发银行", value: "浦发银行" },
  { label: "江苏银行", value: "江苏银行" },
  { label: "南京银行", value: "南京银行" },
  { label: "其他", value: "其他" },
];

const workStatusOptions: ConstructionFormOption[] = [
  { label: "在场", value: "1" },
  { label: "离场", value: "2" },
];

const moneyInput = {
  step: "0.01",
  inputMode: "decimal" as const,
};

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

  { key: "invest_total", label: "总投资", valueType: "number", section: "基本信息", ...moneyInput },
  {
    key: "investment_nature",
    label: "投资性质",
    valueType: "number",
    control: "select",
    section: "基本信息",
    options: investmentNatureOptions,
  },
  { key: "labor_cost", label: "总劳务费", valueType: "number", section: "基本信息", ...moneyInput },
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
  { key: "contract_amount", label: "合同金额", valueType: "number", section: "额外信息", ...moneyInput },
  { key: "margin_amount", label: "保证金金额", valueType: "number", section: "额外信息", ...moneyInput },
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
  { key: "company_type", label: "单位类型", valueType: "number", control: "select", required: true, section: "基础信息", options: companyTypeOptions },
  { key: "register_date", label: "注册日期", valueType: "date", required: true, section: "基础信息" },
  { key: "register_area", label: "注册区域", valueType: "string", required: true, section: "基础信息" },
  { key: "register_area_list", label: "注册区域名称", valueType: "string", required: true, section: "基础信息" },
  { key: "company_address", label: "单位地址", valueType: "string", required: true, section: "基础信息", wide: true },
  { key: "company_phone", label: "单位电话", valueType: "string", required: true, section: "基础信息" },
  { key: "manager_name", label: "负责人", valueType: "string", required: true, section: "负责人" },
  { key: "manager_phone", label: "负责人手机号", valueType: "string", required: true, section: "负责人" },
  { key: "manager_id_card", label: "负责人身份证", valueType: "string", required: true, section: "负责人" },
  { key: "legal_person_name", label: "法人姓名", valueType: "string", required: true, section: "负责人" },
  { key: "legal_person_id_card", label: "法人身份证", valueType: "string", section: "负责人" },
  { key: "contract_amount", label: "合同金额", valueType: "number", section: "合同计薪", ...moneyInput },
  { key: "salary_calc_type", label: "计薪方式", valueType: "number", control: "select", section: "合同计薪", options: unitSalaryCalcTypeOptions },
  { key: "quantity_unit_type", label: "计量单位", valueType: "number", control: "select", section: "合同计薪", options: quantityUnitTypeOptions },
  { key: "attachment", label: "附件", valueType: "string", control: "upload", uploadKind: "file", section: "资料附件" },
  { key: "attachment_file", label: "附件文件", valueType: "json", control: "upload", uploadKind: "file", uploadMultiple: true, section: "资料附件", wide: true },
  { key: "seal_photo", label: "印章图片", valueType: "string", control: "upload", uploadKind: "image", section: "资料附件" },
];

export const teamFormFields: ConstructionFormField[] = [
  { key: "is_manage_team", label: "是否管理班组", valueType: "boolean", control: "select", defaultValue: "false", section: "基础信息", options: yesNoOptions },
  { key: "unit_id", label: "参建单位", valueType: "string", control: "select", required: true, section: "基础信息", optionsSource: "units" },
  { key: "name", label: "班组名称", valueType: "string", required: true, section: "基础信息" },
  { key: "work_type", label: "工种", valueType: "number", control: "select", required: true, managementTeamType: true, section: "基础信息", options: teamWorkTypeOptions },
  { key: "settlement_type", label: "结算方式", valueType: "number", control: "select", section: "结算考勤", options: inheritedSalaryCalcTypeOptions },
  { key: "quantity_unit_type", label: "计量单位", valueType: "number", control: "select", section: "结算考勤", options: quantityUnitTypeOptions },
  { key: "attendance_start_time", label: "考勤开始时间", valueType: "string", defaultValue: "06:00", section: "结算考勤" },
  { key: "attendance_end_time", label: "考勤结束时间", valueType: "string", defaultValue: "18:00", section: "结算考勤" },
  { key: "attendance_is_next_day", label: "考勤跨天", valueType: "boolean", control: "select", defaultValue: "false", section: "结算考勤", options: yesNoOptions },
  { key: "leader_id", label: "班组长", valueType: "string", control: "select", searchable: true, section: "班组长", optionsSource: "workers" },
  { key: "leader_name", label: "班组长姓名", valueType: "string", section: "班组长", hidden: true },
  { key: "leader_phone", label: "班组长手机号", valueType: "string", section: "班组长", hidden: true },
  { key: "leader_id_card", label: "班组长身份证", valueType: "string", section: "班组长", hidden: true },
  { key: "remark", label: "备注", valueType: "string", control: "textarea", section: "班组长", wide: true },
];

export const workerFormFields: ConstructionFormField[] = [
  { key: "unit_id", label: "参建单位", valueType: "string", control: "select", required: true, section: "班组归属", optionsSource: "units" },
  { key: "team_id", label: "所属班组", valueType: "string", control: "select", required: true, section: "班组归属", optionsSource: "teams" },
  { key: "avatar", label: "照片", valueType: "string", control: "upload", uploadKind: "image", required: true, section: "证件照片" },
  { key: "ocr_photo", label: "识别身份证正面", valueType: "string", control: "upload", uploadKind: "image", required: true, section: "证件照片" },
  { key: "id_card_back_file", label: "识别身份证反面", valueType: "string", control: "upload", uploadKind: "image", required: true, section: "证件照片" },
  { key: "signature_photo", label: "人员签字", valueType: "string", control: "upload", uploadKind: "image", signaturePad: true, section: "证件照片" },
  { key: "signature_time", label: "签名日期", valueType: "date", section: "证件照片" },
  { key: "name", label: "姓名", valueType: "string", required: true, section: "基础信息" },
  { key: "phone", label: "手机号", valueType: "string", required: true, section: "基础信息" },
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
  { key: "id_card", label: "身份证号", valueType: "string", required: true, section: "基础信息" },
  { key: "nation", label: "民族", valueType: "string", required: true, section: "基础信息" },
  { key: "address", label: "住址", valueType: "string", section: "基础信息", wide: true },
  { key: "native_place", label: "籍贯", valueType: "number", control: "nativePlace", section: "基础信息" },
  { key: "validity_period", label: "开始日期", valueType: "string", section: "基础信息" },
  { key: "validity_period_end", label: "结束日期", valueType: "string", section: "基础信息" },
  { key: "visa_office", label: "签发机关", valueType: "string", section: "基础信息" },
  { key: "is_manage_team", label: "是否带班", valueType: "boolean", control: "select", defaultValue: "false", section: "基础信息", options: yesNoOptions },
  { key: "is_key_personnel", label: "重点人员", valueType: "boolean", control: "select", defaultValue: "false", section: "基础信息", options: yesNoOptions },
  { key: "work_type", label: "工种", valueType: "number", control: "select", required: true, section: "基础信息", options: workerWorkTypeOptions },
  { key: "worker_type", label: "工人类型", valueType: "number", control: "select", required: true, defaultValue: "1", section: "基础信息", options: workerTypeOptions },
  { key: "political_status", label: "政治面貌", valueType: "number", control: "select", required: true, section: "基础信息", options: politicalStatusOptions },
  { key: "manager_type", label: "管理人员类型", valueType: "string", control: "select", required: true, visibleWhenWorkerType: "1001", section: "基础信息", options: managerTypeOptions },
  { key: "settlement_type", label: "结算方式", valueType: "number", control: "select", section: "结算银行卡", options: inheritedSalaryCalcTypeOptions },
  { key: "quantity_unit_type", label: "计量单位", valueType: "number", control: "select", section: "结算银行卡", options: quantityUnitTypeOptions },
  { key: "unit_price", label: "单价", valueType: "number", section: "结算银行卡", ...moneyInput },
  { key: "salary_bank_card", label: "工资银行卡", valueType: "string", section: "结算银行卡" },
  { key: "salary_bank", label: "工资银行", valueType: "string", control: "select", section: "结算银行卡", options: salaryBankOptions },
  { key: "education", label: "文化程度", valueType: "number", control: "select", hidden: true, section: "保险与状态", options: educationOptions },
  { key: "has_major_medical_history", label: "重大病史", valueType: "boolean", control: "select", defaultValue: "false", hidden: true, section: "保险与状态", options: yesNoOptions },
  { key: "current_address", label: "现住址", valueType: "string", hidden: true, section: "保险与状态", wide: true },
  { key: "has_insurance", label: "工伤或意外伤害保险是否购买", valueType: "boolean", control: "select", defaultValue: "false", hidden: true, section: "保险与状态", options: yesNoOptions },
  { key: "work_status", label: "在场状态", valueType: "number", control: "select", defaultValue: "1", hidden: true, section: "保险与状态", options: workStatusOptions },
  { key: "entry_time", label: "进场日期", valueType: "date", hidden: true, section: "保险与状态" },
  { key: "exit_time", label: "退场日期", valueType: "date", hidden: true, section: "保险与状态" },
  { key: "dormitory_id", label: "宿舍 ID", valueType: "string", section: "资料附件" },
  { key: "settlement_file", label: "离场结算单", valueType: "json", control: "upload", uploadKind: "file", uploadMultiple: true, section: "资料附件", wide: true },
  { key: "labor_contract_file", label: "劳动合同", valueType: "json", control: "upload", uploadKind: "file", uploadMultiple: true, section: "资料附件", wide: true },
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
    if (!isFieldVisible(field, state)) return payload;
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

export function getFieldsBySection(fields: ConstructionFormField[], state: ConstructionFormState = {}) {
  return fields.filter((field) => !field.hidden && isFieldVisible(field, state)).reduce<Array<{ section: string; fields: ConstructionFormField[] }>>(
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

function isFieldVisible(field: ConstructionFormField, state: ConstructionFormState) {
  return !field.visibleWhenWorkerType || state.worker_type === field.visibleWhenWorkerType;
}

export function getFieldOptionLabel(
  fields: ConstructionFormField[],
  key: string,
  value: string | number | boolean | null | undefined,
  fallback = "未填写"
) {
  if (value === null || value === undefined || value === "") return fallback;

  const field = fields.find((item) => item.key === key);
  const option = field?.options?.find((item) => item.value === String(value));

  return option?.label ?? String(value);
}

export function datetimeLocalNow() {
  return toDatetimeLocal(new Date().toISOString());
}

export function dateInputToday(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
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
