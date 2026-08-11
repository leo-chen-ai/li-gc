import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNingboHousingConfig,
  createNingboHousingConfigForm,
  parseNingboHousingConfig,
  validateNingboHousingConfig,
  buildYongxinV2Config,
  createYongxinV2ConfigForm,
  parseYongxinV2Config,
  validateYongxinV2Config,
  buildXinledaConfig,
  createXinledaConfigForm,
  parseXinledaConfig,
  validateXinledaConfig,
} from "./platform-configs.ts";

test("市住建表单自动生成标准配置", () => {
  const form = {
    ...createNingboHousingConfigForm(),
    project_id: "local-project",
    platform_type: "ningbo_housing",
    base_url: "http://183.136.157.18:7334/",
    app_key: " app-key ",
    app_secret: " app-secret ",
    project_guid: " guid-1 ",
    external_project_id: "1206",
    corp_code: "91330212062914115M",
    approval_number: "FGW-001",
  };

  assert.equal(validateNingboHousingConfig(form), null);
  assert.deepEqual(buildNingboHousingConfig(form), {
    base_url: "http://183.136.157.18:7334",
    app_key: "app-key",
    app_secret: "app-secret",
    project_guid: "guid-1",
    project_id: "1206",
    corp_code: "91330212062914115M",
    approval_number: "FGW-001",
  });
});

test("编辑时兼容旧配置字段别名", () => {
  const form = parseNingboHousingConfig({
    id: "config-1",
    project_id: "local-project",
    platform_name: "市住建",
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
    corp_code: "91330212062914115M",
    approval_number: "approval",
  };

  assert.equal(validateNingboHousingConfig(form), "宁波平台项目 ID 必须为数字");
});

test("宁波平台项目 ID 不能超过 Int32 范围", () => {
  const form = {
    ...createNingboHousingConfigForm(),
    project_id: "local-project",
    platform_type: "ningbo_housing",
    base_url: "http://183.136.157.18:7334",
    app_key: "key",
    app_secret: "secret",
    project_guid: "guid",
    external_project_id: "913302121440896573",
    corp_code: "91330212062914115M",
    approval_number: "approval",
  };

  assert.equal(validateNingboHousingConfig(form), "宁波平台项目 ID 必须在 1–2147483647 范围内");
});

test("宁波平台统一社会信用代码必须是 18 位", () => {
  const form = {
    ...createNingboHousingConfigForm(),
    project_id: "local-project",
    platform_type: "ningbo_housing",
    base_url: "http://183.136.157.18:7334",
    app_key: "key",
    app_secret: "secret",
    project_guid: "guid",
    external_project_id: "185157",
    corp_code: "91330212062914115M -",
    approval_number: "approval",
  };

  assert.equal(validateNingboHousingConfig(form), "统一社会信用代码必须是 18 位大写字母或数字");
});

test("新增配置时必须先选择平台", () => {
  const form = {
    ...createNingboHousingConfigForm(),
    project_id: "local-project",
  };

  assert.equal(validateNingboHousingConfig(form), "请选择对接平台");
});

test("甬薪配置只保存接口地址和三项凭证", () => {
  const form = {
    ...createYongxinV2ConfigForm(),
    project_id: "local-project",
    base_url: "https://apirs.91jtg.com/openapi/",
    project_code: "project-code",
    app_key: "app-key",
    app_secret: "1234567890abcdef",
  };

  assert.equal(validateYongxinV2Config(form), null);
  assert.deepEqual(buildYongxinV2Config(form), {
    base_url: "https://apirs.91jtg.com/openapi",
    project_code: "project-code",
    app_key: "app-key",
    app_secret: "1234567890abcdef",
  });
});

test("甬薪旧配置编辑时兼容历史字段", () => {
  const form = parseYongxinV2Config({
    id: "config-yongxin",
    project_id: "local-project",
    platform_name: "甬薪",
    platform_type: "yongxin_v2",
    config: {
      base_url: "https://example.test",
      project_code: "P1",
      app_key: "K1",
      app_secret: "1234567890abcdef",
      mode: "production",
      modules: { sync_units: false, sync_attendance: true },
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

  assert.equal(form.base_url, "https://example.test");
  assert.equal(form.sync_units, false);
  assert.equal(form.sync_teams, true);
  assert.equal(form.sync_attendance, true);
});

test("薪乐达配置使用 AppID、项目编码并支持保证金数据", () => {
  const form = {
    ...createXinledaConfigForm(),
    project_id: "local-project",
    app_id: " xinleda-app ",
    app_secret: "1234567890abcdef",
    project_code: " XLD-PROJECT-1 ",
    mode: "production" as const,
    sync_attendance: false,
    company_safeguard_payload: JSON.stringify({
      company_name: "测试企业",
      organization_code: "91330212062914115M",
      province_code: "330000",
      city_code: "330200",
      county_code: "330203",
      institution_name: "测试银行",
      assure_amt: 100,
      type: 2,
      status: 3,
      attrs_url: "https://example.test/margin.jpg",
    }),
  };

  assert.equal(validateXinledaConfig(form), null);
  assert.deepEqual(buildXinledaConfig(form), {
    base_url: "https://openapi.hwxld.com",
    app_id: "xinleda-app",
    app_secret: "1234567890abcdef",
    project_code: "XLD-PROJECT-1",
    mode: "production",
    modules: {
      sync_project: true,
      sync_units: true,
      sync_teams: true,
      sync_workers: true,
      sync_attendance: false,
    },
    attendance_backfill_from: null,
    company_safeguard_payload: {
      company_name: "测试企业",
      organization_code: "91330212062914115M",
      province_code: "330000",
      city_code: "330200",
      county_code: "330203",
      institution_name: "测试银行",
      assure_amt: 100,
      type: 2,
      status: 3,
      attrs_url: "https://example.test/margin.jpg",
    },
  });
});

test("薪乐达配置可编辑同平台多账户且兼容 appid 字段", () => {
  const form = parseXinledaConfig({
    id: "config-xinleda-2",
    project_id: "local-project",
    platform_name: "薪乐达-劳务公司B",
    platform_type: "xinleda",
    config: {
      appid: "company-b",
      appsecret: "1234567890abcdef",
      projectCode: "XLD-B",
      modules: { sync_project: false, sync_workers: true },
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

  assert.equal(form.app_id, "company-b");
  assert.equal(form.project_code, "XLD-B");
  assert.equal(form.sync_project, false);
  assert.equal(form.sync_workers, true);
});
