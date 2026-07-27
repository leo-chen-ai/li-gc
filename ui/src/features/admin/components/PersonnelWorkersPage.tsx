import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, ImageIcon, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProjectSearchSelect } from "@/features/projects/components/ProjectSearchSelect";
import {
  getControlledTablePage,
  getTotalPages,
} from "@/features/projects/lib/project-table-operations";
import { constructionProjectService } from "@/features/projects/services/construction-project-service";
import type { ConstructionPersonnelWorker } from "@/features/projects/types/construction-types";
import { getApiUrl } from "@/lib/api";

type PersonnelFilters = {
  projectId: string;
  keyword: string;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function PersonnelWorkersPage() {
  const [projectId, setProjectId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<PersonnelFilters>({
    projectId: "",
    keyword: "",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [editingWorker, setEditingWorker] = useState<ConstructionPersonnelWorker | null>(null);
  const [editingDate, setEditingDate] = useState("");
  const workers = useQuery({
    queryKey: ["management", "personnel-workers", appliedFilters, page, pageSize],
    queryFn: () =>
      constructionProjectService.listPersonnelWorkers({
        page,
        page_size: pageSize,
        project_id: appliedFilters.projectId || undefined,
        keyword: appliedFilters.keyword || undefined,
      }),
    placeholderData: (previousData) => previousData,
    staleTime: 30 * 1000,
  });
  const workerDetail = useQuery({
    queryKey: ["management", "personnel-worker", selectedWorkerId],
    queryFn: () => constructionProjectService.getPersonnelWorker(selectedWorkerId ?? ""),
    enabled: Boolean(selectedWorkerId),
    staleTime: 30 * 1000,
  });
  const queryClient = useQueryClient();
  const updateEntryTimeMutation = useMutation({
    mutationFn: ({
      projectId,
      workerId,
      entryTime,
    }: {
      projectId: string;
      workerId: string;
      entryTime: string;
    }) => constructionProjectService.updateWorker(projectId, workerId, { entry_time: entryTime }),
    onSuccess: () => {
      toast.success("进场日期修改成功");
      void queryClient.invalidateQueries({ queryKey: ["management", "personnel-workers"] });
      setEditingWorker(null);
    },
    onError: (error) => {
      toast.error("修改进场日期失败", { description: String(error) });
    },
  });
  const rows: ConstructionPersonnelWorker[] = workers.data?.items ?? [];
  const total = workers.data?.total ?? 0;
  const pageCount = getTotalPages(total, pageSize);
  const currentPage = getControlledTablePage(page, total, pageSize);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);
  const selectedWorker =
    workerDetail.data ?? rows.find((worker) => worker.id === selectedWorkerId) ?? null;

  useEffect(() => {
    if (total > 0 && page !== currentPage) setPage(currentPage);
  }, [currentPage, page, total]);

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters({
      projectId,
      keyword: keyword.trim(),
    });
  };

  const resetFilters = () => {
    setProjectId("");
    setKeyword("");
    setPage(1);
    setAppliedFilters({ projectId: "", keyword: "" });
  };

  return (
    <div className="space-y-3">
      <section className="rounded-xl border bg-white px-4 py-3 shadow-sm dark:bg-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-medium text-[#0f6b5d]">人员管理 / 人员信息列表</div>
            <h1 className="mt-1 text-xl font-semibold tracking-normal">人员信息列表</h1>
            <p className="mt-1 text-sm text-muted-foreground">汇总现有所有项目的人员数据。</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void workers.refetch()} disabled={workers.isFetching}>
            <RefreshCw className={`mr-2 size-4 ${workers.isFetching ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </section>
      <form
        className="grid gap-3 rounded-xl border bg-[#f8faf9] p-3 shadow-sm dark:bg-card md:grid-cols-[minmax(240px,1fr)_minmax(220px,1fr)_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <ProjectSearchSelect
          value={projectId}
          onValueChange={setProjectId}
          includeAllOption
          allOptionLabel="全部项目"
          className="h-9"
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索姓名、手机号、身份证号"
            className="h-9 pl-9"
          />
        </div>
        <Button type="submit" className="h-9 bg-[#0f6b5d] text-white hover:bg-[#0b5148]">
          查询
        </Button>
        <Button type="button" variant="outline" className="h-9" onClick={resetFilters}>
          重置
        </Button>
      </form>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card">
        <div className="overflow-x-auto">
          <Table>
          <TableHeader>
            <TableRow className="bg-[#f8faf9]">
              <TableHead className="w-16">头像</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>手机号</TableHead>
              <TableHead>身份证号</TableHead>
              <TableHead>所属项目</TableHead>
              <TableHead>进场时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workers.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">人员数据加载中</TableCell>
              </TableRow>
            ) : workers.isError ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-red-600">人员数据加载失败，请检查登录状态或后端服务</TableCell>
              </TableRow>
            ) : rows.length ? (
              rows.map((worker) => (
                <TableRow
                  key={worker.id}
                  className="cursor-pointer hover:bg-[#f8faf9]"
                  onClick={() => setSelectedWorkerId(worker.id)}
                >
                  <TableCell>
                    <WorkerListAvatar worker={worker} />
                  </TableCell>
                  <TableCell className="font-medium">{worker.name || "未填写"}</TableCell>
                  <TableCell>{worker.phone || "-"}</TableCell>
                  <TableCell>{worker.id_card || "-"}</TableCell>
                  <TableCell>{worker.project_name || "未命名项目"}</TableCell>
                  <TableCell>{worker.entry_time || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingWorker(worker);
                        setEditingDate(worker.entry_time ?? "");
                      }}
                    >
                      <CalendarIcon className="mr-1 size-3.5" />
                      修改进场日期
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">暂无人员数据</TableCell>
              </TableRow>
            )}
          </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-3 border-t bg-[#f8faf9] px-4 py-3 text-sm text-muted-foreground dark:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
          <span>显示 {rangeStart}-{rangeEnd} / 共 {total} 条记录</span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs">每页</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                setPage(1);
              }}
              className="h-8 rounded-md border bg-white px-2 text-sm text-foreground outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:bg-background"
              aria-label="选择每页条数"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option} 条</option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 bg-white dark:bg-background"
              disabled={workers.isFetching || currentPage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              上一页
            </Button>
            <span className="min-w-16 text-center text-xs">第 {currentPage} / {pageCount} 页</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 bg-white dark:bg-background"
              disabled={workers.isFetching || currentPage >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>
      <Dialog open={Boolean(selectedWorkerId)} onOpenChange={(open) => !open && setSelectedWorkerId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>人员详情</DialogTitle>
            <DialogDescription>仅查看系统中的人员基础数据，不在此处修改。</DialogDescription>
          </DialogHeader>
          {workerDetail.isLoading && !selectedWorker ? (
            <div className="py-8 text-center text-sm text-muted-foreground">人员详情加载中</div>
          ) : workerDetail.isError ? (
            <div className="py-8 text-center text-sm text-red-600">人员详情加载失败，请稍后重试</div>
          ) : selectedWorker ? (
            <div className="space-y-4">
              <WorkerPhotoSection worker={selectedWorker} />
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem label="姓名" value={selectedWorker.name} />
                <DetailItem label="手机号" value={selectedWorker.phone} />
                <DetailItem label="身份证号" value={selectedWorker.id_card} />
                <DetailItem label="所属项目" value={selectedWorker.project_name} />
                <DetailItem label="参建单位" value={selectedWorker.unit_name} />
                <DetailItem label="所属班组" value={selectedWorker.team_name} />
                <DetailItem label="进场时间" value={selectedWorker.entry_time} />
                <DetailItem label="退场时间" value={selectedWorker.exit_time} />
                <DetailItem label="工人状态" value={selectedWorker.work_status} />
                <DetailItem label="工种" value={selectedWorker.work_type} />
                <DetailItem label="人员类型" value={selectedWorker.worker_type} />
                <DetailItem label="结算方式" value={selectedWorker.settlement_type} />
                <DetailItem label="银行卡号" value={selectedWorker.salary_bank_card} />
                <DetailItem label="开户行" value={selectedWorker.salary_bank} />
                <DetailItem label="是否参保" value={formatBoolean(selectedWorker.has_insurance)} />
                <DetailItem label="是否重点人员" value={formatBoolean(selectedWorker.is_key_personnel)} />
                <DetailItem className="sm:col-span-2" label="现居住地址" value={selectedWorker.current_address} />
                <DetailItem className="sm:col-span-2" label="身份证地址" value={selectedWorker.address} />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editingWorker)} onOpenChange={(open) => !open && setEditingWorker(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改进场日期</DialogTitle>
            <DialogDescription>
              修改 {editingWorker?.name || "该工人"} 的进场日期。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">当前进场日期</label>
              <div className="rounded-md border bg-[#f8faf9] px-3 py-2 text-sm">
                {editingWorker?.entry_time || "未设置"}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">新进场日期</label>
              <Input
                type="date"
                value={editingDate}
                onChange={(e) => setEditingDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingWorker(null)}>
              取消
            </Button>
            <Button
              className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
              disabled={!editingDate || updateEntryTimeMutation.isPending}
              onClick={() => {
                if (editingWorker) {
                  updateEntryTimeMutation.mutate({
                    projectId: editingWorker.project_id,
                    workerId: editingWorker.id,
                    entryTime: editingDate,
                  });
                }
              }}
            >
              {updateEntryTimeMutation.isPending ? "提交中..." : "确认修改"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkerListAvatar({ worker }: { worker: ConstructionPersonnelWorker }) {
  const avatarUrl = collectPhotoUrls(worker.avatar)[0];
  const fallback = getWorkerAvatarFallback(worker.name);

  return (
    <Avatar size="lg" className="border border-slate-200 bg-emerald-50 dark:border-border dark:bg-emerald-950">
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={`${worker.name || "工人"}头像`} className="object-cover" /> : null}
      <AvatarFallback className="bg-emerald-50 font-semibold text-[#0f6b5d] dark:bg-emerald-950 dark:text-emerald-300">
        {fallback}
      </AvatarFallback>
    </Avatar>
  );
}

function getWorkerAvatarFallback(name: string | null | undefined) {
  return (name || "工").trim().slice(0, 1) || "工";
}

function WorkerPhotoSection({ worker }: { worker: ConstructionPersonnelWorker }) {
  const photos = [
    { label: "人员照片", urls: collectPhotoUrls(worker.avatar) },
    { label: "身份证正面", urls: collectPhotoUrls(worker.ocr_photo) },
    { label: "身份证反面", urls: collectPhotoUrls(worker.id_card_back_file) },
    { label: "人员签字", urls: collectPhotoUrls(worker.signature_photo) },
  ];

  return (
    <section>
      <div className="text-sm font-medium">证件照片</div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {photos.map((photo) => (
          <PhotoCard key={photo.label} label={photo.label} urls={photo.urls} />
        ))}
      </div>
    </section>
  );
}

function PhotoCard({ label, urls }: { label: string; urls: string[] }) {
  const firstUrl = urls[0];

  return (
    <div className="overflow-hidden rounded-lg border bg-[#f8faf9] dark:bg-background">
      <div className="flex h-36 items-center justify-center bg-white dark:bg-muted/20">
        {firstUrl ? (
          <a href={firstUrl} target="_blank" rel="noreferrer" className="h-full w-full">
            <img src={firstUrl} alt={label} className="h-full w-full object-contain" />
          </a>
        ) : (
          <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
            <ImageIcon className="size-6" />
            暂无照片
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="truncate text-sm font-medium">{label}</span>
        {firstUrl ? (
          <a href={firstUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-[#0f6b5d] hover:underline">
            查看
          </a>
        ) : null}
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: unknown;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 min-h-9 rounded-md border bg-[#f8faf9] px-3 py-2 text-sm break-words dark:bg-background">
        {formatValue(value)}
      </div>
    </div>
  );
}

function formatValue(value: unknown) {
  if (value == null || value === "") return "-";
  return String(value);
}

function formatBoolean(value: boolean | null | undefined) {
  if (value == null) return "-";
  return value ? "是" : "否";
}

function collectPhotoUrls(value: unknown): string[] {
  if (value == null) return [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const parsed = parseJsonValue(trimmed);
    if (parsed != null) return collectPhotoUrls(parsed);
    return [normalizePhotoUrl(trimmed)].filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPhotoUrls(item));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["public_url", "url", "image_url", "src"]) {
      const url = record[key];
      if (typeof url === "string" && url.trim()) {
        return [normalizePhotoUrl(url)];
      }
    }
  }

  return [];
}

function parseJsonValue(value: string) {
  if (!value.startsWith("{") && !value.startsWith("[")) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizePhotoUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `${window.location.protocol}${trimmed}`;

  const apiBase = getApiUrl().replace(/\/$/, "");
  if (trimmed.startsWith("/")) return `${apiBase}${trimmed}`;
  return `${apiBase}/${trimmed}`;
}
