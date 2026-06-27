import { Link } from "@tanstack/react-router";
import { Download, Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
  useCreateEnterpriseCustomerMutation,
  useDeleteEnterpriseCustomerMutation,
  useEnterpriseCustomersQuery,
  useUpdateEnterpriseCustomerMutation,
} from "../hooks";
import {
  customerStatusOptions,
  buildEnterpriseCustomerFilters,
  formatCents,
  pageRange,
  statusLabel,
  statusTone,
} from "../lib";
import { enterpriseProjectService } from "../services";
import type {
  EnterpriseCustomer,
  EnterpriseCustomerPayload,
  EnterpriseCustomerStatus,
} from "../types";

const PAGE_SIZE = 10;

type CustomerFormState = {
  customer_code: string;
  name: string;
  credit_code: string;
  contact_name: string;
  contact_phone: string;
  address: string;
  status: EnterpriseCustomerStatus;
  remark: string;
};

const emptyForm: CustomerFormState = {
  customer_code: "",
  name: "",
  credit_code: "",
  contact_name: "",
  contact_phone: "",
  address: "",
  status: "active",
  remark: "",
};

export function EnterpriseCustomersPage() {
  const [keyword, setKeyword] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<CustomerFormState>(emptyForm);
  const [editing, setEditing] = useState<EnterpriseCustomer | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EnterpriseCustomer | null>(null);
  const [exporting, setExporting] = useState(false);
  const filters = useMemo(
    () => buildEnterpriseCustomerFilters({
      page,
      pageSize: PAGE_SIZE,
      keyword,
      status,
      dateFrom,
      dateTo,
    }),
    [dateFrom, dateTo, keyword, page, status]
  );
  const customersQuery = useEnterpriseCustomersQuery(filters);
  const createCustomer = useCreateEnterpriseCustomerMutation();
  const updateCustomer = useUpdateEnterpriseCustomerMutation(editing?.id ?? "");
  const deleteCustomer = useDeleteEnterpriseCustomerMutation();
  const rows = customersQuery.data?.items ?? [];
  const total = customersQuery.data?.total ?? 0;
  const range = pageRange(total, page, PAGE_SIZE);
  const totals = rows.reduce(
    (sum, row) => ({
      collection: sum.collection + (row.collection_amount_cents ?? 0),
      receivable: sum.receivable + (row.receivable_balance_cents ?? 0),
      cashProfit: sum.cashProfit + (row.cash_profit_cents ?? 0),
    }),
    { collection: 0, receivable: 0, cashProfit: 0 }
  );

  const openCreate = () => {
    setEditing(null);
    setFormState(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (customer: EnterpriseCustomer) => {
    setEditing(customer);
    setFormState({
      customer_code: customer.customer_code ?? "",
      name: customer.name,
      credit_code: customer.credit_code ?? "",
      contact_name: customer.contact_name ?? "",
      contact_phone: customer.contact_phone ?? "",
      address: customer.address ?? "",
      status: customer.status,
      remark: customer.remark ?? "",
    });
    setFormOpen(true);
  };

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.name.trim()) {
      toast.error("请填写往来单位名称");
      return;
    }
    const payload: EnterpriseCustomerPayload = {
      customer_code: formState.customer_code || undefined,
      name: formState.name,
      credit_code: formState.credit_code || undefined,
      contact_name: formState.contact_name || undefined,
      contact_phone: formState.contact_phone || undefined,
      address: formState.address || undefined,
      status: formState.status,
      remark: formState.remark || undefined,
    };
    try {
      if (editing) {
        await updateCustomer.mutateAsync(payload);
        toast.success("往来单位已修改");
      } else {
        await createCustomer.mutateAsync(payload);
        toast.success("往来单位已新增");
      }
      setFormOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteCustomer.mutateAsync(pendingDelete.id);
      toast.success("往来单位已删除");
      setPendingDelete(null);
    } catch {
      toast.error("删除失败");
    }
  };

  const exportCustomers = async () => {
    setExporting(true);
    try {
      const blob = await enterpriseProjectService.exportCustomers(filters);
      downloadBlob(blob, `往来单位经营汇总-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success("往来单位数据已导出");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-[#0f6b5d]">企业经营模块</div>
            <h1 className="mt-1 text-xl font-semibold tracking-normal">往来单位管理</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={exporting} onClick={exportCustomers}>
              <Download className="mr-2 size-4" />
              导出数据
            </Button>
            <Button className="bg-[#0f6b5d] hover:bg-[#0d5e52]" onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              新增往来单位
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Metric label="往来单位" value={`${total} 家`} />
          <Metric label="本页回款" value={formatCents(totals.collection)} />
          <Metric label="本页应收" value={formatCents(totals.receivable)} />
          <Metric label="本页现金毛利" value={formatCents(totals.cashProfit)} />
        </div>

        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 lg:grid-cols-[minmax(260px,1fr)_180px_170px_170px_auto]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="往来单位名称、编号、税号、联系人、电话"
              value={keywordDraft}
              onChange={(event) => setKeywordDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setPage(1);
                  setKeyword(keywordDraft.trim());
                }
              }}
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {customerStatusOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label="创建开始日期"
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
          />
          <Input
            aria-label="创建结束日期"
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
          />
          <Button className="bg-[#0f6b5d] hover:bg-[#0d5e52]" onClick={() => { setPage(1); setKeyword(keywordDraft.trim()); }}>
            查询
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[16%]">往来单位</TableHead>
              <TableHead className="w-[11%]">联系人</TableHead>
              <TableHead className="w-[7%]">项目</TableHead>
              <TableHead className="w-[10%]">合同额</TableHead>
              <TableHead className="w-[11%]">开票/回款</TableHead>
              <TableHead className="w-[9%]">应收</TableHead>
              <TableHead className="w-[9%]">现金毛利</TableHead>
              <TableHead className="w-[8%]">状态</TableHead>
              <TableHead className="w-[19%] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customersQuery.isLoading ? (
              <TableRow><TableCell colSpan={9} className="h-32 text-center text-slate-500">加载中</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="h-32 text-center text-slate-500">暂无往来单位</TableCell></TableRow>
            ) : (
              rows.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="min-w-0">
                    <Link
                      to="/app/admin/enterprise-customers/$customerId"
                      params={{ customerId: customer.id }}
                      className="block truncate font-medium text-[#0f6b5d] hover:underline"
                    >
                      {customer.name}
                    </Link>
                    <div className="truncate text-xs text-slate-500">{customer.customer_code || customer.credit_code || "未填写编号"}</div>
                  </TableCell>
                  <TableCell className="truncate">
                    {customer.contact_name || "未填写"}
                    <div className="truncate text-xs text-slate-500">{customer.contact_phone || "-"}</div>
                  </TableCell>
                  <TableCell>{customer.project_count ?? 0} 个</TableCell>
                  <TableCell>{formatCents(customer.contract_amount_cents)}</TableCell>
                  <TableCell className="truncate">
                    {formatCents(customer.issued_invoice_amount_cents)}
                    <div className="text-xs text-emerald-700">{formatCents(customer.collection_amount_cents)}</div>
                  </TableCell>
                  <TableCell>{formatCents(customer.receivable_balance_cents)}</TableCell>
                  <TableCell>{formatCents(customer.cash_profit_cents)}</TableCell>
                  <TableCell><Badge className={statusTone(customer.status)}>{statusLabel(customer.status)}</Badge></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/app/admin/enterprise-customers/$customerId" params={{ customerId: customer.id }}>
                          <Eye className="mr-1 size-4" />
                          详情
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(customer)}><Pencil className="mr-1 size-4" />编辑</Button>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setPendingDelete(customer)}><Trash2 className="mr-1 size-4" />删除</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
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
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader><DialogTitle>{editing ? "编辑往来单位" : "新增往来单位"}</DialogTitle></DialogHeader>
          <form className="grid gap-4" onSubmit={submitForm}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="往来单位名称 *" value={formState.name} onChange={(name) => setFormState({ ...formState, name })} />
              <Field label="往来单位编号" value={formState.customer_code} onChange={(customer_code) => setFormState({ ...formState, customer_code })} />
              <Field label="统一社会信用代码" value={formState.credit_code} onChange={(credit_code) => setFormState({ ...formState, credit_code })} />
              <Field label="联系人" value={formState.contact_name} onChange={(contact_name) => setFormState({ ...formState, contact_name })} />
              <Field label="联系电话" value={formState.contact_phone} onChange={(contact_phone) => setFormState({ ...formState, contact_phone })} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">状态</label>
                <Select value={formState.status} onValueChange={(value) => setFormState({ ...formState, status: value as EnterpriseCustomerStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {customerStatusOptions.filter((item) => item.value !== "all").map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field label="地址" value={formState.address} onChange={(address) => setFormState({ ...formState, address })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">备注</label>
              <textarea className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={formState.remark} onChange={(event) => setFormState({ ...formState, remark: event.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
              <Button type="submit" className="bg-[#0f6b5d] hover:bg-[#0d5e52]" disabled={createCustomer.isPending || updateCustomer.isPending}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>删除往来单位</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">确认删除该往来单位？已关联项目不会删除，但入口将不再显示。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteCustomer.isPending}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-[#f8faf9] px-3 py-1.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="truncate text-base font-semibold">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
