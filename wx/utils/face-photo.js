// 控制人脸机实际上传的 JPEG 大小；不将压缩失败回退成原图上传。
const MAX_PHOTO_BYTES = 200 * 1024;

function base64Bytes(value) {
  if (typeof value !== "string" || !value.length) return 0;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor(value.length * 3 / 4) - padding;
}

async function prepareFacePhoto(photo, api = wx) {
  const info = await new Promise((resolve, reject) => {
    api.getImageInfo({ src: photo, success: resolve, fail: reject });
  });
  if (!(info.width > 0 && info.height > 0)) throw new Error("照片尺寸无效，请重新拍照");
  // 每次从拍摄原图压缩，避免连续转码；最长边限制兼顾横竖屏。
  const attempts = [[960, 70], [960, 55], [800, 55], [800, 40]];
  for (const [longEdge, quality] of attempts) {
    const scale = Math.min(1, longEdge / Math.max(info.width, info.height));
    const result = await new Promise((resolve, reject) => {
      api.compressImage({
        src: photo,
        quality,
        compressedWidth: Math.max(1, Math.round(info.width * scale)),
        compressedHeight: Math.max(1, Math.round(info.height * scale)),
        success: resolve,
        fail: reject,
      });
    }).catch(() => { throw new Error("照片压缩失败，请重新拍照"); });
    if (!result.tempFilePath) throw new Error("照片压缩失败，请重新拍照");
    const data = await new Promise((resolve, reject) => {
      api.getFileSystemManager().readFile({
        filePath: result.tempFilePath,
        encoding: "base64",
        success: (file) => resolve(file.data),
        fail: reject,
      });
    });
    const size = base64Bytes(data);
    if (size > 0 && size <= MAX_PHOTO_BYTES) return data;
  }
  throw new Error("照片压缩后仍超过200KB，请调整拍摄画面后重试");
}

module.exports = { prepareFacePhoto, base64Bytes, MAX_PHOTO_BYTES };
