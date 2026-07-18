import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNingboHousingConfig,
  createNingboHousingConfigForm,
  parseNingboHousingConfig,
  validateNingboHousingConfig,
} from "./platform-configs.ts";

test("宁波市住建表单自动生成标准配置", () => {
  const form = {
    ...createNingboHousingConfigForm(),
    project_id: "local-project",
    platform_type: "ningbo_housing",
    base_url: "http://183.136.157.18:7334/",
    app_key: " app-key ",
    app_secret: " app-secret ",
    project_guid: " guid-1 ",
    external_project_id: "1206",
    corp_code: "91330200TEST",
    approval_number: "FGW-001",
  };

  assert.equal(validateNingboHousingConfig(form), null);
  assert.deepEqual(buildNingboHousingConfig(form), {
    base_url: "http://183.136.157.18:7334",
    app_key: "app-key",
    app_secret: "app-secret",
    project_guid: "guid-1",
    project_id: "1206",
    corp_code: "91330200TEST",
    approval_number: "FGW-001",
  });
});

test("编辑时兼容旧配置字段别名", () => {
  const form = parseNingboHousingConfig({
    id: "config-1",
    project_id: "local-project",
    platform_name: "宁波市住建",
    platform_type: "real_name",
    config: {
      url: "http://example.test",
      appKey: "key",
      appSecret: "secret",
      guid: "guid",
      ProjectApartmentId: 99,
      unified_code: "corp",
      FgwCode: "approval",
    },
    is_enabled: true,
    remark: null,
    is_deleted: false,
    project_name: null,
    created_by_user_id: null,
    updated_by_user_id: null,
    created_at: "",
    updated_at: "",
    deleted_at: null,
  });

  assert.equal(form.app_key, "key");
  assert.equal(form.external_project_id, "99");
  assert.equal(form.corp_code, "corp");
  assert.equal(form.approval_number, "approval");
});

test("宁波平台项目 ID 只允许数字", () => {
  const form = {
    ...createNingboHousingConfigForm(),
    project_id: "local-project",
    platform_type: "ningbo_housing",
    base_url: "http://183.136.157.18:7334",
    app_key: "key",
    app_secret: "secret",
    project_guid: "guid",
    external_project_id: "NB-1",
    corp_code: "corp",
    approval_number: "approval",
  };

  assert.equal(validateNingboHousingConfig(form), "宁波平台项目 ID 必须为数字");
});

test("新增配置时必须先选择平台", () => {
  const form = {
    ...createNingboHousingConfigForm(),
    project_id: "local-project",
  };

  assert.equal(validateNingboHousingConfig(form), "请选择对接平台");
});
