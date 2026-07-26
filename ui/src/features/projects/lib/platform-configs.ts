import type { ConstructionPlatformConfig, JsonValue } from "@/features/projects/types/construction-types";

export const NINGBO_HOUSING_PLATFORM_NAME = "市住建";
export const NINGBO_HOUSING_PLATFORM_TYPE = "ningbo_housing";
export const NINGBO_HOUSING_DEFAULT_BASE_URL = "http://183.136.157.18:7334";
export const YONGXIN_V2_PLATFORM_NAME = "甬薪";
export const YONGXIN_V2_PLATFORM_TYPE = "yongxin_v2";
export const XINLEDA_PLATFORM_NAME = "薪乐达";
export const XINLEDA_PLATFORM_TYPE = "xinleda";
export const XINLEDA_DEFAULT_BASE_URL = "https://openapi.hwxld.com";
export const BUILT_IN_PLATFORM_OPTIONS = [
  { value: NINGBO_HOUSING_PLATFORM_TYPE, label: NINGBO_HOUSING_PLATFORM_NAME },
  { value: YONGXIN_V2_PLATFORM_TYPE, label: YONGXIN_V2_PLATFORM_NAME },
  { value: XINLEDA_PLATFORM_TYPE, label: XINLEDA_PLATFORM_NAME },
] as const;

export type NingboHousingConfigForm = {
  project_id: string;
  platform_type: string;
  base_url: string;
  app_key: string;
  app_id: string;
  app_secret: string;
  project_guid: string;
  external_project_id: string;
  corp_code: string;
  approval_number: string;
  project_code: string;
  mode: "test" | "production";
  sync_project: boolean;
  sync_units: boolean;
  sync_teams: boolean;
  sync_workers: boolean;
  sync_attendance: boolean;
  attendance_backfill_from: string;
  company_safeguard_payload: string;
  is_enabled: boolean;
  remark: string;
};

export function createNingboHousingConfigForm(): NingboHousingConfigForm {
  return {
    project_id: "",
    platform_type: "",
    base_url: "",
    app_key: "",
    app_id: "",
    app_secret: "",
    project_guid: "",
    external_project_id: "",
    corp_code: "",
    approval_number: "",
    project_code: "",
    mode: "test",
    sync_project: true,
    sync_units: true,
    sync_teams: true,
    sync_workers: true,
    sync_attendance: true,
    attendance_backfill_from: "",
    company_safeguard_payload: "",
    is_enabled: true,
    remark: "",
  };
}

export function parseNingboHousingConfig(config: ConstructionPlatformConfig): NingboHousingConfigForm {
  const value = asJsonObject(config.config);
  return {
    ...createNingboHousingConfigForm(),
    project_id: config.project_id,
    platform_type: NINGBO_HOUSING_PLATFORM_TYPE,
    base_url: readString(value, "base_url", "url", "endpoint", "host") || NINGBO_HOUSING_DEFAULT_BASE_URL,
    app_key: readString(value, "app_key", "appKey", "AppKey"),
    app_secret: readString(value, "app_secret", "appSecret", "AppSecret"),
    project_guid: readString(value, "project_guid", "guid", "projectGuid", "ProjectGuid"),
    external_project_id: readString(value, "project_id", "projectId", "ProjectApartmentId"),
    corp_code: readString(value, "corp_code", "corpCode", "CorpCode", "unified_code"),
    approval_number: readString(value, "approval_number", "approvalNumber", "FgwCode"),
    project_code: "",
    mode: "test",
    sync_units: true,
    sync_teams: true,
    sync_workers: true,
    sync_attendance: true,
    attendance_backfill_from: "",
    is_enabled: config.is_enabled,
    remark: config.remark ?? "",
  };
}

export function createYongxinV2ConfigForm(): NingboHousingConfigForm {
  return {
    ...createNingboHousingConfigForm(),
    platform_type: YONGXIN_V2_PLATFORM_TYPE,
    mode: "test",
  };
}

export function createXinledaConfigForm(): NingboHousingConfigForm {
  return {
    ...createNingboHousingConfigForm(),
    platform_type: XINLEDA_PLATFORM_TYPE,
    base_url: XINLEDA_DEFAULT_BASE_URL,
    mode: "test",
  };
}

