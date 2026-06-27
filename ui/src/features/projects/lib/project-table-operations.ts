export const DEFAULT_PROJECT_TABLE_PAGE_SIZE = 10;

export type CsvCell =
  | string
  | number
  | boolean
  | null
  | undefined
  | {
      value: string | number | boolean | null | undefined;
      text?: boolean;
    };

export type WageSheetInputRow = Record<string, unknown>;

export type NormalizedWageItem = {
  id_card: string;
  team_name: string;
  attendance_days: string;
  monthly_settlement: string;
  daily_settlement: string;
  wage_card_number: string;
  wage_bank: string;
  payable_amount_cents: number;
  paid_amount_cents: number;
  adjustment_amount_cents: number;
  unpaid_amount_cents: number;
  adjustment_reason: string;
};

export type EditableWageRow = {
  row_key?: string;
  worker_id: string;
  worker_name: string;
  id_card: string;
  team_name: string;
  attendance_days: string;
  monthly_settlement?: string;
  daily_settlement?: string;
  wage_card_number: string;
  wage_bank: string;
  payable_amount_yuan: string;
  paid_amount_yuan: string;
  adjustment_amount_yuan: string;
  unpaid_amount_yuan: string;
  adjustment_reason: string;
};

export type ProjectResourceListParamInput = {
  page?: number;
  pageSize?: number;
  keyword?: string | null;
  unitId?: string | null;
  teamId?: string | null;
  companyType?: number | string | null;
  salaryCalcType?: number | string | null;
  workType?: number | string | null;
  settlementType?: number | string | null;
  workStatus?: number | string | null;
  direction?: number | string | null;
  attendanceDate?: string | null;
  attendanceConfigured?: boolean | null;
};

export type ProjectListParamInput = {
  page?: number;
  pageSize?: number;
  keyword?: string | null;
  status?: number | string | null;
};

export function buildProjectListParams(input: ProjectListParamInput = {}) {
  const page = Number.isFinite(input.page) ? Math.max(1, Math.trunc(input.page ?? 1)) : 1;
  const pageSize = Number.isFinite(input.pageSize)
    ? Math.max(1, Math.trunc(input.pageSize ?? DEFAULT_PROJECT_TABLE_PAGE_SIZE))
    : DEFAULT_PROJECT_TABLE_PAGE_SIZE;
  return {
    page,
    page_size: pageSize,
    ...(input.keyword?.trim() ? { keyword: input.keyword.trim() } : {}),
    ...buildOptionalNumericParam("status", input.status),
  };
}

export function buildProjectResourceListParams(input: ProjectResourceListParamInput = {}) {
  const page = Number.isFinite(input.page) ? Math.max(1, Math.trunc(input.page ?? 1)) : 1;
  const pageSize = Number.isFinite(input.pageSize)
    ? Math.max(1, Math.trunc(input.pageSize ?? DEFAULT_PROJECT_TABLE_PAGE_SIZE))
    : DEFAULT_PROJECT_TABLE_PAGE_SIZE;
  return {
    page,
    page_size: pageSize,
    ...(input.keyword?.trim() ? { keyword: input.keyword.trim() } : {}),
    ...(input.unitId ? { unit_id: input.unitId } : {}),
    ...(input.teamId ? { team_id: input.teamId } : {}),
    ...buildOptionalNumericParam("company_type", input.companyType),
    ...buildOptionalNumericParam("salary_calc_type", input.salaryCalcType),
    ...buildOptionalNumericParam("work_type", input.workType),
    ...buildOptionalNumericParam("settlement_type", input.settlementType),
    ...buildOptionalNumericParam("work_status", input.workStatus),
    ...buildOptionalNumericParam("direction", input.direction),
    ...(input.attendanceDate ? { attendance_date: input.attendanceDate } : {}),
    ...(input.attendanceConfigured == null ? {} : { attendance_configured: input.attendanceConfigured }),
  };
}

