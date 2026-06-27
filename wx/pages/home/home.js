const { assetPath } = require("../../config/assets");

const featureCards = [
  {
    key: "onboarding",
    title: "实名入职",
    note: "现有工人12人",
    image: assetPath("/assets/illustrations/module-onboarding.png"),
    tone: "tone-mint",
  },
  {
    key: "teams",
    title: "班组管理",
    note: "8个班组",
    image: assetPath("/assets/illustrations/module-teams.png"),
    tone: "tone-warm",
  },
  {
    key: "workers",
    title: "项目工人",
    note: "286人在册",
    image: assetPath("/assets/illustrations/module-workers.png"),
    tone: "tone-green",
  },
  {
    key: "companies",
    title: "参建单位",
    note: "6家单位",
    image: assetPath("/assets/illustrations/module-companies.png"),
    tone: "tone-soft",
  },
];

const attendanceModules = [
  {
    key: "attendance",
    title: "出勤统计",
    note: "今日286人",
    image: assetPath("/assets/illustrations/module-attendance.png"),
  },
  {
    key: "device",
    title: "考勤机模式",
    note: "4台设备",
    image: assetPath("/assets/illustrations/module-device.png"),
  },
];

const projectOptions = [
  {
    id: "1206",
    title: "淮安高铁商务区综合体项目",
    developerName: "淮安城发置业有限公司",
    location: "清江浦区 · 在建",
    metric: "286人在册",
  },
  {
    id: "1207",
    title: "宁波正宇建设有限公司项目",
    developerName: "宁波正宇建设有限公司",
    location: "海曙区 · 筹备",
    metric: "64人在册",
  },
  {
    id: "1208",
    title: "山淮智慧工地示范项目",
    developerName: "山淮建设工程有限公司",
    location: "生态文旅区 · 在建",
    metric: "128人在册",
  },
  {
    id: "1209",
    title: "淮安城发安置房二期",
    developerName: "淮安城发置业有限公司",
    location: "经开区 · 在建",
    metric: "96人在册",
  },
];

function getStoredProjectOptions() {
  const projects = wx.getStorageSync("shanhuai_managed_projects");
  if (!Array.isArray(projects) || projects.length === 0) {
    return projectOptions;
  }

  return projects.map((project) => ({
    id: project.id,
    title: project.name || "未命名项目",
    developerName: "已授权项目",
    location: "小程序可管理",
    metric: "查看详情",
  }));
}

const moduleRoutes = {
  onboarding: "/pages/onboarding/onboarding",
  teams: "/pages/teams/teams",
  workers: "/pages/workers/workers",
  companies: "/pages/companies/companies",
  attendance: "/pages/attendance/attendance",
  device: "/pages/device/device",
};

Page({
  data: {
    pendingCount: 1,
    primaryFeature: featureCards[0],
    miniFeatures: [featureCards[1], featureCards[2]],
    wideFeature: featureCards[3],
    attendanceModules,
    projectCardBg: assetPath("/project-switch-card-bg.png"),
    selectedProject: projectOptions[0],
    projectOptions,
    filteredProjects: projectOptions,
    projectKeyword: "",
    projectSwitcherVisible: false,
  },

  onLoad() {
    const token = wx.getStorageSync("shanhuai_access_token");
    if (!token) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }

    const storedProjects = getStoredProjectOptions();
    this.setData({
      selectedProject: storedProjects[0],
      projectOptions: storedProjects,
      filteredProjects: storedProjects,
    });
  },

  navigateToModule(event) {
    const { key } = event.currentTarget.dataset;
    const url = moduleRoutes[key];
    if (!url) return;
    wx.navigateTo({ url });
  },

  openProfile() {
    wx.redirectTo({ url: "/pages/profile/profile" });
  },

  openProjectSwitcher() {
    this.setData({
      projectSwitcherVisible: true,
      projectKeyword: "",
      filteredProjects: this.data.projectOptions,
    });
  },

  closeProjectSwitcher() {
    this.setData({ projectSwitcherVisible: false });
  },

  onProjectKeywordInput(event) {
    const projectKeyword = event.detail.value;
    const keyword = String(projectKeyword || "").trim().toLowerCase();
    const filteredProjects = this.data.projectOptions.filter((project) => (
      `${project.title} ${project.developerName} ${project.location} ${project.metric}`.toLowerCase().includes(keyword)
    ));
    this.setData({ projectKeyword, filteredProjects });
  },

  selectProject(event) {
    const { id } = event.currentTarget.dataset;
    const selectedProject = this.data.projectOptions.find((project) => project.id === id);
    if (!selectedProject) return;
    this.setData({
      selectedProject,
      projectSwitcherVisible: false,
    });
    wx.showToast({
      title: "项目已切换",
      icon: "success",
    });
  },

  logout() {
    wx.removeStorageSync("shanhuai_access_token");
    wx.removeStorageSync("shanhuai_token_expires_at");
    wx.removeStorageSync("shanhuai_user");
    wx.removeStorageSync("shanhuai_managed_projects");
    wx.redirectTo({ url: "/pages/login/login" });
  },
});
