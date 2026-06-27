const { assetPath } = require("../../config/assets");

Page({
  data: {
    account: "",
    password: "",
    rememberAccount: false,
    loading: false,
    loginIllustration: assetPath("/assets/illustrations/login-attendance-bg-preview-v1.png"),
  },

  onAccountChange(event) {
    this.setData({ account: event.detail.value });
  },

  onPasswordChange(event) {
    this.setData({ password: event.detail.value });
  },

  toggleRemember() {
    this.setData({ rememberAccount: !this.data.rememberAccount });
  },

  forgotPassword() {
    wx.showToast({
      title: "请联系管理员重置密码",
      icon: "none",
    });
  },

  submitLogin() {
    this.setData({ loading: true });
    wx.setStorageSync("shanhuai_mock_login", {
      account: this.data.account || "debug",
      loginAt: Date.now(),
    });

    setTimeout(() => {
      this.setData({ loading: false });
      wx.redirectTo({ url: "/pages/home/home" });
    }, 260);
  },
});