function buildOptionalNumericParam(key: string, value: number | string | null | undefined) {
  if (value == null || value === "") return {};
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? { [key]: numberValue } : {};
}

export function getTotalPages(total: number, pageSize = DEFAULT_PROJECT_TABLE_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function getControlledTablePage(page: number, total: number, pageSize = DEFAULT_PROJECT_TABLE_PAGE_SIZE) {
  const normalized = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  if (total <= 0) return normalized;
  return Math.min(normalized, getTotalPages(total, pageSize));
}

export function clampPage(page: number, total: number, pageSize = DEFAULT_PROJECT_TABLE_PAGE_SIZE) {
  const normalized = Number.isFinite(page) ? Math.trunc(page) : 1;
  return Math.min(Math.max(normalized, 1), getTotalPages(total, pageSize));
}

export function getPageItems<T>(items: T[], page: number, pageSize = DEFAULT_PROJECT_TABLE_PAGE_SIZE) {
  const currentPage = clampPage(page, items.length, pageSize);
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function parseYuanToCents(value: unknown): number {
  if (value == null) return 0;
  const normalized =
    typeof value === "number"
      ? value.toFixed(2)
      : String(value).trim().replace(/[,\s￥¥元]/g, "");
  if (!normalized) return 0;
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d{0,2})\d*)?$/);
  if (!match) return 0;
  const [, sign, yuan, cents = ""] = match;
  const amount = Number(yuan) * 100 + Number(cents.padEnd(2, "0"));
  return sign === "-" ? -amount : amount;
}

export function formatCentsAsYuan(cents: number | null | undefined) {
  const value = cents ?? 0;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const yuan = Math.floor(abs / 100);
  const fractional = String(abs % 100).padStart(2, "0");
  return `${sign}${yuan}.${fractional}`;
}

export function summarizeWageRows(rows: EditableWageRow[]) {
  return rows.reduce(
    (summary, row) => {
      const payableAmount = parseYuanToCents(row.payable_amount_yuan);
      const paidAmount = parseYuanToCents(row.paid_amount_yuan);
      const unpaidAmount = row.unpaid_amount_yuan
        ? parseYuanToCents(row.unpaid_amount_yuan)
        : Math.max(payableAmount - paidAmount, 0);

      return {
        employee_count: summary.employee_count + 1,
        payable_amount_cents: summary.payable_amount_cents + payableAmount,
        paid_amount_cents: summary.paid_amount_cents + paidAmount,
        unpaid_amount_cents: summary.unpaid_amount_cents + unpaidAmount,
      };
    },
    {
      employee_count: 0,
      payable_amount_cents: 0,
      paid_amount_cents: 0,
      unpaid_amount_cents: 0,
    }
  );
}

export function buildWageItemPayloads(rows: EditableWageRow[]) {
  return rows.map((row) => {
    const payableAmount = parseYuanToCents(row.payable_amount_yuan);
    const paidAmount = parseYuanToCents(row.paid_amount_yuan);
    const unpaidAmount = row.unpaid_amount_yuan
      ? parseYuanToCents(row.unpaid_amount_yuan)
      : Math.max(payableAmount - paidAmount, 0);

    return {
      worker_id: row.worker_id,
      worker_name: row.worker_name,
      id_card: row.id_card,
      team_name: row.team_name,
      attendance_days: row.attendance_days,
      monthly_settlement: row.monthly_settlement ?? "",
      daily_settlement: row.daily_settlement ?? "",
      wage_card_number: row.wage_card_number,
      wage_bank: row.wage_bank,
      payable_amount_cents: payableAmount,
      paid_amount_cents: paidAmount,
      adjustment_amount_cents: parseYuanToCents(row.adjustment_amount_yuan),
      unpaid_amount_cents: unpaidAmount,
      adjustment_reason: row.adjustment_reason,
    };
  });
}

