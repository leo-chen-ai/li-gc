const { assetPath } = require("../../config/assets");
const { request } = require("../../config/api.js");

Page({
  data: {
    account: "",
    password: "",
    rememberAccount: false,
    loading: false,
    loginIllustration: assetPath("/assets/illustrations/login-attendance-bg-preview-v1.png"),
  },

  onLoad() {
    const rememberedAccount = wx.getStorageSync("shanhuai_remembered_account");
    if (rememberedAccount) {
      this.setData({
        account: rememberedAccount,
        rememberAccount: true,
      });
    }
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

  async submitLogin() {
    const account = String(this.data.account || "").trim();
    const password = String(this.data.password || "");

    if (!account || !password) {
      wx.showToast({
        title: "请输入账号和密码",
        icon: "none",
      });
      return;
    }

    this.setData({ loading: true });

    try {
      const result = await request({
        url: "/auth/login",
        method: "POST",
        data: {
          account,
          password,
          client: "miniapp",
        },
      });

      wx.setStorageSync("shanhuai_access_token", result.token.access_token);
      wx.setStorageSync("shanhuai_token_expires_at", Date.now() + result.token.expires_in * 1000);
      wx.setStorageSync("shanhuai_user", result.user);
      wx.setStorageSync("shanhuai_managed_projects", result.managed_projects || []);

      if (this.data.rememberAccount) {
        wx.setStorageSync("shanhuai_remembered_account", account);
      } else {
        wx.removeStorageSync("shanhuai_remembered_account");
      }

      this.setData({ loading: false });
      wx.redirectTo({ url: "/pages/home/home" });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: error && error.message ? error.message : "登录失败",
        icon: "none",
      });
    }
  },
});
