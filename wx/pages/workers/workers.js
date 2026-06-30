const { assetPath } = require("../../config/assets.js");
const {
  getSelectedProject,
  deleteResource,
  listResource,
  updateResource,
} = require("../../utils/construction-api.js");
const { fieldSets, optionLabel } = require("../../utils/construction-fields.js");
const {
  buildDefaultForm,
  buildFormFields,
  buildPayloadFromForm,
  nextUploadValue,
  today,
  uploadForField,
} = require("../../utils/form-utils.js");

function calculateAge(idCard) {
  const birth = String(idCard || "").slice(6, 14);
  if (!/^\d{8}$/.test(birth)) return "";
  const year = Number(birth.slice(0, 4));
  const month = Number(birth.slice(4, 6)) - 1;
  const day = Number(birth.slice(6, 8));
  const now = new Date();
  let age = now.getFullYear() - year;
  if (now < new Date(now.getFullYear(), month, day)) age -= 1;
  return age > 0 ? age : "";
}

Page({
  data: {
    pageHeaderBg: assetPath("/page-header-bg-v1.png"),
    project: null,
    projectName: "",
    keyword: "",
    teamFilter: "全部",
    authFilter: "全部",
    teamOptions: ["全部"],
    authOptions: ["全部", "已认证", "未认证"],
    teamIndex: 0,
    authIndex: 0,
    units: [],
    teams: [],
    workers: [],
    filteredWorkers: [],
    currentWorker: null,
    detailVisible: false,
    editVisible: false,
    editId: "",
    form: {},
    formFields: [],
    saving: false,
  },

  async onLoad() {
    await this.loadData();
  },

  async loadData() {
    const project = getSelectedProject();
    if (!project || !project.id) {
      wx.showToast({ title: "请先选择项目", icon: "none" });
      wx.redirectTo({ url: "/pages/home/home" });
      return;
    }

    this.setData({ project, projectName: project.title || project.name || "已授权项目" });
    try {
      const [unitsResult, teamsResult, workersResult] = await Promise.all([
        listResource(project.id, "units", { page: 1, page_size: 200 }),
        listResource(project.id, "teams", { page: 1, page_size: 200 }),
        listResource(project.id, "workers", { page: 1, page_size: 300 }),
      ]);
      const units = unitsResult.items || [];
      const teams = teamsResult.items || [];
      const workers = (workersResult.items || []).map((worker) => this.decorateWorker(worker, units, teams));
      this.setData({
        units,
        teams,
        workers,
        teamOptions: ["全部"].concat(teams.map((team) => team.name || "未命名班组")),
      }, () => this.refresh());
    } catch (error) {
      wx.showToast({ title: error.message || "工人加载失败", icon: "none" });
    }
  },

  decorateWorker(worker, units = this.data.units, teams = this.data.teams) {
    const team = teams.find((item) => item.id === worker.team_id);
    const unit = units.find((item) => item.id === worker.unit_id);
    return {
      ...worker,
      genderText: optionLabel(fieldSets.workers, "gender", worker.gender, ""),
      age: calculateAge(worker.id_card),
      workType: optionLabel(fieldSets.workers, "work_type", worker.work_type),
      workerType: optionLabel(fieldSets.workers, "worker_type", worker.worker_type),
      team: team ? team.name || "未命名班组" : "未匹配班组",
      unit: unit ? unit.company_name || "未命名单位" : "未匹配单位",
      authStatus: worker.auth_status === 2 ? "已认证" : "未认证",
      settlement: optionLabel(fieldSets.workers, "settlement_type", worker.settlement_type),
      unitPrice: worker.unit_price || "",
      idCard: worker.id_card || "",
      issuingAuthority: worker.visa_office || "",
      validPeriod: [worker.validity_period, worker.validity_period_end].filter(Boolean).join(" 至 "),
      nativePlace: optionLabel(fieldSets.workers, "native_place", worker.native_place, ""),
      avatarUrl: worker.avatar || assetPath("/module-workers.png"),
      statusText: worker.work_status === 2 ? "离场" : "在场",
    };
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value }, () => this.refresh());
  },

  onTeamFilterChange(event) {
    const teamIndex = Number(event.detail.value);
    this.setData({
      teamIndex,
      teamFilter: this.data.teamOptions[teamIndex],
    }, () => this.refresh());
  },

  onAuthFilterChange(event) {
    const authIndex = Number(event.detail.value);
    this.setData({
      authIndex,
      authFilter: this.data.authOptions[authIndex],
    }, () => this.refresh());
  },

  refresh() {
    const kw = String(this.data.keyword || "").trim().toLowerCase();
    const filteredWorkers = this.data.workers.filter((worker) => {
      const text = `${worker.name || ""} ${worker.phone || ""} ${worker.team} ${worker.workType} ${worker.id_card || ""}`.toLowerCase();
      const matchesKeyword = !kw || text.includes(kw);
      const matchesTeam = this.data.teamFilter === "全部" || worker.team === this.data.teamFilter;
      const matchesAuth = this.data.authFilter === "全部" || worker.authStatus === this.data.authFilter;
      return matchesKeyword && matchesTeam && matchesAuth;
    });
    const currentWorker = this.data.currentWorker
      ? filteredWorkers.find((item) => item.id === this.data.currentWorker.id) || this.data.currentWorker
      : filteredWorkers[0] || null;
    this.setData({ filteredWorkers, currentWorker });
  },

  openWorkerDetail(event) {
    const { id } = event.currentTarget.dataset;
    const currentWorker = this.data.workers.find((item) => item.id === id);
    if (!currentWorker) return;
    this.setData({ currentWorker, detailVisible: true });
  },

  closeWorkerDetail() {
    this.setData({ detailVisible: false });
  },

  openEditWorker(event) {
    const id = event.currentTarget.dataset.id || (this.data.currentWorker && this.data.currentWorker.id);
    const worker = this.data.workers.find((item) => item.id === id);
    if (!worker) return;
    const form = buildDefaultForm(fieldSets.workers, worker);
    this.setData({
      editVisible: true,
      editId: id,
      form,
      formFields: buildFormFields(fieldSets.workers, form, this.lookupData()),
    });
  },

  closeEdit() {
    if (this.data.saving) return;
    this.setData({ editVisible: false });
  },

  lookupData() {
    return {
      units: this.data.units,
      teams: this.data.teams,
      workers: this.data.workers,
    };
  },

  onFormInput(event) {
    this.updateFormValue(event.currentTarget.dataset.key, event.detail.value);
  },

  onPickerChange(event) {
    const key = event.currentTarget.dataset.key;
    const field = fieldSets.workers.find((item) => item.key === key);
    if (!field) return;
    const options = buildFormFields([field], this.data.form, this.lookupData())[0].options || [];
    const option = options[Number(event.detail.value)];
    this.updateFormValue(key, option && option.value || "");
  },

  updateFormValue(key, value) {
    const form = { ...this.data.form, [key]: value };
    if (key === "unit_id") {
      const team = this.data.teams.find((item) => item.id === form.team_id);
      if (team && team.unit_id !== value) form.team_id = "";
    }
    this.setData({
      form,
      formFields: buildFormFields(fieldSets.workers, form, this.lookupData()),
    });
  },

  async chooseUpload(event) {
    const key = event.currentTarget.dataset.key;
    const field = fieldSets.workers.find((item) => item.key === key);
    if (!field) return;
    try {
      wx.showLoading({ title: "上传中" });
      const file = await uploadForField(field, {
        bizType: "workers",
        bizId: this.data.editId || this.data.project.id,
      });
      wx.hideLoading();
      this.updateFormValue(key, nextUploadValue(field, this.data.form[key], file));
      wx.showToast({ title: "上传成功", icon: "success" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || "上传失败", icon: "none" });
    }
  },

  async submitEditWorker() {
    if (this.data.saving) return;
    let payload;
    try {
      payload = buildPayloadFromForm(fieldSets.workers, this.data.form);
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
      return;
    }

    this.setData({ saving: true });
    try {
      await updateResource(this.data.project.id, "workers", this.data.editId, payload);
      this.setData({ saving: false, editVisible: false });
      await this.loadData();
      wx.showToast({ title: "工人信息已修改", icon: "success" });
    } catch (error) {
      this.setData({ saving: false });
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  },

  retireWorker(event) {
    const id = event.currentTarget.dataset.id || (this.data.currentWorker && this.data.currentWorker.id);
    const worker = this.data.workers.find((item) => item.id === id);
    if (!worker) return;
    wx.showModal({
      title: "工人退场",
      content: `确认将“${worker.name || "未命名工人"}”标记为离场？`,
      confirmText: "退场",
      confirmColor: "#d93026",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await updateResource(this.data.project.id, "workers", id, {
            work_status: 2,
            exit_time: today(),
          });
          await this.loadData();
          wx.showToast({ title: "已退场", icon: "success" });
        } catch (error) {
          wx.showToast({ title: error.message || "退场失败", icon: "none" });
        }
      },
    });
  },

  deleteWorker(event) {
    const id = event.currentTarget.dataset.id || (this.data.currentWorker && this.data.currentWorker.id);
    const worker = this.data.workers.find((item) => item.id === id);
    if (!worker) return;
    wx.showModal({
      title: "删除工人",
      content: `确认删除“${worker.name || "未命名工人"}”？删除后该工人记录不可在小程序继续查看。`,
      confirmText: "删除",
      confirmColor: "#d93026",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await deleteResource(this.data.project.id, "workers", id);
          this.setData({ detailVisible: false });
          await this.loadData();
          wx.showToast({ title: "已删除", icon: "success" });
        } catch (error) {
          wx.showToast({ title: error.message || "删除失败", icon: "none" });
        }
      },
    });
  },

  showAction(event) {
    const { name } = event.currentTarget.dataset;
    if (name === "批量退场") {
      wx.showToast({ title: "请逐个确认退场", icon: "none" });
      return;
    }
    wx.showToast({ title: `${name}功能待设备接口开放`, icon: "none" });
  },

  saveWorker() {
    this.openEditWorker({ currentTarget: { dataset: { id: this.data.currentWorker && this.data.currentWorker.id } } });
  },

  goBack() {
    if (this.data.editVisible) {
      this.closeEdit();
      return;
    }
    if (this.data.detailVisible) {
      this.closeWorkerDetail();
      return;
    }
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.redirectTo({ url: "/pages/home/home" });
  },
});
