const { assetPath } = require("../../config/assets.js");

const genderOptions = ["男", "女"];
const workTypeOptions = ["钢筋工", "木工", "安装工", "电工", "架子工", "混凝土工", "其他"];
const workerTypeOptions = ["建筑工人", "管理人员"];
const managerRoleOptions = ["请选择", "项目经理", "安全员", "施工员", "质量员"];
const educationOptions = ["初中", "高中", "中专", "大专", "本科"];
const politicalOptions = ["群众", "党员", "团员"];
const settlementOptions = ["日结", "月结", "按量", "计件"];

const knownWorkerByPhone = {
  1: {
    phone: "1",
    name: "张建国",
    gender: "男",
    idCard: "320826198803121132",
    unitName: "苏北劳务工程有限公司",
    teamName: "钢筋一班",
    workType: "钢筋工",
    workerType: "建筑工人",
    managerRole: "请选择",
    education: "初中",
    politicalStatus: "群众",
    settlement: "日结",
    unitPrice: "200",
    nation: "汉族",
    entryDate: "2026-06-28",
    address: "淮安市清江浦区项目生活区",
    nativePlace: "江苏",
    issuingAuthority: "句容市公安局",
    validStart: "2022-05-16",
    validEnd: "2099-12-12",
    remark: "系统已有实名资料，本次仅确认入职信息。",
  },
};

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyForm(phone = "") {
  return {
    phone,
    name: "",
    gender: "男",
    idCard: "",
    unitName: "",
    teamName: "",
    workType: "钢筋工",
    workerType: "建筑工人",
    managerRole: "请选择",
    education: "初中",
    politicalStatus: "群众",
    settlement: "日结",
    unitPrice: "200",
    nation: "",
    entryDate: today(),
    address: "",
    nativePlace: "",
    issuingAuthority: "",
    validStart: today(),
    validEnd: "2099-12-12",
    remark: "",
  };
}

function optionIndex(options, value) {
  const index = options.indexOf(value);
  return index >= 0 ? index : 0;
}

