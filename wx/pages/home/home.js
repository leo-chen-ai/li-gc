const { assetPath } = require("../../config/assets");
const {
  clearSelectedProject,
  getSelectedProject,
  listProjectOptions,
  listResource,
  setSelectedProject,
} = require("../../utils/construction-api.js");

const emptyStats = {
  workerCount: 0,
  teamCount: 0,
  unitCount: 0,
  todayAttendanceCount: 0,
  deviceCount: 0,
};

function dateToIso(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function resultTotal(result) {
  const total = Number(result && result.total);
  if (Number.isFinite(total)) return total;
  return Array.isArray(result && result.items) ? result.items.length : 0;
}

function countTodayAttendance(result, todayIso) {
  const day = Number(todayIso.slice(8, 10));
  const rows = Array.isArray(result && result.items) ? result.items : [];
  return rows.filter((worker) => (
    Array.isArray(worker.days)
    && worker.days.some((item) => Number(item.day) === day && (item.first_in_record_id || item.last_out_record_id))
  )).length;
}

function buildHomeModules(stats) {
  const featureCards = [
    {
      key: "onboarding",
      title: "实名入职",
      note: `现有工人${stats.workerCount}人`,
      image: assetPath("/assets/illustrations/module-onboarding.png"),
      tone: "tone-mint",
    },
    {
      key: "teams",
      title: "班组管理",
      note: `${stats.teamCount}个班组`,
      image: assetPath("/assets/illustrations/module-teams.png"),
      tone: "tone-warm",
    },
    {
      key: "workers",
      title: "项目工人",
      note: `${stats.workerCount}人在册`,
      image: assetPath("/assets/illustrations/module-workers.png"),
      tone: "tone-green",
    },
    {
      key: "companies",
      title: "参建单位",
      note: `${stats.unitCount}家单位`,
      image: assetPath("/assets/illustrations/module-companies.png"),
      tone: "tone-soft",
    },
    {
      key: "attendance",
      title: "出勤统计",
      note: `今日${stats.todayAttendanceCount}人`,
      image: assetPath("/assets/illustrations/module-attendance.png"),
      tone: "tone-mint",
    },
    {
      key: "device",
      title: "考勤机模式",
      note: `${stats.deviceCount}台设备`,
      image: assetPath("/assets/illustrations/module-device.png"),
      tone: "tone-green",
    },
  ];

  return {
    primaryFeature: featureCards[0],
    miniFeatures: [featureCards[1], featureCards[2]],
    wideFeature: featureCards[3],
    attendanceModules: [featureCards[4], featureCards[5]],
    sectionMetric: `今日出勤${stats.todayAttendanceCount}人`,
  };
}

const initialModules = buildHomeModules(emptyStats);
const HOME_STATS_CACHE_MS = 15000;

Page({
  data: {
    pendingCount: 1,
    ...initialModules,
    homeStats: emptyStats,
    projectCardBg: assetPath("/project-switch-card-bg.png"),
    selectedProject: {},
    projectOptions: [],
    filteredProjects: [],
    projectKeyword: "",
    projectSwitcherVisible: false,
    workerEntryVisible: false,
    workerEntryLoading: false,
    onsiteWorkerCount: 0,
    departedWorkerCount: 0,
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
      if (!this.data.loadingProjects) {
        await this.loadProjects();
      }
      return;
    }

    if (token && this.data.selectedProject && this.data.selectedProject.id) {
      const projectId = this.data.selectedProject.id;
      const cacheIsFresh = this._statsProjectId === projectId
        && Date.now() - (this._statsLoadedAt || 0) < HOME_STATS_CACHE_MS;
      if (cacheIsFresh) return;
      await this.loadHomeStats(this.data.selectedProject.id);
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
      await this.loadHomeStats(selectedProject.id);
    } catch (error) {
      this.setData({ loadingProjects: false });
      wx.showToast({ title: error.message || "项目加载失败", icon: "none" });
    }
  },

  async loadHomeStats(projectId) {
    if (!projectId || this._loadingStats) return;
    this._loadingStats = true;
    try {
      const todayIso = dateToIso(new Date());
      const [unitsResult, teamsResult, workersResult, attendanceResult, devicesResult] = await Promise.all([
        listResource(projectId, "units", { page: 1, page_size: 1 }),
        listResource(projectId, "teams", { page: 1, page_size: 1 }),
        listResource(projectId, "workers", { page: 1, page_size: 1 }),
        listResource(projectId, "attendance-records", { view: "calendar", month: todayIso.slice(0, 7) }),
        listResource(projectId, "attendance-devices", { page: 1, page_size: 1 }),
      ]);
      const homeStats = {
        workerCount: resultTotal(workersResult),
        teamCount: resultTotal(teamsResult),
        unitCount: resultTotal(unitsResult),
        todayAttendanceCount: countTodayAttendance(attendanceResult, todayIso),
        deviceCount: resultTotal(devicesResult),
      };
      const statsChanged = Object.keys(homeStats).some((key) => homeStats[key] !== this.data.homeStats[key]);
      if (statsChanged) {
        this.setData({
          homeStats,
          ...buildHomeModules(homeStats),
        });
      }
      this._statsProjectId = projectId;
      this._statsLoadedAt = Date.now();
    } catch (error) {
      wx.showToast({ title: error.message || "首页数据加载失败", icon: "none" });
    } finally {
      this._loadingStats = false;
    }
  },

  openOnboarding() {
    wx.navigateTo({ url: "/pages/onboarding/onboarding" });
  },

  openTeams() {
    wx.navigateTo({ url: "/pages/teams/teams" });
  },

  openCompanies() {
    wx.navigateTo({ url: "/pages/companies/companies" });
  },

  openAttendance() {
    wx.navigateTo({ url: "/pages/attendance/attendance" });
  },

  openDevice() {
    wx.navigateTo({ url: "/pages/device/device" });
  },

  async openWorkerEntry() {
    const projectId = this.data.selectedProject && this.data.selectedProject.id;
    if (!projectId) return;
    this.setData({ workerEntryVisible: true, workerEntryLoading: true });
    try {
      const [onsite, departed] = await Promise.all([
        listResource(projectId, "workers", { page: 1, page_size: 1, work_status: 1 }),
        listResource(projectId, "workers", { page: 1, page_size: 1, work_status: 2 }),
      ]);
      this.setData({
        workerEntryLoading: false,
        onsiteWorkerCount: resultTotal(onsite),
        departedWorkerCount: resultTotal(departed),
      });
    } catch (error) {
      this.setData({ workerEntryLoading: false });
      wx.showToast({ title: error.message || "人员数量加载失败", icon: "none" });
    }
  },

  closeWorkerEntry() {
    this.setData({ workerEntryVisible: false });
  },

  enterWorkerList(event) {
    const status = Number(event.currentTarget.dataset.status) === 2 ? 2 : 1;
    this.setData({ workerEntryVisible: false });
    wx.navigateTo({ url: `/pages/workers/workers?status=${status}` });
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
    this.loadHomeStats(selectedProject.id);
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
