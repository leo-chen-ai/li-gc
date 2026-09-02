import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessSystemWarnings,
  getDefaultAdminPath,
  getMenuPermissionForPath,
  getMenuKeysForUserRole,
  isAdminWorkspacePath,
  menuPermissions,
  shouldLoadRolePermissions,
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

test("every non-admin account loads its assigned role permissions", () => {
  assert.equal(shouldLoadRolePermissions("user"), true);
  assert.equal(shouldLoadRolePermissions("project_manager"), true);
  assert.equal(shouldLoadRolePermissions("admin"), false);
  assert.equal(shouldLoadRolePermissions(undefined), false);
});

test("all configured admin pages resolve to their menu permission", () => {
  for (const menu of menuPermissions) {
    assert.equal(getMenuPermissionForPath(menu.path)?.key, menu.key);
  }

  assert.equal(getMenuPermissionForPath("/app/admin/quality-safety/detail")?.key, "quality_safety");
  assert.equal(getMenuPermissionForPath("/app/admin/unknown"), undefined);
});

test("report-only roles land directly in the data reporting center", () => {
  assert.equal(getDefaultAdminPath(["data_reporting"]), "/app/admin/data-reporting");
  assert.equal(getDefaultAdminPath([]), "/app/admin");
});

test("admin menu guard does not intercept the standalone data screen", () => {
  assert.equal(isAdminWorkspacePath("/app/admin"), true);
  assert.equal(isAdminWorkspacePath("/app/admin/projects"), true);
  assert.equal(isAdminWorkspacePath("/app/data-screen"), false);
  assert.equal(isAdminWorkspacePath("/app/data-screen/project/project-id"), false);
});
