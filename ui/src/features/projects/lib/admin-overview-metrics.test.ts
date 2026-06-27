import assert from "node:assert/strict";

import { buildAdminOverviewMetrics } from "./admin-overview-metrics.ts";
import type { ConstructionOverview } from "../types/construction-types.ts";

const overview: ConstructionOverview = {
  project_count: 2,
  unit_count: 23,
  team_count: 23,
  worker_count: 24,
  today_attendance_count: 11,
  wage_payable_amount_cents: 32970000,
  wage_paid_amount_cents: 32420000,
  wage_unpaid_amount_cents: 550000,
  wage_paid_rate_basis_points: 9834,
  attendance_7day_count: 77,
  attendance_7day_average: 11,
  platform_today_request_count: 16,
  platform_success_count: 15,
  platform_failed_count: 1,
  platform_success_rate_basis_points: 9375,
  project_status_distribution: [
    { status: 1, count: 1 },
    { status: 2, count: 1 },
  ],
  attendance_trend: [
    { date: "2026-06-20", count: 10 },
    { date: "2026-06-21", count: 9 },
    { date: "2026-06-22", count: 11 },
    { date: "2026-06-23", count: 12 },
    { date: "2026-06-24", count: 12 },
    { date: "2026-06-25", count: 11 },
    { date: "2026-06-26", count: 12 },
  ],
  platform_status_distribution: [
    { status: "success", count: 15 },
    { status: "failed", count: 1 },
  ],
};

const metrics = buildAdminOverviewMetrics(overview);

assert.equal(metrics.kpis.length, 7);
assert.equal(metrics.kpis[0]?.label, "项目");
assert.equal(metrics.kpis[6]?.value, "0.55万");
assert.deepEqual(metrics.kpis.map((item) => item.icon), [
  "projects",
  "units",
  "teams",
  "workers",
  "attendance",
  "platform",
  "wages",
]);
assert.equal(metrics.matrixRows.length, 5);
assert.deepEqual(metrics.matrixRows.map((row) => row.label), [
  "项目状态",
  "劳务规模",
  "考勤活跃",
  "工资风险",
  "平台对接",
]);
assert.equal(metrics.matrixRows.some((row) => row.label.includes("配置")), false);
assert.equal(metrics.wage.paidRate, 0.9834);
assert.equal(metrics.platform.successRate, 0.9375);
