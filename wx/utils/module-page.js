const { assetPath } = require("../config/assets.js");

const STORAGE_PREFIX = "shanhuai_module_";

const optionSets = {
  companyType: [
    { label: "总承包单位", value: "总承包单位" },
    { label: "建设单位", value: "建设单位" },
    { label: "劳务分包", value: "劳务分包" },
    { label: "专业分包", value: "专业分包" },
    { label: "监理", value: "监理" },
  ],
  salaryType: [
    { label: "日结", value: "日结" },
    { label: "月结", value: "月结" },
    { label: "按量", value: "按量" },
    { label: "计件", value: "计件" },
  ],
  workType: [
    { label: "钢筋工", value: "钢筋工" },
    { label: "木工", value: "木工" },
    { label: "安装工", value: "安装工" },
    { label: "电工", value: "电工" },
    { label: "架子工", value: "架子工" },
    { label: "混凝土工", value: "混凝土工" },
    { label: "其他", value: "其他" },
  ],
  yesNo: [
    { label: "否", value: "否" },
    { label: "是", value: "是" },
  ],
  contractTemplate: [
    { label: "请选择合同模板", value: "" },
    { label: "项目标准劳务合同", value: "项目标准劳务合同" },
    { label: "管理人员入职协议", value: "管理人员入职协议" },
  ],
  region: [
    { label: "浙江省/宁波市/海曙区", value: "浙江省/宁波市/海曙区" },
    { label: "江苏省/淮安市/清江浦区", value: "江苏省/淮安市/清江浦区" },
    { label: "江苏省/淮安市/经开区", value: "江苏省/淮安市/经开区" },
  ],
  deviceDirection: [
    { label: "进场", value: "进场" },
    { label: "出场", value: "出场" },
    { label: "双向", value: "双向" },
  ],
  deviceStatus: [
    { label: "在线", value: "在线" },
    { label: "离线", value: "离线" },
    { label: "维护中", value: "维护中" },
  ],
};

const baseFields = {
  unit: [
    { key: "company_name", label: "企业名称", required: true, placeholder: "请输入参建单位名称" },
    { key: "company_type", label: "企业类型", control: "select", options: optionSets.companyType, required: true },
    { key: "company_credit_code", label: "社会信用代码", required: true, placeholder: "请输入社会信用代码" },
    { key: "manager_name", label: "项目经理（选填）", placeholder: "请输入项目经理名称" },
    { key: "manager_phone", label: "项目经理电话（选填）", placeholder: "请输入项目经理电话" },
    { key: "manager_id_card", label: "项目经理身份证号（选填）", placeholder: "请输入项目经理身份证号" },
    { key: "region", label: "注册地区", control: "select", options: optionSets.region, required: true, defaultValue: "浙江省/宁波市/海曙区" },
    { key: "company_address", label: "企业地址", required: true, placeholder: "请输入企业地址" },
    { key: "registered_date", label: "注册日期", required: true, placeholder: "请选择注册日期" },
    { key: "legal_person_name", label: "法人姓名" },
    { key: "legal_person_id_card", label: "身份证号" },
    { key: "company_phone", label: "联系电话" },
    { key: "contract_amount", label: "合约金额（万元）", valueType: "number", placeholder: "请填写金额数字，如：5200" },
  ],
  team: [
    { key: "project_name", label: "项目", defaultValue: "宁波诺丁汉大学2026暑期工程项目13#楼装修工程", wide: true },
    { key: "name", label: "班组", required: true, placeholder: "请输入班组名称（不超过10个字）" },
    { key: "work_type", label: "班组工种类型", control: "select", options: optionSets.workType, required: true },
    { key: "unit_name", label: "班组所属参建单位", required: true, placeholder: "请选择参建单位" },
    { key: "attendance_period", label: "考勤时段", defaultValue: "07:30-17:00", required: true },
    { key: "second_day", label: "第二天", control: "select", options: optionSets.yesNo, defaultValue: "否" },
    { key: "settlement_type", label: "结算方式", control: "select", options: optionSets.salaryType, defaultValue: "月结" },
    { key: "unit_price", label: "默认单价（元）", valueType: "number", defaultValue: "200" },
    { key: "contract_template", label: "在线签合同", control: "select", options: optionSets.contractTemplate },
    { key: "leader_name", label: "班组长", defaultValue: "暂无" },
  ],
  device: [
    { key: "device_name", label: "设备名称", required: true },
    { key: "device_type", label: "设备类型", required: true },
    { key: "serial_number", label: "设备序列号", required: true },
    { key: "direction", label: "进出方向", control: "select", options: optionSets.deviceDirection, defaultValue: "双向" },
    { key: "location", label: "安装位置" },
    { key: "status", label: "设备状态", control: "select", options: optionSets.deviceStatus, defaultValue: "在线" },
    { key: "last_sync", label: "最近同步" },
    { key: "remark", label: "备注", control: "textarea", wide: true },
  ],
};

