import assert from "node:assert/strict";
import test from "node:test";

import { getMenuKeysForUserRole, menuPermissions } from "./rbac.ts";

test("admin default menus include every configured menu permission", () => {
  const adminKeys = new Set(getMenuKeysForUserRole("admin"));

  for (const menu of menuPermissions) {
    assert.equal(adminKeys.has(menu.key), true, `${menu.key} should be visible to admin by default`);
  }
});

test("standard users receive scoped management menus by default", () => {
  assert.deepEqual(getMenuKeysForUserRole("user"), [
    "projects",
    "attendance_devices",
    "attendance_device_issue_reports",
    "personnel_workers",
  ]);
});