export function parseYongxinV2Config(config: ConstructionPlatformConfig): NingboHousingConfigForm {
  const value = asJsonObject(config.config);
  const modules = asJsonObject(value.modules);
  return {
    ...createYongxinV2ConfigForm(),
    project_id: config.project_id,
    base_url: readString(value, "base_url", "url", "endpoint"),
    app_key: readString(value, "app_key", "appKey", "AppKey"),
    app_secret: readString(value, "app_secret", "appSecret", "AppSecret"),
    project_code: readString(value, "project_code", "projectCode", "ProjectCode"),
    mode: readString(value, "mode") === "production" ? "production" : "test",
    sync_units: readBoolean(modules, true, "sync_units"),
    sync_teams: readBoolean(modules, true, "sync_teams"),
    sync_workers: readBoolean(modules, true, "sync_workers"),
    sync_attendance: readBoolean(modules, true, "sync_attendance"),
    attendance_backfill_from: readString(value, "attendance_backfill_from").slice(0, 10),
    is_enabled: config.is_enabled,
    remark: config.remark ?? "",
  };
}

export function buildYongxinV2Config(form: NingboHousingConfigForm): JsonValue {
  return {
    base_url: form.base_url.trim().replace(/\/+$/, ""),
    project_code: form.project_code.trim(),
    app_key: form.app_key.trim(),
    app_secret: form.app_secret.trim(),
    mode: form.mode,
    modules: {
      sync_units: form.sync_units,
      sync_teams: form.sync_teams,
      sync_workers: form.sync_workers,
      sync_attendance: form.sync_attendance,
    },
    attendance_backfill_from: form.attendance_backfill_from
      ? `${form.attendance_backfill_from}T00:00:00+08:00`
      : null,
  };
}

export function parseXinledaConfig(config: ConstructionPlatformConfig): NingboHousingConfigForm {
  const value = asJsonObject(config.config);
  const modules = asJsonObject(value.modules);
  const safeguard = value.company_safeguard_payload;
  return {
    ...createXinledaConfigForm(),
    project_id: config.project_id,
    base_url: readString(value, "base_url", "url", "endpoint") || XINLEDA_DEFAULT_BASE_URL,
    app_id: readString(value, "app_id", "appid", "appId"),
    app_secret: readString(value, "app_secret", "appsecret", "appSecret"),
    project_code: readString(value, "project_code", "projectCode"),
    mode: readString(value, "mode") === "production" ? "production" : "test",
    sync_project: readBoolean(modules, true, "sync_project"),
    sync_units: readBoolean(modules, true, "sync_units"),
    sync_teams: readBoolean(modules, true, "sync_teams"),
    sync_workers: readBoolean(modules, true, "sync_workers"),
    sync_attendance: readBoolean(modules, true, "sync_attendance"),
    attendance_backfill_from: readString(value, "attendance_backfill_from").slice(0, 10),
    company_safeguard_payload: safeguard == null ? "" : JSON.stringify(safeguard, null, 2),
    is_enabled: config.is_enabled,
    remark: config.remark ?? "",
  };
}

export function buildXinledaConfig(form: NingboHousingConfigForm): JsonValue {
  const safeguard = form.company_safeguard_payload.trim();
  return {
    base_url: form.base_url.trim().replace(/\/+$/, ""),
    app_id: form.app_id.trim(),
    app_secret: form.app_secret.trim(),
    project_code: form.project_code.trim(),
    mode: form.mode,
    modules: {
      sync_project: form.sync_project,
      sync_units: form.sync_units,
      sync_teams: form.sync_teams,
      sync_workers: form.sync_workers,
      sync_attendance: form.sync_attendance,
    },
    attendance_backfill_from: form.attendance_backfill_from
      ? `${form.attendance_backfill_from}T00:00:00+08:00`
      : null,
    company_safeguard_payload: safeguard ? JSON.parse(safeguard) as JsonValue : null,
  };
}

