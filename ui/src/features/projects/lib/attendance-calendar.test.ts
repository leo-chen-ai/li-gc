import assert from "node:assert/strict";
import test from "node:test";

import { buildAttendanceCalendarRows, buildAttendanceCalendarRowsFromSummary, getAttendanceMonthDays } from "./attendance-calendar.ts";
import type { AttendanceRecord } from "../data/mock-projects.ts";

const records: AttendanceRecord[] = [
  {
    id: "a-1",
    projectId: "p-1",
    worker: "张三",
    team: "钢筋班",
    direction: "出场",
    time: "2026-06-01T18:05:00+08:00",
    device: "南门",
    status: "有效",
  },
  {
    id: "a-1-early-out",
    projectId: "p-1",
    worker: "张三",
    team: "钢筋班",
    direction: "出场",
    time: "2026-06-01T17:05:00+08:00",
    device: "南门",
    status: "有效",
  },
  {
    id: "a-2",
    projectId: "p-1",
    worker: "张三",
    team: "钢筋班",
    direction: "进场",
    time: "2026-06-01T07:31:00+08:00",
    device: "南门",
    status: "有效",
  },
  {
    id: "a-2-late-in",
    projectId: "p-1",
    worker: "张三",
    team: "钢筋班",
    direction: "进场",
    time: "2026-06-01T08:31:00+08:00",
    device: "南门",
    status: "有效",
  },
  {
    id: "a-3",
    projectId: "p-1",
    worker: "李四",
    team: "木工班",
    direction: "进场",
    time: "2026-06-02 08:00:00",
    device: "东门",
    status: "有效",
  },
];

test("builds worker rows with one earliest entry and one latest exit per day", () => {
  const rows = buildAttendanceCalendarRows(records, "2026-06");
  const zhangSan = rows.find((row) => row.worker === "张三");
  const liSi = rows.find((row) => row.worker === "李四");

  assert.equal(rows.length, 2);
  assert.ok(zhangSan);
  assert.equal(zhangSan.days[1].firstInTime, "07:31");
  assert.deepEqual(
    zhangSan.days[1].records.map((record) => `${record.direction} ${record.time}`),
    ["进场 07:31", "出场 18:05"]
  );
  assert.ok(liSi);
  assert.equal(liSi.days[2].firstInTime, "08:00");
});

test("returns the exact day count for the selected attendance month", () => {
  assert.equal(getAttendanceMonthDays("2026-02"), 28);
  assert.equal(getAttendanceMonthDays("2026-03"), 31);
});

test("builds calendar rows from backend monthly summary", () => {
  const rows = buildAttendanceCalendarRowsFromSummary([
    {
      worker_id: "worker-1",
      worker_name: "张三",
      team_name: "钢筋班",
      total_working_hours: 22.25,
      total_work_point: 3.5,
      days: [
        {
          day: 1,
          first_in_record_id: "in-1",
          first_in_time: "07:31",
          last_out_record_id: "out-1",
          last_out_time: "18:05",
          working_hours: 10.57,
          work_point: 1.5,
          work_hour_algorithm: "tiered_duration",
        },
      ],
    },
  ]);

  assert.equal(rows.length, 1);
  assert.deepEqual(
    rows[0].days[1].records.map((record) => `${record.direction} ${record.time}`),
    ["进场 07:31", "出场 18:05"]
  );
  assert.equal(rows[0].days[1].workingHours, 10.57);
  assert.equal(rows[0].days[1].workPoint, 1.5);
  assert.equal(rows[0].days[1].workHourAlgorithm, "tiered_duration");
  assert.equal(rows[0].monthlyWorkingHours, 22.25);
  assert.equal(rows[0].monthlyWorkPoint, 3.5);
});
