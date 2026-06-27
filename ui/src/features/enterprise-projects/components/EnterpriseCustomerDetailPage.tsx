import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
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
  useCreateEnterpriseProjectMutation,
  useEnterpriseCustomerQuery,
  useEnterpriseCustomerSummaryQuery,
  useEnterpriseProjectsQuery,
} from "../hooks";
import {
  customerSummaryRows,
  formatCents,
  pageRange,
  projectStatusOptions,
  statusLabel,
  statusTone,
} from "../lib";
import type { EnterpriseProjectPayload, EnterpriseProjectStatus } from "../types";
import { EnterpriseOwnEntitySearchSelect } from "./EnterpriseSearchSelect";
import { EnterpriseProjectDetailPage } from "./EnterpriseProjectDetailPage";
import { FormulaDialogButton } from "./FormulaDialogButton";

const PAGE_SIZE = 10;
type ProjectFormState = {
  project_code: string;
  name: string;
  own_entity_id: string;
  own_entity_name: string;
  contract_amount: string;
  owner_name: string;
  status: EnterpriseProjectStatus;
  planned_start_date: string;
  planned_end_date: string;
  remark: string;
};

const emptyProjectForm: ProjectFormState = {
  project_code: "",
  name: "",
  own_entity_id: "",
  own_entity_name: "",
  contract_amount: "",
  owner_name: "",
  status: "active",
  planned_start_date: "",
  planned_end_date: "",
  remark: "",
};