const moduleConfigs = {
  teams: {
    key: "teams",
    title: "班组管理",
    shortTitle: "班组",
    kicker: "班组 / 考勤规则",
    subtitle: "维护班组、工种、班组长和上下班考勤时间。",
    formHint: "字段对齐移动端新增班组：工种、参建单位、考勤时段、结算和合同。",
    searchPlaceholder: "搜索班组、班组长、单位",
    primaryMetric: "正常班组",
    secondaryMetric: "总人数",
    attentionMetric: "待完善",
    filters: [
      { label: "全部", value: "all" },
      { label: "正常", value: "正常" },
      { label: "待完善", value: "待完善" },
    ],
    filterField: "status",
    fields: baseFields.team,
  },
  companies: {
    key: "companies",
    title: "参建单位",
    shortTitle: "单位",
    kicker: "单位台账 / 合同计薪",
    subtitle: "维护单位类型、信用代码、负责人和合同计薪信息。",
    formHint: "字段对齐移动端新增参建单位：必填信息和可选法人合同信息。",
    searchPlaceholder: "搜索单位、信用代码、负责人",
    primaryMetric: "参建单位",
    secondaryMetric: "总合同额",
    attentionMetric: "劳务单位",
    filters: [
      { label: "全部", value: "all" },
      { label: "总承包单位", value: "总承包单位" },
      { label: "建设单位", value: "建设单位" },
      { label: "劳务分包", value: "劳务分包" },
    ],
    filterField: "company_type",
    fields: baseFields.unit,
  },
  device: {
    key: "device",
    title: "考勤机模式",
    shortTitle: "设备",
    kicker: "设备 / 闸机同步",
    subtitle: "维护考勤设备、序列号、安装位置、进出方向和状态。",
    formHint: "对应 PC 考勤设备：设备类型、名称、序列号、方向和备注。",
    searchPlaceholder: "搜索设备、序列号、位置",
    primaryMetric: "在线",
    secondaryMetric: "设备总数",
    attentionMetric: "离线",
    filters: [
      { label: "全部", value: "all" },
      { label: "在线", value: "在线" },
      { label: "离线", value: "离线" },
      { label: "维护中", value: "维护中" },
    ],
    filterField: "status",
    fields: baseFields.device,
  },
};

