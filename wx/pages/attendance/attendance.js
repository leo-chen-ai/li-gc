const { assetPath } = require("../../config/assets.js");
const { getSelectedProject, listResource } = require("../../utils/construction-api.js");
const { fieldSets, optionLabel } = require("../../utils/construction-fields.js");

function dateToIso(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDateLabel(iso) {
  const [, month, day] = iso.split("-");
  return `${month}月${day}日`;
}

function formatMonth(iso) {
  const [year, month] = iso.split("-");
  return `${year}年${month}月`;
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function recentDates(days = 8) {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const value = dateToIso(date);
    return { value, label: formatDateLabel(value), count: 0 };
  });
}

Page({
  data: {
    pageHeaderBg: assetPath("/page-header-bg-v1.png"),
    project: null,
    projectName: "",
    month: "",
    stats: { total: 0, present: 0, absent: 0, rate: "0%" },
    teamFilter: "全部班组",
    companyFilter: "全部参建单位",
    teamOptions: ["全部班组"],
    companyOptions: ["全部参建单位"],
    teamIndex: 0,
    companyIndex: 0,
    keyword: "",
    activeDate: "",
    activeDateValue: "",
    dateItems: [],
    tabs: ["已出勤", "未出勤"],
    activeTab: "已出勤",
    units: [],
    teams: [],
    workers: [],
    records: [],
    filteredWorkers: [],
    detailVisible: false,
    currentDetail: null,
  },

  async onLoad() {
    const dates = recentDates();
    this.setData({
      dateItems: dates,
      activeDate: dates[0].label,
      activeDateValue: dates[0].value,
      month: formatMonth(dates[0].value),
    });
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
      const [unitsResult, teamsResult, workersResult, attendanceResult] = await Promise.all([
        listResource(project.id, "units", { page: 1, page_size: 200 }),
        listResource(project.id, "teams", { page: 1, page_size: 200 }),
        listResource(project.id, "workers", { page: 1, page_size: 300 }),
        listResource(project.id, "attendance-records", {
          page: 1,
          page_size: 500,
          attendance_date: this.data.activeDateValue,
        }),
      ]);
      const units = unitsResult.items || [];
      const teams = teamsResult.items || [];
      const workers = workersResult.items || [];
      const records = attendanceResult.items || [];
      this.setData({
        units,
        teams,
        workers,
        records,
        teamOptions: ["全部班组"].concat(teams.map((team) => team.name || "未命名班组")),
        companyOptions: ["全部参建单位"].concat(units.map((unit) => unit.company_name || "未命名单位")),
      }, () => this.refresh());
    } catch (error) {
      wx.showToast({ title: error.message || "考勤加载失败", icon: "none" });
    }
  },

  setDate(event) {
    const value = event.currentTarget.dataset.value;
    const item = this.data.dateItems.find((date) => date.value === value);
    if (!item) return;
    this.setData({
      activeDate: item.label,
      activeDateValue: item.value,
      month: formatMonth(item.value),
      detailVisible: false,
    }, () => this.loadData());
  },

  setTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab }, () => this.refresh());
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

  onCompanyFilterChange(event) {
    const companyIndex = Number(event.detail.value);
    this.setData({
      companyIndex,
      companyFilter: this.data.companyOptions[companyIndex],
    }, () => this.refresh());
  },

  refresh() {
    const rows = this.data.workers.map((worker) => this.buildWorkerAttendance(worker));
    const present = rows.filter((item) => item.status === "已出勤").length;
    const total = rows.length;
    const stats = {
      total,
      present,
      absent: Math.max(0, total - present),
      rate: total ? `${Math.round((present / total) * 1000) / 10}%` : "0%",
    };
    const dateItems = this.data.dateItems.map((item) => ({
      ...item,
      count: item.value === this.data.activeDateValue ? present : item.count,
    }));

    const kw = String(this.data.keyword || "").trim().toLowerCase();
    const filteredWorkers = rows.filter((item) => {
      const matchesTab = item.status === this.data.activeTab;
      const matchesKeyword = !kw || `${item.name} ${item.phone} ${item.workType} ${item.teamName}`.toLowerCase().includes(kw);
      const matchesTeam = this.data.teamFilter === "全部班组" || item.teamName === this.data.teamFilter;
      const matchesCompany = this.data.companyFilter === "全部参建单位" || item.companyName === this.data.companyFilter;
      return matchesTab && matchesKeyword && matchesTeam && matchesCompany;
    });

    this.setData({ stats, dateItems, filteredWorkers });
  },

  buildWorkerAttendance(worker) {
    const team = this.data.teams.find((item) => item.id === worker.team_id);
    const unit = this.data.units.find((item) => item.id === worker.unit_id);
    const records = this.data.records
      .filter((record) => record.worker_id === worker.id)
      .sort((left, right) => new Date(left.trigger_time) - new Date(right.trigger_time));
    const inRecord = records.find((record) => record.direction === 0);
    const outRecord = records.slice().reverse().find((record) => record.direction === 1);
    return {
      id: worker.id,
      name: worker.name || "未命名工人",
      phone: worker.phone || "",
      workType: optionLabel(fieldSets.workers, "work_type", worker.work_type),
      teamName: team ? team.name || "未命名班组" : "未匹配班组",
      companyName: unit ? unit.company_name || "未命名单位" : "未匹配单位",
      signIn: formatTime(inRecord && inRecord.trigger_time),
      signOut: formatTime(outRecord && outRecord.trigger_time),
      status: records.length ? "已出勤" : "未出勤",
      avatar: worker.avatar || assetPath("/module-workers.png"),
      records: records.map((record) => ({
        ...record,
        timeText: formatTime(record.trigger_time),
        directionText: optionLabel(fieldSets.attendance, "direction", record.direction),
        photo: record.closeup_photo || record.photo_path || record.overall_photo || "",
      })),
    };
  },

  openWorkerAttendance(event) {
    const id = event.currentTarget.dataset.id;
    const currentDetail = this.data.filteredWorkers.find((item) => item.id === id);
    if (!currentDetail) return;
    this.setData({ currentDetail, detailVisible: true });
  },

  closeDetail() {
    this.setData({ detailVisible: false, currentDetail: null });
  },

  resetFilters() {
    this.setData({
      keyword: "",
      teamFilter: "全部班组",
      companyFilter: "全部参建单位",
      teamIndex: 0,
      companyIndex: 0,
    }, () => this.refresh());
  },

  showAction(event) {
    const { name } = event.currentTarget.dataset;
    wx.showToast({ title: `${name}请在系统电话中处理`, icon: "none" });
  },

  goBack() {
    if (this.data.detailVisible) {
      this.closeDetail();
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
