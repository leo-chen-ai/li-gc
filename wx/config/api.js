const API_BASE_URL = "http://127.0.0.1:8080/api/v1";

function apiUrl(path) {
  return `${API_BASE_URL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
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

module.exports = {
  API_BASE_URL,
  request,
};
