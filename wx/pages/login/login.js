const { assetPath } = require("../../config/assets");
const { request } = require("../../config/api.js");

const LOCAL_DEBUG_PASSWORD_KEY = "shanhuai_local_debug_password";
const ACCESS_TOKEN_KEY = "shanhuai_access_token";
const TOKEN_EXPIRES_AT_KEY = "shanhuai_token_expires_at";

function isLocalDebugEnv() {
  if (!wx.getAccountInfoSync) return false;
  try {
    const accountInfo = wx.getAccountInfoSync();
    return accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion === "develop";
  } catch (error) {
    return false;
  }
}

Page({
  data: {
    account: "",
    password: "",
    passwordVisible: false,
    rememberAccount: false,
    loading: false,
    agreedToTerms: false,
    loginIllustration: assetPath("/assets/illustrations/login-attendance-bg-preview-v1.png"),
    accountIcon: assetPath("/login-user.png"),
    lockIcon: assetPath("/login-lock.png"),
    eyeIcon: assetPath("/login-eye.png"),
    eyeOffIcon: assetPath("/login-eye-off.png"),
  },

  onLoad() {
    const token = wx.getStorageSync(ACCESS_TOKEN_KEY);
    const expiresAt = Number(wx.getStorageSync(TOKEN_EXPIRES_AT_KEY));
    if (token && expiresAt > Date.now()) {
      wx.redirectTo({ url: "/pages/home/home" });
      return;
    }
    if (token) {
      wx.removeStorageSync(ACCESS_TOKEN_KEY);
      wx.removeStorageSync(TOKEN_EXPIRES_AT_KEY);
      wx.removeStorageSync("shanhuai_user");
      wx.removeStorageSync("shanhuai_managed_projects");
    }

    const rememberedAccount = wx.getStorageSync("shanhuai_remembered_account");
    if (isLocalDebugEnv()) {
      this.setData({
        account: rememberedAccount || "",
        password: wx.getStorageSync(LOCAL_DEBUG_PASSWORD_KEY) || "",
        rememberAccount: true,
      });
      return;
    }

    if (rememberedAccount) {
      this.setData({
        account: rememberedAccount,
        rememberAccount: true,
      });
    }
  },

  onAccountChange(event) {
    const account = event.detail.value;
    this.setData({ account });
    if (this.data.rememberAccount) {
      wx.setStorageSync("shanhuai_remembered_account", String(account || "").trim());
    }
  },

  onPasswordChange(event) {
    this.setData({ password: event.detail.value });
  },

  togglePasswordVisibility() {
    this.setData({ passwordVisible: !this.data.passwordVisible });
  },

  toggleRemember() {
    const rememberAccount = !this.data.rememberAccount;
    this.setData({ rememberAccount });
    if (rememberAccount) {
      const account = String(this.data.account || "").trim();
      if (account) wx.setStorageSync("shanhuai_remembered_account", account);
      return;
    }
    wx.removeStorageSync("shanhuai_remembered_account");
  },

  forgotPassword() {
    wx.showModal({
      title: "联系管理员",
      content: "请拨打管理员电话 13777114735 重置密码",
      confirmText: "拨打",
      cancelText: "取消",
      confirmColor: "#07966f",
      success: (result) => {
        if (!result.confirm) return;
        wx.makePhoneCall({ phoneNumber: "13777114735" });
      },
    });
  },

  toggleAgreement() {
    this.setData({ agreedToTerms: !this.data.agreedToTerms });
  },

  openPrivacy() {
    wx.navigateTo({ url: "/pages/privacy/privacy" });
  },

  openAgreement() {
    wx.navigateTo({ url: "/pages/agreement/agreement" });
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

    if (!this.data.agreedToTerms) {
      wx.showToast({
        title: "请先阅读并同意用户服务协议和隐私政策",
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

      wx.setStorageSync(ACCESS_TOKEN_KEY, result.token.access_token);
      wx.setStorageSync(TOKEN_EXPIRES_AT_KEY, Date.now() + result.token.expires_in * 1000);
      wx.setStorageSync("shanhuai_user", result.user);
      wx.setStorageSync("shanhuai_managed_projects", result.managed_projects || []);

      if (isLocalDebugEnv()) {
        wx.setStorageSync(LOCAL_DEBUG_PASSWORD_KEY, password);
      }

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
