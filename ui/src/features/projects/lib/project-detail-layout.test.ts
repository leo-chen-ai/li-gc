import assert from "node:assert/strict";

import {
  DEFAULT_PROJECT_DETAIL_TAB,
  getProjectDetailTabs,
  getProjectInfoCellClassName,
} from "./project-detail-layout.ts";

assert.equal(DEFAULT_PROJECT_DETAIL_TAB, "项目基本信息");

assert.equal(getProjectInfoCellClassName(12, 13), "sm:col-span-2");
assert.equal(getProjectInfoCellClassName(11, 13), "");
assert.equal(getProjectInfoCellClassName(11, 12), "");

assert.equal(getProjectDetailTabs(true).includes("移动人脸机"), true);
assert.equal(getProjectDetailTabs(false).includes("移动人脸机"), false);
assert.equal(getProjectDetailTabs(true).includes("电子围栏配置"), false);
assert.equal(getProjectDetailTabs(false).includes("电子围栏配置"), false);
