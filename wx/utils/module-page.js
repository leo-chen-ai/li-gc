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
  uploadForField,
} = require("./form-utils.js");

const resourceByModule = {
  teams: "teams",
  companies: "units",
  device: "attendance-devices",
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
    title: "考勤机模式",
    shortTitle: "设备",
    kicker: "设备 / 闸机同步",
    subtitle: "维护考勤设备、序列号、安装位置、进出方向和状态。",
    formHint: "对应 PC 考勤设备：设备类型、名称、序列号、方向和备注。",
    searchPlaceholder: "搜索设备、序列号、位置",
    primaryMetric: "进场",
    secondaryMetric: "设备总数",
    attentionMetric: "通用",
    filters: [
      { label: "全部", value: "all" },
      { label: "进场", value: "0" },
      { label: "出场", value: "1" },
      { label: "通用", value: "2" },
    ],
    filterField: "direction",
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
      loading: false,
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
      loading: true,
      keyword: "",
      filterValue: "all",
      formVisible: false,
    });

    try {
      const lookups = await this.loadLookups(project.id, moduleKey);
      const records = await this.loadRecords(moduleKey, project.id);
      this.setData({ lookups, loading: false });
      this.refresh(records);
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

    async loadRecords(moduleKey, projectId = this.data.project.id) {
    const result = await listResource(projectId, resourceByModule[moduleKey], {
      page: 1,
      page_size: 200,
    });
    return result.items || [];
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
      const fieldValue = this.data.moduleKey === "teams" && filterField === "status"
        ? getTeamStatus(record)
        : String(record[filterField] === undefined || record[filterField] === null ? "" : record[filterField]);
      const matchesFilter = filterValue === "all" || fieldValue === filterValue;
      const text = Object.values(record).join(" ").toLowerCase();
      return matchesFilter && (!normalizedKeyword || text.includes(normalizedKeyword));
    });
  },

    decorateRecords(moduleKey, records) {
    return records.map((record) => {
      const view = buildRecordView(moduleKey, record, this.data.lookups);
      return { ...record, ...view };
    });
  },

    buildSummary(moduleKey, records) {
    if (moduleKey === "teams") {
      const normalCount = records.filter((item) => getTeamStatus(item) === "正常").length;
      const attentionCount = records.filter((item) => getTeamStatus(item) === "待完善").length;
      return {
        primary: normalCount,
        secondary: this.data.lookups.workers.length,
        attention: attentionCount,
      };
    }
    if (moduleKey === "companies") {
      return {
        primary: records.length,
        secondary: `${sumBy(records, "contract_amount")}万`,
        attention: countBy(records, "company_type", "3"),
      };
    }
    return {
      primary: countBy(records, "direction", "0"),
      secondary: records.length,
      attention: countBy(records, "direction", "2"),
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

    updateFormValue(key, value) {
    const form = applyDerivedFormValues(this.data.moduleKey, { ...this.data.form, [key]: value }, key, this.data.lookups);
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
      const file = await uploadForField(field, {
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

    async saveRecord() {
    if (this.data.saving) return;
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
      const records = await this.loadRecords(this.data.moduleKey);
      this.setData({ formVisible: false, saving: false });
      this.refresh(records);
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (error) {
      this.setData({ saving: false });
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  },

    deleteRecord(event) {
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
          const records = await this.loadRecords(this.data.moduleKey);
          this.refresh(records);
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
  if (["待完善", "待补图", "维护中"].includes(status)) return "warn";
  if (["异常", "离场", "离线"].includes(status)) return "danger";
  return "";
}

function getTeamStatus(record) {
  return record.attendance_start_time && record.attendance_end_time ? "正常" : "待完善";
}

function details(items) {
  return items.map(([label, value]) => ({ label, value: value || "未填写" }));
}

function buildRecordView(moduleKey, record, lookups = {}) {
  if (moduleKey === "teams") {
    const status = getTeamStatus(record);
    const unit = (lookups.units || []).find((item) => item.id === record.unit_id);
    const workerCount = (lookups.workers || []).filter((item) => item.team_id === record.id).length;
    return {
      _title: record.name,
      _subtitle: `${record.team_no || "未填编号"} / ${(unit && unit.company_name) || "未关联单位"} / ${optionLabel(fieldSets.teams, "work_type", record.work_type, "未填工种")}`,
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
  return {
    _title: record.device_name,
    _subtitle: `${record.device_type || "未填类型"} / ${record.serial_number || "未填序列号"}`,
    _status: optionLabel(fieldSets.devices, "direction", record.direction, "进场"),
    _statusTone: toneFromStatus(optionLabel(fieldSets.devices, "direction", record.direction, "")),
    _details: details([["方向", optionLabel(fieldSets.devices, "direction", record.direction)], ["设备类型", record.device_type], ["序列号", record.serial_number], ["设备名称", record.device_name]]),
    _note: record.remark || "设备运行正常",
  };
}

function applyDerivedFormValues(moduleKey, form, changedKey, lookups) {
  if (moduleKey !== "teams") return form;

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
