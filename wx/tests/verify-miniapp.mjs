import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function readText(path) {
  return readFileSync(join(root, path), "utf8");
}

for (const path of [
  "project.config.json",
  "app.json",
  "app.js",
  "app.wxss",
  "config/assets.js",
  "package.json",
  "scripts/localize-tdesign-font.mjs",
  "pages/login/login.wxml",
  "pages/login/login.wxss",
  "pages/login/login.js",
  "pages/login/login.json",
  "pages/home/home.wxml",
  "pages/home/home.wxss",
  "pages/home/home.js",
  "pages/home/home.json",
]) {
  assert.ok(existsSync(join(root, path)), `${path} should exist`);
}

const projectConfig = readJson("project.config.json");
assert.equal(projectConfig.appid, "wx27135eec1b9aedbd");

const appJson = readJson("app.json");
assert.deepEqual(appJson.pages, ["pages/login/login", "pages/home/home"]);
assert.equal(appJson.window.navigationStyle, "custom");

const packageJson = readJson("package.json");
assert.ok(packageJson.dependencies["tdesign-miniprogram"], "tdesign-miniprogram dependency is required");

const loginJson = readJson("pages/login/login.json");
assert.equal(loginJson.usingComponents["t-button"], "/miniprogram_npm/tdesign-miniprogram/button/button");

const homeJson = readJson("pages/home/home.json");
assert.equal(homeJson.navigationStyle, "custom");

const loginWxml = readText("pages/login/login.wxml");
const loginWxss = readText("pages/login/login.wxss");
const loginJs = readText("pages/login/login.js");
assert.match(loginWxml, /山淮筑/);
assert.match(loginWxml, /请输入邮箱或用户名/);
assert.match(loginWxml, /登录/);
assert.match(loginWxml, /宁波山淮科技有限公司 技术支持/);
assert.match(loginWxml, /class="login-bg"/);
assert.match(loginWxml, /class="login-bg-fade"/);
assert.doesNotMatch(loginWxss, /padding:\s*132rpx/);
assert.match(loginWxss, /\.login-bg\s*\{/);
assert.match(loginWxss, /\.login-bg\s*\{[\s\S]*top:\s*-\d+rpx;/);
assert.match(loginJs, /login-attendance-bg-preview-v1\.png/);
assert.match(loginJs, /assetPath/);
assert.doesNotMatch(loginJs, /loginIllustration:\s*"\/assets\/illustrations\//);
assert.doesNotMatch(loginJs, /请输入账号和密码/);

const homeWxml = readText("pages/home/home.wxml");
const homeWxss = readText("pages/home/home.wxss");
const homeJs = readText("pages/home/home.js");
const homeSurface = `${homeWxml}\n${homeJs}`;
for (const label of ["实名入职", "班组管理", "项目工人", "参建单位", "出勤统计", "考勤机模式"]) {
  assert.match(homeSurface, new RegExp(label), `home should render ${label}`);
}

assert.doesNotMatch(homeSurface, /人员管理/, "home should not repeat the personnel management section");
assert.doesNotMatch(homeJs, /manageModules/, "home should not keep unused personnel management data");
assert.match(homeWxss, /\.feature-primary\s*\{[\s\S]*height:\s*390rpx;/);
assert.match(homeWxss, /\.feature-mini\s*\{[\s\S]*height:\s*186rpx;/);
assert.match(homeWxss, /\.feature-wide\s*\{[\s\S]*height:\s*186rpx;/);

assert.match(homeJs, /navigateToModule/);
assert.match(homeJs, /assetPath/);
assert.match(homeWxml, /宁波山淮科技有限公司 技术支持/);

const assetConfig = readText("config/assets.js");
assert.match(assetConfig, /ASSET_BASE_URL/);
assert.match(assetConfig, /京东云 OSS/);

const { ASSET_BASE_URL, assetPath } = require(join(root, "config/assets.js"));
assert.equal(ASSET_BASE_URL, "https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx");
assert.equal(
  assetPath("/assets/illustrations/login-attendance-banner-v3.png"),
  "https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx/login-attendance-banner-v3.png",
);
assert.equal(
  assetPath("/assets/illustrations/login-attendance-bg-preview-v1.png"),
  "https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx/login-attendance-bg-preview-v1.png",
);

const packageJsonText = readText("package.json");
assert.match(packageJsonText, /localize:tdesign-font/);

assert.ok(!existsSync(join(root, "assets/illustrations")), "local illustration assets should not be kept in the mini program package");

const tdesignIconWxss = readText("miniprogram_npm/tdesign-miniprogram/icon/icon.wxss");
assert.match(tdesignIconWxss, /shanhuai-gc\.s3\.cn-east-2\.jdcloud-oss\.com\/wx\/tdesign-icon\.woff/);
