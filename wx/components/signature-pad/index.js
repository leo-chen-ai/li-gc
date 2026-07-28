Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(visible) {
        if (visible) {
          this.setData({ message: "" });
          // wx:if 切换后 canvas 节点需要等下一帧才能查询到
          wx.nextTick(() => this.initCanvas());
        } else {
          this.canvas = null;
          this.context = null;
        }
      },
    },
    uploading: {
      type: Boolean,
      value: false,
    },
    title: {
      type: String,
      value: "人员签字",
    },
  },

  data: {
    message: "",
  },

  lifetimes: {
    attached() {
      this.canvas = null;
      this.context = null;
      this.drawing = false;
      this.lastPoint = null;
      this.hasStroke = false;
    },
  },

  methods: {
    noop() {},

    initCanvas() {
      this.createSelectorQuery()
        .select("#signaturePad")
        .fields({ node: true, size: true })
        .exec((result) => {
          const info = result && result[0];
          if (!info || !info.node) {
            // 节点未就绪时重试一次，避免弹层动画期间查询为空
            setTimeout(() => this.initCanvas(), 120);
            return;
          }
          const canvas = info.node;
          const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 1;
          canvas.width = Math.max(1, Math.floor(info.width * dpr));
          canvas.height = Math.max(1, Math.floor(info.height * dpr));
          const context = canvas.getContext("2d");
          context.scale(dpr, dpr);
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, info.width, info.height);
          context.lineCap = "round";
          context.lineJoin = "round";
          context.strokeStyle = "#111827";
          context.lineWidth = 3;
          this.canvas = canvas;
          this.context = context;
          this.drawing = false;
          this.lastPoint = null;
          this.hasStroke = false;
        });
    },

    pointFromEvent(event) {
      const touch = event.touches && event.touches[0];
      if (!touch) return null;
      return { x: touch.x, y: touch.y };
    },

    handleTouchStart(event) {
      if (!this.context) return;
      this.drawing = true;
      this.lastPoint = this.pointFromEvent(event);
      if (this.data.message) this.setData({ message: "" });
    },

    handleTouchMove(event) {
      if (!this.drawing || !this.lastPoint || !this.context) return;
      const nextPoint = this.pointFromEvent(event);
      if (!nextPoint) return;
      this.context.beginPath();
      this.context.moveTo(this.lastPoint.x, this.lastPoint.y);
      this.context.lineTo(nextPoint.x, nextPoint.y);
      this.context.stroke();
      this.lastPoint = nextPoint;
      this.hasStroke = true;
    },

    handleTouchEnd() {
      this.drawing = false;
      this.lastPoint = null;
    },

    clearPad() {
      if (this.data.uploading) return;
      this.initCanvas();
      this.setData({ message: "" });
    },

    handleClose() {
      if (this.data.uploading) return;
      this.triggerEvent("close");
    },

    confirmPad() {
      if (this.data.uploading) return;
      if (!this.hasStroke) {
        this.setData({ message: "请先在签字区域手写签名" });
        return;
      }
      if (!this.canvas) return;
      wx.canvasToTempFilePath({
        canvas: this.canvas,
        fileType: "png",
        success: (result) => {
          if (!result.tempFilePath) {
            this.setData({ message: "签字生成失败，请重新签字" });
            return;
          }
          this.triggerEvent("confirm", { tempFilePath: result.tempFilePath });
        },
        fail: () => {
          this.setData({ message: "签字生成失败，请重新签字" });
        },
      }, this);
    },
  },
});
