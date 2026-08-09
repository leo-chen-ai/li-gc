import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useSearch } from "@tanstack/react-router";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  useAttendanceDeviceIssueReportsQuery,
  useCreateAttendanceDeviceIssueReportMutation,
  useDeleteAttendanceDeviceIssueReportMutation,
  useProjectAttendanceDevicesQuery,
  useProjectOptionsQuery,
  useProjectWorkersQuery,
} from "@/features/projects/hooks/use-construction-projects";
import type {
  ConstructionAttendanceDeviceIssueAction,
  ConstructionAttendanceDeviceIssueReport,
  ConstructionAttendanceDeviceIssueReportPayload,
  ConstructionAttendanceDeviceIssueStatus,
} from "@/features/projects/types/construction-types";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const statusOptions = [
  { value: "pending", label: "下发中" },
  { value: "success", label: "成功" },
  { value: "failed", label: "失败" },
] as const;

const actionOptions = [
  { value: "create", label: "新增" },
  { value: "update", label: "修改" },
  { value: "delete", label: "删除" },
] as const;

type IssueReportFormState = {
  project_id: string;
  worker_id: string;
  attendance_device_id: string;
  action: ConstructionAttendanceDeviceIssueAction;
  issued_at: string;
  message: string;
  remark: string;
};

const defaultFormState: IssueReportFormState = {
  project_id: "",
  worker_id: "",
  attendance_device_id: "",
  action: "create",
  issued_at: "",
  message: "",
  remark: "",
};

