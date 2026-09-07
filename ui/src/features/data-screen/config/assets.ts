/** 数据大屏皮肤切图（京东云 OSS，不进仓库） */
export const DATA_SCREEN_ASSET_BASE =
  "https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/data-screen";

export function dataScreenAsset(fileName: string): string {
  const name = fileName.replace(/^\/+/, "").replace(/^data-screen\//, "");
  return `${DATA_SCREEN_ASSET_BASE}/${name}`;
}
