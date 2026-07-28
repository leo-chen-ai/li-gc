const { assetPath } = require("../../config/assets.js");
const { resolveAssetUrl } = require("../../config/api.js");
const {
  getSelectedProject,
  deleteResource,
  listResource,
  updateResource,
  uploadConstructionFile,
} = require("../../utils/construction-api.js");
const { fieldSets, optionLabel } = require("../../utils/construction-fields.js");
const { provinces, nativePlaceParts, nativePlaceLabel } = require("../../utils/china-regions.js");
const {
  buildDefaultForm,
  buildFormFields,
  buildPayloadFromForm,
  nextUploadValue,
  previewUploadedFile,
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

const LIST_PAGE_SIZE = 10;

Page({
  data: {
    pageHeaderBg: assetPath("/page-header-bg-v1.png"),
    workStatus: 1,
    statusLabel: "在场",
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
    total: 0,
    page: 1,
    pageSize: LIST_PAGE_SIZE,
    hasMore: false,
    currentWorker: null,
    detailVisible: false,
    editVisible: false,
    editId: "",
    form: {},
    formFields: [],
    loading: false,
    loadingMore: false,
    saving: false,
    batchMode: false,
    selectedWorkerIds: [],
    batchRetiring: false,
    reentryVisible: false,
    reentryWorker: null,
    reentryTeamIndex: 0,
    reentryTeamName: "",
    reentryEntryTime: today(),
    reentrySaving: false,
    signatureVisible: false,
    signatureUploading: false,
    signatureMode: "",
  },

  async onLoad(options = {}) {
    const workStatus = Number(options.status) === 2 ? 2 : 1;
    this.setData({ workStatus, statusLabel: workStatus === 2 ? "离场" : "在场" });
    await this.loadData();
  },

  async loadData() {
    const project = getSelectedProject();
    if (!project || !project.id) {
      wx.showToast({ title: "请先选择项目", icon: "none" });
      wx.redirectTo({ url: "/pages/home/home" });
      return;
    }

    this.setData({
      project,
      projectName: project.title || project.name || "已授权项目",
      loading: true,
      loadingMore: false,
      page: 1,
      hasMore: false,
    });
    try {
      const [unitsResult, teamsResult] = await Promise.all([
        listResource(project.id, "units", { page: 1, page_size: 100 }),
        listResource(project.id, "teams", { page: 1, page_size: 100 }),
      ]);
      const units = unitsResult.items || [];
      const teams = teamsResult.items || [];
      this.setData({
        units,
        teams,
        teamOptions: ["全部"].concat(teams.map((team) => team.name || "未命名班组")),
      });
      const workersResult = await this.loadWorkers(1);
      this.setData({ loading: false });
      this.applyWorkersResult(workersResult, 1, false);
    } catch (error) {
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: error.message || "工人加载失败", icon: "none" });
    }
  },

  async loadWorkers(page = 1) {
    return listResource(this.data.project.id, "workers", this.buildWorkerListParams(page));
  },

  buildWorkerListParams(page = 1) {
    const params = {
      page,
      page_size: this.data.pageSize || LIST_PAGE_SIZE,
      work_status: this.data.workStatus,
    };
    const keyword = String(this.data.keyword || "").trim();
    if (keyword) {
      params.keyword = keyword;
    }
    if (this.data.teamIndex > 0) {
      const team = this.data.teams[this.data.teamIndex - 1];
      if (team && team.id) {
        params.team_id = team.id;
      }
    }
    if (this.data.authFilter === "已认证") {
      params.auth_status = 2;
    }
    if (this.data.authFilter === "未认证") {
      params.auth_status = "unverified";
    }
    return params;
  },

  applyWorkersResult(result, page, append) {
    const selected = new Set(this.data.selectedWorkerIds);
    const items = (result.items || []).map((worker) => ({
      ...this.decorateWorker(worker),
      batchSelected: selected.has(worker.id),
    }));
    const workers = append ? this.data.workers.concat(items) : items;
    const total = Number.isFinite(Number(result.total)) ? Number(result.total) : workers.length;
    const currentWorker = this.data.currentWorker
      ? workers.find((item) => item.id === this.data.currentWorker.id) || this.data.currentWorker
      : workers[0] || null;

    this.setData({
      workers,
      filteredWorkers: workers,
      currentWorker,
      total,
      page,
      hasMore: workers.length < total,
    });
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
      nativePlace: nativePlaceLabel(worker.native_place, ""),
      avatarUrl: resolveAssetUrl(worker.avatar) || assetPath("/module-workers.png"),
      idCardFrontUrl: resolveAssetUrl(worker.ocr_photo),
      idCardBackUrl: resolveAssetUrl(worker.id_card_back_file),
      signatureUrl: resolveAssetUrl(worker.signature_photo),
      statusText: worker.work_status === 2 ? "离场" : "在场",
    };
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  onTeamFilterChange(event) {
    const teamIndex = Number(event.detail.value);
    this.setData({
      teamIndex,
      teamFilter: this.data.teamOptions[teamIndex],
    }, () => this.submitSearch());
  },

  onAuthFilterChange(event) {
    const authIndex = Number(event.detail.value);
    this.setData({
      authIndex,
      authFilter: this.data.authOptions[authIndex],
    }, () => this.submitSearch());
  },

  async submitSearch() {
    await this.reloadWorkers({ append: false });
  },

  async reloadWorkers({ append = false } = {}) {
    if (append) {
      if (this.data.loadingMore || this.data.loading || !this.data.hasMore) return;
    } else if (this.data.loading) {
      return;
    }

    const page = append ? this.data.page + 1 : 1;
    this.setData(append ? { loadingMore: true } : { loading: true, hasMore: false });
    try {
      const result = await this.loadWorkers(page);
      this.setData({ loading: false, loadingMore: false });
      this.applyWorkersResult(result, page, append);
    } catch (error) {
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: error.message || "工人加载失败", icon: "none" });
    }
  },

  async onReachBottom() {
    if (this.data.detailVisible || this.data.editVisible) return;
    await this.reloadWorkers({ append: true });
  },

  openWorkerDetail(event) {
    const { id } = event.currentTarget.dataset;
    const currentWorker = this.data.workers.find((item) => item.id === id);
    if (!currentWorker) return;
    this.setData({ currentWorker, detailVisible: true });
  },

  handleWorkerTap(event) {
    if (this.data.batchMode) {
      this.toggleWorkerSelection(event);
      return;
    }
    this.openWorkerDetail(event);
  },

  toggleBatchMode() {
    if (this.data.workStatus !== 1 || this.data.batchRetiring) return;
    this.setData({
      batchMode: !this.data.batchMode,
      selectedWorkerIds: [],
      workers: this.data.workers.map((worker) => ({ ...worker, batchSelected: false })),
      filteredWorkers: this.data.filteredWorkers.map((worker) => ({ ...worker, batchSelected: false })),
    });
  },

  toggleWorkerSelection(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) return;
    const selected = new Set(this.data.selectedWorkerIds);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    const markSelection = (worker) => ({ ...worker, batchSelected: selected.has(worker.id) });
    this.setData({
      selectedWorkerIds: Array.from(selected),
      workers: this.data.workers.map(markSelection),
      filteredWorkers: this.data.filteredWorkers.map(markSelection),
    });
  },

  confirmBatchRetire() {
    const ids = this.data.selectedWorkerIds;
    if (!ids.length || this.data.batchRetiring) {
      wx.showToast({ title: "请先选择工人", icon: "none" });
      return;
    }
    wx.showModal({
      title: "批量退场",
      content: `确认将已选择的 ${ids.length} 名工人标记为离场？`,
      confirmText: "确认退场",
      confirmColor: "#d93026",
      success: async (result) => {
        if (!result.confirm) return;
        this.setData({ batchRetiring: true });
        try {
          for (const id of ids) {
            await updateResource(this.data.project.id, "workers", id, {
              work_status: 2,
              exit_time: today(),
            });
          }
          this.setData({ batchRetiring: false, batchMode: false, selectedWorkerIds: [] });
          await this.reloadWorkers({ append: false });
          wx.showToast({ title: `已退场${ids.length}人`, icon: "success" });
        } catch (error) {
          this.setData({ batchRetiring: false });
          wx.showToast({ title: error.message || "批量退场失败", icon: "none" });
        }
      },
    });
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

  onNativeProvinceChange(event) {
    const province = provinces[Number(event.detail.value)];
    if (province) this.updateFormValue("native_place", `${province.code}0000`);
  },

  onNativeCityChange(event) {
    const { province } = nativePlaceParts(this.data.form.native_place);
    const city = province && province.cities[Number(event.detail.value)];
    if (city) this.updateFormValue("native_place", `${city.code}00`);
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
      const { file } = await uploadForField(field, {
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

  previewUpload(event) {
    const { url, name, isImage } = event.currentTarget.dataset;
    previewUploadedFile({ url, name, isImage: isImage === true || isImage === "true" });
  },

  openFormSignature() {
    this.setData({ signatureVisible: true, signatureMode: "form" });
  },

  openDetailSignature() {
    if (!this.data.currentWorker) return;
    this.setData({ signatureVisible: true, signatureMode: "detail" });
  },

  closeSignaturePad() {
    if (this.data.signatureUploading) return;
    this.setData({ signatureVisible: false, signatureMode: "" });
  },

  async onSignatureConfirm(event) {
    const tempFilePath = event.detail && event.detail.tempFilePath;
    if (!tempFilePath || this.data.signatureUploading) return;
    const mode = this.data.signatureMode;
    const worker = this.data.currentWorker;
    this.setData({ signatureUploading: true });
    try {
      const file = await uploadConstructionFile(tempFilePath, {
        bizType: "workers",
        bizId: (mode === "detail" ? worker && worker.id : this.data.editId) || this.data.project.id,
        fieldKey: "signature_photo",
      });
      const url = file.public_url || file.object_key || "";
      if (mode === "form") {
        this.updateFormValue("signature_photo", url);
        this.setData({ signatureUploading: false, signatureVisible: false, signatureMode: "" });
        wx.showToast({ title: "签字已上传", icon: "success" });
        return;
      }
      await updateResource(this.data.project.id, "workers", worker.id, {
        signature_photo: url,
        signature_time: today(),
      });
      this.setData({ signatureUploading: false, signatureVisible: false, signatureMode: "" });
      await this.reloadWorkers({ append: false });
      wx.showToast({ title: "签字已保存", icon: "success" });
    } catch (error) {
      this.setData({ signatureUploading: false });
      wx.showToast({ title: error.message || "签字上传失败", icon: "none" });
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
      await this.reloadWorkers({ append: false });
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
          await this.reloadWorkers({ append: false });
          wx.showToast({ title: "已退场", icon: "success" });
        } catch (error) {
          wx.showToast({ title: error.message || "退场失败", icon: "none" });
        }
      },
    });
  },

  openReentry(event) {
    const id = event.currentTarget.dataset.id || (this.data.currentWorker && this.data.currentWorker.id);
    const worker = this.data.workers.find((item) => item.id === id);
    if (!worker) return;
    if (!this.data.teams.length) {
      wx.showToast({ title: "请先维护班组", icon: "none" });
      return;
    }

    const teamIndex = Math.max(0, this.data.teams.findIndex((team) => team.id === worker.team_id));
    const team = this.data.teams[teamIndex];
    this.setData({
      reentryVisible: true,
      reentryWorker: worker,
      reentryTeamIndex: teamIndex,
      reentryTeamName: team.name || "未命名班组",
      reentryEntryTime: today(),
    });
  },

  closeReentry() {
    if (this.data.reentrySaving) return;
    this.setData({ reentryVisible: false, reentryWorker: null });
  },

  onReentryTeamChange(event) {
    const reentryTeamIndex = Number(event.detail.value);
    const team = this.data.teams[reentryTeamIndex];
    this.setData({
      reentryTeamIndex,
      reentryTeamName: team ? team.name || "未命名班组" : "",
    });
  },

  onReentryDateChange(event) {
    this.setData({ reentryEntryTime: event.detail.value });
  },

  async submitReentry() {
    const worker = this.data.reentryWorker;
    const team = this.data.teams[this.data.reentryTeamIndex];
    const entryTime = this.data.reentryEntryTime;
    if (!worker || !team || !entryTime || this.data.reentrySaving) return;

    this.setData({ reentrySaving: true });
    try {
      await updateResource(this.data.project.id, "workers", worker.id, {
        unit_id: team.unit_id,
        team_id: team.id,
        work_status: 1,
        entry_time: entryTime,
        exit_time: null,
      });
      this.setData({ reentrySaving: false, reentryVisible: false, reentryWorker: null, detailVisible: false });
      await this.reloadWorkers({ append: false });
      wx.showToast({ title: "已办理进场", icon: "success" });
    } catch (error) {
      this.setData({ reentrySaving: false });
      wx.showToast({ title: error.message || "进场失败", icon: "none" });
    }
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
          await this.reloadWorkers({ append: false });
          wx.showToast({ title: "已删除", icon: "success" });
        } catch (error) {
          wx.showToast({ title: error.message || "删除失败", icon: "none" });
        }
      },
    });
  },

  showAction(event) {
    const { name } = event.currentTarget.dataset;
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