export function validateXinledaConfig(form: NingboHousingConfigForm): string | null {
  if (!form.project_id) return "请选择山淮施工项目";
  if (!/^https?:\/\//i.test(form.base_url.trim())) return "请填写薪乐达平台接口地址";
  if (!form.app_id.trim()) return "请填写 AppID";
  if (!/^[\x20-\x7E]+$/.test(form.app_secret.trim()) || ![16, 24, 32].includes(new TextEncoder().encode(form.app_secret.trim()).length)) {
    return "AppSecret 必须是 16、24 或 32 个 ASCII 字节，才能按接口文档进行 AES-CBC 加密";
  }
  if (!form.project_code.trim()) return "请填写薪乐达项目编码";
  if (!form.sync_project && !form.sync_units && !form.sync_teams && !form.sync_workers && !form.sync_attendance) {
    return "请至少启用一个同步模块";
  }
  if (form.company_safeguard_payload.trim()) {
    try {
      const parsed: unknown = JSON.parse(form.company_safeguard_payload);
      const valid = parsed != null && typeof parsed === "object"
        && (!Array.isArray(parsed) || parsed.every((row) => row != null && typeof row === "object" && !Array.isArray(row)));
      if (!valid) return "企业保证金数据必须是 JSON 对象或对象数组";
    } catch {
      return "企业保证金数据不是合法 JSON";
    }
  }
  return null;
}

export function validateYongxinV2Config(form: NingboHousingConfigForm): string | null {
  if (!form.project_id) return "请选择山淮筑项目";
  if (!/^https?:\/\//i.test(form.base_url.trim())) return "请填写甬薪平台接口地址";
  if (!form.project_code.trim()) return "请填写项目对接码";
  if (!form.app_key.trim()) return "请填写 AppKey";
  if (!/^[\x20-\x7E]+$/.test(form.app_secret.trim()) || ![16, 24, 32].includes(new TextEncoder().encode(form.app_secret.trim()).length)) {
    return "AppSecret 必须是 16、24 或 32 个 ASCII 字节，才能按接口文档进行 AES-CBC 加密";
  }
  if (!form.sync_units && !form.sync_teams && !form.sync_workers && !form.sync_attendance) {
    return "请至少启用一个同步模块";
  }
  return null;
}

export function buildNingboHousingConfig(form: NingboHousingConfigForm): JsonValue {
  return {
    base_url: form.base_url.trim().replace(/\/+$/, ""),
    app_key: form.app_key.trim(),
    app_secret: form.app_secret.trim(),
    project_guid: form.project_guid.trim(),
    project_id: form.external_project_id.trim(),
    corp_code: form.corp_code.trim().toUpperCase(),
    approval_number: form.approval_number.trim(),
  };
}

export function validateNingboHousingConfig(form: NingboHousingConfigForm): string | null {
  if (!form.project_id) return "请选择山淮筑项目";
  if (!form.platform_type) return "请选择对接平台";
  if (form.platform_type !== NINGBO_HOUSING_PLATFORM_TYPE) return "当前平台暂未内置配置表单";
  if (!/^https?:\/\//i.test(form.base_url.trim())) return "请填写以 http:// 或 https:// 开头的接口地址";
  if (!form.app_key.trim()) return "请填写 AppKey";
  if (!form.app_secret.trim()) return "请填写 AppSecret";
  if (!form.project_guid.trim()) return "请填写项目 GUID";
  const externalProjectId = form.external_project_id.trim();
  if (!/^\d+$/.test(externalProjectId)) return "宁波平台项目 ID 必须为数字";
  const numericProjectId = Number(externalProjectId);
  if (!Number.isSafeInteger(numericProjectId) || numericProjectId < 1 || numericProjectId > 2_147_483_647) {
    return "宁波平台项目 ID 必须在 1–2147483647 范围内";
  }
  if (!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(form.corp_code.trim().toUpperCase())) {
    return "统一社会信用代码必须是 18 位大写字母或数字";
  }
  if (!form.approval_number.trim()) return "请填写发改立项编号";
  return null;
}

export function isNingboHousingConfig(config: ConstructionPlatformConfig) {
  return config.platform_type === NINGBO_HOUSING_PLATFORM_TYPE
    || config.platform_name === NINGBO_HOUSING_PLATFORM_NAME;
}

export function isYongxinV2Config(config: ConstructionPlatformConfig) {
  return config.platform_type === YONGXIN_V2_PLATFORM_TYPE;
}

export function isXinledaConfig(config: ConstructionPlatformConfig) {
  return config.platform_type === XINLEDA_PLATFORM_TYPE;
}

export function summarizePlatformConfig(config: ConstructionPlatformConfig) {
  if (isXinledaConfig(config)) {
    const form = parseXinledaConfig(config);
    return `${form.mode === "production" ? "正式" : "测试（不发起真实请求）"} · AppID ${form.app_id || "未填写"} · 项目编码 ${form.project_code || "未填写"}`;
  }
  if (isYongxinV2Config(config)) {
    const form = parseYongxinV2Config(config);
    return `${form.mode === "production" ? "正式" : "测试（不发起真实请求）"} · 项目码 ${form.project_code || "未填写"}`;
  }
  if (!isNingboHousingConfig(config)) return "已保存自定义配置";
  const form = parseNingboHousingConfig(config);
  return form.external_project_id
    ? `已配置凭证 · 平台项目 ID ${form.external_project_id}`
    : "已配置接口凭证";
}

function readBoolean(value: Record<string, JsonValue>, fallback: boolean, ...keys: string[]) {
  for (const key of keys) {
    if (typeof value[key] === "boolean") return value[key] as boolean;
  }
  return fallback;
}

function asJsonObject(value: JsonValue): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readString(value: Record<string, JsonValue>, ...keys: string[]) {
  for (const key of keys) {
    const item = value[key];
    if (typeof item === "string" && item.trim()) return item;
    if (typeof item === "number") return String(item);
  }
  return "";
}
