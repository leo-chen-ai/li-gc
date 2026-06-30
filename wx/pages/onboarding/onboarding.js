const { assetPath } = require("../../config/assets.js");
const {
  createResource,
  getSelectedProject,
  listResource,
  updateResource,
} = require("../../utils/construction-api.js");
const { fieldSets } = require("../../utils/construction-fields.js");
const {
  buildDefaultForm,
  buildFormFields,
  buildPayloadFromForm,
  nextUploadValue,
  today,
  uploadForField,
} = require("../../utils/form-utils.js");

function buildSections(formFields) {
  return formFields.reduce((sections, field) => {
    const name = field.section || "其他";
    let section = sections.find((item) => item.name === name);
    if (!section) {
      section = { name, fields: [] };
      sections.push(section);
    }
    section.fields.push(field);
    return sections;
  }, []);
}

Page({
  data: {
    phoneModalVisible: true,
    phoneLookupValue: "",
    pageHeaderBg: assetPath("/page-header-bg-v1.png"),
    lookupMatchedPreview: false,
    project: null,
    projectName: "",
    units: [],
    teams: [],
    workers: [],
    editingId: "",
    form: {},
    formFields: [],
    formSections: [],
    submitNotice: "",
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
      const workers = workersResult.items || [];
      const defaultForm = buildDefaultForm(fieldSets.workers, {}, {
        unit_id: units[0] ? units[0].id : "",
        team_id: teams[0] ? teams[0].id : "",
        worker_type: "1",
        gender: "1",
        entry_time: today(),
      });
      this.setData({ units, teams, workers });
      this.applyForm(defaultForm);
    } catch (error) {
      wx.showToast({ title: error.message || "入职数据加载失败", icon: "none" });
    }
  },

  lookupData() {
    return {
      units: this.data.units,
      teams: this.data.teams,
      workers: this.data.workers,
    };
  },

  applyForm(form, extra = {}) {
    const formFields = buildFormFields(fieldSets.workers, form, this.lookupData());
    this.setData({
      form,
      formFields,
      formSections: buildSections(formFields),
      ...extra,
    });
  },

  onPhoneLookupInput(event) {
    const phoneLookupValue = event.detail.value;
    const phone = String(phoneLookupValue || "").trim();
    this.setData({
      phoneLookupValue,
      lookupMatchedPreview: Boolean(this.data.workers.find((worker) => String(worker.phone || "") === phone)),
    });
  },

  confirmPhoneLookup() {
    const phone = String(this.data.phoneLookupValue || "").trim();
    if (!phone) {
      wx.showToast({ title: "请先输入手机号", icon: "none" });
      return;
    }

    const matched = this.data.workers.find((worker) => String(worker.phone || "") === phone);
    if (matched) {
      const form = buildDefaultForm(fieldSets.workers, matched);
      this.applyForm(form, {
        editingId: matched.id,
        phoneModalVisible: false,
        submitNotice: "已带出已有工人信息，本次提交会更新实名入职资料。",
      });
      wx.showToast({ title: "已带出人员信息", icon: "success" });
      return;
    }

    const form = {
      ...this.data.form,
      phone,
      entry_time: this.data.form.entry_time || today(),
    };
    this.applyForm(form, {
      editingId: "",
      phoneModalVisible: false,
      submitNotice: "",
    });
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
    this.applyForm(form, { submitNotice: "" });
  },

  async chooseUpload(event) {
    const key = event.currentTarget.dataset.key;
    const field = fieldSets.workers.find((item) => item.key === key);
    if (!field) return;
    try {
      wx.showLoading({ title: "上传中" });
      const file = await uploadForField(field, {
        bizType: "workers",
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

  async submitOnboarding() {
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
      if (this.data.editingId) {
        await updateResource(this.data.project.id, "workers", this.data.editingId, payload);
      } else {
        await createResource(this.data.project.id, "workers", payload);
      }
      this.setData({
        saving: false,
        submitNotice: this.data.editingId ? "实名入职资料已更新。" : "实名入职已提交。",
      });
      wx.showToast({ title: this.data.editingId ? "已更新" : "已入职", icon: "success" });
      setTimeout(() => wx.navigateTo({ url: "/pages/workers/workers" }), 450);
    } catch (error) {
      this.setData({ saving: false });
      wx.showToast({ title: error.message || "提交失败", icon: "none" });
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.redirectTo({ url: "/pages/home/home" });
  },
});
