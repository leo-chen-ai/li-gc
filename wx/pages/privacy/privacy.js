Page({
  data: {
    scrollTop: 0,
  },
  goBack() {
    wx.navigateBack();
  },
  onScrollToTop(event) {
    this.setData({ scrollTop: event.detail.scrollTop });
  },
});
