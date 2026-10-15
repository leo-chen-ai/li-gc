export type AttendanceReference = { record_id: string; out_record_id: string };

// 整批确定一次背景；各套只随机衣服，重试复用同一份批次参数。
export function prepareStudioReferences(references: AttendanceReference[]) {
  if (!references.length || references.some((item) => !item.record_id || !item.out_record_id)) {
    throw new Error("缺少完整的进出场参考照片，请重新抽取");
  }
  return {
    background_in_record_id: references[0].record_id,
    background_out_record_id: references[0].out_record_id,
    references: references.map((item) => ({ ...item })),
  };
}
