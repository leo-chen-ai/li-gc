export type AttendanceReference = { record_id: string; out_record_id: string; in_photo?: string | null; out_photo?: string | null };

// 保存同次抽样，每套分别使用自己的进出场原图，重试不重新抽取。
export function prepareStudioReferences(references: AttendanceReference[]) {
  if (!references.length || references.some((item) => !item.record_id || !item.out_record_id)) {
    throw new Error("缺少完整的进出场参考照片，请重新抽取");
  }
  return {
    references: references.map((item) => ({ ...item })),
  };
}

export function studioPairReference(references: AttendanceReference[], index: number) {
  const pair = references[index];
  if (!pair?.record_id || !pair.out_record_id) throw new Error("缺少本套进出场参考原图");
  return {
    reference_record_id: pair.record_id,
    reference_out_record_id: pair.out_record_id,
    background_in_record_id: pair.record_id,
    background_out_record_id: pair.out_record_id,
  };
}

// 预览与生成使用同一次抽样；仅接受图片或HTTP(S)地址，兼容设备裸base64原图。
export function referencePhotoSrc(photo?: string | null): string | undefined {
  if (!photo) return undefined;
  const value = photo.trim();
  if (/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch { /* 设备图片也可能是裸base64 */ }
  const base64 = value.replace(/\s/g, "");
  return base64.length >= 16 && /^[A-Za-z0-9+/]+={0,2}$/.test(base64)
    ? `data:image/jpeg;base64,${base64}` : undefined;
}
