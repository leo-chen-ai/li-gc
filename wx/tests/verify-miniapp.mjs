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
  "utils/construction-api.js",
  "utils/construction-fields.js",
  "utils/form-utils.js",
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
for (const path of ["utils/construction-api.js", "utils/construction-fields.js", "utils/form-utils.js"]) {
  assert.ok(
    projectConfig.packOptions.include.some((item) => item.type === "file" && item.value === path),
    `${path} should be explicitly included in the mini program package`,
  );
}
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
const loginJson = readJson("pages/login/login.json");
assert.deepEqual(loginJson.usingComponents, {});

const homeJson = readJson("pages/home/home.json");
assert.equal(homeJson.navigationStyle, "custom");

const profileJson = readJson("pages/profile/profile.json");
assert.equal(profileJson.navigationStyle, "custom");
assert.ok(!profileJson.usingComponents || !profileJson.usingComponents["t-icon"], "profile should not depend on remote icon fonts");

const loginWxml = readText("pages/login/login.wxml");
const loginWxss = readText("pages/login/login.wxss");
const loginJs = readText("pages/login/login.js");
assert.match(loginWxml, /山淮筑/);
assert.match(loginWxml, /请输入手机号或用户名/);
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
assert.doesNotMatch(loginJs, /LOCAL_DEBUG_LOGIN/);
assert.doesNotMatch(loginJs, /admin123/);
assert.match(loginJs, /LOCAL_DEBUG_PASSWORD_KEY/);
assert.match(loginJs, /wx\.getStorageSync\(LOCAL_DEBUG_PASSWORD_KEY\)/);
assert.match(loginJs, /wx\.setStorageSync\(LOCAL_DEBUG_PASSWORD_KEY, password\)/);
assert.match(loginJs, /getAccountInfoSync/);
assert.match(loginJs, /envVersion === "develop"/);
assert.match(loginWxml, /bind:tap="togglePasswordVisibility"/);
assert.doesNotMatch(loginWxml, />[◇□●]</);
assert.match(loginJs, /shanhuai_access_token/);
assert.match(loginJs, /shanhuai_token_expires_at/);
assert.match(loginJs, /expiresAt > Date\.now\(\)/);
assert.match(loginJs, /wx\.redirectTo\(\{ url: "\/pages\/home\/home" \}\)/);
assert.ok(
  loginJs.indexOf("expiresAt > Date.now()") < loginJs.indexOf("if (isLocalDebugEnv())"),
  "cached login should be restored before local debug credentials are populated",
);
assert.match(loginJs, /shanhuai_managed_projects/);
for (const icon of ["login-user.png", "login-lock.png", "login-eye.png", "login-eye-off.png"]) {
  assert.match(loginJs, new RegExp(icon.replace(".", "\\.")));
}
assert.doesNotMatch(loginWxml, /<t-(button|icon)/);
assert.match(loginJs, /请拨打管理员电话 13777114735 重置密码/);
assert.match(loginJs, /wx\.makePhoneCall\(\{ phoneNumber: "13777114735" \}\)/);
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
assert.doesNotMatch(homeSurface, /现有工人12人/, "home should not hard-code worker count");
assert.doesNotMatch(homeSurface, /今日出勤286人|今日286人|286人在册|8个班组|6家单位|4台设备/, "home should not hard-code project metrics");
assert.match(homeSurface, /现有工人\$\{stats\.workerCount\}人/, "home should show onboarding current worker copy from project stats");
assert.match(homeSurface, /loadHomeStats/, "home should load project stats");
assert.match(homeSurface, /countTodayAttendance/, "home should count today's attendance by project");
assert.match(homeWxml, /sectionMetric/, "home should render dynamic attendance metric");
assert.match(homeJs, /primaryFeature/, "home should keep original primary feature data");
assert.match(homeWxml, /feature-board/, "home should keep original feature card layout");
assert.match(homeWxml, /primaryFeature|miniFeatures|wideFeature|attendanceModules/, "home should keep original split card structure");
assert.match(homeWxss, /\.feature-primary\s*\{[\s\S]*height:\s*390rpx;/);
assert.match(homeWxss, /\.section-card\s*\{[\s\S]*margin-top:\s*28rpx;/);
assert.doesNotMatch(homeJs, /manageModules/, "home should not keep unused personnel management data");
assert.doesNotMatch(homeWxml, /function-panel|projectFunctions/, "home should not use the compact function panel");
assert.doesNotMatch(homeWxss, /function-panel|function-grid|function-item/);
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
assert.match(homeJs, /listProjectOptions/);
assert.match(homeJs, /未分配项目/);
assert.match(homeJs, /setSelectedProject/);
assert.match(homeJs, /clearSelectedProject/);
assert.match(homeJs, /project-switch-card-bg\.png/);
assert.match(homeJs, /openProjectSwitcher/);
assert.match(homeJs, /onProjectKeywordInput/);
assert.match(homeJs, /selectProject/);
assert.match(homeJs, /\/pages\/profile\/profile/);
assert.match(homeWxml, /project-card/);
assert.match(homeWxml, /project-modal/);
assert.match(homeWxml, /project-search/);
assert.match(homeWxml, /project-option/);
assert.match(homeJs, /openWorkerEntry/);
assert.match(homeJs, /work_status:\s*1/);
assert.match(homeJs, /work_status:\s*2/);
assert.match(homeWxml, /在场工人/);
assert.match(homeWxml, /离场工人/);
assert.match(homeWxml, /onsiteWorkerCount/);
assert.match(homeWxml, /departedWorkerCount/);
assert.match(homeWxss, /\.worker-entry-modal\s*\{[\s\S]*top:\s*50%;/);
assert.match(homeWxss, /\.worker-entry-modal\.show\s*\{[\s\S]*translateY\(-50%\)/);
assert.match(homeWxss, /\.project-card\s*\{/);
assert.match(homeWxss, /\.project-switch-button\s*\{/);
assert.match(homeWxss, /\.project-modal\s*\{/);

const profileWxml = readText("pages/profile/profile.wxml");
const profileWxss = readText("pages/profile/profile.wxss");
const profileJs = readText("pages/profile/profile.js");
const profileSurface = `${profileWxml}\n${profileJs}`;
for (const label of ["我的", "账号安全与项目身份", "拨打13777114735", "常用功能", "修改密码", "退出登录"]) {
  assert.match(profileSurface, new RegExp(label), `profile should render ${label}`);
}
assert.match(profileSurface, /扫码登录电脑端/, "profile should expose PC scan login");
assert.match(profileJs, /scanPcLogin/);
assert.match(profileJs, /wx\.scanCode/);
assert.match(profileJs, /confirmPcLogin/);
assert.match(profileJs, /\/auth\/scan-login\/sessions\/\$\{encodeURIComponent\(scanToken\)\}\/confirm/);
assert.ok(profileJs.includes("shanhuai:\\/\\/scan-login"));
assert.match(profileWxml, /symbol-scan/);
assert.match(profileWxss, /\.symbol-scan::before/);
for (const removedLabel of ["已登录", "安全值", "我的项目", "今日出勤", "在职工人", "公司管理", "电子围栏设置", "子管理员维护", "短信设置", "客服支持", "升级模块", "隐私政策", "项目切换", "实名入职", "手机号码", "当前项目", "所属单位"]) {
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
assert.doesNotMatch(profileWxml, /phone-row|info-grid|info-card|symbol-home|symbol-users/);
assert.match(profileWxml, /contact-card/);
assert.match(profileWxml, /contact-icon/);
assert.match(profileWxml, /tool-grid/);
assert.match(profileWxml, /bottom-nav/);
for (const iconClass of ["symbol-lock", "symbol-logout"]) {
  assert.match(profileWxml, new RegExp(iconClass), `profile should render ${iconClass}`);
  assert.match(profileWxss, new RegExp(`\\.${iconClass}`), `profile should style ${iconClass}`);
}
assert.match(profileJs, /goHome/);
assert.match(profileJs, /changePassword/);
assert.match(profileJs, /\/auth\/change-password/);
assert.match(profileJs, /contactUs/);
assert.match(profileJs, /wx\.makePhoneCall/);
assert.match(profileJs, /13777114735/);
assert.doesNotMatch(profileSurface, /联系我们/);
assert.doesNotMatch(profileJs, /maskPhone|companyName|projectName|未绑定手机号/);
assert.match(profileJs, /logout/);
assert.match(profileJs, /removeStorageSync\("shanhuai_access_token"\)/);
assert.doesNotMatch(profileJs, /shanhuai_mock_login/);
assert.match(profileJs, /\/pages\/home\/home/);
assert.match(profileJs, /\/pages\/login\/login/);
assert.match(profileJs, /profile-page-green-bg\.jpg/);
assert.match(profileJs, /profile-construction-visual\.jpg/);
assert.match(profileJs, /profile-contact-icon\.png/);
assert.match(profileJs, /require\("\.\.\/\.\.\/config\/assets\.js"\)/);
assert.match(profileJs, /assetPath\("\/profile-page-green-bg\.jpg"\)/);
assert.match(profileWxss, /#0a9875/);
assert.match(profileWxss, /\.profile-top-visual\s*\{/);
assert.match(profileWxss, /\.contact-card\s*\{/);
assert.doesNotMatch(profileWxss, /phone-row|info-grid|info-card|symbol-home|symbol-users|security-progress|security-mini-button|cardBgFloat|progressFill/);
assert.doesNotMatch(profileWxss, /@keyframes|animation:/, "profile page should avoid auto animations that stutter on open");
assert.match(profileWxss, /\.profile-content\s*\{[\s\S]*padding:\s*112rpx 30rpx calc\(196rpx \+ env\(safe-area-inset-bottom\)\);/);
assert.match(profileWxss, /\.bottom-nav\s*\{[\s\S]*height:\s*calc\(112rpx \+ env\(safe-area-inset-bottom\)\);/);
assert.doesNotMatch(profileWxss, /purple|fuchsia|miku|#ff7d73|#ff6f6a|#ffb08c/i);
assert.ok(!existsSync(join(root, "assets/generated/profile-page-green-bg.jpg")), "profile page background should be hosted on OSS");
assert.ok(!existsSync(join(root, "assets/generated/profile-construction-visual.jpg")), "profile construction visual should be hosted on OSS");
assert.ok(!existsSync(join(root, "assets/generated/profile-contact-icon.png")), "profile contact icon should be hosted on OSS");

const onboardingWxml = readText("pages/onboarding/onboarding.wxml");
const onboardingWxss = readText("pages/onboarding/onboarding.wxss");
const onboardingJs = readText("pages/onboarding/onboarding.js");
const constructionFieldsJs = readText("utils/construction-fields.js");
const onboardingSurface = `${onboardingWxml}\n${onboardingJs}\n${constructionFieldsJs}`;
assert.doesNotMatch(onboardingJs, /createModulePage/);
assert.match(onboardingJs, /createResource/);
assert.match(onboardingJs, /updateResource/);
assert.match(onboardingJs, /fieldSets\.workers/);
assert.match(onboardingJs, /uploadForField/);
assert.match(onboardingJs, /confirmPhoneLookup/);
assert.match(onboardingJs, /submitOnboarding/);
assert.match(onboardingWxml, /先查询手机号/);
assert.match(onboardingWxml, /phoneModalVisible/);
assert.match(onboardingWxml, /onboarding-form/);
assert.match(onboardingWxml, /提交实名入职/);
assert.match(onboardingWxml, /formSections/);
assert.match(onboardingWxml, /chooseUpload/);
assert.match(onboardingWxml, /field\.control === 'upload'/);
assert.match(onboardingWxml, /field\.uploadItems/);
assert.match(onboardingJs, /previewUpload/);
assert.ok(
  onboardingJs.indexOf("listResource") < onboardingJs.indexOf("submitOnboarding"),
  "onboarding should load project lookups before submit",
);
for (const label of ["班组归属", "证件照片", "基础信息", "结算银行卡"]) {
  assert.match(onboardingSurface, new RegExp(label), `onboarding should define/render ${label}`);
}
assert.match(onboardingJs, /ONBOARDING_HIDDEN_FIELDS/);
for (const field of ["education", "has_major_medical_history", "current_address", "has_insurance", "work_status", "entry_time", "exit_time", "dormitory_id", "settlement_file", "labor_contract_file"]) {
  assert.match(onboardingJs, new RegExp(`ONBOARDING_HIDDEN_FIELDS[\\s\\S]*?"${field}"`));
}
assert.match(onboardingJs, /ONBOARDING_REQUIRED_PHOTOS = new Set\(\["avatar", "ocr_photo", "id_card_back_file"\]\)/);
assert.match(onboardingJs, /label: "身份证正面", required: true/);
assert.match(onboardingJs, /label: "身份证反面", required: true/);
assert.match(onboardingJs, /entry_time: today\(\)/);
assert.match(onboardingJs, /url: "\/ocr\/id-card"/);
assert.match(onboardingJs, /title: "身份证识别中", mask: true/);
assert.match(onboardingJs, /image_url: imageUrl/);
assert.match(onboardingJs, /inferNativePlaceFromAddress\(fields\.address\)/);
assert.match(constructionFieldsJs, /visibleWhenWorkerType: "1001"/);
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
assert.match(onboardingWxss, /\.upload-field\s*\{/);
assert.match(onboardingWxss, /safe-area-inset-bottom/);

const moduleWxml = readText("pages/teams/teams.wxml");
const moduleWxss = readText("pages/teams/teams.wxss");
const moduleJs = readText("utils/module-page.js");
const formUtilsJs = readText("utils/form-utils.js");
assert.match(formUtilsJs, /isFieldVisible\(field, form\)/);
const moduleSurface = `${moduleJs}\n${constructionFieldsJs}`;
const moduleFormSurface = `${moduleWxml}\n${formUtilsJs}`;
for (const label of ["班组管理", "参建单位", "考勤机状态"]) {
  assert.match(moduleJs, new RegExp(label), `module page should configure ${label}`);
}
assert.match(moduleJs, /online_status/, "device module should filter by online status");
assert.match(moduleJs, /last_heartbeat_at/, "device module should display last heartbeat");
assert.match(moduleJs, /isDeviceOnline/, "device module should align online calculation with PC");
assert.match(constructionFieldsJs, /厂家类型/, "device form should use manufacturer type wording");
assert.match(constructionFieldsJs, /deviceTypeOptions/, "device form should expose manufacturer type options");
assert.doesNotMatch(moduleJs, /key:\s*"onboarding"/);
assert.doesNotMatch(moduleJs, /key:\s*"workers"/);
assert.doesNotMatch(moduleJs, /key:\s*"attendance"/);
for (const field of ["company_credit_code", "manager_id_card", "register_date", "register_area", "attachment_file", "unit_id", "attendance_start_time", "attendance_is_next_day", "leader_id", "serial_number"]) {
  assert.match(moduleSurface, new RegExp(field), `module page should include ${field}`);
}
assert.doesNotMatch(moduleSurface, /timer_set_[abc]|计时设置 [ABC]/, "miniapp unit form should not render legacy timer settings");
assert.doesNotMatch(constructionFieldsJs, /key:\s*"team_no"|班组编号/, "miniapp team form should not render unused team number");
assert.doesNotMatch(constructionFieldsJs, /key:\s*"register_area",/, "miniapp unit form should not duplicate registration area");
assert.match(constructionFieldsJs, /key:\s*"register_area_list", label:\s*"注册区域"/);
assert.doesNotMatch(constructionFieldsJs, /key:\s*"attachment",/, "miniapp unit form should not duplicate attachment fields");
assert.match(constructionFieldsJs, /key:\s*"attachment_file", label:\s*"附件"[\s\S]*?uploadKind:\s*"image"/);
assert.match(moduleFormSurface, /dateDisplay/, "miniapp forms should expose date display text");
assert.match(moduleWxml, /mode="date"/, "miniapp module form should use a date picker");
assert.match(moduleFormSurface, /uploadItems/, "miniapp upload fields should expose preview items");
assert.match(moduleFormSurface, /选择本地文件/, "miniapp file uploads should clearly choose local files");
assert.match(moduleWxml, /previewUpload/, "miniapp module upload rows should be previewable");
assert.match(formUtilsJs, /previewUploadedFile/);
for (const action of ["openCreate", "openEdit", "saveRecord", "deleteRecord", "chooseUpload", "previewUpload"]) {
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
const deviceWxml = readText("pages/device/device.wxml");
assert.match(deviceWxml, /wx:if="{{canManage}}"/, "device page should hide management actions for non-admin users");
assert.doesNotMatch(deviceWxml, /record-card"[^>]*bind:tap="openEdit"/, "device cards should not open edit by tapping the whole card");
const companiesWxml = readText("pages/companies/companies.wxml");
const companiesWxss = readText("pages/companies/companies.wxss");
assert.match(companiesWxml, /search-input/, "companies page should keep search beside add");
assert.match(companiesWxml, /bind:tap="submitSearch">搜索/, "companies page should render a visible search button");
assert.match(companiesWxml, /bindconfirm="submitSearch"/, "companies page should search from keyboard confirm");
assert.match(companiesWxss, /\.toolbar-search-button/, "companies page should style the search button");
assert.match(moduleJs, /submitSearch\(\)/, "module page should implement explicit search submit");
assert.match(moduleJs, /params\.keyword\s*=\s*keyword/, "module page should pass search keyword to backend");
assert.doesNotMatch(moduleJs, /Object\.values\(record\)\.join/, "module page should not keyword-filter records on the client");
assert.match(moduleJs, /LIST_PAGE_SIZE = 10/, "module page should default to 10 backend rows");
assert.match(moduleJs, /onReachBottom/, "module page should load more when reaching bottom");
assert.match(moduleJs, /reloadRecords\(\{ append: true \}\)/, "module page should append the next backend page");
assert.match(moduleWxml, /bind:tap="submitSearch">搜索/, "teams page should render a visible search button");
assert.match(moduleWxml, /bindconfirm="submitSearch"/, "teams page should search from keyboard confirm");
assert.match(moduleWxss, /\.toolbar-search-button/, "teams page should style the search button");
assert.match(moduleWxml, /load-more-state/, "teams page should expose load-more state");
assert.match(companiesWxml, /{{total}}/, "companies page should render backend total count");
assert.match(companiesWxml, /load-more-state/, "companies page should expose load-more state");
assert.match(companiesWxml, /bind:tap="openCreate">新增/, "companies page should keep add beside search");
assert.doesNotMatch(companiesWxml, /filter-row|filter-chip|总承包单位|建设单位|劳务分包/, "companies page should not show unit type filter chips");
assert.doesNotMatch(companiesWxss, /\.filter-row|\.filter-chip/, "companies page should not keep unused unit filter styles");
assert.match(moduleJs, /listResource/);
assert.match(moduleJs, /createResource/);
assert.match(moduleJs, /updateResource/);
assert.match(moduleJs, /deleteResource/);
assert.match(moduleJs, /getCurrentPages\(\)/);
assert.match(moduleJs, /redirectTo\(\{ url: "\/pages\/home\/home" \}\)/);
assert.match(moduleWxml, /form-sheet/);
assert.match(moduleWxml, /record-card/);
assert.doesNotMatch(moduleWxml, /module-tabs/);
assert.match(moduleWxml, /picker/);
assert.doesNotMatch(moduleWxml, /\|\| '请选择'/);
assert.match(moduleWxss, /safe-area-inset-bottom/);
assert.match(moduleWxss, /\.record-card\s*\{[\s\S]*border-radius:\s*18rpx;/);
assert.match(moduleWxss, /\.record-grid\s*\{[\s\S]*display:\s*none;/);
assert.match(moduleWxss, /\.record-actions\s*\{[\s\S]*gap:\s*10rpx;/);
assert.match(moduleWxss, /\.text-button\s*\{[\s\S]*min-width:\s*72rpx;/);
assert.match(companiesWxss, /\.record-card\s*\{[\s\S]*border-radius:\s*18rpx;/);
assert.match(companiesWxss, /\.record-grid\s*\{[\s\S]*display:\s*none;/);
assert.ok(!existsSync(join(root, "pages/module/module.wxml")), "old fused module page should not remain");

const workersWxml = readText("pages/workers/workers.wxml");
const workersWxss = readText("pages/workers/workers.wxss");
const workersJs = readText("pages/workers/workers.js");
assert.doesNotMatch(workersJs, /createModulePage/);
for (const label of ["statusLabel", "批量退场", "请输入姓名或手机号", "认证状态", "工人详情", "身份证号码", "劳务合同", "相关文件", "人员签字", "编辑工人信息", "办理退场", "办理进场", "所属班组", "进场日期", "删除工人"]) {
  assert.match(`${workersWxml}\n${workersJs}`, new RegExp(label), `workers page should render ${label}`);
}
assert.match(workersJs, /listResource/);
assert.match(workersJs, /updateResource/);
assert.match(workersJs, /deleteResource/);
assert.match(workersJs, /submitEditWorker/);
assert.match(workersJs, /retireWorker/);
assert.match(workersJs, /openReentry/);
assert.match(workersJs, /submitReentry/);
assert.match(workersJs, /team_id: team\.id/);
assert.match(workersJs, /entry_time: entryTime/);
assert.match(workersJs, /confirmBatchRetire/);
assert.match(workersJs, /work_status:\s*this\.data\.workStatus/);
assert.match(workersWxml, /batch-retire-bar/);
assert.match(workersWxml, /item\.batchSelected/);
assert.match(workersJs, /chooseUpload/);
assert.match(workersJs, /previewUpload/);
assert.match(workersJs, /LIST_PAGE_SIZE = 10/, "workers page should default to 10 backend rows");
assert.match(workersJs, /buildWorkerListParams/, "workers page should build backend list params");
assert.match(workersJs, /params\.keyword\s*=\s*keyword/, "workers page should pass keyword to backend");
assert.match(workersJs, /params\.team_id\s*=\s*team\.id/, "workers page should pass team filter to backend");
assert.match(workersJs, /params\.auth_status\s*=\s*"unverified"/, "workers page should pass unverified filter to backend");
assert.match(workersJs, /onReachBottom/, "workers page should load more when reaching bottom");
assert.doesNotMatch(workersJs, /text\.includes|matchesKeyword|matchesTeam|matchesAuth/, "workers page should not keyword-filter records on the client");
assert.match(workersWxml, /bindconfirm="submitSearch"/, "workers page should search from keyboard confirm");
assert.match(workersWxml, /{{total}}/, "workers page should render backend total count");
assert.match(workersWxml, /load-more-state/, "workers page should expose load-more state");
assert.doesNotMatch(workersWxml, /data-name="下发"|>下发</, "workers page should not render dispatch action");
assert.match(workersWxml, /idCardFrontUrl/);
assert.match(workersWxml, /id-photo-preview/);
assert.match(workersWxml, /item\.uploadItems/);
assert.match(workersWxss, /\.upload-list/);
assert.match(workersWxss, /grid-template-columns:\s*repeat\(2, 1fr\)/, "workers card actions should use two columns");
assert.match(workersJs, /openWorkerDetail/);
assert.match(workersJs, /page-header-bg-v1\.png/);
assert.match(workersWxss, /\.auth-ribbon/);
assert.match(workersWxss, /\.form-sheet/);
assert.match(workersWxss, /\.reentry-dialog\s*\{[\s\S]*top:\s*50%/);

const attendanceWxml = readText("pages/attendance/attendance.wxml");
const attendanceWxss = readText("pages/attendance/attendance.wxss");
const attendanceJs = readText("pages/attendance/attendance.js");
assert.doesNotMatch(attendanceJs, /createModulePage/);
for (const label of ["出勤统计", "项目名称", "总人数", "出勤率", "全部班组", "全部参建单位", "搜索姓名", "已出勤", "未出勤"]) {
  assert.match(`${attendanceWxml}\n${attendanceJs}`, new RegExp(label), `attendance page should render ${label}`);
}
assert.match(attendanceJs, /listResource/);
assert.match(attendanceJs, /buildWorkerAttendance/);
assert.match(attendanceJs, /openWorkerAttendance/);
assert.match(attendanceJs, /loadWorkerMonthCalendar/);
assert.match(attendanceJs, /buildMonthCalendar/);
assert.match(attendanceJs, /view:\s*"calendar"/);
assert.match(attendanceJs, /setDate/);
assert.match(attendanceJs, /setTab/);
assert.match(attendanceJs, /page-header-bg-v1\.png/);
assert.match(attendanceWxss, /\.date-rail/);
assert.match(attendanceWxml, /detail-records/);
assert.match(attendanceWxml, /calendar-grid/);
assert.match(attendanceWxml, /calendar-day/);
assert.match(attendanceWxml, /calendarAttendanceDays/);
assert.match(attendanceWxss, /\.detail-dialog/);
assert.match(attendanceWxss, /\.calendar-day\.present/);

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

const apiConfig = readText("config/api.js");
const { API_BASE_URL } = require(join(root, "config/api.js"));
assert.equal(API_BASE_URL, "https://shanhuai.top/api/v1");
assert.match(apiConfig, /LOCAL_API_BASE_URL = "http:\/\/192\.168\.32\.126:8080\/api\/v1"/);
assert.match(apiConfig, /PRODUCTION_API_BASE_URL = "https:\/\/shanhuai\.top\/api\/v1"/);
assert.match(apiConfig, /isDevelopEnv\(\) \? LOCAL_API_BASE_URL : PRODUCTION_API_BASE_URL/);
assert.match(apiConfig, /statusCode !== 401/);
assert.match(apiConfig, /登录已过期，请重新登录/);
assert.match(apiConfig, /wx\.reLaunch\(\{/);
for (const key of ["shanhuai_access_token", "shanhuai_token_expires_at", "shanhuai_user", "shanhuai_managed_projects", "shanhuai_selected_project"]) {
  assert.match(apiConfig, new RegExp(`removeStorageSync\\("${key}"\\)`), `401 should clear ${key}`);
}
assert.doesNotMatch(apiConfig, /127\.0\.0\.1/, "miniapp debug API should use the LAN IP for real-device debugging");

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

assert.ok(!existsSync(join(root, "assets/illustrations")), "local illustration assets should not be kept in the mini program package");
