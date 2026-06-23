import assert from "node:assert/strict";

import { getProjectInfoCellClassName } from "./project-detail-layout.ts";

assert.equal(getProjectInfoCellClassName(12, 13), "sm:col-span-2");
assert.equal(getProjectInfoCellClassName(11, 13), "");
assert.equal(getProjectInfoCellClassName(11, 12), "");
