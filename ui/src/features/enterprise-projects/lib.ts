import type {
  EnterpriseAttachment,
  EnterpriseCustomerStatus,
  EnterpriseProjectStatus,
  EnterpriseRecordKind,
} from "./types";

export function formatCents(cents: number | null | undefined) {
  const value = Number.isFinite(cents) ? Number(cents) : 0;
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value / 100);
}

export function formatPlainCents(cents: number | null | undefined) {
  const value = Number.isFinite(cents) ? Number(cents) : 0;
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    active: "进行中",
    inactive: "停用",
    paused: "暂停",
    completed: "已完结",
    archived: "归档",
    draft: "草稿",
    issued: "已开票",
    voided: "已作废",
    pending: "待收票",
    received: "已收票",
    confirmed: "已确认",
    cancelled: "已取消",
  };
  return status ? labels[status] ?? status : "未填写";
}

export function statusTone(status?: string | null) {
  if (status === "active" || status === "issued" || status === "received" || status === "confirmed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "paused" || status === "draft" || status === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "voided" || status === "cancelled" || status === "archived") {
    return "border-slate-200 bg-slate-50 text-slate-500";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function pageRange(total: number, page: number, pageSize: number) {
  if (total <= 0) {
    return { start: 0, end: 0, pageCount: 1 };
  }
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  return {
    start: (safePage - 1) * pageSize + 1,
    end: Math.min(safePage * pageSize, total),
    pageCount,
  };
}

export function buildAttachmentSummary(attachments: EnterpriseAttachment[] | null | undefined) {
  const count = attachments?.filter((item) => item.url || item.name).length ?? 0;
  if (count === 0) return "无附件";
  return `${count} 个附件`;
}

export function attachmentTextForPayload(rawText: string): EnterpriseAttachment[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((url, index) => ({
      name: `附件${index + 1}`,
      url,
    }));
}

export function attachmentTextFromRecords(attachments: EnterpriseAttachment[] | null | undefined) {
  return (attachments ?? []).map((item) => item.url).filter(Boolean).join("\n");
}

export function uploadRecordToAttachment(record: {
  original_filename?: string | null;
  public_url?: string | null;
}) {
  const url = record.public_url?.trim();
  if (!url) return null;
  return {
    name: record.original_filename?.trim() || "附件",
    url,
  } satisfies EnterpriseAttachment;
}

export function formulaRows() {
  return [
    { label: "已开票", formula: "开票金额合计，不含已作废开票" },
    { label: "已收票", formula: "收票金额合计，不含已作废收票" },
    { label: "已回款", formula: "回款金额合计，只统计已确认回款" },
    { label: "已付款", formula: "付款金额合计，只统计已确认付款" },
    { label: "现金毛利", formula: "已回款 - 已付款" },
    { label: "账面毛利", formula: "已开票 - 已收票" },
    { label: "应收余额", formula: "已开票 - 已回款" },
    { label: "应付余额", formula: "已收票 - 已付款" },
  ];
}

export function customerSummaryRows() {
  return [
    { label: "年度合同额", formula: "往来单位关联项目合同金额合计" },
    { label: "年度开票", formula: "往来单位关联项目下开票金额合计，不含已作废" },
    { label: "年度回款", formula: "往来单位关联项目下已确认回款合计" },
    { label: "年度收票", formula: "往来单位关联项目下收票金额合计，不含已作废" },
    { label: "年度付款", formula: "往来单位关联项目下已确认付款合计" },
    { label: "年度应收", formula: "年度开票 - 年度回款" },
    { label: "年度应付", formula: "年度收票 - 年度付款" },
    { label: "年度现金毛利", formula: "年度回款 - 年度付款" },
    { label: "年度账面毛利", formula: "年度开票 - 年度收票" },
    { label: "往来单位回款率", formula: "年度回款 / 年度开票" },
    { label: "往来单位付款率", formula: "年度付款 / 年度收票" },
  ];
}

export function buildCustomerOptionLabel(customer: {
  name: string;
  customer_code?: string | null;
  contact_name?: string | null;
}) {
  return [customer.customer_code, customer.name, customer.contact_name].filter(Boolean).join(" · ");
}

export function buildEnterpriseSelectLabel(
  selected: { id: string; label: string } | undefined,
  value: string,
  fallbackLabel?: string | null
) {
  if (selected?.label) return selected.label;
  if (fallbackLabel?.trim()) return fallbackLabel.trim();
  return value || "请选择";
}

export function buildEnterpriseProjectSearchFilters({
  keyword,
  customerId,
  pageSize = 20,
}: {
  keyword?: string;
  customerId?: string;
  pageSize?: number;
}) {
  const normalizedKeyword = keyword?.trim();
  return {
    page: 1,
    page_size: pageSize,
    keyword: normalizedKeyword || undefined,
    customer_id: customerId || undefined,
  };
}

export function buildEnterpriseCustomerFilters({
  page,
  pageSize,
  keyword,
  status,
  dateFrom,
  dateTo,
}: {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const normalizedKeyword = keyword?.trim();
  return {
    page,
    page_size: pageSize,
    keyword: normalizedKeyword || undefined,
    status: status && status !== "all" ? status : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };
}

export function buildEnterpriseRecordFilters({
  page,
  pageSize,
  keyword,
  status,
  dateFrom,
  dateTo,
}: {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const normalizedKeyword = keyword?.trim();
  return {
    page,
    page_size: pageSize,
    keyword: normalizedKeyword || undefined,
    status: status && status !== "all" ? status : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };
}

export function extractEnterpriseCustomerIdFromPath(pathname: string) {
  const match = pathname.match(/^\/app\/admin\/enterprise-customers\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function extractEnterpriseProjectIdFromPath(pathname: string) {
  const match = pathname.match(/^\/app\/admin\/enterprise-projects\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function buildInvoiceLinkOptions<
  T extends {
    id: string;
    invoice_no: string | null;
    amount_cents: number;
    customer_name?: string | null;
    supplier_name?: string | null;
    invoice_date: string;
  },
>(records: T[]) {
  return records.map((record) => {
    const counterparty = record.customer_name ?? record.supplier_name ?? "未填写对象";
    const identity = record.invoice_no || record.invoice_date;
    return {
      value: record.id,
      label: `${identity} · ${counterparty || "未填写对象"} · ${formatPlainCents(record.amount_cents)}`,
    };
  });
}

export const projectStatusOptions: Array<{ value: EnterpriseProjectStatus | "all"; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "active", label: "进行中" },
  { value: "paused", label: "暂停" },
  { value: "completed", label: "已完结" },
  { value: "archived", label: "归档" },
];

export const customerStatusOptions: Array<{ value: EnterpriseCustomerStatus | "all"; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "active", label: "正常" },
  { value: "inactive", label: "停用" },
  { value: "archived", label: "归档" },
];

export const recordModuleLabels: Record<EnterpriseRecordKind, string> = {
  "issued-invoices": "开票",
  "received-invoices": "收票",
  collections: "回款",
  payments: "付款",
};
