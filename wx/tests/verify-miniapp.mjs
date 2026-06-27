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
  "config/api.js",
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
  "pages/profile/profile.wxml",
  "pages/profile/profile.wxss",
  "pages/profile/profile.js",
  "pages/profile/profile.json",
  "utils/module-page.js",
  "pages/onboarding/onboarding.wxml",
  "pages/onboarding/onboarding.wxss",
  "pages/onboarding/onboarding.js",
  "pages/onboarding/onboarding.json",
  "pages/teams/teams.wxml",
  "pages/teams/teams.wxss",
  "pages/teams/teams.js",
  "pages/teams/teams.json",
  "pages/workers/workers.wxml",
  "pages/workers/workers.wxss",
  "pages/workers/workers.js",
  "pages/workers/workers.json",
  "pages/companies/companies.wxml",
  "pages/companies/companies.wxss",
  "pages/companies/companies.js",
  "pages/companies/companies.json",
  "pages/attendance/attendance.wxml",
  "pages/attendance/attendance.wxss",
  "pages/attendance/attendance.js",
  "pages/attendance/attendance.json",
  "pages/device/device.wxml",
  "pages/device/device.wxss",
  "pages/device/device.js",
  "pages/device/device.json",
]) {
  assert.ok(existsSync(join(root, path)), `${path} should exist`);
}

const projectConfig = readJson("project.config.json");
assert.equal(projectConfig.appid, "wx27135eec1b9aedbd");
assert.ok(
  projectConfig.packOptions.include.some((item) => item.type === "file" && item.value === "utils/module-page.js"),
  "module-page shared JS should be explicitly included in the mini program package",
);
assert.ok(
  projectConfig.packOptions.include.some((item) => item.type === "file" && item.value === "config/api.js"),
  "api config JS should be explicitly included in the mini program package",
);

const appJson = readJson("app.json");
assert.deepEqual(appJson.pages, [
  "pages/login/login",
  "pages/home/home",
  "pages/profile/profile",
  "pages/onboarding/onboarding",
  "pages/teams/teams",
  "pages/workers/workers",
  "pages/companies/companies",
  "pages/attendance/attendance",
  "pages/device/device",
]);
assert.equal(appJson.window.navigationStyle, "custom");

const packageJson = readJson("package.json");
assert.ok(packageJson.dependencies["tdesign-miniprogram"], "tdesign-miniprogram dependency is required");

const loginJson = readJson("pages/login/login.json");
assert.equal(loginJson.usingComponents["t-button"], "/miniprogram_npm/tdesign-miniprogram/button/button");

const homeJson = readJson("pages/home/home.json");
assert.equal(homeJson.navigationStyle, "custom");

