import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  useCreateEnterpriseRecordMutation,
  useDeleteEnterpriseRecordMutation,
  useEnterpriseProjectQuery,
  useEnterpriseProjectSummaryQuery,
  useEnterpriseRecordsQuery,
  useUpdateEnterpriseRecordMutation,
} from "../hooks";
import { enterpriseProjectService } from "../services";
import type {
  EnterpriseRecord,
  EnterpriseRecordKind,
  FinancialRecordPayload,
  IssuedInvoice,
  ReceivedInvoice,
} from "../types";
import {
  buildAttachmentSummary,
  buildEnterpriseRecordFilters,
  buildInvoiceLinkOptions,
  formatCents,
  formulaRows,
  pageRange,
  recordModuleLabels,
  statusLabel,
  statusTone,
  uploadRecordToAttachment,
} from "../lib";
import { constructionProjectService } from "@/features/projects/services/construction-project-service";
import { FormulaDialogButton } from "./FormulaDialogButton";
import { EnterpriseCustomerSearchSelect, EnterpriseOwnEntitySearchSelect } from "./EnterpriseSearchSelect";

const PAGE_SIZE = 10;
const tabs: Array<"overview" | EnterpriseRecordKind> = [
  "overview",
  "issued-invoices",
  "received-invoices",
  "collections",
  "payments",
];

const statusOptions: Record<EnterpriseRecordKind, Array<{ value: string; label: string }>> = {
  "issued-invoices": [
    { value: "all", label: "全部状态" },
    { value: "draft", label: "草稿" },
    { value: "issued", label: "已开票" },
    { value: "voided", label: "已作废" },
  ],
  "received-invoices": [
    { value: "all", label: "全部状态" },
    { value: "pending", label: "待收票" },
    { value: "received", label: "已收票" },
    { value: "voided", label: "已作废" },
  ],
  collections: [
    { value: "all", label: "全部状态" },
    { value: "draft", label: "草稿" },
    { value: "confirmed", label: "已确认" },
    { value: "cancelled", label: "已取消" },
  ],
  payments: [
    { value: "all", label: "全部状态" },
    { value: "draft", label: "草稿" },
    { value: "confirmed", label: "已确认" },
    { value: "cancelled", label: "已取消" },
  ],
};

