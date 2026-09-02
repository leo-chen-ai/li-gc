import assert from "node:assert/strict";

import { DEFAULT_PROJECT_DETAIL_TAB, getProjectInfoCellClassName } from "./project-detail-layout.ts";

assert.equal(DEFAULT_PROJECT_DETAIL_TAB, "项目基本信息");

assert.equal(getProjectInfoCellClassName(12, 13), "sm:col-span-2");
assert.equal(getProjectInfoCellClassName(11, 13), "");
assert.equal(getProjectInfoCellClassName(11, 12), "");
