import type { JsonValue } from "../types/construction-types";

export type PlatformHttpAttempt = {
  attempt_no: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  request: JsonValue | null;
  http_status: number | null;
  response: JsonValue | null;
  duration_ms: number | null;
  status: string;
  error: string | null;
  created_at: string | null;
};

export function platformLogBaseUrl(payload: JsonValue | null): string {
  const object = asObject(payload);
  return readString(object?.base_url);
}

export function platformLogAttempts(payload: JsonValue | null): PlatformHttpAttempt[] {
  const attempts = asObject(payload)?.attempts;
  if (!Array.isArray(attempts)) return [];

  return attempts
    .map((value, index) => normalizeAttempt(value, index + 1))
    .filter((value): value is PlatformHttpAttempt => value !== null)
    .sort((left, right) => right.attempt_no - left.attempt_no);
}

export function buildPlatformAttemptCurl(attempt: PlatformHttpAttempt, baseUrl = ""): string {
  const method = (attempt.method || "POST").toUpperCase();
  const queryRequest = method === "GET" || method === "HEAD";
  const url = queryRequest
    ? appendQuery(resolveAttemptUrl(attempt.url, baseUrl), attempt.request)
    : resolveAttemptUrl(attempt.url, baseUrl);
  const headers = { ...attempt.headers };
  if (!queryRequest && !hasHeader(headers, "content-type") && attempt.request !== null) {
    headers["Content-Type"] = "application/json";
  }

  const lines = [
    `curl --request ${shellQuote(method)}`,
    `  --url ${shellQuote(url || attempt.url || "[REQUEST_URL]")}`,
    ...Object.entries(headers).map(
      ([name, value]) => `  --header ${shellQuote(`${name}: ${value}`)}`
    ),
  ];
  if (!queryRequest && attempt.request !== null) {
    lines.push(`  --data-raw ${shellQuote(JSON.stringify(attempt.request))}`);
  }
  return lines.join(" \\\n");
}

function appendQuery(url: string, request: JsonValue | null): string {
  const object = asObject(request);
  if (!object || !url) return url;
  const separator = url.includes("?") ? "&" : "?";
  const query = Object.entries(object)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(queryValue(value))}`)
    .join("&");
  return query ? `${url}${separator}${query}` : url;
}

function queryValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function formatPlatformLogJson(value: JsonValue | null): string {
  return value === null ? "无" : JSON.stringify(value, null, 2);
}

function normalizeAttempt(value: unknown, fallbackNo: number): PlatformHttpAttempt | null {
  const object = asObject(value);
  if (!object) return null;

  return {
    attempt_no: readNumber(object.attempt_no) ?? fallbackNo,
    method: readString(object.method) || "POST",
    url: readString(object.url),
    headers: readHeaders(object.headers),
    request: asJsonValue(object.request),
    http_status: readNumber(object.http_status),
    response: asJsonValue(object.response),
    duration_ms: readNumber(object.duration_ms),
    status: readString(object.status),
    error: readNullableString(object.error),
    created_at: readNullableString(object.created_at),
  };
}

function resolveAttemptUrl(url: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(url)) return url.split("#", 1)[0] ?? url;
  const path = url.split("#", 1)[0] ?? url;
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function readHeaders(value: unknown): Record<string, string> {
  const object = asObject(value);
  if (!object) return {};
  return Object.fromEntries(
    Object.entries(object).map(([key, item]) => [key, typeof item === "string" ? item : String(item ?? "")])
  );
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asJsonValue(value: unknown): JsonValue | null {
  if (value === undefined || value === null) return null;
  return value as JsonValue;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown): string | null {
  const text = readString(value);
  return text || null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
