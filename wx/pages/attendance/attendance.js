const { assetPath } = require("../../config/assets.js");

const attendanceWorkers = [
  { id: "a1", name: "李云兴", workType: "建筑电工", phone: "13282232202", signIn: "07:04:11", signOut: "17:56:44", status: "已出勤", avatar: assetPath("/module-workers.png") },
  { id: "a2", name: "俞士辉", workType: "其它", phone: "15958232455", signIn: "07:04:16", signOut: "18:03:09", status: "已出勤", avatar: assetPath("/module-onboarding.png") },
  { id: "a3", name: "徐光全", workType: "杂工", phone: "15558269905", signIn: "07:12:48", signOut: "18:01:24", status: "已出勤", avatar: assetPath("/module-workers.png") },
  { id: "a4", name: "丁想想", workType: "管理人员", phone: "18268618908", signIn: "", signOut: "", status: "未出勤", avatar: assetPath("/module-workers.png") },
];

function filterList(keyword, tab) {
  const kw = String(keyword || "").trim().toLowerCase();
  return attendanceWorkers.filter((item) => {
    const matchesTab = tab === "全部" || item.status === tab;
    const matchesKeyword = !kw || `${item.name} ${item.phone} ${item.workType}`.toLowerCase().includes(kw);
    return matchesTab && matchesKeyword;
  });
}

Page({
  data: {
    pageHeaderBg: assetPath("/page-header-bg-v1.png"),
    projectName: "宁波诺丁汉大学2026暑期工程项目13#楼装修工程",
    month: "2026年06月",
    stats: { total: 128, present: 49, absent: 79, rate: "38.3%" },
    teamFilter: "全部班组",
    companyFilter: "全部参建单位",
    keyword: "",
    activeDate: "06月27日",
    dateItems: [
      { label: "06月27日", count: 49 },
      { label: "06月26日", count: 57 },
      { label: "06月25日", count: 68 },
      { label: "06月24日", count: 61 },
      { label: "06月23日", count: 63 },
      { label: "06月22日", count: 50 },
      { label: "06月21日", count: 54 },
      { label: "06月20日", count: 52 },
    ],
    tabs: ["已出勤", "未出勤"],
    activeTab: "已出勤",
    filteredWorkers: filterList("", "已出勤"),
  },

  setDate(event) {
    this.setData({ activeDate: event.currentTarget.dataset.date });
  },

  setTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab }, () => this.refresh());
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  refresh() {
    this.setData({ filteredWorkers: filterList(this.data.keyword, this.data.activeTab) });
  },

  resetFilters() {
    this.setData({
      keyword: "",
      teamFilter: "全部班组",
      companyFilter: "全部参建单位",
    }, () => this.refresh());
  },

  showAction(event) {
    const { name } = event.currentTarget.dataset;
    wx.showToast({ title: `${name}调试中`, icon: "none" });
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
