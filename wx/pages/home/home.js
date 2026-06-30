const { assetPath } = require("../../config/assets");
const {
  clearSelectedProject,
  getSelectedProject,
  listProjectOptions,
  setSelectedProject,
} = require("../../utils/construction-api.js");

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
    selectedProject: {},
    projectOptions: [],
    filteredProjects: [],
    projectKeyword: "",
    projectSwitcherVisible: false,
    loadingProjects: false,
  },

  async onLoad() {
    const token = wx.getStorageSync("shanhuai_access_token");
    if (!token) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }

    await this.loadProjects();
  },

  async onShow() {
    const token = wx.getStorageSync("shanhuai_access_token");
    if (token && !this.data.projectOptions.length) {
      await this.loadProjects();
    }
  },

  async loadProjects() {
    this.setData({ loadingProjects: true });
    try {
      const projectOptions = await listProjectOptions();
      if (!projectOptions.length) {
        clearSelectedProject();
        wx.showModal({
          title: "未分配项目",
          content: "当前账号没有可管理项目，请联系管理员分配项目后再登录。",
          showCancel: false,
          success: () => this.logout(),
        });
        return;
      }

      const storedProject = getSelectedProject();
      const selectedProject = projectOptions.find((project) => storedProject && project.id === storedProject.id)
        || projectOptions[0];
      setSelectedProject(selectedProject);
      this.setData({
        loadingProjects: false,
        selectedProject,
        projectOptions,
        filteredProjects: projectOptions,
      });
    } catch (error) {
      this.setData({ loadingProjects: false });
      wx.showToast({ title: error.message || "项目加载失败", icon: "none" });
    }
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
    setSelectedProject(selectedProject);
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
    clearSelectedProject();
    wx.redirectTo({ url: "/pages/login/login" });
  },
});
