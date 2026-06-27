import { Link } from "@tanstack/react-router";
import { Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
  useDeleteEnterpriseProjectMutation,
  useEnterpriseProjectsQuery,
  useUpdateEnterpriseProjectMutation,
} from "../hooks";
import { enterpriseProjectService } from "../services";
import type { EnterpriseProject, EnterpriseProjectPayload, EnterpriseProjectStatus } from "../types";
import {
  formatCents,
  pageRange,
  projectStatusOptions,
  statusLabel,
  statusTone,
} from "../lib";
import { EnterpriseCustomerSearchSelect, EnterpriseOwnEntitySearchSelect } from "./EnterpriseSearchSelect";

const PAGE_SIZE = 10;

type ProjectFormState = {
  project_code: string;
  name: string;
  customer_id: string;
  customer_name: string;
  own_entity_id: string;
  own_entity_name: string;
  contract_amount: string;
  owner_name: string;
  status: EnterpriseProjectStatus;
  planned_start_date: string;
  planned_end_date: string;
  remark: string;
};

const emptyForm: ProjectFormState = {
  project_code: "",
  name: "",
  customer_id: "",
  customer_name: "",
  own_entity_id: "",
  own_entity_name: "",
  contract_amount: "",
  owner_name: "",
  status: "active",
  planned_start_date: "",
  planned_end_date: "",
  remark: "",
};

