const { resolveAssetUrl } = require("../../config/api.js");
const {
  getSelectedProject,
  listAttendancePointTodayRecords,
  recognizeAttendancePoint,
} = require("../../utils/construction-api.js");

function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeRecord(record) {
  return {
    ...record,
    timeText: formatTime(record.trigger_time),
    avatarUrl: resolveAssetUrl(record.worker_avatar || record.closeup_photo || ""),
  };
}

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
    pointId: "",
    pointName: "考勤点",
    cameraPosition: "front",
    cameraAlive: false,
    privacyVisible: false,
    privacyContractName: "《山淮筑隐私保护指引》",
    cameraBlocked: false,
    cameraErrorText: "",
    recognizing: false,
    lastResult: null,
    todayRecords: [],
    loadingRecords: true,
    topPadding: calcTopPadding(),
  },

  onLoad(options) {
    const pointId = (options && options.pointId) || "";
    const pointName = decodeURIComponent((options && options.pointName) || "考勤点");
    if (!pointId) {
      wx.showToast({ title: "缺少考勤点参数", icon: "none" });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ pointId, pointName });
    this.setupPrivacyAuthorization();
    // camera 延迟挂载：上一个页面的摄像头资源释放需要一点时间，
    // 立即挂载会导致二次进入时黑屏。
    this._mountTimer = setTimeout(() => {
      this.setData({ cameraAlive: true }, () => {
        this.cameraContext = wx.createCameraContext();
      });
    }, 400);
    this.loadTodayRecords();
  },

  // 摄像头属于隐私接口（__usePrivacyCheck__ 已开启），
  // 必须先弹隐私授权弹窗，用户同意后摄像头才能出画面，否则黑屏。
  setupPrivacyAuthorization() {
    if (!wx.onNeedPrivacyAuthorization) return;
    wx.onNeedPrivacyAuthorization((resolve) => {
      this._privacyResolve = resolve;
      this.setData({ privacyVisible: true });
    });
    if (wx.getPrivacySetting) {
      wx.getPrivacySetting({
        success: (result) => {
          if (result.privacyContractName) {
            this.setData({ privacyContractName: result.privacyContractName });
          }
        },
      });
    }
  },

  handlePrivacyAgree() {
    this.setData({ privacyVisible: false });
    if (this._privacyResolve) {
      this._privacyResolve({ event: "agree", buttonId: "privacy-agree-btn" });
      this._privacyResolve = null;
    }
  },

  handlePrivacyDisagree() {
    this.setData({ privacyVisible: false });
    if (this._privacyResolve) {
      this._privacyResolve({ event: "disagree" });
      this._privacyResolve = null;
    }
    this.setData({
      cameraBlocked: true,
      cameraErrorText: "未同意隐私协议，无法使用摄像头打卡",
    });
  },

  openPrivacyContract() {
    if (wx.openPrivacyContract) {
      wx.openPrivacyContract();
    }
  },

  onUnload() {
    clearTimeout(this._mountTimer);
    clearTimeout(this._stopTimer);
  },

  onShow() {
    if (!this.data.pointId) return;
    // 仅当页面真正被隐藏过（从打卡成功提示/其他页面返回）才重挂载摄像头，
    // 避免首次进入时销毁重建导致黑屏。
    if (this._needCameraRemount) {
      this._needCameraRemount = false;
      this.remountCamera();
    } else if (!this.cameraContext) {
      this.cameraContext = wx.createCameraContext();
    }
    if (!this.data.loadingRecords) {
      this.loadTodayRecords();
    }
  },

  onHide() {
    this._needCameraRemount = true;
  },

  remountCamera() {
    if (this._remounting) return;
    this._remounting = true;
    this.setData({ cameraAlive: false }, () => {
      setTimeout(() => {
        this.setData({ cameraAlive: true }, () => {
          this.cameraContext = wx.createCameraContext();
          this._remounting = false;
        });
      }, 120);
    });
  },

  onCameraStop() {
    // 摄像头意外停止时重挂载一次（带防抖，避免反复重建黑屏）
    if (this.data.cameraBlocked || this._remounting) return;
    clearTimeout(this._stopTimer);
    this._stopTimer = setTimeout(() => this.remountCamera(), 300);
  },

  toggleCamera() {
    this.setData({
      cameraPosition: this.data.cameraPosition === "front" ? "back" : "front",
    });
  },

  onCameraError(event) {
    const detail = (event && event.detail && event.detail.errMsg) || "";
    this.setData({
      cameraBlocked: true,
      cameraErrorText: detail.includes("auth") || detail.includes("authorize")
        ? "摄像头权限未开启，请在设置中允许使用摄像头"
        : "摄像头初始化失败，请重试",
    });
  },

  openSystemSetting() {
    wx.openSetting({
      success: (result) => {
        if (result.authSetting && result.authSetting["scope.camera"]) {
          this.setData({ cameraBlocked: false, cameraErrorText: "" });
        }
      },
    });
  },

  async captureAndRecognize() {
    if (this.data.recognizing || this.data.cameraBlocked) return;
    const project = getSelectedProject();
    if (!project || !project.id) {
      wx.showToast({ title: "请先选择项目", icon: "none" });
      return;
    }
    this.setData({ recognizing: true });
    try {
      const photo = await new Promise((resolve, reject) => {
        this.cameraContext.takePhoto({
          quality: "high",
          success: (result) => resolve(result.tempImagePath),
          fail: reject,
        });
      });

      let filePath = photo;
      try {
        const compressed = await new Promise((resolve, reject) => {
          wx.compressImage({
            src: photo,
            quality: 70,
            compressedWidth: 720,
            success: (result) => resolve(result.tempFilePath),
            fail: reject,
          });
        });
        filePath = compressed || photo;
      } catch (error) {
        // 压缩失败时使用原图
      }

      const imageBase64 = await new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
          filePath,
          encoding: "base64",
          success: (result) => resolve(result.data),
          fail: reject,
        });
      });

      const result = await recognizeAttendancePoint(
        project.id,
        this.data.pointId,
        `data:image/jpeg;base64,${imageBase64}`
      );

      if (result && result.matched) {
        const directionText = result.direction === 1 ? "出场" : "进场";
        this.setData({
          lastResult: {
            ok: true,
            title: `${result.worker_name || "识别成功"} · ${directionText}打卡成功`,
            note: `相似度 ${Math.round((result.score || 0) * 100)}%`,
          },
        });
        wx.vibrateShort && wx.vibrateShort({ type: "light" });
        this.loadTodayRecords();
      } else {
        const reasonMap = {
          no_face: "未检测到人脸，请正对摄像头",
          low_score: "未匹配到人员，请确认已录入人脸",
          empty_library: "项目人脸库为空，请先在后台同步人脸",
        };
        this.setData({
          lastResult: {
            ok: false,
            title: "未识别到人员",
            note: reasonMap[result && result.reason] || "请调整角度后重试",
          },
        });
      }
    } catch (error) {
      const message = (error && error.message) || (error && error.errMsg) || "识别失败，请重试";
      this.setData({
        lastResult: { ok: false, title: "识别失败", note: message },
      });
    } finally {
      this.setData({ recognizing: false });
    }
  },

  async loadTodayRecords() {
    const project = getSelectedProject();
    if (!project || !project.id || !this.data.pointId) return;
    try {
      const records = await listAttendancePointTodayRecords(project.id, this.data.pointId);
      this.setData({
        todayRecords: (Array.isArray(records) ? records : []).map(normalizeRecord),
        loadingRecords: false,
      });
    } catch (error) {
      this.setData({ loadingRecords: false });
    }
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: "/pages/attendance-machine/points" }),
    });
  },
});
