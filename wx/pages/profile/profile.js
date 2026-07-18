const { request } = require("../../config/api.js");
const { assetPath } = require("../../config/assets.js");
const { clearSelectedProject, getSelectedProject } = require("../../utils/construction-api.js");

function extractScanLoginToken(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const match = text.match(/^shanhuai:\/\/scan-login\?(.+)$/);
  if (match) {
    const tokenPair = match[1]
      .split("&")
      .map((part) => part.split("="))
      .find(([key]) => key === "token");
    return tokenPair ? decodeURIComponent(tokenPair[1] || "") : "";
  }

  return /^[a-f0-9]{64}$/i.test(text) ? text : "";
}

Page({
  data: {
    account: "",
    userName: "项目管理员",
    profilePageBg: assetPath("/profile-page-green-bg.jpg"),
    profileVisual: assetPath("/profile-construction-visual.jpg"),
    contactIcon: assetPath("/profile-contact-icon.png"),
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
      this.setData({
        account: user.username || user.email || "未命名账号",
        userName: user.name || user.username || "项目管理员",
      });
    }
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

  scanPcLogin() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ["qrCode"],
      success: (result) => {
        const scanToken = extractScanLoginToken(result.result || result.path);
        if (!scanToken) {
          wx.showToast({ title: "请扫描电脑端登录二维码", icon: "none" });
          return;
        }

        wx.showModal({
          title: "确认登录电脑端",
          content: "将使用当前小程序账号登录电脑端山淮筑后台。",
          confirmText: "确认登录",
          confirmColor: "#0a9875",
          success: (modalResult) => {
            if (modalResult.confirm) {
              this.confirmPcLogin(scanToken);
            }
          },
        });
      },
      fail: (error) => {
        if (error && String(error.errMsg || "").includes("cancel")) return;
        wx.showToast({ title: "扫码失败，请重试", icon: "none" });
      },
    });
  },

  async confirmPcLogin(scanToken) {
    wx.showLoading({ title: "确认中" });
    try {
      await request({
        url: `/auth/scan-login/sessions/${encodeURIComponent(scanToken)}/confirm`,
        method: "POST",
        data: {},
      });
      wx.hideLoading();
      wx.showToast({ title: "电脑端登录成功", icon: "success" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || "确认失败", icon: "none" });
    }
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
    wx.makePhoneCall({
      phoneNumber: "13777114735",
    });
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
