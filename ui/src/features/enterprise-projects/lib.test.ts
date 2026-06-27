import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAttachmentSummary,
  buildCustomerOptionLabel,
  buildEnterpriseCustomerFilters,
  buildEnterpriseSelectLabel,
  buildEnterpriseProjectSearchFilters,
  buildEnterpriseRecordFilters,
  customerSummaryRows,
  buildInvoiceLinkOptions,
  formatPlainCents,
  formulaRows,
  pageRange,
  statusLabel,
  extractEnterpriseCustomerIdFromPath,
  extractEnterpriseProjectIdFromPath,
  uploadRecordToAttachment,
} from "./lib.ts";

test("formats cents as yuan with two decimals", () => {
  assert.equal(formatPlainCents(1234567), "12,345.67");
  assert.equal(formatPlainCents(undefined), "0.00");
});

test("maps known statuses to Chinese labels", () => {
  assert.equal(statusLabel("active"), "进行中");
  assert.equal(statusLabel("confirmed"), "已确认");
  assert.equal(statusLabel("unknown"), "unknown");
});

test("calculates table range from backend pagination", () => {
  assert.deepEqual(pageRange(23, 2, 10), { start: 11, end: 20, pageCount: 3 });
  assert.deepEqual(pageRange(0, 1, 10), { start: 0, end: 0, pageCount: 1 });
});

test("summarizes invoice attachments without leaking long file names into table cells", () => {
  assert.equal(buildAttachmentSummary([]), "无附件");
  assert.equal(
    buildAttachmentSummary([
      { name: "华东大区六月工程进度款发票扫描件.pdf", url: "https://example.test/a.pdf" },
      { name: "银行回单.png", url: "https://example.test/b.png" },
    ]),
    "2 个附件"
  );
});

test("builds compact invoice link options from project invoice records", () => {
  assert.deepEqual(
    buildInvoiceLinkOptions([
      {
        id: "invoice-1",
        invoice_no: "INV-001",
        amount_cents: 1234500,
        customer_name: "湖州城投",
        invoice_date: "2026-06-12",
      },
      {
        id: "invoice-2",
        invoice_no: null,
        amount_cents: 500000,
        customer_name: null,
        invoice_date: "2026-06-13",
      },
    ]),
    [
      { value: "invoice-1", label: "INV-001 · 湖州城投 · 12,345.00" },
      { value: "invoice-2", label: "2026-06-13 · 未填写对象 · 5,000.00" },
    ]
  );
});

test("maps uploaded files to enterprise attachments", () => {
  assert.deepEqual(
    uploadRecordToAttachment({
      original_filename: "开票附件.pdf",
      public_url: "https://oss.example.test/invoice.pdf",
    }),
    {
      name: "开票附件.pdf",
      url: "https://oss.example.test/invoice.pdf",
    }
  );
  assert.equal(uploadRecordToAttachment({ public_url: "" }), null);
});

test("lists project profit formulas for the summary board", () => {
  const rows = formulaRows();
  assert.ok(rows.some((row) => row.label === "现金毛利" && row.formula === "已回款 - 已付款"));
  assert.ok(rows.some((row) => row.label === "账面毛利" && row.formula === "已开票 - 已收票"));
});

test("builds customer option labels for project forms", () => {
  assert.equal(
    buildCustomerOptionLabel({
      name: "南京江北城投集团",
      customer_code: "C-001",
      contact_name: "王总",
    }),
    "C-001 · 南京江北城投集团 · 王总"
  );
  assert.equal(buildCustomerOptionLabel({ name: "湖州城建集团" }), "湖州城建集团");
});

