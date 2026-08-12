import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessSystemWarnings,
  getDefaultAdminPath,
  getMenuKeysForUserRole,
  menuPermissions,
} from "./rbac.ts";

test("data reporting role cannot access homepage warnings", () => {
  assert.equal(canAccessSystemWarnings("shujubaosong"), false);
  assert.equal(canAccessSystemWarnings("user"), true);
  assert.equal(canAccessSystemWarnings("hlyl01"), true);
});

test("admin default menus include every configured menu permission", () => {
  const adminKeys = new Set(getMenuKeysForUserRole("admin"));

  for (const menu of menuPermissions) {
    assert.equal(adminKeys.has(menu.key), true, `${menu.key} should be visible to admin by default`);
  }
});

test("standard users receive scoped management menus by default", () => {
  assert.deepEqual(getMenuKeysForUserRole("user"), [
    "admin_overview",
    "system_warnings",
    "projects",
    "attendance_devices",
    "attendance_device_issue_reports",
    "personnel_workers",
  ]);
});

test("custom roles receive their configured menus", () => {
  assert.deepEqual(
    getMenuKeysForUserRole("shujubaosong", [
      { code: "shujubaosong", menu_keys: ["projects", "data_reporting"] },
    ]),
    ["projects", "data_reporting"]
  );
});

test("report-only roles land directly in the data reporting center", () => {
  assert.equal(getDefaultAdminPath(["data_reporting"]), "/app/admin/data-reporting");
  assert.equal(getDefaultAdminPath([]), "/app/admin");
});
