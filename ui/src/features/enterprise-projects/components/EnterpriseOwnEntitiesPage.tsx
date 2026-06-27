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
  useCreateEnterpriseOwnEntityMutation,
  useDeleteEnterpriseOwnEntityMutation,
  useEnterpriseOwnEntitiesQuery,
  useUpdateEnterpriseOwnEntityMutation,
} from "../hooks";
import { pageRange, statusLabel, statusTone } from "../lib";
import { enterpriseProjectService } from "../services";
import type {
  EnterpriseOwnEntity,
  EnterpriseOwnEntityPayload,
  EnterpriseOwnEntityStatus,
} from "../types";

const PAGE_SIZE = 10;

type EntityFormState = {
  name: string;
  credit_code: string;
  bank_name: string;
  bank_account: string;
  contact_name: string;
  contact_phone: string;
  address: string;
  status: EnterpriseOwnEntityStatus;
  is_default: boolean;
  remark: string;
};

const emptyForm: EntityFormState = {
  name: "",
  credit_code: "",
  bank_name: "",
  bank_account: "",
  contact_name: "",
  contact_phone: "",
  address: "",
  status: "active",
  is_default: false,
  remark: "",
};

export function EnterpriseOwnEntitiesPage() {
  const [keyword, setKeyword] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<EntityFormState>(emptyForm);
  const [editing, setEditing] = useState<EnterpriseOwnEntity | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EnterpriseOwnEntity | null>(null);
  const [exporting, setExporting] = useState(false);

  const filters = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      keyword: keyword || undefined,
      status: status === "all" ? undefined : status,
    }),
    [keyword, page, status]
  );
  const entitiesQuery = useEnterpriseOwnEntitiesQuery(filters);
  const createEntity = useCreateEnterpriseOwnEntityMutation();
  const updateEntity = useUpdateEnterpriseOwnEntityMutation(editing?.id ?? "");
  const deleteEntity = useDeleteEnterpriseOwnEntityMutation();
  const rows = entitiesQuery.data?.items ?? [];
  const total = entitiesQuery.data?.total ?? 0;
  const range = pageRange(total, page, PAGE_SIZE);

  const openCreate = () => {
    setEditing(null);
    setFormState(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (entity: EnterpriseOwnEntity) => {
    setEditing(entity);
    setFormState({
      name: entity.name,
      credit_code: entity.credit_code ?? "",
      bank_name: entity.bank_name ?? "",
      bank_account: entity.bank_account ?? "",
      contact_name: entity.contact_name ?? "",
      contact_phone: entity.contact_phone ?? "",
      address: entity.address ?? "",
      status: entity.status,
      is_default: Boolean(entity.is_default),
      remark: entity.remark ?? "",
    });
    setFormOpen(true);
  };

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.name.trim()) {
      toast.error("请填写主体名称");
      return;
    }
    const payload: EnterpriseOwnEntityPayload = {
      name: formState.name.trim(),
      credit_code: formState.credit_code || undefined,
      bank_name: formState.bank_name || undefined,
      bank_account: formState.bank_account || undefined,
      contact_name: formState.contact_name || undefined,
      contact_phone: formState.contact_phone || undefined,
      address: formState.address || undefined,
      status: formState.status,
      is_default: formState.is_default,
      remark: formState.remark || undefined,
    };
    try {
      if (editing) {
        await updateEntity.mutateAsync(payload);
        toast.success("我方主体已修改");
      } else {
        await createEntity.mutateAsync(payload);
        toast.success("我方主体已新增");
      }
      setFormOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteEntity.mutateAsync(pendingDelete.id);
      toast.success("我方主体已删除");
      setPendingDelete(null);
    } catch {
      toast.error("删除失败");
    }
  };

  const exportEntities = async () => {
    setExporting(true);
    try {
      const blob = await enterpriseProjectService.exportOwnEntities(filters);
      downloadBlob(blob, `我方主体-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success("我方主体已导出");
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
            <h1 className="mt-1 text-xl font-semibold tracking-normal">我方主体管理</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={exporting} onClick={exportEntities}>
              <Download className="mr-2 size-4" />
              导出数据
            </Button>
            <Button className="bg-[#0f6b5d] hover:bg-[#0d5e52]" onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              新增主体
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 lg:grid-cols-[minmax(260px,1fr)_220px_auto]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="主体名称、税号、开户行、账号、联系人"
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
          <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">启用</SelectItem>
              <SelectItem value="inactive">停用</SelectItem>
              <SelectItem value="archived">归档</SelectItem>
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
              <TableHead className="w-[20%]">主体名称</TableHead>
              <TableHead className="w-[18%]">税号</TableHead>
              <TableHead className="w-[22%]">开户行 / 账号</TableHead>
              <TableHead className="w-[13%]">联系人</TableHead>
              <TableHead className="w-[8%]">默认</TableHead>
              <TableHead className="w-[8%]">状态</TableHead>
              <TableHead className="w-[11%] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entitiesQuery.isLoading ? (
              <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-500">加载中</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-500">暂无我方主体</TableCell></TableRow>
            ) : (
              rows.map((entity) => (
                <TableRow key={entity.id}>
                  <TableCell className="min-w-0">
                    <div className="truncate font-medium text-[#0f6b5d]" title={entity.name}>{entity.name}</div>
                    <div className="truncate text-xs text-slate-500">{entity.address || "未填写地址"}</div>
                  </TableCell>
                  <TableCell className="truncate">{entity.credit_code || "未填写"}</TableCell>
                  <TableCell className="truncate">
                    {entity.bank_name || "未填写"}
                    <div className="truncate text-xs text-slate-500">{entity.bank_account || "-"}</div>
                  </TableCell>
                  <TableCell className="truncate">
                    {entity.contact_name || "未填写"}
                    <div className="truncate text-xs text-slate-500">{entity.contact_phone || "-"}</div>
                  </TableCell>
                  <TableCell>{entity.is_default ? "是" : "否"}</TableCell>
                  <TableCell><Badge className={statusTone(entity.status)}>{statusLabel(entity.status)}</Badge></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(entity)}>
                        <Pencil className="mr-1 size-4" />
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setPendingDelete(entity)}
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
          <DialogHeader><DialogTitle>{editing ? "编辑我方主体" : "新增我方主体"}</DialogTitle></DialogHeader>
          <form className="grid gap-4" onSubmit={submitForm}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="主体名称 *" value={formState.name} onChange={(name) => setFormState({ ...formState, name })} />
              <Field label="统一社会信用代码" value={formState.credit_code} onChange={(credit_code) => setFormState({ ...formState, credit_code })} />
              <Field label="开户行" value={formState.bank_name} onChange={(bank_name) => setFormState({ ...formState, bank_name })} />
              <Field label="银行账号" value={formState.bank_account} onChange={(bank_account) => setFormState({ ...formState, bank_account })} />
              <Field label="联系人" value={formState.contact_name} onChange={(contact_name) => setFormState({ ...formState, contact_name })} />
              <Field label="联系电话" value={formState.contact_phone} onChange={(contact_phone) => setFormState({ ...formState, contact_phone })} />
              <Field label="地址" value={formState.address} onChange={(address) => setFormState({ ...formState, address })} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">状态</label>
                <Select value={formState.status} onValueChange={(value) => setFormState({ ...formState, status: value as EnterpriseOwnEntityStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">启用</SelectItem>
                    <SelectItem value="inactive">停用</SelectItem>
                    <SelectItem value="archived">归档</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={formState.is_default}
                  onChange={(event) => setFormState({ ...formState, is_default: event.target.checked })}
                />
                默认主体
              </label>
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
              <Button type="submit" className="bg-[#0f6b5d] hover:bg-[#0d5e52]" disabled={createEntity.isPending || updateEntity.isPending}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>删除我方主体</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">确认删除“{pendingDelete?.name}”？已关联的历史记录不会删除。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteEntity.isPending}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
