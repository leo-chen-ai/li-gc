import type { JsonValue } from "@/features/projects/types/construction-types";

export type WorkHourSegmentForm = {
  id: string;
  startHour: string;
  endHour: string;
  rate: string;
};

export type WorkHourRuleForm = {
  segments: WorkHourSegmentForm[];
};

type JsonRecord = { [key: string]: JsonValue };
type UnknownRecord = Record<string, unknown>;

const MAX_WORK_HOURS = 24;

export function createDefaultWorkHourRuleForm(): WorkHourRuleForm {
  return {
    segments: [
      { id: "segment-1", startHour: "0", endHour: "8", rate: "1" },
      { id: "segment-2", startHour: "8", endHour: "15", rate: "1.5" },
    ],
  };
}

export function buildWorkHourRules(form: WorkHourRuleForm): JsonRecord {
  return {
    algorithm: "tiered_duration",
    maxHours: MAX_WORK_HOURS,
    segments: normalizeSegments(form.segments).map((segment) => ({
      fromHours: segment.startHour,
      toHours: segment.endHour,
      rate: segment.rate,
    })),
  };
}

export function parseWorkHourRules(value: unknown): WorkHourRuleForm {
  const defaults = createDefaultWorkHourRuleForm();
  if (!isRecord(value)) return defaults;

  const rawSegments = Array.isArray(value.segments)
    ? value.segments
    : deriveSegmentsFromLegacyRules(value);
  const segments = normalizeSegments(
    rawSegments.map((segment, index) => parseSegment(segment, index))
  ).map((segment, index) => ({
    id: `segment-${index + 1}`,
    startHour: stringifyCleanNumber(segment.startHour),
    endHour: stringifyCleanNumber(segment.endHour),
    rate: stringifyCleanNumber(segment.rate),
  }));

  return {
    segments: segments.length > 0 ? segments : defaults.segments,
  };
}

export function summarizeWorkHourRules(value: unknown) {
  const form = parseWorkHourRules(value);
  const parts = form.segments.slice(0, 4).map((segment) => (
    `${segment.startHour}-${segment.endHour}小时 x${segment.rate}`
  ));
  if (form.segments.length > 4) {
    parts.push(`另${form.segments.length - 4}段`);
  }
  parts.push(`上限${MAX_WORK_HOURS}小时`);
  return parts.join(" · ");
}

function parseSegment(value: unknown, index: number): WorkHourSegmentForm {
  const segment = isRecord(value) ? value : {};
  return {
    id: stringifyText(segment.id, `segment-${index + 1}`),
    startHour: stringifyUnknownNumber(segment.fromHours ?? segment.startHour ?? segment.start),
    endHour: stringifyUnknownNumber(segment.toHours ?? segment.endHour ?? segment.end),
    rate: stringifyUnknownNumber(segment.rate ?? segment.multiplier),
  };
}

function normalizeSegments(segments: WorkHourSegmentForm[]) {
  const normalized = segments
    .map((segment) => {
      const startHour = clampHour(toNumber(segment.startHour, 0));
      const endHour = clampHour(toNumber(segment.endHour, startHour));
      const rate = Math.max(0, toNumber(segment.rate, 1));
      return { startHour, endHour, rate };
    })
    .filter((segment) => segment.endHour > segment.startHour)
    .sort((left, right) => left.startHour - right.startHour || left.endHour - right.endHour);

  return normalized.length > 0
    ? normalized
    : createDefaultWorkHourRuleForm().segments.map((segment) => ({
      startHour: Number(segment.startHour),
      endHour: Number(segment.endHour),
      rate: Number(segment.rate),
    }));
}

function deriveSegmentsFromLegacyRules(value: UnknownRecord): UnknownRecord[] {
  const overtime = isRecord(value.overtime) ? value.overtime : {};
  const nightShift = isRecord(value.nightShift) ? value.nightShift : {};
  const baseEnd = clampHour(toNumber(
    stringifyUnknownNumber(overtime.afterHours ?? value.overtimeAfterHours ?? value.standardHoursPerDay ?? value.dayHours),
    8
  ));
  const overtimeEnabled = toBoolean(overtime.enabled, value.overtimeAfterHours != null);
  const overtimeRate = toNumber(stringifyUnknownNumber(overtime.rate ?? value.overtimeRate ?? nightShift.ratio), 1.5);
  if (overtimeEnabled && baseEnd > 0 && baseEnd < MAX_WORK_HOURS) {
    return [
      { fromHours: 0, toHours: baseEnd, rate: 1 },
      { fromHours: baseEnd, toHours: MAX_WORK_HOURS, rate: overtimeRate },
    ];
  }
  return [{ fromHours: 0, toHours: baseEnd || 8, rate: 1 }];
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampHour(value: number) {
  return Math.min(MAX_WORK_HOURS, Math.max(0, value));
}

function stringifyUnknownNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return stringifyCleanNumber(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return value;
  return "";
}

function stringifyCleanNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function stringifyText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function toBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}