export function buildExcelCsv({
  headers,
  rows,
}: {
  headers: string[];
  rows: CsvCell[][];
}) {
  const lines = [headers.map(escapeCsvValue).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function parseWageExcelFile(file: File): Promise<NormalizedWageItem[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Excel 文件没有可读取的工作表");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<WageSheetInputRow>(sheet, { defval: "" });
  if (rows.length === 0) {
    throw new Error("Excel 文件没有可导入的数据");
  }

  const headers = Object.keys(rows[0] ?? {});
  assertWageRowsHaveRequiredColumns(headers);
  const normalizedRows = normalizeWageSheetRows(rows);
  if (normalizedRows.length === 0) {
    throw new Error("Excel 文件没有有效工资数据");
  }

  return normalizedRows;
}

export function normalizeWageSheetRows(rows: WageSheetInputRow[]): NormalizedWageItem[] {
  const normalizedRows: NormalizedWageItem[] = [];

  for (const row of rows) {
    const item = {
      id_card: getAliasedCell(row, ["身份证", "身份证号"]),
      team_name: getAliasedCell(row, ["所属班组", "班组", "班组名称"]),
      attendance_days: getAliasedCell(row, ["考勤天数（天）", "考勤天数", "实际出勤（天）", "实际出勤天"]),
      monthly_settlement: getAliasedCell(row, ["工资按月结算", "按月工资", "月工资"]),
      daily_settlement: getAliasedCell(row, ["工资按天结算", "按日工资", "日工资"]),
      wage_card_number: getAliasedCell(row, ["工资卡号", "银行卡号", "工资卡银行卡号"]),
      wage_bank: getAliasedCell(row, ["工资卡银行", "银行名称", "工资银行"]),
      payable_amount_cents: parseYuanToCents(getAliasedCell(row, ["应发工资（元）", "应发工资", "应发金额"])),
      paid_amount_cents: parseYuanToCents(getAliasedCell(row, ["实发工资（元）", "实发工资", "实发金额"])),
      adjustment_amount_cents: parseYuanToCents(getAliasedCell(row, ["调整工资（元）", "调整工资"])),
      unpaid_amount_cents: parseYuanToCents(getAliasedCell(row, ["本次未发（元）", "本次未发", "未发金额"])),
      adjustment_reason: getAliasedCell(row, ["工资调整理由", "调整理由", "备注"]),
    };

    const hasAnyValue = Object.values(item).some((value) => {
      if (typeof value === "number") return value !== 0;
      return String(value).trim() !== "";
    });
    if (!hasAnyValue) continue;

    normalizedRows.push(item);
  }

  return normalizedRows;
}

export function assertWageRowsHaveRequiredColumns(headers: string[]) {
  const normalizedHeaders = new Set(headers.map(normalizeHeader));
  const requiredGroups = [
    ["身份证", "身份证号"],
    ["应发工资（元）", "应发工资", "应发金额"],
    ["实发工资（元）", "实发工资", "实发金额"],
  ];
  const missing = requiredGroups
    .filter((group) => group.every((header) => !normalizedHeaders.has(normalizeHeader(header))))
    .map((group) => group[0]);

  if (missing.length > 0) {
    throw new Error(`Excel 缺少必填列: ${missing.join("、")}`);
  }
}

function getAliasedCell(row: WageSheetInputRow, aliases: string[]) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const match = entries.find(([key]) => normalizeHeader(key) === target);
    if (match) return stringifyCell(match[1]);
  }
  return "";
}

function normalizeHeader(value: string) {
  return value.replace(/\s/g, "").replace(/[()（）]/g, "").toLowerCase();
}

function stringifyCell(value: unknown) {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text.trim();
  }
  return String(value).trim();
}

function escapeCsvValue(cell: CsvCell) {
  const textSafe = typeof cell === "object" && cell != null && "value" in cell && cell.text === true;
  const raw = typeof cell === "object" && cell != null && "value" in cell ? cell.value : cell;
  const value = raw == null ? "" : String(raw);
  const escaped = value.replace(/"/g, "\"\"");
  const output = textSafe ? `="${escaped}"` : escaped;
  return /[",\r\n]/.test(output) ? `"${output}"` : output;
}
