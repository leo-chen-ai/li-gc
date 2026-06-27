import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const iconWxssPath = join(root, "miniprogram_npm/tdesign-miniprogram/icon/icon.wxss");
const remoteFontUrl = "https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx/tdesign-icon.woff";

if (!existsSync(iconWxssPath)) {
  throw new Error("miniprogram_npm is missing. Run WeChat DevTools build npm first.");
}

const source = readFileSync(iconWxssPath, "utf8");
const localized = source.replace(
  /@font-face\{font-family:t;src:[^}]+}/,
  `@font-face{font-family:t;src:url(${remoteFontUrl}) format('woff');font-weight:400;font-style:normal;}`,
);

if (source === localized) {
  throw new Error("TDesign icon font declaration was not found.");
}

writeFileSync(iconWxssPath, localized, "utf8");
console.log(`Localized TDesign icon font: ${remoteFontUrl}`);
