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

function monthKey(iso) {
  return String(iso || "").slice(0, 7);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function buildMonthCalendar(month, activeDate, days = []) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return [];

  const dayCount = new Date(year, monthNumber, 0).getDate();
  const firstWeekday = new Date(year, monthNumber - 1, 1).getDay();
  const dayMap = days.reduce((map, item) => {
    map[Number(item.day)] = item;
    return map;
  }, {});
  const cells = Array.from({ length: firstWeekday }, (_, index) => ({
    key: `empty-${index}`,
    empty: true,
  }));

  for (let day = 1; day <= dayCount; day += 1) {
    const info = dayMap[day];
    const date = `${month}-${pad2(day)}`;
    cells.push({
      key: date,
      day,
      date,
      empty: false,
      hasAttendance: Boolean(info),
      isActive: date === activeDate,
      firstIn: info && info.first_in_time || "",
      lastOut: info && info.last_out_time || "",
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `empty-tail-${cells.length}`, empty: true });
  }

  return cells;
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
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
    stats: { total: 0, present: 0, absent: 0, rate: "0%", view: "" },
    loading: true,
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
    calendarRowsByMonth: {},
    calendarWeekdays: ["日", "一", "二", "三", "四", "五", "六"],
    dailyRecordsByDate: {},
    dateLoading: false,
  },

  async onLoad() {
    const dates = recentDates();
    const activeDateValue = dates[0].value;
    this.setData({
      loading: true,
      dateLoading: true,
      dateItems: dates,
      activeDate: dates[0].label,
      activeDateValue,
      month: formatMonth(activeDateValue),
    });
    // 先快速加载 stats（只查计数，毫秒级），让用户先看到总人数/出勤数
    await this.loadStats(activeDateValue);
    // 再并行加载完整数据（工人、班组、单位、记录、月历计数）
    this.loadData();
  },

  buildStatsFromResult(result) {
    const isValidStats = result && result.view === "stats" && "present" in result;
    if (!isValidStats) return null;
    return {
      total: result.total || 0,
      present: result.present || 0,
      absent: result.absent || 0,
      rate: result.rate || "0%",
      view: "stats",
    };
  },

  computeStatsFromWorkers(rows) {
    const present = rows.filter((item) => item.status === "已出勤").length;
    const total = rows.length;
    return {
      total,
      present,
      absent: Math.max(0, total - present),
      rate: total ? `${Math.round((present / total) * 1000) / 10}%` : "0%",
      view: "client",
    };
  },

  async loadStats(date) {
    const project = getSelectedProject();
    if (!project || !project.id) return;
    try {
      const result = await listResource(project.id, "attendance-records", {
        view: "stats",
        attendance_date: date || this.data.activeDateValue,
      });
      const stats = this.buildStatsFromResult(result)
        || this.computeStatsFromWorkers(this.data.filteredWorkers);
      this.setData({ stats, loading: false });
    } catch (error) {
      const stats = this.computeStatsFromWorkers(this.data.filteredWorkers);
      this.setData({ stats, loading: false });
      wx.showToast({ title: error.message || "统计加载失败", icon: "none" });
    }
  },

  async loadData() {
    this.setData({ dateLoading: true });
    const project = getSelectedProject();
    if (!project || !project.id) {
      wx.showToast({ title: "请先选择项目", icon: "none" });
      wx.redirectTo({ url: "/pages/home/home" });
      return;
    }
    this.setData({ project, projectName: project.title || project.name || "已授权项目" });

    try {
      // 后端 page_size 最大 100，传更大值无效；首屏并行拉取基础数据
      const [unitsResult, teamsResult, workersResult, attendanceResult] = await Promise.all([
        listResource(project.id, "units", { page: 1, page_size: 100 }),
        listResource(project.id, "teams", { page: 1, page_size: 100 }),
        listResource(project.id, "workers", { page: 1, page_size: 100 }),
        listResource(project.id, "attendance-records", {
          page: 1,
          page_size: 100,
          attendance_date: this.data.activeDateValue,
        }),
      ]);
      const units = unitsResult.items || [];
      const teams = teamsResult.items || [];
      const workers = workersResult.items || [];
      const records = attendanceResult.items || [];
      this.setData({
        dateLoading: false,
        units,
        teams,
        workers,
        records,
        dailyRecordsByDate: { ...this.data.dailyRecordsByDate, [this.data.activeDateValue]: records },
        teamOptions: ["全部班组"].concat(teams.map((team) => team.name || "未命名班组")),
        companyOptions: ["全部参建单位"].concat(units.map((unit) => unit.company_name || "未命名单位")),
      }, () => {
        this.refresh();
        this.loadMonthCalendarCounts();
      });
    } catch (error) {
      this.setData({ dateLoading: false });
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
    }, () => {
      this.loadDailyRecords();
      this.loadStats(item.value);
    });
  },

  async loadDailyRecords() {
    const project = this.data.project;
    if (!project || !project.id) return;
    const date = this.data.activeDateValue;
    const cached = this.data.dailyRecordsByDate[date];
    if (cached) {
      this.setData({ records: cached }, () => this.refresh());
      return;
    }
    this.setData({ dateLoading: true });
    try {
      const attendanceResult = await listResource(project.id, "attendance-records", {
        page: 1,
        page_size: 100,
        attendance_date: date,
      });
      const records = attendanceResult.items || [];
      this.setData({
        records,
        dailyRecordsByDate: { ...this.data.dailyRecordsByDate, [date]: records },
        dateLoading: false,
      }, () => this.refresh());
    } catch (error) {
      this.setData({ dateLoading: false });
      wx.showToast({ title: error.message || "考勤加载失败", icon: "none" });
    }
  },

  async loadMonthCalendarCounts() {
    const project = this.data.project;
    if (!project || !project.id) return;
    try {
      const month = monthKey(this.data.activeDateValue);
      const result = await listResource(project.id, "attendance-records", {
        view: "calendar",
        month,
        page: 1,
        page_size: 100,
      });
      const rows = result.items || [];
      const countMap = {};
      rows.forEach((row) => {
        if (!Array.isArray(row.days)) return;
        row.days.forEach((day) => {
          const dayNum = Number(day.day);
          if (!dayNum || dayNum < 1 || dayNum > 31) return;
          const date = `${month}-${pad2(dayNum)}`;
          countMap[date] = (countMap[date] || 0) + 1;
        });
      });
      const dateItems = this.data.dateItems.map((item) => ({
        ...item,
        count: countMap[item.value] || 0,
      }));
      this.setData({ dateItems });
    } catch (error) {
      console.error("加载月出勤计数失败", error);
    }
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
    const kw = String(this.data.keyword || "").trim().toLowerCase();
    const filteredWorkers = rows.filter((item) => {
      const matchesTab = item.status === this.data.activeTab;
      const matchesKeyword = !kw || `${item.name} ${item.phone} ${item.workType} ${item.teamName}`.toLowerCase().includes(kw);
      const matchesTeam = this.data.teamFilter === "全部班组" || item.teamName === this.data.teamFilter;
      const matchesCompany = this.data.companyFilter === "全部参建单位" || item.companyName === this.data.companyFilter;
      return matchesTab && matchesKeyword && matchesTeam && matchesCompany;
    });

    // 如果 stats 不是来自后端 stats 接口（旧版/异常），按当前列表重新计算兜底
    const stats = this.data.stats && this.data.stats.view === "stats"
      ? this.data.stats
      : this.computeStatsFromWorkers(filteredWorkers);
    this.setData({ filteredWorkers, stats });
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

  async openWorkerAttendance(event) {
    const id = event.currentTarget.dataset.id;
    const currentDetail = this.data.filteredWorkers.find((item) => item.id === id);
    if (!currentDetail) return;
    const month = monthKey(this.data.activeDateValue);
    const calendarDays = buildMonthCalendar(month, this.data.activeDateValue);
    this.setData({
      currentDetail: {
        ...currentDetail,
        calendarMonth: formatMonth(`${month}-01`),
        calendarDays,
        calendarAttendanceDays: 0,
        calendarLoading: true,
      },
      detailVisible: true,
    });
    await this.loadWorkerMonthCalendar(id, month);
  },

  async loadWorkerMonthCalendar(workerId, month) {
    const cachedRows = this.data.calendarRowsByMonth[month];
    if (cachedRows) {
      this.applyWorkerMonthCalendar(workerId, month, cachedRows);
      return;
    }

    try {
      const result = await listResource(this.data.project.id, "attendance-records", {
        view: "calendar",
        month,
        page: 1,
        page_size: 100,
      });
      const rows = result.items || [];
      this.setData({
        calendarRowsByMonth: {
          ...this.data.calendarRowsByMonth,
          [month]: rows,
        },
      });
      this.applyWorkerMonthCalendar(workerId, month, rows);
    } catch (error) {
      this.setData({
        currentDetail: {
          ...this.data.currentDetail,
          calendarLoading: false,
        },
      });
      wx.showToast({ title: error.message || "月历加载失败", icon: "none" });
    }
  },

  applyWorkerMonthCalendar(workerId, month, rows) {
    const row = rows.find((item) => item.worker_id === workerId);
    const days = row && Array.isArray(row.days) ? row.days : [];
    const calendarDays = buildMonthCalendar(month, this.data.activeDateValue, days);
    this.setData({
      currentDetail: {
        ...this.data.currentDetail,
        calendarDays,
        calendarAttendanceDays: days.length,
        calendarLoading: false,
      },
    });
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