const seedRecords = {
  teams: [
    { id: "tm-1", project_name: "宁波诺丁汉大学2026暑期工程项目13#楼装修工程", unit_name: "苏北劳务工程有限公司", name: "钢筋一班", work_type: "钢筋工", leader_name: "马建军", worker_count: "42", settlement_type: "月结", attendance_period: "07:30-17:00", second_day: "否", unit_price: "200", contract_template: "项目标准劳务合同", status: "正常" },
    { id: "tm-2", project_name: "宁波诺丁汉大学2026暑期工程项目13#楼装修工程", unit_name: "苏北劳务工程有限公司", name: "木工二班", work_type: "木工", leader_name: "黄小飞", worker_count: "38", settlement_type: "日结", attendance_period: "07:30-17:00", second_day: "否", unit_price: "280", contract_template: "", status: "正常" },
    { id: "tm-3", project_name: "宁波诺丁汉大学2026暑期工程项目13#楼装修工程", unit_name: "山淮建设工程有限公司", name: "安装综合班", work_type: "安装工", leader_name: "暂无", worker_count: "31", settlement_type: "月结", attendance_period: "", second_day: "否", unit_price: "200", contract_template: "", status: "待完善" },
  ],
  companies: [
    { id: "co-1", company_name: "山淮建设工程有限公司", company_type: "总承包单位", company_credit_code: "91320800MA1SH0001X", manager_name: "陈国强", manager_phone: "138****7621", manager_id_card: "3208**********7621", region: "江苏省/淮安市/清江浦区", legal_person_name: "陈国强", legal_person_id_card: "3208**********7621", company_phone: "0517-83218888", contract_amount: "68000", registered_date: "2022-05-16", company_address: "淮安市清江浦区枚皋路项目部" },
    { id: "co-2", company_name: "淮安城发置业有限公司", company_type: "建设单位", company_credit_code: "91320800MA1CF8802K", manager_name: "李思源", manager_phone: "139****8820", manager_id_card: "3208**********8820", region: "江苏省/淮安市/清江浦区", legal_person_name: "李思源", legal_person_id_card: "3208**********8820", company_phone: "0517-83660018", contract_amount: "96000", registered_date: "2020-09-28", company_address: "淮安市生态文旅区商务中心" },
    { id: "co-3", company_name: "苏北劳务工程有限公司", company_type: "劳务分包", company_credit_code: "91320891MA1LW3019A", manager_name: "许强", manager_phone: "136****3319", manager_id_card: "3208**********3319", region: "浙江省/宁波市/海曙区", legal_person_name: "许强", legal_person_id_card: "3208**********3319", company_phone: "0517-83776621", contract_amount: "8420", registered_date: "2021-03-12", company_address: "宁波市海曙区项目办公点" },
  ],
  device: [
    { id: "dv-1", device_name: "南门 01 号闸机", device_type: "闸机", serial_number: "SH-GATE-001", direction: "双向", location: "项目南门", status: "在线", last_sync: "2026-06-27 09:24", remark: "主入口" },
    { id: "dv-2", device_name: "东门 02 号闸机", device_type: "闸机", serial_number: "SH-GATE-002", direction: "进场", location: "项目东门", status: "在线", last_sync: "2026-06-27 09:20", remark: "早高峰使用" },
    { id: "dv-3", device_name: "生活区人脸机", device_type: "人脸识别机", serial_number: "SH-FACE-003", direction: "出场", location: "生活区通道", status: "离线", last_sync: "2026-06-26 18:10", remark: "网络待检查" },
  ],
};

