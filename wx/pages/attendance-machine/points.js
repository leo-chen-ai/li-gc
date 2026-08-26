const { getSelectedProject, listMachineAttendancePoints } = require("../../utils/construction-api.js");

// 计算状态栏 + 胶囊按钮下方的安全顶部间距（px），避免自定义导航页被遮挡
function calcTopPadding() {
  try {
    const menu = wx.getMenuButtonBoundingClientRect();
    if (menu && menu.bottom) return menu.bottom + 10;
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    return (info.statusBarHeight || 20) + 54;
  } catch (error) {
    return 88;
  }
}

Page({
  data: {
    points: [],
    loading: true,
    topPadding: calcTopPadding(),
  },

  async onLoad() {
    await this.loadPoints();
  },

  async onShow() {
    if (!this.data.loading) {
      await this.loadPoints();
    }
  },

  async loadPoints() {
    const project = getSelectedProject();
    if (!project || !project.id) {
      wx.showToast({ title: "请先选择项目", icon: "none" });
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    try {
      const points = await listMachineAttendancePoints(project.id);
      this.setData({ points: Array.isArray(points) ? points : [], loading: false });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message || "考勤点加载失败", icon: "none" });
    }
  },

  openCamera(event) {
    const { id, name } = event.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/attendance-machine/camera?pointId=${id}&pointName=${encodeURIComponent(name || "考勤点")}`,
    });
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: "/pages/home/home" }),
    });
  },
});
