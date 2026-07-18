import type { ConstructionPlatformConfig, JsonValue } from "@/features/projects/types/construction-types";

export const NINGBO_HOUSING_PLATFORM_NAME = "宁波市住建";
export const NINGBO_HOUSING_PLATFORM_TYPE = "ningbo_housing";
export const NINGBO_HOUSING_DEFAULT_BASE_URL = "http://183.136.157.18:7334";
export const BUILT_IN_PLATFORM_OPTIONS = [
  { value: NINGBO_HOUSING_PLATFORM_TYPE, label: NINGBO_HOUSING_PLATFORM_NAME },
] as const;

export type NingboHousingConfigForm = {
  project_id: string;
  platform_type: string;
  base_url: string;
  app_key: string;
  app_secret: string;
  project_guid: string;
  external_project_id: string;
  corp_code: string;
  approval_number: string;
  is_enabled: boolean;
  remark: string;
};

export function createNingboHousingConfigForm(): NingboHousingConfigForm {
  return {
    project_id: "",
    platform_type: "",
    base_url: "",
    app_key: "",
    app_secret: "",
    project_guid: "",
    external_project_id: "",
    corp_code: "",
    approval_number: "",
    is_enabled: true,
    remark: "",
  };
}

export function parseNingboHousingConfig(config: ConstructionPlatformConfig): NingboHousingConfigForm {
  const value = asJsonObject(config.config);
  return {
    project_id: config.project_id,
    platform_type: NINGBO_HOUSING_PLATFORM_TYPE,
    base_url: readString(value, "base_url", "url", "endpoint", "host") || NINGBO_HOUSING_DEFAULT_BASE_URL,
    app_key: readString(value, "app_key", "appKey", "AppKey"),
    app_secret: readString(value, "app_secret", "appSecret", "AppSecret"),
    project_guid: readString(value, "project_guid", "guid", "projectGuid", "ProjectGuid"),
    external_project_id: readString(value, "project_id", "projectId", "ProjectApartmentId"),
    corp_code: readString(value, "corp_code", "corpCode", "CorpCode", "unified_code"),
    approval_number: readString(value, "approval_number", "approvalNumber", "FgwCode"),
    is_enabled: config.is_enabled,
    remark: config.remark ?? "",
  };
}

export function buildNingboHousingConfig(form: NingboHousingConfigForm): JsonValue {
  return {
    base_url: form.base_url.trim().replace(/\/+$/, ""),
    app_key: form.app_key.trim(),
    app_secret: form.app_secret.trim(),
    project_guid: form.project_guid.trim(),
    project_id: form.external_project_id.trim(),
    corp_code: form.corp_code.trim(),
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
  if (!/^\d+$/.test(form.external_project_id.trim())) return "宁波平台项目 ID 必须为数字";
  if (!form.corp_code.trim()) return "请填写统一社会信用代码";
  if (!form.approval_number.trim()) return "请填写发改立项编号";
  return null;
}

export function isNingboHousingConfig(config: ConstructionPlatformConfig) {
  return config.platform_type === NINGBO_HOUSING_PLATFORM_TYPE
    || config.platform_name === NINGBO_HOUSING_PLATFORM_NAME;
}

export function summarizePlatformConfig(config: ConstructionPlatformConfig) {
  if (!isNingboHousingConfig(config)) return "已保存自定义配置";
  const form = parseNingboHousingConfig(config);
  return form.external_project_id
    ? `已配置凭证 · 平台项目 ID ${form.external_project_id}`
    : "已配置接口凭证";
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
