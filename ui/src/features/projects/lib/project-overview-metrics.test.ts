import assert from "node:assert/strict";

import {
  buildProjectOverviewAudit,
  countTodayEntries,
} from "./project-overview-metrics.ts";
import type { AttendanceRecord, ConstructionUnit, Project, Team, Worker } from "../data/mock-projects.ts";

const project = {
  name: "测试项目",
  code: "SH-001",
  workPermit: "待办理",
  address: "淮安市",
  contractor: "总包单位",
  buildUnit: "建设单位",
  manager: "张三",
  managerPhone: "13800000000",
  startDate: "2026-01-01",
  finishDate: "2026-12-31",
  investment: "100 万元",
  laborCost: "20 万元",
  area: "1000 平方米",
  realNameManager: "未填写",
  laborManager: "李四",
} as Project;

const units: ConstructionUnit[] = [];

const teams = [
  { name: "钢筋班", unitName: "总包单位", type: "钢筋工", leader: "王五", phone: "138", attendanceStart: "06:00", attendanceEnd: "18:00", salaryType: "按日" },
  { name: "木工班", unitName: "总包单位", type: "木工", leader: "赵六", phone: "139", attendanceStart: "06:00", attendanceEnd: "", salaryType: "按日" },
] as Team[];

const workers = [
  { name: "工人一", idCard: "3201", phone: "138", team: "钢筋班", unit: "总包单位", workType: "钢筋工", status: "在场" },
  { name: "工人二", idCard: "3202", phone: "139", team: "木工班", unit: "总包单位", workType: "木工", status: "未认证" },
] as Worker[];

const attendance = [
  { direction: "进场", time: "2026-06-21 07:10:00", status: "有效" },
  { direction: "进场", time: "2026-06-20 07:10:00", status: "有效" },
  { direction: "出场", time: "2026-06-21 12:10:00", status: "待补图" },
] as AttendanceRecord[];

assert.equal(countTodayEntries(attendance, new Date("2026-06-21T08:00:00+08:00")), 1);

const audit = buildProjectOverviewAudit(project, {
  units,
  teams,
  workers,
  attendance,
});

assert.equal(audit.pendingRiskCount, 4);
assert.equal(audit.workPermit.value, "待办理");
assert.equal(audit.unitMatch.value, "未匹配");
assert.equal(audit.teamAttendance.value, "1 个班组待核对");
assert.equal(audit.attendanceExceptions.value, "1 条待补图");
assert.equal(audit.completeness.teamInfo, 94);
assert.equal(audit.completeness.realNameAttendance, 58);
assert.notEqual(audit.completeness.teamInfo, 76);
assert.notEqual(audit.completeness.realNameAttendance, 92);

const emptyLedgerAudit = buildProjectOverviewAudit(
  {
    ...project,
    workPermit: "123",
  },
  {
    units: [],
    teams: [],
    workers: [],
    attendance: [],
  }
);

assert.equal(emptyLedgerAudit.workPermit.value, "已填写");
assert.equal(emptyLedgerAudit.unitMatch.value, "未匹配");
assert.equal(emptyLedgerAudit.teamAttendance.value, "无班组");
assert.equal(emptyLedgerAudit.teamAttendance.done, false);
assert.equal(emptyLedgerAudit.attendanceExceptions.value, "暂无异常");
assert.equal(emptyLedgerAudit.pendingRiskCount, 2);