export function EnterpriseCustomerDetailPage({ customerId }: { customerId: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [page, setPage] = useState(1);
  const [projectDetailId, setProjectDetailId] = useState<string | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(emptyProjectForm);
  const customerQuery = useEnterpriseCustomerQuery(customerId);
  const customer = customerQuery.data;
  const summaryQuery = useEnterpriseCustomerSummaryQuery(customerId, year);
  const projectsQuery = useEnterpriseProjectsQuery({
    page,
    page_size: PAGE_SIZE,
    customer_id: customerId,
  });
  const projects = projectsQuery.data?.items ?? [];
  const total = projectsQuery.data?.total ?? 0;
  const range = pageRange(total, page, PAGE_SIZE);
  const summary = summaryQuery.data;
  const summaryFormulaRows = useMemo(() => customerSummaryRows(), []);
  const createProject = useCreateEnterpriseProjectMutation();

  const openCreateProject = () => {
    setProjectForm({
      ...emptyProjectForm,
      owner_name: customer?.contact_name ?? "",
    });
    setProjectFormOpen(true);
  };

  const submitProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customer) {
      toast.error("往来单位数据未加载完成");
      return;
    }
    if (!projectForm.name.trim()) {
      toast.error("请填写项目名称");
      return;
    }
    const payload: EnterpriseProjectPayload = {
      project_code: projectForm.project_code || undefined,
      name: projectForm.name,
      customer_id: customer.id,
      customer_name: customer.name,
      own_entity_id: projectForm.own_entity_id || undefined,
      own_entity_name: projectForm.own_entity_name || undefined,
      contract_amount: projectForm.contract_amount || "0",
      owner_name: projectForm.owner_name || undefined,
      status: projectForm.status,
      planned_start_date: projectForm.planned_start_date || undefined,
      planned_end_date: projectForm.planned_end_date || undefined,
      remark: projectForm.remark || undefined,
    };
    try {
      await createProject.mutateAsync(payload);
      toast.success("关联项目已新增");
      setProjectFormOpen(false);
      setProjectForm(emptyProjectForm);
      setPage(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "新增项目失败");
    }
  };

  return (
    <div className="space-y-4 text-slate-950">
      <Link to="/app/admin/enterprise-customers" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-[#0f6b5d]">
        <ArrowLeft className="size-4" />
        返回往来单位列表
      </Link>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#0f6b5d]">往来单位经营视图</div>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-normal">{customer?.name ?? "往来单位详情"}</h1>
            <p className="mt-1 truncate text-sm text-slate-500">
              {customer?.contact_name || "未填写联系人"} · {customer?.contact_phone || "未填写电话"} · {customer?.credit_code || "未填写税号"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusTone(customer?.status)}>{statusLabel(customer?.status)}</Badge>
            <FormulaDialogButton
              rows={summaryFormulaRows}
              description="往来单位经营汇总按关联项目和流水聚合，统计指定年份内的开票、收票、回款、付款和利润。"
            />
            <Input
              type="number"
              className="w-36"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => setYear(Number(event.target.value) || new Date().getFullYear())}
            />
          </div>
        </div>
        <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="项目数" value={`${summary?.project_count ?? 0} 个`} />
          <SummaryCard label="合同额" value={formatCents(summary?.contract_amount_cents)} />
          <SummaryCard label="年度开票" value={formatCents(summary?.issued_invoice_amount_cents)} />
          <SummaryCard label="年度回款" value={formatCents(summary?.collection_amount_cents)} emphasis />
          <SummaryCard label="年度收票" value={formatCents(summary?.received_invoice_amount_cents)} />
          <SummaryCard label="年度付款" value={formatCents(summary?.payment_amount_cents)} />
          <SummaryCard label="年度应收" value={formatCents(summary?.receivable_balance_cents)} />
          <SummaryCard label="现金毛利" value={formatCents(summary?.cash_profit_cents)} emphasis />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h2 className="text-lg font-semibold">关联项目</h2>
            <p className="mt-1 text-sm text-slate-500">打开项目详情弹窗可查看该往来单位下的开票、收票、回款和付款明细。</p>
          </div>
          <Button className="bg-[#0f6b5d] hover:bg-[#0d5e52]" onClick={openCreateProject} disabled={!customer}>
            <Plus className="mr-2 size-4" />
            新增关联项目
          </Button>
        </div>
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[24%]">项目名称</TableHead>
              <TableHead className="w-[14%]">往来单位</TableHead>
              <TableHead className="w-[14%]">我方主体</TableHead>
              <TableHead className="w-[13%]">合同额</TableHead>
              <TableHead className="w-[11%]">负责人</TableHead>
              <TableHead className="w-[9%]">状态</TableHead>
              <TableHead className="w-[10%] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projectsQuery.isLoading ? (
              <TableRow><TableCell colSpan={7} className="h-28 text-center text-slate-500">加载中</TableCell></TableRow>
            ) : projects.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-28 text-center text-slate-500">暂无关联项目</TableCell></TableRow>
            ) : (
              projects.map((project) => (
                <TableRow
                  key={project.id}
                  className="cursor-pointer hover:bg-[#f8faf9]"
                  onClick={() => setProjectDetailId(project.id)}
                >
                  <TableCell className="truncate font-medium text-[#0f6b5d]">{project.name}</TableCell>
                  <TableCell className="truncate">{project.customer_name || "未填写"}</TableCell>
                  <TableCell className="truncate">{project.own_entity_name || "未填写"}</TableCell>
                  <TableCell>{formatCents(project.contract_amount_cents)}</TableCell>
                  <TableCell className="truncate">{project.owner_name || "未填写"}</TableCell>
                  <TableCell><Badge className={statusTone(project.status)}>{statusLabel(project.status)}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setProjectDetailId(project.id);
                      }}
                    >
                      详情
                    </Button>
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

      <Dialog open={Boolean(projectDetailId)} onOpenChange={(open) => !open && setProjectDetailId(null)}>
        <DialogContent className="flex h-[calc(100vh-24px)] max-h-[calc(100vh-24px)] w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] flex-col gap-3 overflow-hidden p-4 sm:max-w-[calc(100vw-24px)]">
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle>项目详情</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {projectDetailId ? <EnterpriseProjectDetailPage projectId={projectDetailId} embedded /> : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={projectFormOpen} onOpenChange={setProjectFormOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>新增关联项目</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submitProject}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="往来单位" value={customer?.name ?? ""} disabled onChange={() => undefined} />
              <Field label="项目名称 *" value={projectForm.name} onChange={(name) => setProjectForm({ ...projectForm, name })} />
              <Field label="项目编号" value={projectForm.project_code} onChange={(project_code) => setProjectForm({ ...projectForm, project_code })} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">我方主体</label>
                <EnterpriseOwnEntitySearchSelect
                  value={projectForm.own_entity_id}
                  selectedLabel={projectForm.own_entity_name}
                  onValueChange={(value) =>
                    setProjectForm({
                      ...projectForm,
                      own_entity_id: value,
                      own_entity_name: value ? projectForm.own_entity_name : "",
                    })
                  }
                  onEntityChange={(entity) =>
                    setProjectForm((current) => ({
                      ...current,
                      own_entity_id: entity?.id ?? "",
                      own_entity_name: entity?.name ?? "",
                    }))
                  }
                />
              </div>
              <Field label="合同金额(元)" value={projectForm.contract_amount} onChange={(contract_amount) => setProjectForm({ ...projectForm, contract_amount })} />
              <Field label="负责人" value={projectForm.owner_name} onChange={(owner_name) => setProjectForm({ ...projectForm, owner_name })} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">状态</label>
                <Select value={projectForm.status} onValueChange={(status) => setProjectForm({ ...projectForm, status: status as EnterpriseProjectStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {projectStatusOptions.filter((item) => item.value !== "all").map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field type="date" label="计划开始日期" value={projectForm.planned_start_date} onChange={(planned_start_date) => setProjectForm({ ...projectForm, planned_start_date })} />
              <Field type="date" label="计划结束日期" value={projectForm.planned_end_date} onChange={(planned_end_date) => setProjectForm({ ...projectForm, planned_end_date })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">备注</label>
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={projectForm.remark}
                onChange={(event) => setProjectForm({ ...projectForm, remark: event.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProjectFormOpen(false)}>取消</Button>
              <Button type="submit" className="bg-[#0f6b5d] hover:bg-[#0d5e52]" disabled={createProject.isPending}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold ${emphasis ? "text-[#0f6b5d]" : "text-slate-950"}`}>{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  type = "text",
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <Input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