test("builds stable labels for searchable enterprise selectors", () => {
  assert.equal(
    buildEnterpriseSelectLabel(
      {
        id: "customer-1",
        label: "C-001 · 南京江北城投集团 · 王总",
      },
      "customer-1",
      "南京江北城投集团"
    ),
    "C-001 · 南京江北城投集团 · 王总"
  );
  assert.equal(
    buildEnterpriseSelectLabel(undefined, "customer-1", "南京江北城投集团"),
    "南京江北城投集团"
  );
  assert.equal(buildEnterpriseSelectLabel(undefined, "customer-1", ""), "customer-1");
  assert.equal(buildEnterpriseSelectLabel(undefined, "", ""), "请选择");
});

test("builds backend filters for customer management search", () => {
  assert.deepEqual(
    buildEnterpriseCustomerFilters({
      page: 3,
      pageSize: 10,
      keyword: "  城投  ",
      status: "active",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
    }),
    {
      page: 3,
      page_size: 10,
      keyword: "城投",
      status: "active",
      date_from: "2026-06-01",
      date_to: "2026-06-30",
    }
  );
  assert.deepEqual(
    buildEnterpriseCustomerFilters({
      page: 1,
      pageSize: 10,
      keyword: "",
      status: "all",
      dateFrom: "",
      dateTo: "",
    }),
    {
      page: 1,
      page_size: 10,
      keyword: undefined,
      status: undefined,
      date_from: undefined,
      date_to: undefined,
    }
  );
});

test("builds backend filters for project search under a customer", () => {
  assert.deepEqual(buildEnterpriseProjectSearchFilters({ keyword: "  江北  ", customerId: "customer-1" }), {
    page: 1,
    page_size: 20,
    keyword: "江北",
    customer_id: "customer-1",
  });
  assert.deepEqual(buildEnterpriseProjectSearchFilters({ keyword: "", customerId: "" }), {
    page: 1,
    page_size: 20,
    keyword: undefined,
    customer_id: undefined,
  });
});

test("builds backend filters for financial records with date range", () => {
  assert.deepEqual(
    buildEnterpriseRecordFilters({
      page: 2,
      pageSize: 10,
      keyword: "  付款方  ",
      status: "confirmed",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
    }),
    {
      page: 2,
      page_size: 10,
      keyword: "付款方",
      status: "confirmed",
      date_from: "2026-06-01",
      date_to: "2026-06-30",
    }
  );
  assert.deepEqual(
    buildEnterpriseRecordFilters({
      page: 1,
      pageSize: 10,
      keyword: "",
      status: "all",
      dateFrom: "",
      dateTo: "",
    }),
    {
      page: 1,
      page_size: 10,
      keyword: undefined,
      status: undefined,
      date_from: undefined,
      date_to: undefined,
    }
  );
});

test("extracts enterprise customer detail id from admin paths", () => {
  assert.equal(
    extractEnterpriseCustomerIdFromPath("/app/admin/enterprise-customers/customer-1"),
    "customer-1"
  );
  assert.equal(extractEnterpriseCustomerIdFromPath("/app/admin/enterprise-customers"), null);
  assert.equal(extractEnterpriseCustomerIdFromPath("/app/admin/enterprise-customers/"), null);
  assert.equal(extractEnterpriseCustomerIdFromPath("/app/admin/enterprise-customers/customer-1/edit"), null);
});

test("extracts enterprise project detail id from admin paths", () => {
  assert.equal(
    extractEnterpriseProjectIdFromPath("/app/admin/enterprise-projects/project-1"),
    "project-1"
  );
  assert.equal(extractEnterpriseProjectIdFromPath("/app/admin/enterprise-projects"), null);
  assert.equal(extractEnterpriseProjectIdFromPath("/app/admin/enterprise-projects/project-1/edit"), null);
});

test("lists customer centered yearly summary formulas", () => {
  const rows = customerSummaryRows();
  assert.ok(rows.some((row) => row.label === "年度回款" && row.formula === "往来单位关联项目下已确认回款合计"));
  assert.ok(rows.some((row) => row.label === "年度现金毛利" && row.formula === "年度回款 - 年度付款"));
  assert.ok(rows.some((row) => row.label === "往来单位回款率" && row.formula === "年度回款 / 年度开票"));
});