function createModulePage(fixedModuleKey) {
  const initialModuleKey = moduleConfigs[fixedModuleKey] ? fixedModuleKey : "teams";

  return {
    data: {
      moduleKey: initialModuleKey,
      module: moduleConfigs[initialModuleKey],
      records: [],
      filteredRecords: [],
      keyword: "",
      filterValue: "all",
      summary: { primary: 0, secondary: 0, attention: 0 },
      pageHeaderBg: assetPath("/page-header-bg-v1.png"),
      formVisible: false,
      formMode: "create",
      formTitle: "新增",
      editingId: "",
      form: {},
      formFields: [],
    },

    onLoad() {
      this.applyModule(initialModuleKey);
    },

  applyModule(moduleKey) {
    const module = moduleConfigs[moduleKey];
    const records = this.loadRecords(moduleKey);
    this.setData({
      moduleKey,
      module,
      records,
      keyword: "",
      filterValue: "all",
      formVisible: false,
      filteredRecords: this.decorateRecords(moduleKey, records),
      summary: this.buildSummary(moduleKey, records),
    });
  },

  loadRecords(moduleKey) {
    const cached = wx.getStorageSync(`${STORAGE_PREFIX}${moduleKey}`);
    if (Array.isArray(cached)) return cached;
    return seedRecords[moduleKey].map((item) => ({ ...item }));
  },

  persist(records) {
    wx.setStorageSync(`${STORAGE_PREFIX}${this.data.moduleKey}`, records);
  },

  refresh(records = this.data.records) {
    const filtered = this.filterRecords(records, this.data.keyword, this.data.filterValue);
    this.setData({
      records,
      filteredRecords: this.decorateRecords(this.data.moduleKey, filtered),
      summary: this.buildSummary(this.data.moduleKey, records),
    });
  },

  filterRecords(records, keyword, filterValue) {
    const normalizedKeyword = String(keyword || "").trim().toLowerCase();
    const filterField = this.data.module.filterField;
    return records.filter((record) => {
      const matchesFilter = filterValue === "all" || String(record[filterField] || "") === filterValue;
      const text = Object.values(record).join(" ").toLowerCase();
      return matchesFilter && (!normalizedKeyword || text.includes(normalizedKeyword));
    });
  },

  decorateRecords(moduleKey, records) {
    return records.map((record) => {
      const view = buildRecordView(moduleKey, record);
      return { ...record, ...view };
    });
  },

  buildSummary(moduleKey, records) {
    if (moduleKey === "teams") {
      const normalCount = records.filter((item) => getTeamStatus(item) === "正常").length;
      const attentionCount = records.filter((item) => getTeamStatus(item) === "待完善").length;
      return {
        primary: normalCount,
        secondary: sumBy(records, "worker_count"),
        attention: attentionCount,
      };
    }
    if (moduleKey === "companies") {
      return {
        primary: records.length,
        secondary: `${sumBy(records, "contract_amount")}万`,
        attention: countBy(records, "company_type", "劳务分包"),
      };
    }
    return {
      primary: countBy(records, "status", "在线"),
      secondary: records.length,
      attention: countBy(records, "status", "离线"),
    };
  },

  onKeywordInput(event) {
    const keyword = event.detail.value;
    this.setData({ keyword });
    this.refresh();
  },

  setFilter(event) {
    const filterValue = event.currentTarget.dataset.value;
    this.setData({ filterValue });
    this.refresh();
  },

  openCreate() {
    const form = buildDefaultForm(this.data.module.fields);
    this.setData({
      formVisible: true,
      formMode: "create",
      editingId: "",
      formTitle: `新增${this.data.module.shortTitle}`,
      form,
      formFields: buildFormFields(this.data.module.fields, form),
    });
  },

  openEdit(event) {
    const id = event.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    const form = buildDefaultForm(this.data.module.fields, record);
    this.setData({
      formVisible: true,
      formMode: "edit",
      editingId: id,
      formTitle: `编辑${this.data.module.shortTitle}`,
      form,
      formFields: buildFormFields(this.data.module.fields, form),
    });
  },

  closeForm() {
    this.setData({ formVisible: false });
  },

  onFormInput(event) {
    const key = event.currentTarget.dataset.key;
    const value = event.detail.value;
    this.updateFormValue(key, value);
  },

  onPickerChange(event) {
    const key = event.currentTarget.dataset.key;
    const field = this.data.module.fields.find((item) => item.key === key);
    const option = field?.options?.[Number(event.detail.value)];
    this.updateFormValue(key, option?.value || "");
  },

  updateFormValue(key, value) {
    const form = { ...this.data.form, [key]: value };
    this.setData({
      form,
      formFields: buildFormFields(this.data.module.fields, form),
    });
  },

  saveRecord() {
    const error = validateForm(this.data.module.fields, this.data.form);
    if (error) {
      wx.showToast({ title: error, icon: "none" });
      return;
    }

    const now = Date.now();
    const nextRecord = normalizeRecord(this.data.moduleKey, {
      ...this.data.form,
      id: this.data.formMode === "edit" ? this.data.editingId : `${this.data.moduleKey}-${now}`,
    });
    const records = this.data.formMode === "edit"
      ? this.data.records.map((item) => (item.id === this.data.editingId ? nextRecord : item))
      : [nextRecord, ...this.data.records];
    this.persist(records);
    this.setData({ formVisible: false });
    this.refresh(records);
    wx.showToast({ title: "已保存", icon: "success" });
  },

  deleteRecord(event) {
    const id = event.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    wx.showModal({
      title: "删除记录",
      content: `确认删除“${buildRecordView(this.data.moduleKey, record)._title}”？`,
      confirmColor: "#d65a44",
      success: (result) => {
        if (!result.confirm) return;
        const records = this.data.records.filter((item) => item.id !== id);
        this.persist(records);
        this.refresh(records);
        wx.showToast({ title: "已删除", icon: "success" });
      },
    });
  },

  resetData() {
    wx.showModal({
      title: "重置调试数据",
      content: "会恢复当前模块的示例数据，已新增和编辑的本地记录将被清空。",
      confirmColor: "#0a9875",
      success: (result) => {
        if (!result.confirm) return;
        wx.removeStorageSync(`${STORAGE_PREFIX}${this.data.moduleKey}`);
        const records = this.loadRecords(this.data.moduleKey);
        this.refresh(records);
      },
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.redirectTo({ url: "/pages/home/home" });
  },
  };
}

module.exports = {
  createModulePage,
  moduleConfigs,
};

function buildDefaultForm(fields, record = {}) {
  return fields.reduce((form, field) => {
    form[field.key] = record[field.key] || field.defaultValue || "";
    return form;
  }, {});
}

function buildFormFields(fields, form) {
  return fields.map((field) => {
    const value = form[field.key] || "";
    const optionIndex = field.options ? Math.max(0, field.options.findIndex((item) => item.value === value)) : 0;
    const valueLabel = field.options?.find((item) => item.value === value)?.label || "";
    return {
      ...field,
      value,
      optionIndex,
      valueLabel,
      displayValue: valueLabel || "请选择",
      placeholder: field.placeholder || "请输入",
      inputType: field.valueType === "number" ? "number" : "text",
      valueType: field.valueType || "string",
    };
  });
}

function validateForm(fields, form) {
  const missed = fields.find((field) => field.required && !String(form[field.key] || "").trim());
  return missed ? `请填写${missed.label}` : "";
}

function countBy(records, key, value) {
  return records.filter((item) => String(item[key] || "") === value).length;
}

function sumBy(records, key) {
  return records.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function toneFromStatus(status) {
  if (["正常", "在场", "有效", "在线", "进场"].includes(status)) return "ok";
  if (["待完善", "待补图", "维护中"].includes(status)) return "warn";
  if (["异常", "离场", "离线"].includes(status)) return "danger";
  return "";
}

function getTeamStatus(record) {
  return record.status || (record.attendance_period ? "正常" : "待完善");
}

function normalizeRecord(moduleKey, record) {
  if (moduleKey === "teams") return { ...record, status: getTeamStatus(record) };
  return record;
}

function details(items) {
  return items.map(([label, value]) => ({ label, value: value || "未填写" }));
}

function buildRecordView(moduleKey, record) {
  if (moduleKey === "teams") {
    const status = getTeamStatus(record);
    return {
      _title: record.name,
      _subtitle: `${record.team_no || "未填编号"} / ${record.unit_name || "未关联单位"} / ${record.work_type || "未填工种"}`,
      _status: status,
      _statusTone: toneFromStatus(status),
      _details: details([["工种", record.work_type], ["参建单位", record.unit_name], ["考勤时段", record.attendance_period], ["默认单价", `${record.unit_price || 0}元`]]),
      _note: `${record.settlement_type || "未填结算方式"} / 班组长：${record.leader_name || "暂无"}`,
    };
  }
  if (moduleKey === "companies") {
    return {
      _title: record.company_name,
      _subtitle: `${record.company_type || "未填类型"} / ${record.company_credit_code || "未填信用代码"}`,
      _status: record.company_type || "单位",
      _statusTone: record.company_type === "劳务分包" ? "warn" : "ok",
      _details: details([["项目经理", record.manager_name], ["电话", record.manager_phone], ["注册地区", record.region], ["合约金额", `${record.contract_amount || 0}万`]]),
      _note: record.company_address || "未填写企业地址",
    };
  }
  return {
    _title: record.device_name,
    _subtitle: `${record.device_type || "未填类型"} / ${record.serial_number || "未填序列号"}`,
    _status: record.status || "在线",
    _statusTone: toneFromStatus(record.status),
    _details: details([["方向", record.direction], ["位置", record.location], ["同步", record.last_sync], ["类型", record.device_type]]),
    _note: record.remark || "设备运行正常",
  };
}
