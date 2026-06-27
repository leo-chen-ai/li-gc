import type { AttendanceRecord } from "../data/mock-projects";

export type AttendanceCalendarCellRecord = {
  id: string;
  direction: AttendanceRecord["direction"];
  time: string;
};

export type AttendanceCalendarCell = {
  day: number;
  firstInTime: string;
  workingHours: number;
  workPoint: number;
  workHourAlgorithm: string;
  records: AttendanceCalendarCellRecord[];
};

export type AttendanceCalendarRow = {
  worker: string;
  team: string;
  monthlyWorkingHours: number;
  monthlyWorkPoint: number;
  days: Record<number, AttendanceCalendarCell>;
};

export type AttendanceCalendarSummaryDay = {
  day: number;
  first_in_record_id?: string | null;
  first_in_time?: string | null;
  last_out_record_id?: string | null;
  last_out_time?: string | null;
  working_hours?: number | null;
  work_point?: number | null;
  work_hour_algorithm?: string | null;
};

export type AttendanceCalendarSummaryRow = {
  worker_id: string;
  worker_name?: string | null;
  team_name?: string | null;
  total_working_hours?: number | null;
  total_work_point?: number | null;
  days: AttendanceCalendarSummaryDay[];
};

type ParsedAttendanceTime = {
  date: Date;
  day: number;
  time: string;
};

export function getAttendanceMonthDays(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex) return 31;
  return new Date(year, monthIndex, 0).getDate();
}

export function buildAttendanceCalendarRows(records: AttendanceRecord[], month: string): AttendanceCalendarRow[] {
  const rows = new Map<string, AttendanceCalendarRow>();
  const monthPrefix = `${month}-`;

  for (const record of records) {
    const parsed = parseAttendanceTime(record.time);
    if (!parsed || !toLocalDateKey(parsed.date).startsWith(monthPrefix)) continue;

    const key = `${record.worker}::${record.team}`;
    const row =
      rows.get(key) ??
      {
        worker: record.worker,
        team: record.team,
        monthlyWorkingHours: 0,
        monthlyWorkPoint: 0,
        days: {},
      };
    const cell =
      row.days[parsed.day] ??
      {
        day: parsed.day,
        firstInTime: "",
        workingHours: 0,
        workPoint: 0,
        workHourAlgorithm: "frontend-summary",
        records: [],
      };

    upsertDailySummaryRecord(cell, {
      id: record.id,
      direction: record.direction,
      time: parsed.time,
    });
    cell.records.sort((left, right) => left.time.localeCompare(right.time));
    cell.firstInTime = cell.records.find((item) => item.direction === "进场")?.time ?? "";
    row.days[parsed.day] = cell;
    rows.set(key, row);
  }

  return Array.from(rows.values()).sort((left, right) => left.worker.localeCompare(right.worker, "zh-Hans-CN"));
}

export function buildAttendanceCalendarRowsFromSummary(summaryRows: AttendanceCalendarSummaryRow[]): AttendanceCalendarRow[] {
  return summaryRows
    .map((summary) => {
      const days: Record<number, AttendanceCalendarCell> = {};

      for (const day of summary.days ?? []) {
        const records: AttendanceCalendarCellRecord[] = [];
        if (day.first_in_time) {
          records.push({
            id: day.first_in_record_id ?? `${summary.worker_id}-${day.day}-in`,
            direction: "进场",
            time: day.first_in_time,
          });
        }
        if (day.last_out_time) {
          records.push({
            id: day.last_out_record_id ?? `${summary.worker_id}-${day.day}-out`,
            direction: "出场",
            time: day.last_out_time,
          });
        }

        days[day.day] = {
          day: day.day,
          firstInTime: day.first_in_time ?? "",
          workingHours: toFiniteNumber(day.working_hours),
          workPoint: toFiniteNumber(day.work_point),
          workHourAlgorithm: day.work_hour_algorithm || "",
          records,
        };
      }

      return {
        worker: summary.worker_name || "未匹配工人",
        team: summary.team_name || "未匹配班组",
        monthlyWorkingHours: toFiniteNumber(summary.total_working_hours) || sumCalendarDays(days, "workingHours"),
        monthlyWorkPoint: toFiniteNumber(summary.total_work_point) || sumCalendarDays(days, "workPoint"),
        days,
      };
    })
    .sort((left, right) => left.worker.localeCompare(right.worker, "zh-Hans-CN"));
}

function sumCalendarDays(days: Record<number, AttendanceCalendarCell>, key: "workingHours" | "workPoint") {
  const total = Object.values(days).reduce((sum, day) => sum + day[key], 0);
  return Number(total.toFixed(2));
}

function toFiniteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function upsertDailySummaryRecord(cell: AttendanceCalendarCell, record: AttendanceCalendarCellRecord) {
  const currentIndex = cell.records.findIndex((item) => item.direction === record.direction);
  if (currentIndex === -1) {
    cell.records.push(record);
    return;
  }

  const current = cell.records[currentIndex];
  const shouldReplace =
    record.direction === "进场"
      ? record.time.localeCompare(current.time) < 0
      : record.time.localeCompare(current.time) > 0;

  if (shouldReplace) {
    cell.records[currentIndex] = record;
  }
}

function parseAttendanceTime(value: string): ParsedAttendanceTime | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const date = new Date(normalized.includes("T") ? normalized : normalized.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return null;

  return {
    date,
    day: date.getDate(),
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
}

function toLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
