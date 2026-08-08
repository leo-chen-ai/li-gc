import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ProjectSearchSelect } from "@/features/projects/components/ProjectSearchSelect";
import {
  useAttendanceAlertConfigsQuery,
  useAttendanceAlertLogsQuery,
  useCreateAttendanceAlertConfigMutation,
  useDeleteAttendanceAlertConfigMutation,
  useProjectOptionsQuery,
  useRunAttendanceAlertsMutation,
  useUpdateAttendanceAlertConfigMutation,
} from "@/features/projects/hooks/use-construction-projects";
import type {
  ConstructionAttendanceAlertCategory,
  ConstructionAttendanceAlertConfig,
  ConstructionAttendanceAlertConfigPayload,
  ConstructionAttendanceAlertLog,
  JsonValue,
} from "@/features/projects/types/construction-types";
import {
  attendanceAlertCategoryLabel,
  attendanceAlertStatusLabel,
  attendanceAlertTabs,
  formatAttendanceAlertRunSummary,
  type AttendanceAlertTabKey,
} from "../lib";

const PAGE_SIZE = 10;

type ConfigFormState = {
  project_id: string;
  is_enabled: boolean;
  check_managers: boolean;
  check_workers: boolean;
  check_supervisors: boolean;
  remark: string;
};

const defaultFormState: ConfigFormState = {
  project_id: "",
  is_enabled: true,
  check_managers: true,
  check_workers: true,
  check_supervisors: true,
  remark: "",
};