Page({
  data: {
    phoneModalVisible: true,
    phoneLookupValue: "",
    pageHeaderBg: assetPath("/page-header-bg-v1.png"),
    faceImage: assetPath("/onboarding-face-upload-v1.png"),
    idFrontImage: assetPath("/id-card-front-construction-v2.png"),
    idBackImage: assetPath("/id-card-back-construction-v2.png"),
    lookupMatchedPreview: false,
    form: emptyForm(),
    genderOptions,
    genderIndex: 0,
    workTypeOptions,
    workTypeIndex: 0,
    workerTypeOptions,
    workerTypeIndex: 0,
    managerRoleOptions,
    managerRoleIndex: 0,
    educationOptions,
    educationIndex: 0,
    politicalOptions,
    politicalIndex: 0,
    settlementOptions,
    settlementIndex: 0,
    submitNotice: "",
  },

  onPhoneLookupInput(event) {
    const phoneLookupValue = event.detail.value;
    this.setData({
      phoneLookupValue,
      lookupMatchedPreview: Boolean(knownWorkerByPhone[String(phoneLookupValue || "").trim()]),
    });
  },

  confirmPhoneLookup() {
    const phone = String(this.data.phoneLookupValue || "").trim();
    if (!phone) {
      wx.showToast({ title: "请先输入手机号", icon: "none" });
      return;
    }

    const matched = knownWorkerByPhone[phone];
    if (matched) {
      this.applyForm(matched, {
        phoneModalVisible: false,
        submitNotice: "",
      });
      wx.showToast({ title: "已带出人员信息", icon: "success" });
      return;
    }

    this.applyForm(emptyForm(phone), {
      phoneModalVisible: false,
      submitNotice: "",
    });
  },

  onFormInput(event) {
    const field = event.currentTarget.dataset.field;
    const form = { ...this.data.form, [field]: event.detail.value };
    this.setData({ form, submitNotice: "" });
  },

  onGenderChange(event) {
    const genderIndex = Number(event.detail.value);
    const form = { ...this.data.form, gender: genderOptions[genderIndex] };
    this.setData({ genderIndex, form, submitNotice: "" });
  },

  onWorkTypeChange(event) {
    const workTypeIndex = Number(event.detail.value);
    const form = { ...this.data.form, workType: workTypeOptions[workTypeIndex] };
    this.setData({ workTypeIndex, form, submitNotice: "" });
  },

  onWorkerTypeChange(event) {
    const workerTypeIndex = Number(event.detail.value);
    const form = { ...this.data.form, workerType: workerTypeOptions[workerTypeIndex] };
    this.setData({ workerTypeIndex, form, submitNotice: "" });
  },

  onManagerRoleChange(event) {
    const managerRoleIndex = Number(event.detail.value);
    const form = { ...this.data.form, managerRole: managerRoleOptions[managerRoleIndex] };
    this.setData({ managerRoleIndex, form, submitNotice: "" });
  },

  onEducationChange(event) {
    const educationIndex = Number(event.detail.value);
    const form = { ...this.data.form, education: educationOptions[educationIndex] };
    this.setData({ educationIndex, form, submitNotice: "" });
  },

  onPoliticalChange(event) {
    const politicalIndex = Number(event.detail.value);
    const form = { ...this.data.form, politicalStatus: politicalOptions[politicalIndex] };
    this.setData({ politicalIndex, form, submitNotice: "" });
  },

  onSettlementChange(event) {
    const settlementIndex = Number(event.detail.value);
    const form = { ...this.data.form, settlement: settlementOptions[settlementIndex] };
    this.setData({ settlementIndex, form, submitNotice: "" });
  },

  onEntryDateChange(event) {
    const form = { ...this.data.form, entryDate: event.detail.value };
    this.setData({ form, submitNotice: "" });
  },

  onValidStartChange(event) {
    const form = { ...this.data.form, validStart: event.detail.value };
    this.setData({ form, submitNotice: "" });
  },

  onValidEndChange(event) {
    const form = { ...this.data.form, validEnd: event.detail.value };
    this.setData({ form, submitNotice: "" });
  },

  chooseFaceImage() {
    this.chooseUploadImage("faceImage", "头像照片");
  },

  chooseIdFrontImage() {
    this.chooseUploadImage("idFrontImage", "身份证正面");
  },

  chooseIdBackImage() {
    this.chooseUploadImage("idBackImage", "身份证反面");
  },

  chooseUploadImage(field, label) {
    const onSuccess = (filePath) => {
      if (!filePath) return;
      this.setData({ [field]: filePath, submitNotice: "" });
      wx.showToast({ title: `已选择${label}`, icon: "success" });
    };

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        success: (res) => {
          const firstFile = res.tempFiles && res.tempFiles[0];
          onSuccess(firstFile && firstFile.tempFilePath);
        },
      });
      return;
    }

    if (wx.chooseImage) {
      wx.chooseImage({
        count: 1,
        sourceType: ["album", "camera"],
        success: (res) => {
          onSuccess(res.tempFilePaths && res.tempFilePaths[0]);
        },
      });
      return;
    }

    wx.showToast({ title: `点击上传${label}`, icon: "none" });
  },

  submitOnboarding() {
    const required = [
      ["phone", "手机号"],
      ["name", "姓名"],
      ["idCard", "身份证号"],
      ["unitName", "参建单位"],
      ["teamName", "所属班组"],
    ];
    const missed = required.find(([key]) => !String(this.data.form[key] || "").trim());
    if (missed) {
      wx.showToast({ title: `请填写${missed[1]}`, icon: "none" });
      return;
    }

    const payload = {
      ...this.data.form,
      savedAt: new Date().toISOString(),
    };
    wx.setStorageSync("shanhuai_onboarding_draft", payload);
    this.setData({ submitNotice: "实名入职信息已保存到本地调试数据。" });
    wx.showToast({ title: "入职已保存", icon: "success" });
  },

  applyForm(form, extraData = {}) {
    this.setData({
      form,
      genderIndex: optionIndex(genderOptions, form.gender),
      workTypeIndex: optionIndex(workTypeOptions, form.workType),
      workerTypeIndex: optionIndex(workerTypeOptions, form.workerType),
      managerRoleIndex: optionIndex(managerRoleOptions, form.managerRole),
      educationIndex: optionIndex(educationOptions, form.education),
      politicalIndex: optionIndex(politicalOptions, form.politicalStatus),
      settlementIndex: optionIndex(settlementOptions, form.settlement),
      ...extraData,
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
});
