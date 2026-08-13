const { assetPath } = require("../config/assets.js");
const {
  createResource,
  deleteResource,
  getSelectedProject,
  listResource,
  updateResource,
} = require("./construction-api.js");
const { fieldSets, optionLabel } = require("./construction-fields.js");
const {
  buildDefaultForm,
  buildFormFields,
  buildPayloadFromForm,
  nextUploadValue,
  previewUploadedFile,
  uploadForField,
} = require("./form-utils.js");
const regions3Level = require("./china-regions-3level.js");

const resourceByModule = {
  teams: "teams",
  companies: "units",
  device: "attendance-devices",
};

const HEARTBEAT_ONLINE_WINDOW_MS = 3 * 60 * 1000;
const B_VENDOR_ONLINE_WINDOW_MS = 15 * 60 * 1000;
const B_VENDOR_DEVICE_TYPE = "弹厂家";
const LIST_PAGE_SIZE = 10;

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
    fields: fieldSets.teams,
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
      { label: "总承包单位", value: "1" },
      { label: "建设单位", value: "4" },
      { label: "劳务分包", value: "3" },
    ],
    filterField: "company_type",
    fields: fieldSets.units,
  },
  device: {
    key: "device",
    title: "考勤机状态",
    shortTitle: "设备",
    kicker: "设备 / 在线状态",
    subtitle: "查看考勤机当前在线状态、厂家、序列号和进出方向。",
    formHint: "对应 PC 考勤机绑定：厂家类型、名称、序列号、方向和备注。",
    searchPlaceholder: "搜索厂家、序列号、设备名称",
    primaryMetric: "在线设备",
    secondaryMetric: "设备总数",
    attentionMetric: "未在线",
    filters: [
      { label: "全部", value: "all" },
      { label: "在线", value: "online" },
      { label: "离线", value: "offline" },
      { label: "未连接", value: "unknown" },
    ],
    filterField: "online_status",
    fields: fieldSets.devices,
  },
};