export function AttendanceAlertsPage() {
  const projectsQuery = useProjectOptionsQuery();
  const projects = projectsQuery.data ?? [];
  const [activeTab, setActiveTab] = useState<AttendanceAlertTabKey>("configs");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [configKeyword, setConfigKeyword] = useState("");
  const [configPage, setConfigPage] = useState(1);
  const [logKeyword, setLogKeyword] = useState("");
  const [logCategory, setLogCategory] = useState<ConstructionAttendanceAlertCategory | "all">("all");
  const [logDate, setLogDate] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ConstructionAttendanceAlertConfig | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ConstructionAttendanceAlertConfig | null>(null);
  const [form, setForm] = useState<ConfigFormState>(defaultFormState);

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0]?.id ?? "");
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    setConfigPage(1);
    setLogPage(1);
  }, [selectedProjectId]);

  useEffect(() => {
    setConfigPage(1);
  }, [configKeyword]);

  useEffect(() => {
    setLogPage(1);
  }, [logCategory, logDate, logKeyword]);

  const configFilters = useMemo(
    () => ({
      page: configPage,
      page_size: PAGE_SIZE,
      keyword: configKeyword.trim() || undefined,
      project_id: selectedProjectId || undefined,
    }),
    [configKeyword, configPage, selectedProjectId]
  );
  const logFilters = useMemo(
    () => ({
      page: logPage,
      page_size: PAGE_SIZE,
      keyword: logKeyword.trim() || undefined,
      project_id: selectedProjectId || undefined,
      category: logCategory === "all" ? undefined : logCategory,
      alert_date: logDate || undefined,
    }),
    [logCategory, logDate, logKeyword, logPage, selectedProjectId]
  );

  const configsQuery = useAttendanceAlertConfigsQuery(configFilters);
  const logsQuery = useAttendanceAlertLogsQuery(logFilters);
  const createConfig = useCreateAttendanceAlertConfigMutation();
  const updateConfig = useUpdateAttendanceAlertConfigMutation();
  const deleteConfig = useDeleteAttendanceAlertConfigMutation();
  const runAlerts = useRunAttendanceAlertsMutation();
  const configs = configsQuery.data?.items ?? [];
  const logs = logsQuery.data?.items ?? [];
  const configTotal = configsQuery.data?.total ?? 0;
  const logTotal = logsQuery.data?.total ?? 0;
  const configTotalPages = Math.max(1, Math.ceil(configTotal / (configsQuery.data?.page_size ?? PAGE_SIZE)));
  const logTotalPages = Math.max(1, Math.ceil(logTotal / (logsQuery.data?.page_size ?? PAGE_SIZE)));
  const enabledCount = configs.filter((config) => config.is_enabled).length;
  const alertCount = logs.reduce((total, log) => total + log.absent_count, 0);
  const currentProject = projects.find((project) => project.id === selectedProjectId);
  const isSaving = createConfig.isPending || updateConfig.isPending;

  const openCreateDialog = () => {
    setActiveTab("configs");
    setEditingConfig(null);
    setForm({
      ...defaultFormState,
      project_id: selectedProjectId || projects[0]?.id || "",
    });
    setFormOpen(true);
  };

  const openEditDialog = (config: ConstructionAttendanceAlertConfig) => {
    setEditingConfig(config);
    setForm({
      project_id: config.project_id,
      is_enabled: config.is_enabled,
      check_managers: config.check_managers,
      check_workers: config.check_workers,
      check_supervisors: config.check_supervisors,
      remark: config.remark ?? "",
    });
    setFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.project_id) {
      toast.error("请选择项目");
      return;
    }
    if (!form.check_managers && !form.check_workers && !form.check_supervisors) {
      toast.error("至少选择一类预警对象");
      return;
    }

    const payload: ConstructionAttendanceAlertConfigPayload = {
      project_id: form.project_id,
      is_enabled: form.is_enabled,
      check_managers: form.check_managers,
      check_workers: form.check_workers,
      check_supervisors: form.check_supervisors,
      remark: form.remark.trim() || null,
    };

    try {
      if (editingConfig) {
        await updateConfig.mutateAsync({ configId: editingConfig.id, payload });
        toast.success("预警配置已修改");
      } else {
        await createConfig.mutateAsync(payload);
        setSelectedProjectId(form.project_id);
        toast.success("预警配置已新增");
      }
      setFormOpen(false);
      setEditingConfig(null);
      setForm(defaultFormState);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存预警配置失败");
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;

    try {
      await deleteConfig.mutateAsync(pendingDelete.id);
      toast.success("预警配置已删除");
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除预警配置失败");
    }
  };

  const handleRun = async () => {
    const alertDate = logDate || todayInputValue();
    try {
      const summary = await runAlerts.mutateAsync({
        alert_date: alertDate,
        project_id: selectedProjectId || undefined,
      });
      setLogDate(alertDate);
      setActiveTab("logs");
      toast.success(formatAttendanceAlertRunSummary(summary));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "运行考勤预警失败");
    }
  };

  return (
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="grid gap-4 border-b border-slate-100 px-5 py-3 dark:border-border lg:grid-cols-[minmax(360px,1fr)_auto] lg:items-center">
          <div className="grid gap-2 sm:grid-cols-3">
            <CompactStat label="本页配置" value={configTotal} helper={currentProject?.name || "全部项目"} />
            <CompactStat label="启用配置" value={enabledCount} helper="当前页" accent="teal" />
            <CompactStat label="缺勤人数" value={alertCount} helper="当前日志页" accent="amber" />
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button
              variant="outline"
              className="h-9 gap-2"
              onClick={handleRun}
              disabled={runAlerts.isPending}
            >
              {runAlerts.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              立即检查
            </Button>
            <Button
              className="h-9 gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
              onClick={openCreateDialog}
              disabled={projects.length === 0}
            >
              <Plus className="size-4" />
              新增配置
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 bg-[#f8faf9] px-5 py-3 dark:bg-muted/30 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {attendanceAlertTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveTab(tab.key)}
                  className={
                    isActive
                      ? "h-9 rounded-lg bg-[#0f6b5d] px-4 text-sm font-medium text-white shadow-sm"
                      : "h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition-colors hover:border-[#0f6b5d]/40 hover:text-[#0f6b5d] dark:border-border dark:bg-background dark:text-muted-foreground dark:hover:text-foreground"
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <label className="w-full space-y-1 lg:max-w-sm">
            <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">项目</span>
            <ProjectSearchSelect
              value={selectedProjectId}
              onValueChange={setSelectedProjectId}
              disabled={projectsQuery.isLoading}
              allOptionLabel={projectsQuery.isError ? "项目加载失败" : "全部项目"}
            />
          </label>
        </div>
      </section>

      {activeTab === "configs" ? (
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-border">
          <div>
            <h2 className="text-base font-semibold">项目预警配置</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">每天 14:00 自动检查启用的项目配置。</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">配置搜索</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={configKeyword}
                  onChange={(event) => setConfigKeyword(event.target.value)}
                  placeholder="项目名称、备注"
                  className="h-9 w-[240px] rounded-lg border-slate-200 bg-white pl-9 focus-visible:border-[#0f6b5d] focus-visible:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
                />
              </div>
            </label>
            <Button variant="outline" size="sm" onClick={() => void configsQuery.refetch()} disabled={configsQuery.isFetching}>
              <RefreshCw className={`mr-2 size-4 ${configsQuery.isFetching ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader className="bg-[#f8faf9] dark:bg-muted/30">
            <TableRow>
              <TableHead className="min-w-[220px] px-4">项目</TableHead>
              <TableHead className="min-w-[180px]">预警对象</TableHead>
              <TableHead className="min-w-[100px]">状态</TableHead>
              <TableHead className="min-w-[220px]">备注</TableHead>
              <TableHead className="min-w-[140px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configsQuery.isLoading ? (
              <TableMessage colSpan={5} icon={<Loader2 className="size-4 animate-spin" />} text="预警配置加载中" />
            ) : configsQuery.isError ? (
              <TableMessage colSpan={5} icon={<AlertTriangle className="size-4" />} text="预警配置加载失败，请检查登录状态或后端服务" tone="danger" />
            ) : configs.length === 0 ? (
              <TableMessage colSpan={5} icon={<CalendarClock className="size-4" />} text="暂无符合条件的预警配置" />
            ) : (
              configs.map((config) => (
                <TableRow key={config.id} className="hover:bg-emerald-50/60 dark:hover:bg-muted/50">
                  <TableCell className="px-4">
                    <div className="font-medium">{config.project_name || "未命名项目"}</div>
                    <div className="mt-1 text-xs text-slate-500">{config.project_id}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {config.check_managers ? <CategoryBadge category="manager" /> : null}
                      {config.check_workers ? <CategoryBadge category="worker" /> : null}
                      {config.check_supervisors ? <CategoryBadge category="supervisor" /> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={config.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"} variant="outline">
                      {config.is_enabled ? "启用" : "停用"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-slate-600 dark:text-muted-foreground">
                    {config.remark || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(config)}>
                        <Pencil className="mr-1 size-4" />
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setPendingDelete(config)}>
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
        <PaginationFooter
          total={configTotal}
          page={configPage}
          totalPages={configTotalPages}
          onPrevious={() => setConfigPage((current) => Math.max(1, current - 1))}
          onNext={() => setConfigPage((current) => Math.min(configTotalPages, current + 1))}
        />
      </section>
      ) : null}

      {activeTab === "logs" ? (
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-border">
          <div>
            <h2 className="text-base font-semibold">预警日志</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">短信未对接前，所有提醒先写入日志。</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">检查日期</span>
              <Input
                type="date"
                value={logDate}
                onChange={(event) => setLogDate(event.target.value)}
                className="h-9 w-[160px] rounded-lg border-slate-200 bg-white focus-visible:border-[#0f6b5d] focus-visible:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">对象</span>
              <Select value={logCategory} onValueChange={(value) => setLogCategory(value as ConstructionAttendanceAlertCategory | "all")}>
                <SelectTrigger className="h-9 w-[130px] bg-white dark:bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="manager">管理人员</SelectItem>
                  <SelectItem value="worker">民工</SelectItem>
                  <SelectItem value="supervisor">监理</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">搜索</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={logKeyword}
                  onChange={(event) => setLogKeyword(event.target.value)}
                  placeholder="项目、消息"
                  className="h-9 w-[220px] rounded-lg border-slate-200 bg-white pl-9 focus-visible:border-[#0f6b5d] focus-visible:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
                />
              </div>
            </label>
          </div>
        </div>

        <Table>
          <TableHeader className="bg-[#f8faf9] dark:bg-muted/30">
            <TableRow>
              <TableHead className="min-w-[120px] px-4">日期</TableHead>
              <TableHead className="min-w-[210px]">项目</TableHead>
              <TableHead className="min-w-[110px]">对象</TableHead>
              <TableHead className="min-w-[150px]">考勤概况</TableHead>
              <TableHead className="min-w-[220px]">未考勤人员</TableHead>
              <TableHead className="min-w-[220px]">日志消息</TableHead>
              <TableHead className="min-w-[90px]">状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logsQuery.isLoading ? (
              <TableMessage colSpan={7} icon={<Loader2 className="size-4 animate-spin" />} text="预警日志加载中" />
            ) : logsQuery.isError ? (
              <TableMessage colSpan={7} icon={<AlertTriangle className="size-4" />} text="预警日志加载失败，请检查登录状态或后端服务" tone="danger" />
            ) : logs.length === 0 ? (
              <TableMessage colSpan={7} icon={<BellRing className="size-4" />} text="暂无符合条件的预警日志" />
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="hover:bg-amber-50/50 dark:hover:bg-muted/50">
                  <TableCell className="px-4 font-medium">{log.alert_date}</TableCell>
                  <TableCell>
                    <div className="font-medium">{log.project_name || "未命名项目"}</div>
                    <div className="mt-1 text-xs text-slate-500">{log.trigger_type === "scheduled" ? "定时" : "手动"}</div>
                  </TableCell>
                  <TableCell><CategoryBadge category={log.category} /></TableCell>
                  <TableCell>
                    <div className="text-sm">{log.attendance_count}/{log.expected_count} 已考勤</div>
                    <div className="mt-1 text-xs text-amber-700">{log.absent_count} 人未考勤</div>
                  </TableCell>
                  <TableCell className="max-w-[260px] whitespace-normal text-sm text-slate-600 dark:text-muted-foreground">
                    {formatAbsentWorkers(log)}
                  </TableCell>
                  <TableCell className="max-w-[320px] whitespace-normal text-sm text-slate-600 dark:text-muted-foreground">
                    {log.message}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={log.status === "failed" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                      {attendanceAlertStatusLabel(log.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaginationFooter
          total={logTotal}
          page={logPage}
          totalPages={logTotalPages}
          onPrevious={() => setLogPage((current) => Math.max(1, current - 1))}
          onNext={() => setLogPage((current) => Math.min(logTotalPages, current + 1))}
        />
      </section>
      ) : null}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingConfig ? "编辑预警配置" : "新增预警配置"}</DialogTitle>
            <DialogDescription>配置项目每日考勤预警对象和启用状态。</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">项目</span>
              <ProjectSearchSelect
                value={form.project_id}
                onValueChange={(projectId) => setForm((current) => ({ ...current, project_id: projectId }))}
                disabled={projectsQuery.isLoading}
                allOptionLabel="请选择项目"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <CheckItem
                id="alert-enabled"
                label="启用配置"
                checked={form.is_enabled}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, is_enabled: checked }))}
              />
              <CheckItem
                id="alert-managers"
                label="管理人员"
                checked={form.check_managers}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, check_managers: checked }))}
              />
              <CheckItem
                id="alert-workers"
                label="民工"
                checked={form.check_workers}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, check_workers: checked }))}
              />
              <CheckItem
                id="alert-supervisors"
                label="监理"
                checked={form.check_supervisors}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, check_supervisors: checked }))}
              />
            </div>

            <label className="space-y-1.5">
              <span className="text-sm font-medium">备注</span>
              <Input
                value={form.remark}
                onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
                placeholder="例如：每天 14 点检查并记录短信日志"
              />
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                取消
              </Button>
              <Button type="submit" className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除预警配置</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该项目不会再按此配置生成新的考勤预警日志，历史日志会保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleteConfig.isPending}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CompactStat({
  label,
  value,
  helper,
  accent = "slate",
}: {
  label: string;
  value: number;
  helper: string;
  accent?: "slate" | "teal" | "amber";
}) {
  const accentClass =
    accent === "teal"
      ? "text-emerald-700"
      : accent === "amber"
        ? "text-amber-700"
        : "text-slate-900 dark:text-foreground";

  return (
    <div className="rounded-lg border border-slate-200 bg-[#f8faf9] px-3 py-2 dark:border-border dark:bg-muted/30">
      <div className="text-xs text-slate-500 dark:text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${accentClass}`}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-muted-foreground">{helper}</div>
    </div>
  );
}

function CategoryBadge({ category }: { category: ConstructionAttendanceAlertCategory }) {
  const classes =
    category === "manager"
      ? "border-slate-200 bg-slate-50 text-slate-700"
      : category === "worker"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <Badge variant="outline" className={classes}>
      {attendanceAlertCategoryLabel(category)}
    </Badge>
  );
}

function CheckItem({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
    </div>
  );
}

function TableMessage({
  colSpan,
  icon,
  text,
  tone = "muted",
}: {
  colSpan: number;
  icon: ReactNode;
  text: string;
  tone?: "muted" | "danger";
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className={tone === "danger" ? "px-5 py-8 text-center text-sm text-red-700" : "px-5 py-8 text-center text-sm text-slate-500"}>
        <span className="inline-flex items-center justify-center gap-2">
          {icon}
          {text}
        </span>
      </TableCell>
    </TableRow>
  );
}

function PaginationFooter({
  total,
  page,
  totalPages,
  onPrevious,
  onNext,
}: {
  total: number;
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const pageSize = PAGE_SIZE;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-[#f8faf9] px-5 py-3 text-sm text-slate-500 dark:bg-muted/30">
      <span>
        显示 {rangeStart}-{rangeEnd} 条，共 {total} 条
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrevious} disabled={page <= 1}>
          上一页
        </Button>
        <span className="min-w-16 text-center">
          {page}/{totalPages}
        </span>
        <Button variant="outline" size="sm" onClick={onNext} disabled={page >= totalPages}>
          下一页
        </Button>
      </div>
    </div>
  );
}

function formatAbsentWorkers(log: ConstructionAttendanceAlertLog) {
  const names = absentWorkerNames(log.details);
  if (names.length === 0) return "-";
  const visible = names.slice(0, 3).join("、");
  return names.length > 3 ? `${visible} 等 ${names.length} 人` : visible;
}

function absentWorkerNames(details: JsonValue) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  const workers = details.absent_workers;
  if (!Array.isArray(workers)) return [];
  return workers
    .map((worker) => {
      if (!worker || typeof worker !== "object" || Array.isArray(worker)) return "";
      const name = worker.worker_name;
      return typeof name === "string" && name.trim() ? name.trim() : "";
    })
    .filter(Boolean);
}

function todayInputValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}
