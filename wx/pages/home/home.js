const { assetPath } = require("../../config/assets");

const featureCards = [
  {
    key: "onboarding",
    title: "实名入职",
    note: "今日待办12人",
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

Page({
  data: {
    pendingCount: 1,
    primaryFeature: featureCards[0],
    miniFeatures: [featureCards[1], featureCards[2]],
    wideFeature: featureCards[3],
    attendanceModules,
  },

  navigateToModule(event) {
    const { title } = event.currentTarget.dataset;
    wx.showToast({
      title: `${title}暂未接入`,
      icon: "none",
    });
  },

  logout() {
    wx.removeStorageSync("shanhuai_mock_login");
    wx.redirectTo({ url: "/pages/login/login" });
  },
});