function createModulePage(fixedModuleKey) {
  const initialModuleKey = moduleConfigs[fixedModuleKey] ? fixedModuleKey : "teams";

  return {
    data: {
      moduleKey: initialModuleKey,
      module: moduleConfigs[initialModuleKey],
      records: [],
      filteredRecords: [],
      total: 0,
      page: 1,
      pageSize: LIST_PAGE_SIZE,
      hasMore: false,
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
      lookups: { units: [], teams: [], workers: [] },
      project: null,
      projectName: "",
      canManage: false,
      loading: false,
      loadingMore: false,
      saving: false,
    },

    async onLoad() {
      await this.applyModule(initialModuleKey);
    },

    async applyModule(moduleKey) {
    const module = moduleConfigs[moduleKey];
    const project = getSelectedProject();
    if (!project || !project.id) {
      wx.showToast({ title: "请先选择项目", icon: "none" });
      wx.redirectTo({ url: "/pages/home/home" });
      return;
    }

    this.setData({
      moduleKey,
      module,
      project,
      projectName: project.title,
      canManage: canManageModule(moduleKey),
      loading: true,
      loadingMore: false,
      keyword: "",
      filterValue: "all",
      page: 1,
      hasMore: false,
      formVisible: false,
    });

    try {
      const lookups = await this.loadLookups(project.id, moduleKey);
      const result = await this.loadRecords(moduleKey, project.id);
      this.setData({ lookups, loading: false });
      this.refresh(result.items || [], result.total, 1);
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message || "加载失败", icon: "none" });
    }
  },

    async loadLookups(projectId, moduleKey) {
    const lookups = { units: [], teams: [], workers: [] };
    if (moduleKey === "teams") {
      const [units, workers] = await Promise.all([
        listResource(projectId, "units", { page: 1, page_size: 200 }),
        listResource(projectId, "workers", { page: 1, page_size: 200 }),
      ]);
      lookups.units = units.items || [];
      lookups.workers = workers.items || [];
    }
    return lookups;
  },

    async loadRecords(moduleKey, projectId = this.data.project.id, page = 1) {
    return listResource(projectId, resourceByModule[moduleKey], {
      page,
      page_size: this.data.pageSize || LIST_PAGE_SIZE,
      ...this.buildListParams(moduleKey),
    });
  },

    buildListParams(moduleKey = this.data.moduleKey) {
    const params = {};
    const keyword = String(this.data.keyword || "").trim();
    if (keyword) {
      params.keyword = keyword;
    }
    if (moduleKey === "companies" && this.data.filterValue !== "all") {
      params.company_type = this.data.filterValue;
    }
    if (moduleKey === "teams") {
      if (this.data.filterValue === "正常") {
        params.attendance_configured = true;
      }
      if (this.data.filterValue === "待完善") {
        params.attendance_configured = false;
      }
    }
    return params;
  },

    refresh(records = this.data.records, total = this.data.total, page = this.data.page) {
    const filtered = this.filterRecords(records, this.data.filterValue);
    const normalizedTotal = Number.isFinite(Number(total)) ? Number(total) : records.length;
    this.setData({
      records,
      filteredRecords: this.decorateRecords(this.data.moduleKey, filtered),
      summary: this.buildSummary(this.data.moduleKey, records, normalizedTotal),
      total: normalizedTotal,
      page,
      hasMore: records.length < normalizedTotal,
    });
  },

    filterRecords(records, filterValue) {
    const filterField = this.data.module.filterField;
    return records.filter((record) => {
      const fieldValue = this.data.moduleKey === "teams" && filterField === "status"
        ? getTeamStatus(record)
        : this.data.moduleKey === "device" && filterField === "online_status"
        ? getDeviceStatusKey(record)
        : String(record[filterField] === undefined || record[filterField] === null ? "" : record[filterField]);
      const matchesFilter = filterValue === "all" || fieldValue === filterValue;
      return matchesFilter;
    });
  },

    decorateRecords(moduleKey, records) {
    return records.map((record) => {
      const view = buildRecordView(moduleKey, record, this.data.lookups);
      return { ...record, ...view };
    });
  },

    buildSummary(moduleKey, records, total = records.length) {
    if (moduleKey === "teams") {
      const attentionCount = records.filter((item) => getTeamStatus(item) === "待完善").length;
      return {
        primary: total,
        secondary: this.data.lookups.workers.length,
        attention: attentionCount,
      };
    }
    if (moduleKey === "companies") {
      return {
        primary: total,
        secondary: `${sumBy(records, "contract_amount")}万`,
        attention: countBy(records, "company_type", "3"),
      };
    }
    const onlineCount = records.filter(isDeviceOnline).length;
    return {
      primary: onlineCount,
      secondary: records.length,
      attention: records.length - onlineCount,
    };
  },

  onKeywordInput(event) {
    const keyword = event.detail.value;
    this.setData({ keyword });
  },

  async submitSearch() {
    await this.reloadRecords({ append: false });
  },

    async setFilter(event) {
    const filterValue = event.currentTarget.dataset.value;
    this.setData({ filterValue });
    await this.reloadRecords({ append: false });
  },

    async reloadRecords({ append = false } = {}) {
    if (append) {
      if (this.data.loadingMore || this.data.loading || !this.data.hasMore) return;
    } else if (this.data.loading) {
      return;
    }

    const page = append ? this.data.page + 1 : 1;
    this.setData(append ? { loadingMore: true } : { loading: true, hasMore: false });
    try {
      const result = await this.loadRecords(this.data.moduleKey, this.data.project.id, page);
      const records = append ? this.data.records.concat(result.items || []) : result.items || [];
      this.setData({ loading: false, loadingMore: false });
      this.refresh(records, result.total, page);
    } catch (error) {
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: error.message || "搜索失败", icon: "none" });
    }
  },

    async onReachBottom() {
    await this.reloadRecords({ append: true });
  },

    openCreate() {
    if (!this.data.canManage) {
      wx.showToast({ title: "当前账号仅可查看", icon: "none" });
      return;
    }
    const overrides = {};
    if (this.data.moduleKey === "teams" && this.data.lookups.units.length) {
      overrides.unit_id = this.data.lookups.units[0].id;
    }
    const form = buildDefaultForm(this.data.module.fields, {}, overrides);
    this.setData({
      formVisible: true,
      formMode: "create",
      editingId: "",
      formTitle: `新增${this.data.module.shortTitle}`,
      form,
      formFields: buildFormFields(this.data.module.fields, form, this.data.lookups),
    });
  },

    openEdit(event) {
    if (!this.data.canManage) {
      wx.showToast({ title: "当前账号仅可查看", icon: "none" });
      return;
    }
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
      formFields: buildFormFields(this.data.module.fields, form, this.data.lookups),
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
    if (!field) return;
    const options = buildFormFields([field], this.data.form, this.data.lookups)[0].options || [];
    const option = options[Number(event.detail.value)];
    this.updateFormValue(key, option && option.value || "");
  },

    onRegionProvinceChange(event) {
    const idx = Number(event.detail.value);
    const province = regions3Level[idx];
    if (!province) return;
    const key = event.currentTarget.dataset.key;
    const field = this.data.module.fields.find((item) => item.key === key);
    if (!field) return;
    const nameKey = field.regionNameKey || "address_code_list";
    const nextCode = field.regionRequireDistrict ? "" : `${province.code}0000`;
    this.updateFormValue(key, nextCode, { [nameKey]: province.name });
  },

    onRegionCityChange(event) {
    const provIdx = Number(event.currentTarget.dataset.provinceIndex);
    const province = regions3Level[provIdx];
    if (!province) return;
    const cityIdx = Number(event.detail.value);
    const city = (province.children || [])[cityIdx];
    if (!city) return;
    const key = event.currentTarget.dataset.key;
    const field = this.data.module.fields.find((item) => item.key === key);
    if (!field) return;
    const nameKey = field.regionNameKey || "address_code_list";
    const nextCode = field.regionRequireDistrict ? "" : `${city.code}00`;
    this.updateFormValue(key, nextCode, { [nameKey]: `${province.name}/${city.name}` });
  },

    onRegionDistrictChange(event) {
    const provIdx = Number(event.currentTarget.dataset.provinceIndex);
    const province = regions3Level[provIdx];
    if (!province) return;
    const cityIdx = Number(event.currentTarget.dataset.cityIndex);
    const city = (province.children || [])[cityIdx];
    if (!city) return;
    const distIdx = Number(event.detail.value);
    const district = (city.children || [])[distIdx];
    if (!district) return;
    const key = event.currentTarget.dataset.key;
    const field = this.data.module.fields.find((item) => item.key === key);
    if (!field) return;
    const nameKey = field.regionNameKey || "address_code_list";
    this.updateFormValue(key, district.code, { [nameKey]: `${province.name}/${city.name}/${district.name}` });
  },

    updateFormValue(key, value, extras = {}) {
    const form = applyDerivedFormValues(this.data.moduleKey, { ...this.data.form, [key]: value, ...extras }, key, this.data.lookups);
    this.setData({
      form,
      formFields: buildFormFields(this.data.module.fields, form, this.data.lookups),
    });
  },

    async chooseUpload(event) {
    const key = event.currentTarget.dataset.key;
    const field = this.data.module.fields.find((item) => item.key === key);
    if (!field) return;
    try {
      wx.showLoading({ title: "上传中" });
      const { file } = await uploadForField(field, {
        bizType: this.data.moduleKey,
        bizId: this.data.editingId || this.data.project.id,
      });
      wx.hideLoading();
      this.updateFormValue(key, nextUploadValue(field, this.data.form[key], file));
      wx.showToast({ title: "上传成功", icon: "success" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || "上传失败", icon: "none" });
    }
  },

  previewUpload(event) {
    const { url, name, isImage } = event.currentTarget.dataset;
    previewUploadedFile({ url, name, isImage: isImage === true || isImage === "true" });
  },

    async saveRecord() {
    if (this.data.saving) return;
    if (!this.data.canManage) {
      wx.showToast({ title: "当前账号仅可查看", icon: "none" });
      return;
    }
    let payload;
    try {
      payload = buildPayloadFromForm(this.data.module.fields, this.data.form);
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
      return;
    }

    this.setData({ saving: true });
    try {
      if (this.data.formMode === "edit") {
        await updateResource(
          this.data.project.id,
          resourceByModule[this.data.moduleKey],
          this.data.editingId,
          payload
        );
      } else {
        await createResource(this.data.project.id, resourceByModule[this.data.moduleKey], payload);
      }
      const result = await this.loadRecords(this.data.moduleKey);
      this.setData({ formVisible: false, saving: false });
      this.refresh(result.items || [], result.total, 1);
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (error) {
      this.setData({ saving: false });
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  },

    deleteRecord(event) {
    if (!this.data.canManage) {
      wx.showToast({ title: "当前账号仅可查看", icon: "none" });
      return;
    }
    const id = event.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    wx.showModal({
      title: "删除记录",
      content: `确认删除“${buildRecordView(this.data.moduleKey, record)._title}”？`,
      confirmColor: "#d65a44",
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await deleteResource(this.data.project.id, resourceByModule[this.data.moduleKey], id);
          const result = await this.loadRecords(this.data.moduleKey);
          this.refresh(result.items || [], result.total, 1);
          wx.showToast({ title: "已删除", icon: "success" });
        } catch (error) {
          wx.showToast({ title: error.message || "删除失败", icon: "none" });
        }
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

function countBy(records, key, value) {
  return records.filter((item) => String(item[key] === undefined || item[key] === null ? "" : item[key]) === value).length;
}

function sumBy(records, key) {
  return records.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function toneFromStatus(status) {
  if (["正常", "在场", "有效", "在线", "进场"].includes(status)) return "ok";
  if (["待完善", "待补图", "维护中", "未连接"].includes(status)) return "warn";
  if (["异常", "离场", "离线"].includes(status)) return "danger";
  return "";
}

function canManageModule(moduleKey) {
  return moduleKey !== "device" || isAdminUser(wx.getStorageSync("shanhuai_user"));
}

function isAdminUser(user) {
  const role = String(user && user.role || "").toLowerCase();
  if (role === "admin") return true;
  const roles = Array.isArray(user && user.roles) ? user.roles : [];
  return roles.some((item) => String(item).toLowerCase() === "admin");
}

function getTeamStatus(record) {
  return record.attendance_start_time && record.attendance_end_time ? "正常" : "待完善";
}

function isDeviceOnline(record) {
  if (record.device_type === B_VENDOR_DEVICE_TYPE) {
    if (!record.last_seen_at) return false;
    const lastSeenAt = new Date(record.last_seen_at).getTime();
    return !Number.isNaN(lastSeenAt) && Date.now() - lastSeenAt <= B_VENDOR_ONLINE_WINDOW_MS;
  }

  if (record.online_status === "offline") return false;
  if (!record.last_heartbeat_at) return record.online_status === "online";

  const heartbeatAt = new Date(record.last_heartbeat_at).getTime();
  if (Number.isNaN(heartbeatAt)) return record.online_status === "online";

  return Date.now() - heartbeatAt <= HEARTBEAT_ONLINE_WINDOW_MS;
}

function getDeviceStatusKey(record) {
  if (isDeviceOnline(record)) return "online";
  const activityAt = record.device_type === B_VENDOR_DEVICE_TYPE
    ? record.last_seen_at
    : record.last_heartbeat_at;
  return activityAt || record.online_status === "offline" ? "offline" : "unknown";
}

function getDeviceStatusLabel(record) {
  const status = getDeviceStatusKey(record);
  if (status === "online") return "在线";
  if (status === "offline") return "离线";
  return "未连接";
}

function details(items) {
  return items.map(([label, value]) => ({ label, value: value || "未填写" }));
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildRecordView(moduleKey, record, lookups = {}) {
  if (moduleKey === "teams") {
    const status = getTeamStatus(record);
    const unit = (lookups.units || []).find((item) => item.id === record.unit_id);
    const workerCount = (lookups.workers || []).filter((item) => item.team_id === record.id).length;
    return {
      _title: record.name,
      _subtitle: `${(unit && unit.company_name) || "未关联单位"} / ${optionLabel(fieldSets.teams, "work_type", record.work_type, "未填工种")}`,
      _status: status,
      _statusTone: toneFromStatus(status),
      _details: details([
        ["工种", optionLabel(fieldSets.teams, "work_type", record.work_type)],
        ["参建单位", unit && unit.company_name],
        ["考勤时段", `${record.attendance_start_time || ""}-${record.attendance_end_time || ""}`],
        ["工人数", `${workerCount}人`],
      ]),
      _note: `${optionLabel(fieldSets.teams, "settlement_type", record.settlement_type, "未填结算方式")} / 班组长：${record.leader_name || "暂无"}`,
    };
  }
  if (moduleKey === "companies") {
    return {
      _title: record.company_name,
      _subtitle: `${optionLabel(fieldSets.units, "company_type", record.company_type, "未填类型")} / ${record.company_credit_code || "未填信用代码"}`,
      _status: optionLabel(fieldSets.units, "company_type", record.company_type, "单位"),
      _statusTone: String(record.company_type) === "3" ? "warn" : "ok",
      _details: details([["负责人", record.manager_name], ["电话", record.manager_phone], ["注册地区", record.register_area_list || record.register_area], ["合同金额", `${record.contract_amount || 0}万`]]),
      _note: record.company_address || "未填写企业地址",
    };
  }
  const status = getDeviceStatusLabel(record);
  const isBVendor = record.device_type === B_VENDOR_DEVICE_TYPE;
  const activityAt = isBVendor ? record.last_seen_at : record.last_heartbeat_at;
  return {
    _title: record.device_name || "未命名设备",
    _subtitle: `${record.device_type || "海厂家"} / ${record.serial_number || "未填序列号"}`,
    _status: status,
    _statusTone: toneFromStatus(status),
    _details: details([
      ["当前状态", status],
      [isBVendor ? "最近通信" : "最近心跳", formatDateTime(activityAt)],
      ["进出方向", optionLabel(fieldSets.devices, "direction", record.direction)],
      ["厂家类型", record.device_type || "海厂家"],
      ["序列号", record.serial_number],
      ["设备名称", record.device_name],
    ]),
    _note: record.remark || (status === "在线" ? "设备当前在线" : isBVendor ? "暂无近期通信" : "暂无在线心跳"),
  };
}

function applyDerivedFormValues(moduleKey, form, changedKey, lookups) {
  if (moduleKey !== "teams") return form;

  // 与 Web 端一致：切换管理班组时自动带出/清空项目管理部工种（1001）
  if (changedKey === "is_manage_team") {
    return {
      ...form,
      work_type: form.is_manage_team === "true" ? "1001" : form.work_type === "1001" ? "" : form.work_type,
    };
  }

  if (changedKey === "leader_id") {
    const leader = (lookups.workers || []).find((item) => item.id === form.leader_id);
    return {
      ...form,
      leader_name: leader ? leader.name || "" : "",
      leader_phone: leader ? leader.phone || "" : "",
      leader_id_card: leader ? leader.id_card || "" : "",
    };
  }

  return form;
}