export function EnterpriseProjectDetailPage({
  projectId,
  embedded = false,
}: {
  projectId: string;
  embedded?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | EnterpriseRecordKind>("overview");
  const projectQuery = useEnterpriseProjectQuery(projectId);
  const summaryQuery = useEnterpriseProjectSummaryQuery(projectId);
  const summary = summaryQuery.data;

  return (
    <div className="space-y-4 text-slate-950">
      {!embedded ? (
        <Link to="/app/admin/enterprise-projects" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-[#0f6b5d]">
          <ArrowLeft className="size-4" />
          返回往来单位关联项目列表
        </Link>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#0f6b5d]">企业经营模块</div>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-normal">
              {projectQuery.data?.name ?? "往来单位关联项目详情"}
            </h1>
            <p className="mt-1 truncate text-sm text-slate-500">
              {projectQuery.data?.customer_name || "未填写往来单位"} · 合同额 {formatCents(projectQuery.data?.contract_amount_cents)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge className={statusTone(projectQuery.data?.status)}>
              {statusLabel(projectQuery.data?.status)}
            </Badge>
            <FormulaDialogButton
              rows={formulaRows()}
              description="项目管理汇总开票、收票、回款和付款后统一计算利润与余额。"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {tabs.map((tab) => (
            <Button
              key={tab}
              type="button"
              variant={activeTab === tab ? "default" : "ghost"}
              className={activeTab === tab ? "bg-[#0f6b5d] hover:bg-[#0d5e52]" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "overview" ? "经营看板" : recordModuleLabels[tab]}
            </Button>
          ))}
        </div>
      </section>

      {activeTab === "overview" ? (
        <div className="space-y-4">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="合同金额" value={formatCents(projectQuery.data?.contract_amount_cents)} />
            <SummaryCard label="已开票" value={formatCents(summary?.issued_invoice_amount_cents)} />
            <SummaryCard label="已收票" value={formatCents(summary?.received_invoice_amount_cents)} />
            <SummaryCard label="已回款" value={formatCents(summary?.collection_amount_cents)} />
            <SummaryCard label="已付款" value={formatCents(summary?.payment_amount_cents)} />
            <SummaryCard label="现金毛利" value={formatCents(summary?.cash_profit_cents)} emphasis />
            <SummaryCard label="账面毛利" value={formatCents(summary?.accounting_profit_cents)} emphasis />
            <SummaryCard label="应收/应付余额" value={`${formatCents(summary?.receivable_balance_cents)} / ${formatCents(summary?.payable_balance_cents)}`} />
          </section>
        </div>
      ) : (
        <RecordTab
          key={activeTab}
          projectId={projectId}
          module={activeTab}
          projectCustomerId={projectQuery.data?.customer_id ?? ""}
          projectCustomerName={projectQuery.data?.customer_name ?? ""}
          projectOwnEntityId={projectQuery.data?.own_entity_id ?? ""}
          projectOwnEntityName={projectQuery.data?.own_entity_name ?? ""}
        />
      )}
    </div>
  );
}

export function RecordTab({
  projectId,
  module,
  prefixFilters,
  projectCustomerId = "",
  projectCustomerName = "",
  projectOwnEntityId = "",
  projectOwnEntityName = "",
}: {
  projectId: string;
  module: EnterpriseRecordKind;
  prefixFilters?: ReactNode;
  projectCustomerId?: string;
  projectCustomerName?: string;
  projectOwnEntityId?: string;
  projectOwnEntityName?: string;
}) {
  const [keyword, setKeyword] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FinancialRecordPayload>(() =>
    defaultRecordForm(module, projectCustomerId, projectCustomerName, projectOwnEntityId, projectOwnEntityName)
  );
  const [editingRecord, setEditingRecord] = useState<EnterpriseRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EnterpriseRecord | null>(null);
  const filters = useMemo(
    () => buildEnterpriseRecordFilters({
      page,
      pageSize: PAGE_SIZE,
      keyword,
      status,
      dateFrom,
      dateTo,
    }),
    [dateFrom, dateTo, keyword, page, status]
  );
  const query = useEnterpriseRecordsQuery(projectId, module, filters);
  const issuedInvoiceOptionsQuery = useEnterpriseRecordsQuery(projectId, "issued-invoices", {
    page: 1,
    page_size: 100,
  });
  const receivedInvoiceOptionsQuery = useEnterpriseRecordsQuery(projectId, "received-invoices", {
    page: 1,
    page_size: 100,
  });
  const createRecord = useCreateEnterpriseRecordMutation(projectId, module);
  const updateRecord = useUpdateEnterpriseRecordMutation(projectId, module, editingRecord?.id ?? "");
  const deleteRecord = useDeleteEnterpriseRecordMutation(projectId, module);
  const rows = (query.data?.items ?? []) as EnterpriseRecord[];
  const total = query.data?.total ?? 0;
  const range = pageRange(total, page, PAGE_SIZE);
  const issuedInvoiceOptions = useMemo(
    () => buildInvoiceLinkOptions((issuedInvoiceOptionsQuery.data?.items ?? []) as IssuedInvoice[]),
    [issuedInvoiceOptionsQuery.data?.items]
  );
  const receivedInvoiceOptions = useMemo(
    () => buildInvoiceLinkOptions((receivedInvoiceOptionsQuery.data?.items ?? []) as ReceivedInvoice[]),
    [receivedInvoiceOptionsQuery.data?.items]
  );

  const submitRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { attachment_text: _attachmentText, ...rawPayload } = form;
    const payload: FinancialRecordPayload = {
      ...rawPayload,
      attachments: form.attachments ?? [],
    };
    try {
      if (editingRecord) {
        await updateRecord.mutateAsync(payload);
        toast.success(`${recordModuleLabels[module]}记录已修改`);
      } else {
        await createRecord.mutateAsync(payload);
        toast.success(`${recordModuleLabels[module]}记录已新增`);
      }
      setForm(defaultRecordForm(module, projectCustomerId, projectCustomerName, projectOwnEntityId, projectOwnEntityName));
      setEditingRecord(null);
      setFormOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const openCreate = () => {
    setEditingRecord(null);
    setForm(defaultRecordForm(module, projectCustomerId, projectCustomerName, projectOwnEntityId, projectOwnEntityName));
    setFormOpen(true);
  };

  const openEdit = (record: EnterpriseRecord) => {
    setEditingRecord(record);
    setForm(recordToForm(module, record));
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteRecord.mutateAsync(pendingDelete.id);
      toast.success(`${recordModuleLabels[module]}记录已删除`);
      setPendingDelete(null);
    } catch {
      toast.error("删除失败");
    }
  };

  const exportRows = async () => {
    try {
      const blob = await enterpriseProjectService.exportRecords(projectId, module, filters);
      downloadBlob(blob, `${recordModuleLabels[module]}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      toast.error("导出失败");
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{recordModuleLabels[module]}记录</h2>
            <p className="mt-1 text-sm text-slate-500">按项目维护经营流水，数据参与项目利润汇总。</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportRows}>
              <Download className="mr-2 size-4" />
              导出数据
            </Button>
            <Button className="bg-[#0f6b5d] hover:bg-[#0d5e52]" onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              新增{recordModuleLabels[module]}
            </Button>
          </div>
        </div>
        <div className={`mt-4 grid gap-3 ${prefixFilters ? "lg:grid-cols-[220px_260px_minmax(220px,1fr)_155px_155px_170px_auto]" : "lg:grid-cols-[minmax(240px,1fr)_170px_170px_190px_auto]"}`}>
          {prefixFilters}
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="名称、发票号、账户、备注"
              value={keywordDraft}
              onChange={(event) => setKeywordDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setKeyword(keywordDraft.trim());
                  setPage(1);
                }
              }}
            />
          </div>
          <Input
            aria-label="开始日期"
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
          />
          <Input
            aria-label="结束日期"
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
          />
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions[module].map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="bg-[#0f6b5d] hover:bg-[#0d5e52]" onClick={() => { setKeyword(keywordDraft.trim()); setPage(1); }}>
            查询
          </Button>
        </div>
      </div>

      <Table className="w-full table-fixed">
        <TableHeader>
          <TableRow>
            {columnsFor(module).map((column) => (
              <TableHead key={column.key} className={column.width}>{column.label}</TableHead>
            ))}
            <TableHead className="w-[12%] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading ? (
            <TableRow><TableCell colSpan={columnsFor(module).length + 1} className="h-28 text-center text-slate-500">加载中</TableCell></TableRow>
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={columnsFor(module).length + 1} className="h-28 text-center text-slate-500">暂无记录</TableCell></TableRow>
          ) : (
            rows.map((row) => <RecordRow key={row.id} module={module} row={row} onEdit={openEdit} onDelete={setPendingDelete} />)
          )}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-slate-500">
        <span>显示 {range.start}-{range.end} 条，共 {total} 条</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
          <span className="min-w-12 text-center">{page}/{range.pageCount}</span>
          <Button variant="outline" size="sm" disabled={page >= range.pageCount} onClick={() => setPage(page + 1)}>下一页</Button>
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "编辑" : "新增"}{recordModuleLabels[module]}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submitRecord}>
            <RecordForm
              module={module}
              projectId={projectId}
              form={form}
              projectCustomerId={projectCustomerId}
              projectCustomerName={projectCustomerName}
              projectOwnEntityId={projectOwnEntityId}
              projectOwnEntityName={projectOwnEntityName}
              issuedInvoiceOptions={issuedInvoiceOptions}
              receivedInvoiceOptions={receivedInvoiceOptions}
              onChange={setForm}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
              <Button type="submit" className="bg-[#0f6b5d] hover:bg-[#0d5e52]" disabled={createRecord.isPending || updateRecord.isPending}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除{recordModuleLabels[module]}记录</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">确认删除这条记录？删除后会同步更新经营看板汇总。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteRecord.isPending}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RecordRow({
  module,
  row,
  onEdit,
  onDelete,
}: {
  module: EnterpriseRecordKind;
  row: EnterpriseRecord;
  onEdit: (row: EnterpriseRecord) => void;
  onDelete: (row: EnterpriseRecord) => void;
}) {
  const fields = rowFields(module, row);
  return (
    <TableRow>
      {fields.map((field) => (
        <TableCell key={field.key} className="truncate">
          {field.node}
        </TableCell>
      ))}
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(row)}>
            <Pencil className="mr-1 size-4" />
            编辑
          </Button>
          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => onDelete(row)}>
            <Trash2 className="mr-1 size-4" />
            删除
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function RecordForm({
  module,
  projectId,
  form,
  projectCustomerId,
  projectCustomerName,
  projectOwnEntityId,
  projectOwnEntityName,
  issuedInvoiceOptions,
  receivedInvoiceOptions,
  onChange,
}: {
  module: EnterpriseRecordKind;
  projectId: string;
  form: FinancialRecordPayload;
  projectCustomerId?: string;
  projectCustomerName?: string;
  projectOwnEntityId?: string;
  projectOwnEntityName?: string;
  issuedInvoiceOptions: Array<{ value: string; label: string }>;
  receivedInvoiceOptions: Array<{ value: string; label: string }>;
  onChange: (form: FinancialRecordPayload) => void;
}) {
  const patch = (key: keyof FinancialRecordPayload, value: string) => onChange({ ...form, [key]: value });
  const statusList = statusOptions[module].filter((item) => item.value !== "all");
  const patchCounterparty = (
    nameKey: "customer_name" | "supplier_name" | "payer_name" | "payee_name",
    value: string,
    name: string
  ) => {
    onChange({
      ...form,
      counterparty_id: value || "",
      customer_id: value || "",
      [nameKey]: name,
    });
  };
  const patchOwnEntity = (value: string, name: string, bankLabel?: string) => {
    onChange({
      ...form,
      own_entity_id: value || "",
      own_entity_name: name,
      account_name: (module === "collections" || module === "payments") && !form.account_name && bankLabel
        ? bankLabel
        : form.account_name,
    });
  };
  const ownEntityLabel = module === "issued-invoices"
    ? "开票主体"
    : module === "received-invoices"
      ? "收票主体"
      : module === "collections"
        ? "收款主体"
        : "付款主体";

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">{ownEntityLabel}</label>
        <EnterpriseOwnEntitySearchSelect
          value={form.own_entity_id ?? projectOwnEntityId ?? ""}
          selectedLabel={form.own_entity_name || projectOwnEntityName}
          onValueChange={(value) => patchOwnEntity(value, value ? form.own_entity_name ?? "" : "")}
          onEntityChange={(entity) =>
            patchOwnEntity(
              entity?.id ?? "",
              entity?.name ?? "",
              [entity?.bank_name, entity?.bank_account].filter(Boolean).join(" / ")
            )
          }
          includeEmptyOption
          emptyLabel="请选择我方主体"
          placeholder="搜索主体名称、税号、开户行、账号"
        />
      </div>
      {module === "issued-invoices" && (
        <>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">往来单位</label>
            <EnterpriseCustomerSearchSelect
              value={form.counterparty_id ?? projectCustomerId ?? ""}
              selectedLabel={form.customer_name || projectCustomerName}
              onValueChange={(value) => patchCounterparty("customer_name", value, value ? form.customer_name ?? "" : "")}
              onCustomerChange={(customer) => patchCounterparty("customer_name", customer?.id ?? "", customer?.name ?? "")}
              includeEmptyOption
              emptyLabel="请选择往来单位"
              placeholder="搜索往来单位名称、编号、税号、联系人、电话"
            />
          </div>
          <Field label="发票号码" value={form.invoice_no ?? ""} onChange={(value) => patch("invoice_no", value)} />
          <Field type="date" label="开票日期 *" value={form.invoice_date ?? ""} onChange={(value) => patch("invoice_date", value)} />
        </>
      )}
      {module === "received-invoices" && (
        <>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">往来单位</label>
            <EnterpriseCustomerSearchSelect
              value={form.counterparty_id ?? ""}
              selectedLabel={form.supplier_name}
              onValueChange={(value) => patchCounterparty("supplier_name", value, value ? form.supplier_name ?? "" : "")}
              onCustomerChange={(customer) => patchCounterparty("supplier_name", customer?.id ?? "", customer?.name ?? "")}
              includeEmptyOption
              emptyLabel="请选择往来单位"
              placeholder="搜索往来单位名称、编号、税号、联系人、电话"
            />
          </div>
          <Field label="发票号码" value={form.invoice_no ?? ""} onChange={(value) => patch("invoice_no", value)} />
          <Field label="费用类型" value={form.expense_type ?? ""} onChange={(value) => patch("expense_type", value)} />
          <Field type="date" label="收票日期 *" value={form.invoice_date ?? ""} onChange={(value) => patch("invoice_date", value)} />
        </>
      )}
      {module === "collections" && (
        <>
          <InvoiceSelect
            label="关联开票"
            value={form.issued_invoice_id ?? "none"}
            options={issuedInvoiceOptions}
            onChange={(value) => patch("issued_invoice_id", value === "none" ? "" : value)}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">往来单位</label>
            <EnterpriseCustomerSearchSelect
              value={form.counterparty_id ?? projectCustomerId ?? ""}
              selectedLabel={form.payer_name || projectCustomerName}
              onValueChange={(value) => patchCounterparty("payer_name", value, value ? form.payer_name ?? "" : "")}
              onCustomerChange={(customer) => patchCounterparty("payer_name", customer?.id ?? "", customer?.name ?? "")}
              includeEmptyOption
              emptyLabel="请选择往来单位"
              placeholder="搜索往来单位名称、编号、税号、联系人、电话"
            />
          </div>
          <Field type="date" label="回款日期 *" value={form.collection_date ?? ""} onChange={(value) => patch("collection_date", value)} />
          <Field label="收款账户" value={form.account_name ?? ""} onChange={(value) => patch("account_name", value)} />
        </>
      )}
      {module === "payments" && (
        <>
          <InvoiceSelect
            label="关联收票"
            value={form.received_invoice_id ?? "none"}
            options={receivedInvoiceOptions}
            onChange={(value) => patch("received_invoice_id", value === "none" ? "" : value)}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">往来单位</label>
            <EnterpriseCustomerSearchSelect
              value={form.counterparty_id ?? ""}
              selectedLabel={form.payee_name}
              onValueChange={(value) => patchCounterparty("payee_name", value, value ? form.payee_name ?? "" : "")}
              onCustomerChange={(customer) => patchCounterparty("payee_name", customer?.id ?? "", customer?.name ?? "")}
              includeEmptyOption
              emptyLabel="请选择往来单位"
              placeholder="搜索往来单位名称、编号、税号、联系人、电话"
            />
          </div>
          <Field type="date" label="付款日期 *" value={form.payment_date ?? ""} onChange={(value) => patch("payment_date", value)} />
          <Field label="付款账户" value={form.account_name ?? ""} onChange={(value) => patch("account_name", value)} />
        </>
      )}
      <Field label="金额(元) *" value={form.amount ?? ""} onChange={(value) => patch("amount", value)} />
      {(module === "issued-invoices" || module === "received-invoices") && (
        <Field label="税率" value={form.tax_rate ?? ""} onChange={(value) => patch("tax_rate", value)} />
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">状态</label>
        <Select value={form.status} onValueChange={(value) => patch("status", value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {statusList.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Field label="备注" value={form.remark ?? ""} onChange={(value) => patch("remark", value)} />
      <AttachmentUploadField
        projectId={projectId}
        module={module}
        value={form.attachments ?? []}
        onChange={(attachments) => onChange({ ...form, attachments })}
      />
    </div>
  );
}

function AttachmentUploadField({
  projectId,
  module,
  value,
  onChange,
}: {
  projectId: string;
  module: EnterpriseRecordKind;
  value: NonNullable<FinancialRecordPayload["attachments"]>;
  onChange: (attachments: NonNullable<FinancialRecordPayload["attachments"]>) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const inputId = `enterprise-${module}-attachments`;

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const uploaded = [];
      for (const file of Array.from(files)) {
        const record = await constructionProjectService.uploadFile(file, {
          bizType: "enterprise",
          bizId: projectId,
          fieldKey: module,
        });
        const attachment = uploadRecordToAttachment(record);
        if (attachment) uploaded.push(attachment);
      }
      onChange([...value, ...uploaded]);
      toast.success(`已上传 ${uploaded.length} 个附件`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "附件上传失败");
    } finally {
      setIsUploading(false);
    }
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="space-y-2 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-medium text-slate-700">附件</label>
        <div>
          <input
            id={inputId}
            className="hidden"
            type="file"
            multiple
            onChange={(event) => {
              void uploadFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" asChild disabled={isUploading}>
            <label htmlFor={inputId} className="cursor-pointer">
              {isUploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              {isUploading ? "上传中" : "上传附件"}
            </label>
          </Button>
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        {value.length === 0 ? (
          <p className="text-sm text-slate-500">暂无附件，上传后自动保存京东云文件地址。</p>
        ) : (
          <div className="space-y-2">
            {value.map((item, index) => (
              <div key={`${item.url}-${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-sm">
                <a className="min-w-0 flex-1 truncate text-[#0f6b5d] hover:underline" href={item.url} target="_blank" rel="noreferrer">
                  {item.name || item.url}
                </a>
                <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => removeAt(index)}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold ${emphasis ? "text-[#0f6b5d]" : ""}`}>{value}</div>
    </div>
  );
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function InvoiceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <Select value={value || "none"} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">不关联</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function columnsFor(module: EnterpriseRecordKind) {
  if (module === "issued-invoices") {
    return [
      { key: "date", label: "开票日期", width: "w-[10%]" },
      { key: "name", label: "往来单位", width: "w-[14%]" },
      { key: "entity", label: "主体", width: "w-[12%]" },
      { key: "invoice", label: "发票号", width: "w-[13%]" },
      { key: "amount", label: "金额", width: "w-[11%]" },
      { key: "attachments", label: "附件", width: "w-[8%]" },
      { key: "status", label: "状态", width: "w-[8%]" },
      { key: "remark", label: "备注", width: "w-[12%]" },
    ];
  }
  if (module === "received-invoices") {
    return [
      { key: "date", label: "收票日期", width: "w-[10%]" },
      { key: "name", label: "往来单位", width: "w-[14%]" },
      { key: "entity", label: "主体", width: "w-[12%]" },
      { key: "invoice", label: "发票号", width: "w-[12%]" },
      { key: "type", label: "费用类型", width: "w-[10%]" },
      { key: "amount", label: "金额", width: "w-[10%]" },
      { key: "attachments", label: "附件", width: "w-[8%]" },
      { key: "status", label: "状态", width: "w-[8%]" },
      { key: "remark", label: "备注", width: "w-[4%]" },
    ];
  }
  return [
    { key: "date", label: module === "collections" ? "回款日期" : "付款日期", width: "w-[10%]" },
    { key: "name", label: "往来单位", width: "w-[16%]" },
    { key: "entity", label: "主体", width: "w-[14%]" },
    { key: "amount", label: "金额", width: "w-[12%]" },
    { key: "account", label: "账户", width: "w-[14%]" },
    { key: "attachments", label: "附件", width: "w-[8%]" },
    { key: "status", label: "状态", width: "w-[8%]" },
    { key: "remark", label: "备注", width: "w-[6%]" },
  ];
}

function rowFields(module: EnterpriseRecordKind, row: EnterpriseRecord) {
  const status = "status" in row ? row.status : "";
  if (module === "issued-invoices") {
    const item = row as Extract<EnterpriseRecord, { customer_name: string | null }>;
    return [
      { key: "date", node: item.invoice_date },
      { key: "name", node: item.customer_name || "未填写" },
      { key: "entity", node: item.own_entity_name || "未填写" },
      { key: "invoice", node: item.invoice_no || "未填写" },
      { key: "amount", node: formatCents(item.amount_cents) },
      { key: "attachments", node: buildAttachmentSummary(item.attachments) },
      { key: "status", node: <Badge className={statusTone(status)}>{statusLabel(status)}</Badge> },
      { key: "remark", node: item.remark || "--" },
    ];
  }
  if (module === "received-invoices") {
    const item = row as Extract<EnterpriseRecord, { supplier_name: string | null }>;
    return [
      { key: "date", node: item.invoice_date },
      { key: "name", node: item.supplier_name || "未填写" },
      { key: "entity", node: item.own_entity_name || "未填写" },
      { key: "invoice", node: item.invoice_no || "未填写" },
      { key: "type", node: item.expense_type || "--" },
      { key: "amount", node: formatCents(item.amount_cents) },
      { key: "attachments", node: buildAttachmentSummary(item.attachments) },
      { key: "status", node: <Badge className={statusTone(status)}>{statusLabel(status)}</Badge> },
      { key: "remark", node: item.remark || "--" },
    ];
  }
  if (module === "collections") {
    const item = row as Extract<EnterpriseRecord, { payer_name: string | null }>;
    return [
      { key: "date", node: item.collection_date },
      { key: "name", node: item.payer_name || "未填写" },
      { key: "entity", node: item.own_entity_name || "未填写" },
      { key: "amount", node: formatCents(item.amount_cents) },
      { key: "account", node: item.account_name || "--" },
      { key: "attachments", node: buildAttachmentSummary(item.attachments) },
      { key: "status", node: <Badge className={statusTone(status)}>{statusLabel(status)}</Badge> },
      { key: "remark", node: item.remark || "--" },
    ];
  }
  const item = row as Extract<EnterpriseRecord, { payee_name: string | null }>;
  return [
    { key: "date", node: item.payment_date },
    { key: "name", node: item.payee_name || "未填写" },
    { key: "entity", node: item.own_entity_name || "未填写" },
    { key: "amount", node: formatCents(item.amount_cents) },
    { key: "account", node: item.account_name || "--" },
    { key: "attachments", node: buildAttachmentSummary(item.attachments) },
    { key: "status", node: <Badge className={statusTone(status)}>{statusLabel(status)}</Badge> },
    { key: "remark", node: item.remark || "--" },
  ];
}

function defaultRecordForm(
  module: EnterpriseRecordKind,
  projectCustomerId = "",
  projectCustomerName = "",
  projectOwnEntityId = "",
  projectOwnEntityName = ""
): FinancialRecordPayload {
  const base = {
    counterparty_id: projectCustomerId,
    customer_id: projectCustomerId,
    own_entity_id: projectOwnEntityId,
    own_entity_name: projectOwnEntityName,
    attachments: [],
  };
  if (module === "issued-invoices") {
    return {
      ...base,
      customer_name: projectCustomerName,
      invoice_date: "",
      status: "issued",
      amount: "",
    };
  }
  if (module === "received-invoices") return { ...base, counterparty_id: "", customer_id: "", invoice_date: "", status: "received", amount: "" };
  if (module === "collections") {
    return {
      ...base,
      payer_name: projectCustomerName,
      collection_date: "",
      status: "confirmed",
      amount: "",
      issued_invoice_id: "",
    };
  }
  return { ...base, counterparty_id: "", customer_id: "", payment_date: "", status: "confirmed", amount: "", received_invoice_id: "" };
}

function recordToForm(module: EnterpriseRecordKind, row: EnterpriseRecord): FinancialRecordPayload {
  if (module === "issued-invoices") {
    const item = row as Extract<EnterpriseRecord, { customer_name: string | null }>;
    return {
      customer_name: item.customer_name ?? "",
      counterparty_id: item.counterparty_id ?? "",
      customer_id: item.counterparty_id ?? "",
      own_entity_id: item.own_entity_id ?? "",
      own_entity_name: item.own_entity_name ?? "",
      invoice_no: item.invoice_no ?? "",
      invoice_date: item.invoice_date ?? "",
      amount: String((item.amount_cents ?? 0) / 100),
      tax_rate: item.tax_rate == null ? "" : String(item.tax_rate),
      status: item.status,
      attachments: item.attachments ?? [],
      remark: item.remark ?? "",
    };
  }
  if (module === "received-invoices") {
    const item = row as Extract<EnterpriseRecord, { supplier_name: string | null }>;
    return {
      supplier_name: item.supplier_name ?? "",
      counterparty_id: item.counterparty_id ?? "",
      customer_id: item.counterparty_id ?? "",
      own_entity_id: item.own_entity_id ?? "",
      own_entity_name: item.own_entity_name ?? "",
      invoice_no: item.invoice_no ?? "",
      invoice_date: item.invoice_date ?? "",
      expense_type: item.expense_type ?? "",
      amount: String((item.amount_cents ?? 0) / 100),
      tax_rate: item.tax_rate == null ? "" : String(item.tax_rate),
      status: item.status,
      attachments: item.attachments ?? [],
      remark: item.remark ?? "",
    };
  }
  if (module === "collections") {
    const item = row as Extract<EnterpriseRecord, { payer_name: string | null }>;
    return {
      payer_name: item.payer_name ?? "",
      counterparty_id: item.counterparty_id ?? "",
      customer_id: item.counterparty_id ?? "",
      own_entity_id: item.own_entity_id ?? "",
      own_entity_name: item.own_entity_name ?? "",
      collection_date: item.collection_date ?? "",
      account_name: item.account_name ?? "",
      amount: String((item.amount_cents ?? 0) / 100),
      issued_invoice_id: item.issued_invoice_id ?? "",
      status: item.status,
      attachments: item.attachments ?? [],
      remark: item.remark ?? "",
    };
  }
  const item = row as Extract<EnterpriseRecord, { payee_name: string | null }>;
  return {
    payee_name: item.payee_name ?? "",
    counterparty_id: item.counterparty_id ?? "",
    customer_id: item.counterparty_id ?? "",
    own_entity_id: item.own_entity_id ?? "",
    own_entity_name: item.own_entity_name ?? "",
    payment_date: item.payment_date ?? "",
    account_name: item.account_name ?? "",
    amount: String((item.amount_cents ?? 0) / 100),
    received_invoice_id: item.received_invoice_id ?? "",
    status: item.status,
    attachments: item.attachments ?? [],
    remark: item.remark ?? "",
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
