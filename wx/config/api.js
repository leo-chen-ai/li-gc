const LOCAL_API_BASE_URL = "http://192.168.32.174:8080/api/v1";
const PRODUCTION_API_BASE_URL = "https://shanhuai.top/api/v1";

function isDevelopEnv() {
  if (!wx.getAccountInfoSync) return false;
  try {
    const accountInfo = wx.getAccountInfoSync();
    return accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion === "develop";
  } catch (error) {
    return false;
  }
}

const API_BASE_URL = isDevelopEnv() ? LOCAL_API_BASE_URL : PRODUCTION_API_BASE_URL;
const API_ORIGIN = API_BASE_URL.replace(/^(https?:\/\/[^/]+)[\s\S]*$/, "$1");
let redirectingToLogin = false;

function apiUrl(path) {
  return `${API_BASE_URL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

// 本地开发后端 UPLOAD_BASE_URL 常配为 localhost，真机上 localhost 指向手机自身无法访问，
// 展示图片前把 localhost/127.0.0.1 域重写为当前 API 域名
function resolveAssetUrl(url) {
  if (!url || typeof url !== "string") return "";
  return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, API_ORIGIN);
}

function handleUnauthorized(url, statusCode) {
  if (statusCode !== 401 || url === "/auth/login") return false;

  wx.removeStorageSync("shanhuai_access_token");
  wx.removeStorageSync("shanhuai_token_expires_at");
  wx.removeStorageSync("shanhuai_user");
  wx.removeStorageSync("shanhuai_managed_projects");
  wx.removeStorageSync("shanhuai_selected_project");

  if (!redirectingToLogin) {
    redirectingToLogin = true;
    wx.showToast({ title: "登录已过期，请重新登录", icon: "none" });
    wx.reLaunch({
      url: "/pages/login/login",
      complete: () => setTimeout(() => { redirectingToLogin = false; }, 1000),
    });
  }
  return true;
}

function request({ url, method = "GET", data, header = {} }) {
  const token = wx.getStorageSync("shanhuai_access_token");
  const headers = {
    "content-type": "application/json",
    ...header,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: apiUrl(url),
      method,
      data,
      header: headers,
      success(response) {
        if (handleUnauthorized(url, response.statusCode)) {
          reject(new Error("登录已过期，请重新登录"));
          return;
        }
        if (response.statusCode >= 200 && response.statusCode < 300 && response.data && response.data.success) {
          resolve(response.data.data);
          return;
        }

        reject(new Error(response.data && response.data.message ? response.data.message : "请求失败"));
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

function uploadFile({ url = "/uploads", filePath, name = "file", formData = {}, header = {} }) {
  const token = wx.getStorageSync("shanhuai_access_token");
  const headers = { ...header };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: apiUrl(url),
      filePath,
      name,
      formData,
      header: headers,
      success(response) {
        if (handleUnauthorized(url, response.statusCode)) {
          reject(new Error("登录已过期，请重新登录"));
          return;
        }
        let body = response.data;
        try {
          body = JSON.parse(response.data);
        } catch (error) {
          reject(new Error("上传响应解析失败"));
          return;
        }

        if (response.statusCode >= 200 && response.statusCode < 300 && body && body.success) {
          resolve(body.data);
          return;
        }

        reject(new Error(body && body.message ? body.message : "上传失败"));
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

module.exports = {
  API_BASE_URL,
  request,
  resolveAssetUrl,
  uploadFile,
};