const profileJson = readJson("pages/profile/profile.json");
assert.equal(profileJson.navigationStyle, "custom");
assert.equal(profileJson.usingComponents["t-icon"], "/miniprogram_npm/tdesign-miniprogram/icon/icon");

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
assert.match(loginJs, /require\("\.\.\/\.\.\/config\/api\.js"\)/);
assert.match(loginJs, /client:\s*"miniapp"/);
assert.match(loginJs, /shanhuai_access_token/);
assert.match(loginJs, /shanhuai_managed_projects/);
assert.doesNotMatch(loginJs, /loginIllustration:\s*"\/assets\/illustrations\//);
assert.doesNotMatch(loginJs, /shanhuai_mock_login/);

const homeWxml = readText("pages/home/home.wxml");
const homeWxss = readText("pages/home/home.wxss");
const homeJs = readText("pages/home/home.js");
const homeSurface = `${homeWxml}\n${homeJs}`;
for (const label of ["实名入职", "班组管理", "项目工人", "参建单位", "出勤统计", "考勤机模式"]) {
  assert.match(homeSurface, new RegExp(label), `home should render ${label}`);
}

assert.doesNotMatch(homeSurface, /人员管理/, "home should not repeat the personnel management section");
assert.doesNotMatch(homeSurface, /今日待办12人/, "home should not show onboarding todo copy");
assert.doesNotMatch(homeSurface, /现有工人数/, "home should not show incomplete onboarding worker copy");
assert.match(homeSurface, /现有工人12人/, "home should show onboarding current worker copy");
assert.doesNotMatch(homeJs, /manageModules/, "home should not keep unused personnel management data");
assert.match(homeWxss, /\.feature-primary\s*\{[\s\S]*height:\s*390rpx;/);
assert.match(homeWxss, /\.feature-mini\s*\{[\s\S]*height:\s*186rpx;/);
assert.match(homeWxss, /\.feature-wide\s*\{[\s\S]*height:\s*186rpx;/);
assert.match(homeWxss, /\.home-page\s*\{[\s\S]*padding:\s*124rpx 30rpx calc\(196rpx \+ env\(safe-area-inset-bottom\)\);/);
assert.match(homeWxss, /\.bottom-nav\s*\{[\s\S]*height:\s*calc\(112rpx \+ env\(safe-area-inset-bottom\)\);/);

assert.match(homeJs, /navigateToModule/);
for (const route of ["onboarding", "teams", "workers", "companies", "attendance", "device"]) {
  assert.match(homeJs, new RegExp(`/pages/${route}/${route}`), `home should route to ${route} page`);
}
assert.doesNotMatch(homeJs, /\/pages\/module\/module/);
assert.match(homeJs, /assetPath/);
assert.doesNotMatch(homeWxml, /宁波山淮科技有限公司 技术支持/);
assert.doesNotMatch(homeWxss, /support-footer/);
assert.match(homeJs, /projectOptions/);
assert.match(homeJs, /developerName/);
assert.match(homeSurface, /淮安城发置业有限公司/);
assert.match(homeJs, /project-switch-card-bg\.png/);
assert.match(homeJs, /openProjectSwitcher/);
assert.match(homeJs, /onProjectKeywordInput/);
assert.match(homeJs, /selectProject/);
assert.match(homeJs, /\/pages\/profile\/profile/);
assert.match(homeWxml, /project-card/);
assert.match(homeWxml, /project-modal/);
assert.match(homeWxml, /project-search/);
assert.match(homeWxml, /project-option/);
assert.match(homeWxss, /\.project-card\s*\{/);
assert.match(homeWxss, /\.project-switch-button\s*\{/);
assert.match(homeWxss, /\.project-modal\s*\{/);

const profileWxml = readText("pages/profile/profile.wxml");
const profileWxss = readText("pages/profile/profile.wxss");
const profileJs = readText("pages/profile/profile.js");
const profileSurface = `${profileWxml}\n${profileJs}`;
for (const label of ["我的", "账号安全与项目身份", "手机号码", "当前项目", "所属单位", "联系我们", "常用功能", "修改密码", "退出登录"]) {
  assert.match(profileSurface, new RegExp(label), `profile should render ${label}`);
}
for (const removedLabel of ["已登录", "安全值", "我的项目", "今日出勤", "在职工人", "公司管理", "电子围栏设置", "子管理员维护", "短信设置", "客服支持", "升级模块", "隐私政策", "项目切换", "实名入职"]) {
  assert.doesNotMatch(profileSurface, new RegExp(removedLabel), `profile should not render ${removedLabel}`);
}
assert.match(profileWxml, /profile-bg-image/);
assert.match(profileWxml, /profile-top-visual/);
assert.match(profileWxml, /account-hero/);
assert.doesNotMatch(profileWxml, /account-visual-bg/);
assert.doesNotMatch(profileWxml, /site-visual-card/);
assert.doesNotMatch(profileWxml, /security-card/);
assert.doesNotMatch(profileWxml, /security-track/);
assert.doesNotMatch(profileWxml, /security-row|security-score/);
assert.match(profileWxml, /phone-row/);
assert.match(profileWxml, /contact-card/);
assert.match(profileWxml, /contact-icon/);
assert.match(profileWxml, /tool-grid/);
assert.match(profileWxml, /bottom-nav/);
assert.match(profileWxml, /t-icon/);
assert.match(profileJs, /goHome/);
assert.match(profileJs, /changePassword/);
assert.match(profileJs, /contactUs/);
assert.match(profileJs, /maskPhone/);
assert.match(profileJs, /logout/);
assert.match(profileJs, /removeStorageSync\("shanhuai_access_token"\)/);
assert.doesNotMatch(profileJs, /shanhuai_mock_login/);
assert.match(profileJs, /\/pages\/home\/home/);
assert.match(profileJs, /\/pages\/login\/login/);
assert.match(profileJs, /profile-page-green-bg\.jpg/);
assert.match(profileJs, /profile-construction-visual\.jpg/);
assert.match(profileJs, /profile-contact-icon\.png/);
assert.match(profileWxss, /#0a9875/);
assert.match(profileWxss, /\.profile-top-visual\s*\{/);
assert.match(profileWxss, /\.contact-card\s*\{/);
assert.doesNotMatch(profileWxss, /security-progress|security-mini-button|cardBgFloat|progressFill/);
assert.match(profileWxss, /@keyframes bgDrift/);
assert.match(profileWxss, /@keyframes avatarFloat/);
assert.match(profileWxss, /@keyframes visualFloat/);
assert.match(profileWxss, /@keyframes sectionEnter/);
assert.match(profileWxss, /\.profile-content\s*\{[\s\S]*padding:\s*112rpx 30rpx calc\(196rpx \+ env\(safe-area-inset-bottom\)\);/);
assert.match(profileWxss, /\.bottom-nav\s*\{[\s\S]*height:\s*calc\(112rpx \+ env\(safe-area-inset-bottom\)\);/);
assert.doesNotMatch(profileWxss, /purple|fuchsia|miku|#ff7d73|#ff6f6a|#ffb08c/i);
assert.ok(existsSync(join(root, "assets/generated/profile-page-green-bg.jpg")), "profile page background should exist");
assert.ok(existsSync(join(root, "assets/generated/profile-construction-visual.jpg")), "profile construction visual should exist");
assert.ok(existsSync(join(root, "assets/generated/profile-contact-icon.png")), "profile contact icon should exist");

const onboardingWxml = readText("pages/onboarding/onboarding.wxml");
const onboardingWxss = readText("pages/onboarding/onboarding.wxss");
const onboardingJs = readText("pages/onboarding/onboarding.js");
assert.doesNotMatch(onboardingJs, /createModulePage/);
assert.match(onboardingJs, /knownWorkerByPhone/);
assert.match(onboardingJs, /confirmPhoneLookup/);
assert.match(onboardingJs, /submitOnboarding/);
assert.match(onboardingJs, /phone:\s*"1"/);
assert.match(onboardingWxml, /先查询手机号/);
assert.match(onboardingWxml, /phoneModalVisible/);
assert.match(onboardingWxml, /onboarding-form/);
assert.match(onboardingWxml, /提交实名入职/);
assert.match(onboardingWxml, /idFrontImage/);
assert.match(onboardingWxml, /idBackImage/);
assert.match(onboardingWxml, /id-illustration/);
assert.ok(
  onboardingWxml.indexOf("个人信息") < onboardingWxml.indexOf("工作信息"),
  "onboarding should place personal information before work information",
);
for (const action of ["chooseFaceImage", "chooseIdFrontImage", "chooseIdBackImage"]) {
  assert.match(onboardingWxml, new RegExp(`bind:tap="${action}"`), `onboarding should make ${action} tappable`);
  assert.match(onboardingJs, new RegExp(action), `onboarding should implement ${action}`);
}
for (const label of ["工作信息", "管理人员角色", "文化程度", "政治面貌", "结算方式", "单价", "个人信息", "身份证识别", "有效期开始", "有效期结束"]) {
  assert.match(onboardingWxml, new RegExp(label), `onboarding should render ${label}`);
}
for (const removedLabel of ["新入职人员", "已匹配人员", "重新查询手机号"]) {
  assert.doesNotMatch(onboardingWxml, new RegExp(removedLabel), `onboarding should not render ${removedLabel}`);
}
assert.doesNotMatch(onboardingWxml, /record-card/);
assert.doesNotMatch(onboardingWxml, /form-sheet/);
assert.match(onboardingWxss, /\.phone-modal\s*\{/);
assert.doesNotMatch(onboardingWxss, /lookup-notice|notice-action/);
assert.doesNotMatch(onboardingWxss, /backdrop-filter|radial-gradient\(circle at 50% 22%/);
assert.match(onboardingWxss, /\.phone-mask\s*\{[\s\S]*background:\s*rgba\(16,\s*31,\s*35,\s*0\.42\);/);
assert.match(onboardingWxss, /\.phone-modal\s*\{[\s\S]*border-radius:\s*34rpx;/);
assert.doesNotMatch(onboardingWxss, /\.phone-modal::before/);
assert.match(onboardingWxss, /\.phone-modal::after\s*\{/);
assert.match(onboardingWxss, /\.onboarding-form\s*\{/);
assert.match(onboardingJs, /page-header-bg-v1\.png/);
assert.match(onboardingJs, /onboarding-face-upload-v1\.png/);
assert.match(onboardingJs, /id-card-front-construction-v2\.png/);
assert.match(onboardingJs, /id-card-back-construction-v2\.png/);
assert.match(onboardingWxss, /\.field-row \.field\s*\{[\s\S]*margin-top:\s*0;/);
assert.match(onboardingWxss, /\.face-upload-card\s*\{/);
assert.match(onboardingWxss, /\.id-upload-action\s*\{/);
assert.match(onboardingWxss, /\.id-illustration\s*\{/);
assert.match(onboardingWxss, /safe-area-inset-bottom/);

const moduleWxml = readText("pages/teams/teams.wxml");
const moduleWxss = readText("pages/teams/teams.wxss");
const moduleJs = readText("utils/module-page.js");
for (const label of ["班组管理", "参建单位", "考勤机模式"]) {
  assert.match(moduleJs, new RegExp(label), `module page should configure ${label}`);
}
assert.doesNotMatch(moduleJs, /key:\s*"onboarding"/);
assert.doesNotMatch(moduleJs, /key:\s*"workers"/);
assert.doesNotMatch(moduleJs, /key:\s*"attendance"/);
for (const field of ["company_credit_code", "manager_id_card", "project_name", "attendance_period", "second_day", "contract_template", "registered_date", "region", "serial_number"]) {
  assert.match(moduleJs, new RegExp(field), `module page should include ${field}`);
}
for (const action of ["openCreate", "openEdit", "saveRecord", "deleteRecord"]) {
  assert.match(moduleJs, new RegExp(action), `module page should implement ${action}`);
}
for (const route of ["teams", "companies", "device"]) {
  const js = readText(`pages/${route}/${route}.js`);
  const wxml = readText(`pages/${route}/${route}.wxml`);
  const wxss = readText(`pages/${route}/${route}.wxss`);
  assert.match(js, /require\("\.\.\/\.\.\/utils\/module-page\.js"\)/, `${route} should require module-page with explicit .js extension`);
  assert.match(wxml, /module-hero-bg/, `${route} should render generated header background`);
  assert.doesNotMatch(wxml, /重置/, `${route} should not render reset near the WeChat capsule`);
  assert.doesNotMatch(wxml, /hero-action/, `${route} should not render the old right hero action`);
  assert.doesNotMatch(wxss, /\.hero-action/, `${route} should not keep unused hero action styles`);
}
assert.match(moduleJs, /Array\.isArray\(cached\)\) return cached/);
assert.match(moduleJs, /getCurrentPages\(\)/);
assert.match(moduleJs, /redirectTo\(\{ url: "\/pages\/home\/home" \}\)/);
assert.match(moduleWxml, /form-sheet/);
assert.match(moduleWxml, /record-card/);
assert.doesNotMatch(moduleWxml, /module-tabs/);
assert.match(moduleWxml, /picker/);
assert.doesNotMatch(moduleWxml, /\|\| '请选择'/);
assert.match(moduleWxss, /safe-area-inset-bottom/);
assert.match(moduleWxss, /\.record-card\s*\{[\s\S]*border-radius:\s*22rpx;/);
assert.match(moduleWxss, /\.record-actions\s*\{[\s\S]*gap:\s*20rpx;/);
assert.match(moduleWxss, /\.text-button\s*\{[\s\S]*min-width:\s*96rpx;/);
assert.ok(!existsSync(join(root, "pages/module/module.wxml")), "old fused module page should not remain");

const workersWxml = readText("pages/workers/workers.wxml");
const workersWxss = readText("pages/workers/workers.wxss");
const workersJs = readText("pages/workers/workers.js");
assert.doesNotMatch(workersJs, /createModulePage/);
for (const label of ["在场人数", "批量退场", "请输入姓名或手机号", "认证状态", "工人详情", "身份证号码", "劳务合同", "相关文件", "人员签字"]) {
  assert.match(`${workersWxml}\n${workersJs}`, new RegExp(label), `workers page should render ${label}`);
}
assert.match(workersJs, /filterWorkers/);
assert.match(workersJs, /openWorkerDetail/);
assert.match(workersJs, /page-header-bg-v1\.png/);
assert.match(workersWxss, /\.auth-ribbon/);

const attendanceWxml = readText("pages/attendance/attendance.wxml");
const attendanceWxss = readText("pages/attendance/attendance.wxss");
const attendanceJs = readText("pages/attendance/attendance.js");
assert.doesNotMatch(attendanceJs, /createModulePage/);
for (const label of ["出勤统计", "项目名称", "2026年06月", "总人数", "出勤率", "全部班组", "全部参建单位", "搜索姓名", "已出勤", "未出勤"]) {
  assert.match(`${attendanceWxml}\n${attendanceJs}`, new RegExp(label), `attendance page should render ${label}`);
}
assert.match(attendanceJs, /filterList/);
assert.match(attendanceJs, /setDate/);
assert.match(attendanceJs, /setTab/);
assert.match(attendanceJs, /page-header-bg-v1\.png/);
assert.match(attendanceWxss, /\.date-rail/);

global.Page = (config) => {
  assert.equal(typeof config.goBack, "function");
};
global.wx = {
  getStorageSync() { return undefined; },
  setStorageSync() {},
  removeStorageSync() {},
  showToast() {},
  showModal() {},
  navigateBack() {},
  redirectTo() {},
};
global.getCurrentPages = () => [];
for (const route of ["teams", "companies", "device"]) {
  let loadedConfig;
  global.Page = (config) => {
    loadedConfig = config;
    assert.equal(typeof config.onLoad, "function");
    assert.equal(typeof config.goBack, "function");
  };
  require(join(root, `pages/${route}/${route}.js`));
  assert.ok(loadedConfig);
}

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
assert.equal(
  assetPath("/project-switch-card-bg.png"),
  "https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx/project-switch-card-bg.png",
);
assert.equal(
  assetPath("/page-header-bg-v1.png"),
  "https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx/page-header-bg-v1.png",
);
assert.equal(
  assetPath("/onboarding-face-upload-v1.png"),
  "https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx/onboarding-face-upload-v1.png",
);
assert.equal(
  assetPath("/id-card-front-construction-v2.png"),
  "https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx/id-card-front-construction-v2.png",
);
assert.equal(
  assetPath("/id-card-back-construction-v2.png"),
  "https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx/id-card-back-construction-v2.png",
);

const packageJsonText = readText("package.json");
assert.match(packageJsonText, /localize:tdesign-font/);

assert.ok(!existsSync(join(root, "assets/illustrations")), "local illustration assets should not be kept in the mini program package");

const tdesignIconWxss = readText("miniprogram_npm/tdesign-miniprogram/icon/icon.wxss");
assert.match(tdesignIconWxss, /shanhuai-gc\.s3\.cn-east-2\.jdcloud-oss\.com\/wx\/tdesign-icon\.woff/);
