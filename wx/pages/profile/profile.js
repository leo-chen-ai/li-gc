Page({
  data: {
    account: "admin",
    userName: "项目管理员",
    companyName: "淮安城发置业有限公司",
    projectName: "淮安高铁商务区综合体项目",
    phoneNumber: "未绑定手机号",
    profilePageBg: "/assets/generated/profile-page-green-bg.jpg",
    profileVisual: "/assets/generated/profile-construction-visual.jpg",
    contactIcon: "/assets/generated/profile-contact-icon.png",
  },

  onLoad() {
    const user = wx.getStorageSync("shanhuai_user");
    const projects = wx.getStorageSync("shanhuai_managed_projects");
    if (user) {
      const rawPhone = user.phone || user.mobile || user.phone_number || user.phoneNumber || "";
      this.setData({
        account: user.username || user.email || "未命名账号",
        userName: user.name || user.username || "项目管理员",
        phoneNumber: rawPhone ? this.maskPhone(rawPhone) : "未绑定手机号",
      });
    }
    if (Array.isArray(projects) && projects.length > 0) {
      this.setData({ projectName: projects[0].name || "已授权项目" });
    }
  },

  goHome() {
    wx.redirectTo({ url: "/pages/home/home" });
  },

  changePassword() {
    wx.showModal({
      title: "修改密码",
      content: "修改密码功能即将接入账号安全接口。",
      showCancel: false,
      confirmText: "我知道了",
      confirmColor: "#0a9875",
    });
  },

  contactUs() {
    wx.showModal({
      title: "联系我们",
      content: "如需账号、项目权限或使用协助，请联系项目管理员。",
      showCancel: false,
      confirmText: "我知道了",
      confirmColor: "#0a9875",
    });
  },

  maskPhone(phone) {
    const value = String(phone || "").trim();
    return value.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后需要重新登录才能继续管理项目。",
      confirmText: "退出",
      confirmColor: "#d93026",
      success(res) {
        if (!res.confirm) return;
        wx.removeStorageSync("shanhuai_access_token");
        wx.removeStorageSync("shanhuai_token_expires_at");
        wx.removeStorageSync("shanhuai_user");
        wx.removeStorageSync("shanhuai_managed_projects");
        wx.redirectTo({ url: "/pages/login/login" });
      },
    });
  },
});
