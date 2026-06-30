const { request } = require("../../config/api.js");
const { clearSelectedProject, getSelectedProject } = require("../../utils/construction-api.js");

Page({
  data: {
    account: "admin",
    userName: "项目管理员",
    companyName: "未选择单位",
    projectName: "未选择项目",
    phoneNumber: "未绑定手机号",
    profilePageBg: "/assets/generated/profile-page-green-bg.jpg",
    profileVisual: "/assets/generated/profile-construction-visual.jpg",
    contactIcon: "/assets/generated/profile-contact-icon.png",
    passwordModalVisible: false,
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    passwordSaving: false,
  },

  onLoad() {
    const user = wx.getStorageSync("shanhuai_user");
    const project = getSelectedProject();
    if (!project || !project.id) {
      wx.showToast({ title: "请先选择项目", icon: "none" });
      wx.redirectTo({ url: "/pages/home/home" });
      return;
    }
    if (user) {
      const rawPhone = user.phone || user.mobile || user.phone_number || user.phoneNumber || "";
      this.setData({
        account: user.username || user.email || "未命名账号",
        userName: user.name || user.username || "项目管理员",
        phoneNumber: rawPhone ? this.maskPhone(rawPhone) : "未绑定手机号",
      });
    }
    this.setData({
      projectName: project.title || project.name || "已授权项目",
      companyName: project.developerName || "已授权单位",
    });
  },

  goHome() {
    wx.redirectTo({ url: "/pages/home/home" });
  },

  changePassword() {
    this.setData({
      passwordModalVisible: true,
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  },

  closePasswordModal() {
    if (this.data.passwordSaving) return;
    this.setData({ passwordModalVisible: false });
  },

  onPasswordInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  async submitPassword() {
    const currentPassword = String(this.data.currentPassword || "");
    const newPassword = String(this.data.newPassword || "");
    const confirmPassword = String(this.data.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      wx.showToast({ title: "请填写完整密码", icon: "none" });
      return;
    }
    if (newPassword.length < 8) {
      wx.showToast({ title: "新密码至少8位", icon: "none" });
      return;
    }
    if (newPassword !== confirmPassword) {
      wx.showToast({ title: "两次新密码不一致", icon: "none" });
      return;
    }

    this.setData({ passwordSaving: true });
    try {
      await request({
        url: "/auth/change-password",
        method: "POST",
        data: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      });
      this.setData({ passwordSaving: false, passwordModalVisible: false });
      wx.showToast({ title: "密码已修改", icon: "success" });
    } catch (error) {
      this.setData({ passwordSaving: false });
      wx.showToast({ title: error.message || "修改失败", icon: "none" });
    }
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
        clearSelectedProject();
        wx.redirectTo({ url: "/pages/login/login" });
      },
    });
  },
});
