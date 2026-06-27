import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExcelCsv,
  buildProjectListParams,
  buildProjectResourceListParams,
  buildWageItemPayloads,
  summarizeWageRows,
  getControlledTablePage,
  getPageItems,
  getTotalPages,
  normalizeWageSheetRows,
  parseYuanToCents,
} from "./project-table-operations.ts";

test("paginates tables at ten rows by default", () => {
  const rows = Array.from({ length: 23 }, (_, index) => index + 1);

  assert.equal(getTotalPages(rows.length), 3);
  assert.deepEqual(getPageItems(rows, 1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(getPageItems(rows, 3), [21, 22, 23]);
  assert.deepEqual(getPageItems(rows, 99), [21, 22, 23]);
});

test("keeps controlled page while paginated data is loading", () => {
  assert.equal(getControlledTablePage(10, 0), 10);
  assert.equal(getControlledTablePage(10, 360), 10);
  assert.equal(getControlledTablePage(99, 360), 36);
});

test("builds backend pagination params for project resource tables", () => {
  assert.deepEqual(buildProjectResourceListParams({ page: 0 }), {
    page: 1,
    page_size: 10,
  });

  assert.deepEqual(
    buildProjectResourceListParams({
      page: 3,
      pageSize: 20,
      keyword: "张三",
      unitId: "unit-1",
      teamId: "team-1",
      workType: 3,
      workStatus: 2,
      direction: 1,
      attendanceDate: "2026-06-23",
      attendanceConfigured: true,
    }),
    {
      page: 3,
      page_size: 20,
      keyword: "张三",
      unit_id: "unit-1",
      team_id: "team-1",
      work_type: 3,
      work_status: 2,
      direction: 1,
      attendance_date: "2026-06-23",
      attendance_configured: true,
    }
  );
});

test("builds backend pagination params for project list", () => {
  assert.deepEqual(buildProjectListParams({ page: 0 }), {
    page: 1,
    page_size: 10,
  });

  assert.deepEqual(
    buildProjectListParams({
      page: 2,
      pageSize: 20,
      keyword: " 项目A ",
      status: 1,
    }),
    {
      page: 2,
      page_size: 20,
      keyword: "项目A",
      status: 1,
    }
  );
});

test("builds Excel-openable csv with text-safe identifiers", () => {
  const csv = buildExcelCsv({
    headers: ["姓名", "身份证", "银行卡号", "金额"],
    rows: [
      ["张三", { value: "332603197912123456", text: true }, { value: "6200000000000000001", text: true }, "5000"],
    ],
  });

  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /="332603197912123456"/);
  assert.match(csv, /="6200000000000000001"/);
});

test("parses yuan amounts to cents without floating point drift", () => {
  assert.equal(parseYuanToCents("5000"), 500000);
  assert.equal(parseYuanToCents("12.30"), 1230);
  assert.equal(parseYuanToCents(0.1), 10);
  assert.equal(parseYuanToCents(""), 0);
});

test("normalizes supplied wage sheet rows and skips blank rows", () => {
  const rows = normalizeWageSheetRows([
    {
      身份证: "3326031979******",
      所属班组: "**班组",
      "考勤天数（天）": "22",
      工资卡号: "62***********",
      工资卡银行: "上海银行",
      "应发工资（元）": "5000",
      "实发工资（元）": "5000",
      "本次未发（元）": "",
    },
    {},
  ]);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id_card: "3326031979******",
    team_name: "**班组",
    attendance_days: "22",
    monthly_settlement: "",
    daily_settlement: "",
    wage_card_number: "62***********",
    wage_bank: "上海银行",
    payable_amount_cents: 500000,
    paid_amount_cents: 500000,
    adjustment_amount_cents: 0,
    unpaid_amount_cents: 0,
    adjustment_reason: "",
  });
});

test("summarizes selected wage detail rows and builds backend payload rows", () => {
  const rows = [
    {
      worker_id: "worker-1",
      worker_name: "张三",
      id_card: "332603197912123456",
      team_name: "木工班组",
      payable_amount_yuan: "5000",
      paid_amount_yuan: "4500",
      adjustment_amount_yuan: "0",
      unpaid_amount_yuan: "",
      attendance_days: "22",
      wage_card_number: "6200000000000000001",
      wage_bank: "上海银行",
      adjustment_reason: "",
    },
    {
      worker_id: "worker-2",
      worker_name: "李四",
      id_card: "332603198001012222",
      team_name: "钢筋班组",
      payable_amount_yuan: "3000",
      paid_amount_yuan: "3000",
      adjustment_amount_yuan: "0",
      unpaid_amount_yuan: "0",
      attendance_days: "",
      wage_card_number: "",
      wage_bank: "",
      adjustment_reason: "",
    },
  ];

  assert.deepEqual(summarizeWageRows(rows), {
    employee_count: 2,
    payable_amount_cents: 800000,
    paid_amount_cents: 750000,
    unpaid_amount_cents: 50000,
  });
  assert.deepEqual(buildWageItemPayloads(rows), [
    {
      worker_id: "worker-1",
      worker_name: "张三",
      id_card: "332603197912123456",
      team_name: "木工班组",
      attendance_days: "22",
      monthly_settlement: "",
      daily_settlement: "",
      wage_card_number: "6200000000000000001",
      wage_bank: "上海银行",
      payable_amount_cents: 500000,
      paid_amount_cents: 450000,
      adjustment_amount_cents: 0,
      unpaid_amount_cents: 50000,
      adjustment_reason: "",
    },
    {
      worker_id: "worker-2",
      worker_name: "李四",
      id_card: "332603198001012222",
      team_name: "钢筋班组",
      attendance_days: "",
      monthly_settlement: "",
      daily_settlement: "",
      wage_card_number: "",
      wage_bank: "",
      payable_amount_cents: 300000,
      paid_amount_cents: 300000,
      adjustment_amount_cents: 0,
      unpaid_amount_cents: 0,
      adjustment_reason: "",
    },
  ]);
});
