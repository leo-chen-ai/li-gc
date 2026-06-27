// 京东云 OSS prefix for mini program images and fonts.
const ASSET_BASE_URL = "https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx";

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}

function normalizeAssetPath(path) {
  return path
    .replace(/^\/+/, "")
    .replace(/^assets\/illustrations\//, "")
    .replace(/^assets\/fonts\//, "");
}

function assetPath(path) {
  if (!ASSET_BASE_URL) {
    return path;
  }

  return `${normalizeBaseUrl(ASSET_BASE_URL)}/${normalizeAssetPath(path)}`;
}

module.exports = {
  ASSET_BASE_URL,
  assetPath,
};
