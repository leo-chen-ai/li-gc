const KB = 1024;

export const WORKER_AVATAR_MAX_BYTES = 20 * KB;
export const WORKER_ID_CARD_MAX_BYTES = 50 * KB;

export function workerImageMaxBytes(fieldKey: string): number | null {
  if (fieldKey === "avatar") return WORKER_AVATAR_MAX_BYTES;
  if (fieldKey === "ocr_photo" || fieldKey === "id_card_back_file") {
    return WORKER_ID_CARD_MAX_BYTES;
  }
  return null;
}

export function workerImageLimitLabel(fieldKey: string): string | null {
  const maxBytes = workerImageMaxBytes(fieldKey);
  return maxBytes ? `上传时自动压缩为 JPG，大小小于 ${maxBytes / KB}KB` : null;
}

export async function compressWorkerImageBeforeUpload(file: File, fieldKey: string): Promise<File> {
  const maxBytes = workerImageMaxBytes(fieldKey);
  if (!maxBytes) return file;

  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const qualities = [0.88, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4, 0.32, 0.24];

    while (true) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器不支持图片压缩");
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of qualities) {
        const blob = await canvasToJpeg(canvas, quality);
        if (blob.size < maxBytes) {
          return new File([blob], jpegFilename(file.name), {
            type: "image/jpeg",
            lastModified: file.lastModified,
          });
        }
      }

      if (width <= 160 && height <= 160) break;
      width = Math.max(160, Math.round(width * 0.82));
      height = Math.max(160, Math.round(height * 0.82));
    }
  } finally {
    bitmap.close();
  }

  throw new Error(`图片无法压缩到小于 ${maxBytes / KB}KB，请更换图片`);
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片压缩失败"))),
      "image/jpeg",
      quality
    );
  });
}

function jpegFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "") || "worker-image";
  return `${stem}.jpg`;
}
