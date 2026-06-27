const { assetPath } = require("../../config/assets.js");

const workers = [
  {
    id: "w1",
    name: "丁想想",
    gender: "男",
    age: 33,
    workType: "管理人员",
    workerType: "管理人员",
    team: "管理人员",
    phone: "18268618908",
    authStatus: "已认证",
    settlement: "日结",
    unitPrice: "200",
    idCard: "341622199307243316",
    address: "浙江省宁波市镇海区骆驼街道海悦花苑3号404室",
    nativePlace: "浙江",
    issuingAuthority: "宁波市公安局镇海区分局",
    validPeriod: "2026-04-30 至 2046-04-30",
    avatar: assetPath("/module-workers.png"),
  },
  {
    id: "w2",
    name: "张家辉",
    gender: "男",
    age: 25,
    workType: "其它",
    workerType: "建筑工人",
    team: "防水班组",
    phone: "15888092795",
    authStatus: "已认证",
    settlement: "日结",
    unitPrice: "200",
    idCard: "330203199901182715",
    address: "浙江省宁波市海曙区项目生活区",
    nativePlace: "浙江",
    issuingAuthority: "宁波市公安局海曙分局",
    validPeriod: "2022-05-16 至 2042-05-16",
    avatar: assetPath("/module-onboarding.png"),
  },
  {
    id: "w3",
    name: "张国庆",
    gender: "男",
    age: 60,
    workType: "其它",
    workerType: "建筑工人",
    team: "防水班组",
    phone: "15990538959",
    authStatus: "已认证",
    settlement: "月结",
    unitPrice: "180",
    idCard: "320826196601094221",
    address: "江苏省淮安市清江浦区项目生活区",
    nativePlace: "江苏",
    issuingAuthority: "淮安市公安局清江浦分局",
    validPeriod: "2020-01-09 至 2040-01-09",
    avatar: assetPath("/module-workers.png"),
  },
  {
    id: "w4",
    name: "王海波",
    gender: "男",
    age: 35,
    workType: "其它",
    workerType: "建筑工人",
    team: "防水班组",
    phone: "15958808973",
    authStatus: "未认证",
    settlement: "日结",
    unitPrice: "200",
    idCard: "330204199102124515",
    address: "浙江省宁波市镇海区项目生活区",
    nativePlace: "浙江",
    issuingAuthority: "宁波市公安局镇海区分局",
    validPeriod: "2021-02-12 至 2041-02-12",
    avatar: assetPath("/module-onboarding.png"),
  },
  {
    id: "w5",
    name: "张明军",
    gender: "男",
    age: 45,
    workType: "其它",
    workerType: "建筑工人",
    team: "防水班组",
    phone: "13586501102",
    authStatus: "已认证",
    settlement: "日结",
    unitPrice: "200",
    idCard: "330225198105112019",
    address: "浙江省宁波市海曙区项目生活区",
    nativePlace: "浙江",
    issuingAuthority: "宁波市公安局海曙分局",
    validPeriod: "2023-05-11 至 2043-05-11",
    avatar: assetPath("/module-workers.png"),
  },
];

function filterWorkers(keyword, teamFilter, authFilter) {
  const kw = String(keyword || "").trim().toLowerCase();
  return workers.filter((worker) => {
    const text = `${worker.name} ${worker.phone} ${worker.team} ${worker.workType}`.toLowerCase();
    const matchesKeyword = !kw || text.includes(kw);
    const matchesTeam = teamFilter === "全部" || worker.team === teamFilter;
    const matchesAuth = authFilter === "全部" || worker.authStatus === authFilter;
    return matchesKeyword && matchesTeam && matchesAuth;
  });
}

Page({
  data: {
    pageHeaderBg: assetPath("/page-header-bg-v1.png"),
    projectName: "宁波诺丁汉大学2026暑期工程项目13#楼装修工程",
    keyword: "",
    teamFilter: "全部",
    authFilter: "全部",
    teamOptions: ["全部", "管理人员", "防水班组"],
    authOptions: ["全部", "已认证", "未认证"],
    teamIndex: 0,
    authIndex: 0,
    workers,
    filteredWorkers: workers,
    currentWorker: workers[0],
    detailVisible: false,
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
    this.setData({
      filteredWorkers: filterWorkers(this.data.keyword, this.data.teamFilter, this.data.authFilter),
    });
  },

  openWorkerDetail(event) {
    const { id } = event.currentTarget.dataset;
    const currentWorker = workers.find((item) => item.id === id);
    if (!currentWorker) return;
    this.setData({ currentWorker, detailVisible: true });
  },

  closeWorkerDetail() {
    this.setData({ detailVisible: false });
  },

  showAction(event) {
    const { name } = event.currentTarget.dataset;
    wx.showToast({ title: `${name}调试中`, icon: "none" });
  },

  saveWorker() {
    wx.showToast({ title: "工人信息已保存", icon: "success" });
  },

  goBack() {
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
