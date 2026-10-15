export const STUDIO_CLIENT_VERSION = 3;
export const STUDIO_PIPELINE = "paired-scenes-v3";

export function validateStudioResult(
  result: { pipeline?: string; entry_layer?: string },
  preparingScenes: boolean,
) {
  if (result.pipeline !== STUDIO_PIPELINE) {
    throw new Error("生成服务版本不一致，请刷新后再生成；未接受旧方式的结果");
  }
  if (!preparingScenes && !result.entry_layer) {
    throw new Error("人物合成结果不完整，请重试本套");
  }
}