export function AttendanceDeviceIssueReportsPage() {
  const searchParams = useSearch({ strict: false }) as {
    project_id?: string;
    attendance_device_id?: string;
    device_name?: string;
    serial_number?: string;
    include_delete_actions?: string;
  };
  const projectsQuery = useProjectOptionsQuery();
  const projects = projectsQuery.data ?? [];
  const searchProjectId = searchParams.project_id ?? "";
  const attendanceDeviceId = searchParams.attendance_device_id ?? "";
  const searchDeviceLabel = [searchParams.device_name, searchParams.serial_number]
    .filter(Boolean)
    .join(" / ");
  const includeDeleteActions = searchParams.include_delete_actions === "1";
  const [selectedProjectId, setSelectedProjectId] = useState(searchProjectId);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [action, setAction] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [formOpen, setFormOpen] = useState(false);
  const [reportPendingDelete, setReportPendingDelete] = useState<ConstructionAttendanceDeviceIssueReport | null>(null);
  const [form, setForm] = useState<IssueReportFormState>(defaultFormState);
  const [workerKeyword, setWorkerKeyword] = useState("");
  const [deviceKeyword, setDeviceKeyword] = useState("");

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0]?.id ?? "");
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    setPage(1);
  }, [action, attendanceDeviceId, keyword, pageSize, selectedProjectId, status]);

  useEffect(() => {
    if (searchProjectId) setSelectedProjectId(searchProjectId);
  }, [searchProjectId]);

  const filters = useMemo(
    () => ({
      page,
      page_size: pageSize,
      keyword: keyword.trim() || undefined,
      project_id: selectedProjectId || undefined,
      attendance_device_id: attendanceDeviceId || undefined,
      status: status === "all" ? undefined : status,
      action: action === "all" ? undefined : action,
      include_delete_actions: includeDeleteActions ? "1" : undefined,
    }),
    [action, attendanceDeviceId, includeDeleteActions, keyword, page, pageSize, selectedProjectId, status]
  );

  const reportsQuery = useAttendanceDeviceIssueReportsQuery(filters);
  const reports = reportsQuery.data?.items ?? [];
  const total = reportsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);
  const successCount = reports.filter((report) => report.status === "success").length;
  const pendingCount = reports.filter((report) => report.status === "pending").length;
  const failedCount = reports.filter((report) => report.status === "failed").length;
  const scopedDeviceLabel = getScopedDeviceLabel(attendanceDeviceId, reports, searchDeviceLabel);

  const workerOptionsQuery = useProjectWorkersQuery(form.project_id, {
    page: 1,
    page_size: 100,
    keyword: workerKeyword.trim() || undefined,
  });
  const deviceOptionsQuery = useProjectAttendanceDevicesQuery(form.project_id, {
    page: 1,
    page_size: 100,
    keyword: deviceKeyword.trim() || undefined,
  });

  const createReport = useCreateAttendanceDeviceIssueReportMutation();
  const deleteReport = useDeleteAttendanceDeviceIssueReportMutation();
  const isSaving = createReport.isPending;

  const handleSearch = () => {
    if (page !== 1) {
      setPage(1);
      return;
    }
    void reportsQuery.refetch();
  };

  const handleResetFilters = () => {
    setSelectedProjectId(searchProjectId || projects[0]?.id || "");
    setKeyword("");
    setStatus("all");
    setAction("all");
    setPage(1);
  };

  const openCreateDialog = () => {
    const projectId = selectedProjectId || projects[0]?.id || "";
    setForm({
      ...defaultFormState,
      project_id: projectId,
      issued_at: toDateTimeLocalValue(new Date()),
    });
    setWorkerKeyword("");
    setDeviceKeyword("");
    setFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.project_id) {
      toast.error("请选择项目");
      return;
    }
    if (!form.worker_id) {
      toast.error("请选择工人");
      return;
    }
    if (!form.attendance_device_id) {
      toast.error("请选择考勤机");
      return;
    }
    if (!form.issued_at) {
      toast.error("请选择下发时间");
      return;
    }

    const issuedAt = new Date(form.issued_at);
    if (Number.isNaN(issuedAt.getTime())) {
      toast.error("下发时间格式不正确");
      return;
    }

    const payload: ConstructionAttendanceDeviceIssueReportPayload = {
      project_id: form.project_id,
      worker_id: form.worker_id,
      attendance_device_id: form.attendance_device_id,
      action: form.action,
      issued_at: issuedAt.toISOString(),
      message: form.message.trim() || null,
      remark: form.remark.trim() || null,
    };

    try {
      await createReport.mutateAsync(payload);
      setSelectedProjectId(form.project_id);
      toast.success("下发命令已发送，等待设备回执");
      setFormOpen(false);
      setForm(defaultFormState);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "新增下发记录失败");
    }
  };

  const handleDelete = async () => {
    if (!reportPendingDelete) return;

    try {
      await deleteReport.mutateAsync(reportPendingDelete.id);
      toast.success("下发记录已删除");
      setReportPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除下发记录失败");
    }
  };

  const handleFormProjectChange = (projectId: string) => {
    setForm((current) => ({
      ...current,
      project_id: projectId,
      worker_id: "",
      attendance_device_id: "",
    }));
    setWorkerKeyword("");
    setDeviceKeyword("");
  };

  return (
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="grid gap-4 border-b border-slate-100 px-5 py-3 dark:border-border lg:grid-cols-[minmax(420px,1fr)_auto] lg:items-center">
          <div className="grid gap-2 sm:grid-cols-4">
            <CompactStat label="当前记录" value={total} helper="筛选范围内" />
            <CompactStat label="本页成功" value={successCount} helper="已完成下发" accent="teal" />
            <CompactStat label="本页下发中" value={pendingCount} helper="等待回执" accent="amber" />
            <CompactStat label="本页失败" value={failedCount} helper="需要处理" accent="red" />
          </div>

          <Button
            className="h-9 gap-2 justify-self-start bg-[#0f6b5d] text-white hover:bg-[#0b5148] lg:justify-self-end"
            onClick={openCreateDialog}
            disabled={projects.length === 0}
          >
            <Plus className="size-4" />
            新增下发记录
          </Button>
        </div>

        <div className="grid gap-3 bg-[#f8faf9] px-5 py-3 dark:bg-muted/30 lg:grid-cols-[minmax(220px,1fr)_minmax(280px,1.2fr)_160px_160px_auto] lg:items-end">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">选择项目</span>
            <ProjectSearchSelect
              value={selectedProjectId}
              onValueChange={setSelectedProjectId}
              includeAllOption
              allOptionLabel="全部项目"
              disabled={projectsQuery.isLoading}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">搜索</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSearch();
                  }
                }}
                placeholder="搜索姓名、身份证、手机号、考勤机、项目"
                className="h-10 rounded-lg border-slate-200 bg-white pl-9 focus-visible:border-[#0f6b5d] focus-visible:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
              />
            </div>
          </label>

          <FilterSelect
            label="下发状态"
            value={status}
            onValueChange={setStatus}
            options={[{ value: "all", label: "全部状态" }, ...statusOptions]}
          />
          <FilterSelect
            label="下发动作"
            value={action}
            onValueChange={setAction}
            options={[{ value: "all", label: "全部动作" }, ...actionOptions]}
          />
          <div className="flex items-end gap-2 lg:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 border-slate-200 bg-white dark:border-border dark:bg-background"
              onClick={handleResetFilters}
            >
              <RotateCcw className="size-4" />
              重置
            </Button>
            <Button
              type="button"
              className="h-10 gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
              onClick={handleSearch}
              disabled={reportsQuery.isFetching}
            >
              {reportsQuery.isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              查询
            </Button>
          </div>
          {attendanceDeviceId ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 lg:col-span-5">
              当前考勤机：{scopedDeviceLabel}
            </div>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-border">
          <div>
            <h2 className="text-base font-semibold tracking-normal">下发记录</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
              {reportsQuery.isLoading
                ? "下发记录加载中"
                : reportsQuery.isError
                  ? "下发记录加载失败，请检查登录状态或后端服务"
                  : `显示 ${rangeStart}-${rangeEnd} 条，共 ${total} 条`}
            </p>
          </div>
        </div>

        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow className="bg-[#f8faf9] hover:bg-[#f8faf9] dark:bg-muted/30 dark:hover:bg-muted/30">
              <TableHead className="w-[14%] px-5 text-slate-500 dark:text-muted-foreground">工人</TableHead>
              <TableHead className="w-[12%] text-slate-500 dark:text-muted-foreground">项目</TableHead>
              <TableHead className="w-[12%] text-slate-500 dark:text-muted-foreground">考勤机</TableHead>
              <TableHead className="w-[9%] text-slate-500 dark:text-muted-foreground">下发时间</TableHead>
              <TableHead className="w-[6%] text-slate-500 dark:text-muted-foreground">状态</TableHead>
              <TableHead className="w-[7%] text-slate-500 dark:text-muted-foreground">动作</TableHead>
              <TableHead className="w-[33%] text-slate-500 dark:text-muted-foreground">回执/原因</TableHead>
              <TableHead className="w-[7%] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.length > 0 ? (
              reports.map((report) => (
                <TableRow key={report.id} className="hover:bg-[#f8faf9]/70 dark:hover:bg-muted/30">
                  <TableCell className="px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-9 shrink-0 border border-slate-200 dark:border-border">
                        {report.avatar_url ? <AvatarImage src={report.avatar_url} alt={report.worker_name ?? "工人"} /> : null}
                        <AvatarFallback className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          {report.worker_name?.slice(0, 1) || <UserRound className="size-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{report.worker_name || "未关联工人"}</div>
                        <div className="mt-1 truncate text-xs text-slate-500 dark:text-muted-foreground">
                          {report.worker_phone || report.worker_id_card || "-"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="truncate text-sm text-slate-700 dark:text-muted-foreground" title={report.project_name || report.project_id}>
                      {report.project_name || report.project_id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-0">
                      <div className="truncate text-sm text-slate-700 dark:text-muted-foreground" title={report.device_name || ""}>
                        {report.device_name || "未关联考勤机"}
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-slate-500 dark:text-muted-foreground" title={report.serial_number || ""}>
                        {report.serial_number || "-"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700 dark:text-muted-foreground">
                    {formatDateTime(report.issued_at)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={report.status} />
                  </TableCell>
                  <TableCell>
                    <ActionBadge action={report.action} />
                  </TableCell>
                  <TableCell>
                    <IssueMessage report={report} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                        onClick={() => setReportPendingDelete(report)}
                      >
                        <Trash2 className="size-4" />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="h-28 text-center text-sm text-slate-500 dark:text-muted-foreground">
                  {reportsQuery.isLoading
                    ? "正在加载下发记录"
                    : reportsQuery.isError
                      ? "下发记录加载失败，请重新登录或检查后端服务"
                      : "暂无符合条件的下发记录"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-[#f8faf9] px-5 py-3 text-sm text-slate-500 dark:border-border dark:bg-muted/30 dark:text-muted-foreground">
          <span>显示 {rangeStart}-{rangeEnd} 条，共 {total} 条</span>
          <div className="flex items-center gap-2">
            <span className="text-xs">每页</span>
            <select
              value={pageSize}
              onChange={(event) => { setPageSize(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]); setPage(1); }}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background dark:text-foreground"
              aria-label="选择每页条数"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (<option key={option} value={option}>{option} 条</option>))}
            </select>
            <Button type="button" variant="outline" size="sm" disabled={page <= 1 || reportsQuery.isLoading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              上一页
            </Button>
            <span className="min-w-12 text-center text-slate-700 dark:text-foreground">
              {page}/{totalPages}
            </span>
            <Button type="button" variant="outline" size="sm" disabled={page >= totalPages || reportsQuery.isLoading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
              下一页
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>下发人员到考勤机</DialogTitle>
            <DialogDescription>
              选择项目工人和在线考勤机后，系统会直接向设备发送人员资料。
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">项目 *</span>
              <ProjectSearchSelect
                value={form.project_id}
                onValueChange={handleFormProjectChange}
                allOptionLabel="请选择项目"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <SearchSelect
                label="项目工人 *"
                value={form.worker_id}
                onValueChange={(workerId) => setForm((current) => ({ ...current, worker_id: workerId }))}
                keyword={workerKeyword}
                onKeywordChange={setWorkerKeyword}
                disabled={!form.project_id}
                loading={workerOptionsQuery.isFetching}
                placeholder="搜索工人姓名、身份证、手机号"
                emptyText={form.project_id ? "暂无匹配工人" : "请先选择项目"}
                options={(workerOptionsQuery.data?.items ?? []).map((worker) => ({
                  value: worker.id,
                  title: worker.name || worker.id,
                  description: [worker.phone, worker.id_card].filter(Boolean).join(" / "),
                  raw: worker,
                }))}
                renderSelected={(worker) => worker?.name || worker?.id || "请选择工人"}
                renderOption={(worker) => (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{worker.name || worker.id}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-muted-foreground">
                      {[worker.phone, worker.id_card].filter(Boolean).join(" / ") || "未填写证件信息"}
                    </span>
                  </span>
                )}
              />

              <SearchSelect
                label="考勤机 *"
                value={form.attendance_device_id}
                onValueChange={(deviceId) => setForm((current) => ({ ...current, attendance_device_id: deviceId }))}
                keyword={deviceKeyword}
                onKeywordChange={setDeviceKeyword}
                disabled={!form.project_id}
                loading={deviceOptionsQuery.isFetching}
                placeholder="搜索设备名字、序列号、厂家"
                emptyText={form.project_id ? "暂无匹配考勤机" : "请先选择项目"}
                options={(deviceOptionsQuery.data?.items ?? []).map((device) => ({
                  value: device.id,
                  title: device.device_name || device.serial_number || device.id,
                  description: [device.device_type, device.serial_number].filter(Boolean).join(" / "),
                  raw: device,
                }))}
                renderSelected={(device) => device?.device_name || device?.serial_number || device?.id || "请选择考勤机"}
                renderOption={(device) => (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{device.device_name || device.serial_number || device.id}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-muted-foreground">
                      {[device.device_type, device.serial_number].filter(Boolean).join(" / ") || "未填写序列号"}
                    </span>
                  </span>
                )}
              />

              <FilterSelect
                label="下发动作"
                value={form.action}
                onValueChange={(nextAction) =>
                  setForm((current) => ({
                    ...current,
                    action: isIssueAction(nextAction) ? nextAction : "create",
                  }))
                }
                options={actionOptions}
              />

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">下发状态</span>
                <div className="flex h-10 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                  等待设备回执
                </div>
              </div>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">下发时间 *</span>
                <Input
                  type="datetime-local"
                  value={form.issued_at}
                  onChange={(event) => setForm((current) => ({ ...current, issued_at: event.target.value }))}
                  className="h-10"
                  required
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">回执消息</span>
                <Input
                  value={form.message}
                  onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                  placeholder="例如：等待设备回执"
                  className="h-10"
                />
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">备注</span>
              <Input
                value={form.remark}
                onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
                placeholder="补充说明"
                className="h-10"
              />
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isSaving} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]">
                {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                下发
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reportPendingDelete)} onOpenChange={(open) => !open && setReportPendingDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除下发记录</DialogTitle>
            <DialogDescription>
              确认删除「{reportPendingDelete?.worker_name || "未关联工人"}」的下发记录？删除后列表不再显示。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReportPendingDelete(null)}>
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteReport.isPending}>
              {deleteReport.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type SearchOption<T> = {
  value: string;
  title: string;
  description?: string;
  raw: T;
};

function SearchSelect<T>({
  label,
  value,
  onValueChange,
  keyword,
  onKeywordChange,
  options,
  placeholder,
  emptyText,
  disabled,
  loading,
  renderSelected,
  renderOption,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  options: SearchOption<T>[];
  placeholder: string;
  emptyText: string;
  disabled?: boolean;
  loading?: boolean;
  renderSelected: (item: T | undefined) => string;
  renderOption: (item: T) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value)?.raw;
  const labelText = value ? renderSelected(selected) : label.replace(" *", "");

  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-10 w-full justify-between gap-2 border-slate-200 bg-white px-3 text-left font-normal dark:border-border dark:bg-background"
            title={labelText}
          >
            <span className={cn("min-w-0 flex-1 truncate", !value && "text-slate-500 dark:text-muted-foreground")}>
              {labelText}
            </span>
            {loading ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" />
            ) : (
              <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          portalled={false}
          className="max-h-[var(--radix-popover-content-available-height)] w-[--radix-popover-trigger-width] min-w-[320px] overflow-hidden p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput value={keyword} onValueChange={onKeywordChange} placeholder={placeholder} />
            <CommandList className="max-h-72 overflow-y-auto">
              <CommandEmpty>{loading ? "搜索中..." : emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                    className="items-start"
                  >
                    <Check className={cn("mt-0.5 size-4", value === option.value ? "opacity-100" : "opacity-0")} />
                    {renderOption(option.raw)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </label>
  );
}

function CompactStat({
  label,
  value,
  helper,
  accent = "slate",
}: {
  label: string;
  value: number | string;
  helper: string;
  accent?: "slate" | "teal" | "amber" | "red";
}) {
  const accentClass = {
    slate: "text-slate-950 dark:text-foreground",
    teal: "text-[#0f6b5d] dark:text-primary",
    amber: "text-amber-700 dark:text-amber-300",
    red: "text-red-700 dark:text-red-300",
  }[accent];

  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-[#f8faf9] px-3 py-2 dark:border-border dark:bg-muted/30">
      <div className="truncate text-xs font-medium text-slate-500 dark:text-muted-foreground">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold leading-none ${accentClass}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500 dark:text-muted-foreground">{helper}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: ConstructionAttendanceDeviceIssueStatus }) {
  const config = {
    success: {
      label: "成功",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    },
    pending: {
      label: "下发中",
      className:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
    },
    failed: {
      label: "失败",
      className:
        "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
    },
  }[status];

  return (
    <Badge variant="outline" className={`rounded-md ${config.className}`}>
      {config.label}
    </Badge>
  );
}

function IssueMessage({ report }: { report: ConstructionAttendanceDeviceIssueReport }) {
  const message = readableIssueMessage(report);
  if (!message) {
    return <span className="text-xs text-slate-400 dark:text-muted-foreground">-</span>;
  }

  return (
    <div
      className={cn(
        "line-clamp-2 max-w-[620px] whitespace-normal break-words text-xs leading-5",
        report.status === "failed"
          ? "text-red-600 dark:text-red-400"
          : "text-slate-500 dark:text-muted-foreground"
      )}
      title={message}
    >
      {message}
    </div>
  );
}

function ActionBadge({ action }: { action: ConstructionAttendanceDeviceIssueAction }) {
  const config = {
    create: {
      label: "新增",
      className:
        "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
    },
    update: {
      label: "修改",
      className:
        "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
    },
    delete: {
      label: "删除",
      className:
        "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
    },
  }[action];

  return (
    <Badge variant="outline" className={`rounded-md ${config.className}`}>
      {config.label}
    </Badge>
  );
}

function readableIssueMessage(report: ConstructionAttendanceDeviceIssueReport) {
  const message = report.message?.trim();
  if (!message) {
    if (report.status === "pending") return "等待设备回执";
    if (report.status === "success") return "设备已确认";
    return "";
  }

  return message.replace(
    "Get pic Person Feature err, please change a pic",
    "人脸照片提取特征失败，请更换清晰正脸照"
  );
}

function getScopedDeviceLabel(
  attendanceDeviceId: string,
  reports: ConstructionAttendanceDeviceIssueReport[],
  fallbackLabel: string
) {
  if (!attendanceDeviceId) return "";
  const report = reports.find((item) => item.attendance_device_id === attendanceDeviceId);
  const label = [report?.device_name, report?.serial_number].filter(Boolean).join(" / ");
  return label || fallbackLabel || attendanceDeviceId;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function toDateTimeLocalValue(date: Date) {
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function isIssueAction(value: string): value is ConstructionAttendanceDeviceIssueAction {
  return actionOptions.some((option) => option.value === value);
}
