import assert from "node:assert/strict";
import test from "node:test";

import {
  attendanceAlertTabs,
  attendanceAlertCategoryLabel,
  attendanceAlertStatusLabel,
  formatAttendanceAlertRunSummary,
} from "./lib.ts";

test("defines attendance alert tabs in page order", () => {
  assert.deepEqual(attendanceAlertTabs, [
    { key: "configs", label: "预警配置" },
    { key: "logs", label: "记录日志" },
  ]);
});

test("maps attendance alert categories to operational labels", () => {
  assert.equal(attendanceAlertCategoryLabel("manager"), "管理人员");
  assert.equal(attendanceAlertCategoryLabel("worker"), "民工");
  assert.equal(attendanceAlertCategoryLabel("supervisor"), "监理");
});

test("maps attendance alert status to log label", () => {
  assert.equal(attendanceAlertStatusLabel("logged"), "已记录");
  assert.equal(attendanceAlertStatusLabel("failed"), "失败");
  assert.equal(attendanceAlertStatusLabel("unknown"), "unknown");
});

test("formats manual run summary for toast copy", () => {
  assert.equal(
    formatAttendanceAlertRunSummary({
      alert_date: "2026-06-30",
      scanned_configs: 1,
      written_logs: 2,
    }),
    "2026-06-30 已检查 1 个项目配置，记录 2 条预警日志"
  );
});