export function EnterpriseProjectsPage() {
  const [keyword, setKeyword] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<ProjectFormState>(emptyForm);
  const [editing, setEditing] = useState<EnterpriseProject | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EnterpriseProject | null>(null);

  const filters = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      keyword: keyword || undefined,
      status: status === "all" ? undefined : status,
    }),
    [keyword, page, status]
  );
  const projectsQuery = useEnterpriseProjectsQuery(filters);
  const createProject = useCreateEnterpriseProjectMutation();
  const updateProject = useUpdateEnterpriseProjectMutation(editing?.id ?? "");
  const deleteProject = useDeleteEnterpriseProjectMutation();
  const rows = projectsQuery.data?.items ?? [];
  const total = projectsQuery.data?.total ?? 0;
  const range = pageRange(total, page, PAGE_SIZE);
  const contractTotal = rows.reduce((sum, row) => sum + row.contract_amount_cents, 0);

  const openCreate = () => {
    setEditing(null);
    setFormState(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (project: EnterpriseProject) => {
    setEditing(project);
    setFormState({
      project_code: project.project_code ?? "",
      name: project.name,
      customer_id: project.customer_id ?? "",
      customer_name: project.customer_name ?? "",
      own_entity_id: project.own_entity_id ?? "",
      own_entity_name: project.own_entity_name ?? "",
      contract_amount: String((project.contract_amount_cents ?? 0) / 100),
      owner_name: project.owner_name ?? "",
      status: project.status,
      planned_start_date: project.planned_start_date ?? "",
      planned_end_date: project.planned_end_date ?? "",
      remark: project.remark ?? "",
    });
    setFormOpen(true);
  };

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.name.trim()) {
      toast.error("请填写项目名称");
      return;
    }
    const payload: EnterpriseProjectPayload = {
      project_code: formState.project_code || undefined,
      name: formState.name,
      customer_id: formState.customer_id || undefined,
      customer_name: formState.customer_name || undefined,
      own_entity_id: formState.own_entity_id || undefined,
      own_entity_name: formState.own_entity_name || undefined,
      contract_amount: formState.contract_amount || "0",
      owner_name: formState.owner_name || undefined,
      status: formState.status,
      planned_start_date: formState.planned_start_date || undefined,
      planned_end_date: formState.planned_end_date || undefined,
      remark: formState.remark || undefined,
    };
    try {
      if (editing) {
        await updateProject.mutateAsync(payload);
        toast.success("往来单位关联项目已修改");
      } else {
        await createProject.mutateAsync(payload);
        toast.success("往来单位关联项目已新增");
      }
      setFormOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const exportRows = async () => {
    try {
      const blob = await enterpriseProjectService.exportProjects(filters);
      downloadBlob(blob, `往来单位关联项目-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      toast.error("导出失败");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteProject.mutateAsync(pendingDelete.id);
      toast.success("往来单位关联项目已删除");
      setPendingDelete(null);
    } catch {
      toast.error("删除失败");
    }
  };

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-[#0f6b5d]">企业经营模块</div>
            <h1 className="mt-1 text-xl font-semibold tracking-normal">往来单位关联项目管理</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportRows}>
              <Download className="mr-2 size-4" />
              导出数据
            </Button>
            <Button className="bg-[#0f6b5d] hover:bg-[#0d5e52]" onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              新增关联项目
            </Button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Metric label="项目数量" value={`${total} 个`} />
          <Metric label="本页合同额" value={formatCents(contractTotal)} />
          <Metric label="当前筛选" value={status === "all" ? "全部状态" : statusLabel(status)} />
        </div>
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 lg:grid-cols-[minmax(260px,1fr)_220px_auto]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="项目名称、编号、往来单位、负责人"
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
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projectStatusOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="bg-[#0f6b5d] hover:bg-[#0d5e52]"
            onClick={() => {
              setPage(1);
              setKeyword(keywordDraft.trim());
            }}
          >
            查询
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[20%]">项目名称</TableHead>
              <TableHead className="w-[13%]">往来单位</TableHead>
              <TableHead className="w-[13%]">我方主体</TableHead>
              <TableHead className="w-[11%]">合同额</TableHead>
              <TableHead className="w-[10%]">负责人</TableHead>
              <TableHead className="w-[11%]">计划周期</TableHead>
              <TableHead className="w-[8%]">状态</TableHead>
              <TableHead className="w-[14%] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projectsQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-slate-500">
                  加载中
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-slate-500">
                  暂无往来单位关联项目
                </TableCell>
              </TableRow>
            ) : (
              rows.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="min-w-0">
                    <Link
                      to="/app/admin/enterprise-projects/$projectId"
                      params={{ projectId: project.id }}
                      className="block truncate font-medium text-[#0f6b5d] hover:underline"
                    >
                      {project.name}
                    </Link>
                    <div className="truncate text-xs text-slate-500">
                      {project.project_code || "未填写编号"}
                    </div>
                  </TableCell>
                  <TableCell className="truncate">{project.customer_name || "未填写"}</TableCell>
                  <TableCell className="truncate">{project.own_entity_name || "未填写"}</TableCell>
                  <TableCell>{formatCents(project.contract_amount_cents)}</TableCell>
                  <TableCell className="truncate">{project.owner_name || "未填写"}</TableCell>
                  <TableCell className="truncate text-xs text-slate-600">
                    {project.planned_start_date || "--"} 至 {project.planned_end_date || "--"}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusTone(project.status)}>{statusLabel(project.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(project)}>
                        <Pencil className="mr-1 size-4" />
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setPendingDelete(project)}
                      >
                        <Trash2 className="mr-1 size-4" />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-slate-500">
          <span>
            显示 {range.start}-{range.end} 条，共 {total} 条
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </Button>
            <span className="min-w-12 text-center">
              {page}/{range.pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= range.pageCount}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑往来单位关联项目" : "新增往来单位关联项目"}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submitForm}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="项目名称 *" value={formState.name} onChange={(value) => setFormState({ ...formState, name: value })} />
              <Field label="项目编号" value={formState.project_code} onChange={(value) => setFormState({ ...formState, project_code: value })} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">往来单位</label>
                <EnterpriseCustomerSearchSelect
                  value={formState.customer_id}
                  selectedLabel={formState.customer_name}
                  onValueChange={(value) =>
                    setFormState({
                      ...formState,
                      customer_id: value,
                      customer_name: value ? formState.customer_name : "",
                    })
                  }
                  onCustomerChange={(customer) =>
                    setFormState((current) => ({
                      ...current,
                      customer_id: customer?.id ?? "",
                      customer_name: customer?.name ?? "",
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">我方主体</label>
                <EnterpriseOwnEntitySearchSelect
                  value={formState.own_entity_id}
                  selectedLabel={formState.own_entity_name}
                  onValueChange={(value) =>
                    setFormState({
                      ...formState,
                      own_entity_id: value,
                      own_entity_name: value ? formState.own_entity_name : "",
                    })
                  }
                  onEntityChange={(entity) =>
                    setFormState((current) => ({
                      ...current,
                      own_entity_id: entity?.id ?? "",
                      own_entity_name: entity?.name ?? "",
                    }))
                  }
                />
              </div>
              <Field label="合同金额(元)" value={formState.contract_amount} onChange={(value) => setFormState({ ...formState, contract_amount: value })} />
              <Field label="负责人" value={formState.owner_name} onChange={(value) => setFormState({ ...formState, owner_name: value })} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">状态</label>
                <Select value={formState.status} onValueChange={(value) => setFormState({ ...formState, status: value as EnterpriseProjectStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {projectStatusOptions.filter((item) => item.value !== "all").map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field type="date" label="计划开始" value={formState.planned_start_date} onChange={(value) => setFormState({ ...formState, planned_start_date: value })} />
              <Field type="date" label="计划结束" value={formState.planned_end_date} onChange={(value) => setFormState({ ...formState, planned_end_date: value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">备注</label>
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={formState.remark}
                onChange={(event) => setFormState({ ...formState, remark: event.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
              <Button type="submit" className="bg-[#0f6b5d] hover:bg-[#0d5e52]" disabled={createProject.isPending || updateProject.isPending}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除往来单位关联项目</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            确认删除“{pendingDelete?.name}”？删除后列表不再显示。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteProject.isPending}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="truncate text-base font-semibold">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
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
