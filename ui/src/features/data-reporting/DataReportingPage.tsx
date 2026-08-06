import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, Beaker, CheckCircle2, Clock3, Download,
  Loader2, Pencil, Play, Plus, RefreshCw, Send,
  Search, Settings2, Square, Trash2, Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthUser } from "@/stores/use-auth-store";
import { reportService } from "./service";
import type { LifecycleStatus, ReportConfig, ReportConfigPayload, ReportItem, ReportRun, ResultCounts, RunArtifact, RunMode, RunProject } from "./types";

type Tab = "dashboard" | "configs" | "tests" | "runs" | "data";
type ResultOutcome = "all" | "success" | "failed" | "unknown";
type ConfigForm = {
  name: string; source_username: string; source_password: string; project_mode: "all" | "selected";
  include_projects: string; exclude_projects: string; target_username: string; target_password: string;
  feishu_app_id: string; feishu_app_secret: string; feishu_chat_id: string; schedule_time: string;
  lifecycle_status: LifecycleStatus; is_enabled: boolean; headless: boolean; upload_timeout_minutes: string;
  latest_entry_days: string; remark: string;
};

const emptyForm: ConfigForm = {
  name: "", source_username: "", source_password: "", project_mode: "all", include_projects: "",
  exclude_projects: "", target_username: "", target_password: "", feishu_app_id: "", feishu_app_secret: "",
  feishu_chat_id: "", schedule_time: "19:00", lifecycle_status: "production", is_enabled: false,
  headless: true, upload_timeout_minutes: "10", latest_entry_days: "1", remark: "",
};

const testCases: Array<{ mode: RunMode; title: string; description: string; danger?: boolean; needsSource?: "raw" | "converted" }> = [
  { mode: "test_source_login", title: "源站登录", description: "验证账号、密码和算术验证码，不下载文件。" },
  { mode: "test_project_list", title: "读取项目", description: "读取源网站全部项目，验证分页与项目筛选。" },
  { mode: "test_download", title: "下载测试", description: "下载选定项目的原始花名册并留存，不转换、不上报。" },
  { mode: "test_transform", title: "转换测试", description: "使用一次下载结果转换模板并解析人员明细。", needsSource: "raw" },
  { mode: "test_target_login", title: "目标站登录", description: "验证政务网登录、图片验证码和短信二次验证。" },
  { mode: "test_upload_validate", title: "上传校验", description: "上传转换文件并读取行数，停在最终提交前。", needsSource: "converted" },
  { mode: "test_submit", title: "真实提交测试", description: "选择转换文件并完成最终提交，会产生真实业务数据。", danger: true, needsSource: "converted" },
  { mode: "test_full", title: "完整流程测试", description: "下载、转换、上传和最终提交完整执行。", danger: true },
];

export function DataReportingPage() {
  const client = useQueryClient();
  const user = useAuthUser();
  // 非管理员（如数据报送角色）只能看运行任务；工作台/报送配置/测试中心/报送数据仅管理员可见
  const isAdmin = user?.role === "admin";
  const visibleTabs: Tab[] = isAdmin ? ["configs", "runs", "dashboard", "tests", "data"] : ["runs"];
  const [tab, setTab] = useState<Tab>(isAdmin ? "configs" : "runs");
  // 角色信息异步就绪后可能停在不可见 tab，渲染时直接收敛到运行任务
  const activeTab: Tab = visibleTabs.includes(tab) ? tab : "runs";
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReportConfig | null>(null);
  const [form, setForm] = useState<ConfigForm>(emptyForm);
  const [testConfigId, setTestConfigId] = useState("");
  const [sourceRunId, setSourceRunId] = useState("");
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [detailOutcome, setDetailOutcome] = useState<ResultOutcome>("all");
  const [detailItemPage, setDetailItemPage] = useState(1);
  const [dataRunId, setDataRunId] = useState("");
  const [dataPage, setDataPage] = useState(1);
  const [dataOutcome, setDataOutcome] = useState<ResultOutcome>("all");
  const [configPage, setConfigPage] = useState(1);
  const [configPageSize, setConfigPageSize] = useState(10);
  const [configKeywordInput, setConfigKeywordInput] = useState("");
  const [configKeyword, setConfigKeyword] = useState("");
  const [configStatus, setConfigStatus] = useState("");
  const [runPage, setRunPage] = useState(1);
  const [runPageSize, setRunPageSize] = useState(10);
  const [runKeywordInput, setRunKeywordInput] = useState("");
  const [runKeyword, setRunKeyword] = useState("");
  const [runStatus, setRunStatus] = useState("");

  const summary = useQuery({ queryKey: ["report-summary"], queryFn: reportService.summary, refetchInterval: 10_000 });
  const configs = useQuery({ queryKey: ["report-configs", "list", configPage, configPageSize, configKeyword, configStatus], queryFn: () => reportService.configs(configPage, configKeyword, configPageSize, configStatus), refetchInterval: 15_000 });
  const configOptions = useQuery({ queryKey: ["report-configs", "options"], queryFn: () => reportService.configs(1, "", 100), refetchInterval: 30_000 });
  const runs = useQuery({ queryKey: ["report-runs", "options"], queryFn: () => reportService.runs({ page: 1, page_size: 100 }), refetchInterval: 10_000 });
  const runList = useQuery({ queryKey: ["report-runs", "list", runPage, runPageSize, runKeyword, runStatus], queryFn: () => reportService.runs({ page: runPage, page_size: runPageSize, keyword: runKeyword, status: runStatus || undefined }), refetchInterval: 5_000 });
  const detail = useQuery({ queryKey: ["report-run", detailRunId], queryFn: () => reportService.run(detailRunId!), enabled: Boolean(detailRunId), refetchInterval: (query) => query.state.data && ["pending", "running", "cancelling"].includes(query.state.data.status) ? 3_000 : false });
  const detailItems = useQuery({ queryKey: ["report-detail-items", detailRunId, detailOutcome, detailItemPage], queryFn: () => reportService.items(detailRunId!, detailItemPage, detailOutcome), enabled: Boolean(detailRunId) });
  const items = useQuery({ queryKey: ["report-items", dataRunId, dataOutcome, dataPage], queryFn: () => reportService.items(dataRunId, dataPage, dataOutcome), enabled: Boolean(dataRunId) });

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["report-summary"] }),
      client.invalidateQueries({ queryKey: ["report-configs"] }),
      client.invalidateQueries({ queryKey: ["report-runs"] }),
    ]);
  };
  const createConfig = useMutation({ mutationFn: (payload: ReportConfigPayload) => reportService.createConfig(payload), onSuccess: invalidate });
  const updateConfig = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: ReportConfigPayload }) => reportService.updateConfig(id, payload), onSuccess: invalidate });
  const deleteConfig = useMutation({ mutationFn: reportService.deleteConfig, onSuccess: invalidate });
  const createRun = useMutation({ mutationFn: ({ configId, mode, options }: { configId: string; mode: RunMode; options?: Record<string, unknown> }) => reportService.createRun(configId, mode, options), onSuccess: invalidate });
  const cancelRun = useMutation({ mutationFn: reportService.cancelRun, onSuccess: invalidate });
  const retryRun = useMutation({ mutationFn: reportService.retryRun, onSuccess: invalidate });

  const configRows = useMemo(() => configs.data?.items ?? [], [configs.data?.items]);
  const configOptionRows = useMemo(() => configOptions.data?.items ?? [], [configOptions.data?.items]);
  const runRows = useMemo(() => runs.data?.items ?? [], [runs.data?.items]);
  const runListRows = useMemo(() => runList.data?.items ?? [], [runList.data?.items]);
  const selectedTestConfigId = testConfigId || configOptionRows[0]?.id || "";
  const rawSourceRuns = useMemo(() => runRows.filter((run) => run.config_id === selectedTestConfigId && run.downloaded_count > 0 && ["success", "partial_success"].includes(run.status)), [runRows, selectedTestConfigId]);
  const convertedSourceRuns = useMemo(() => runRows.filter((run) => run.config_id === selectedTestConfigId && run.converted_count > 0 && ["success", "partial_success"].includes(run.status)), [runRows, selectedTestConfigId]);
  const completedDataRuns = useMemo(() => runRows.filter((run) => run.item_count > 0), [runRows]);

  useEffect(() => {
    setDetailOutcome("all");
    setDetailItemPage(1);
  }, [detailRunId]);

  const openCreate = async () => {
    setEditing(null);
    const defaults = configRows[0];
    if (!defaults) {
      setForm({ ...emptyForm });
      setFormOpen(true);
      return;
    }

    try {
      const detail = await reportService.config(defaults.id);
      setForm({
        ...emptyForm,
        target_username: detail.target_username,
        target_password: detail.target_password ?? "",
        feishu_app_id: detail.verification_config?.app_id ?? "",
        feishu_app_secret: detail.verification_config?.app_secret ?? "",
        feishu_chat_id: detail.verification_config?.chat_id ?? "",
      });
    } catch (error) {
      setForm({ ...emptyForm });
      toast.error(`读取目标网站默认配置失败：${errorMessage(error)}`);
    }
    setFormOpen(true);
  };
  const openEdit = async (config: ReportConfig) => {
    try {
      const detail = await reportService.config(config.id);
      setEditing(detail);
      setForm({
        name: detail.name, source_username: detail.source_username, source_password: detail.source_password ?? "", project_mode: detail.project_mode,
        include_projects: detail.include_projects.join("\n"), exclude_projects: detail.exclude_projects.join("\n"),
        target_username: detail.target_username, target_password: detail.target_password ?? "", feishu_app_id: detail.verification_config?.app_id ?? "", feishu_app_secret: detail.verification_config?.app_secret ?? "",
        feishu_chat_id: detail.verification_config?.chat_id ?? "", schedule_time: detail.schedule_time.slice(0, 5), lifecycle_status: detail.lifecycle_status,
        is_enabled: detail.is_enabled, headless: detail.settings.headless !== false,
        upload_timeout_minutes: String(detail.settings.upload_timeout_minutes ?? 10),
        latest_entry_days: String(detail.settings.latest_entry_days ?? 1), remark: detail.remark ?? "",
      });
      setFormOpen(true);
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const submitConfig = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.source_username.trim() || !form.target_username.trim()) return toast.error("请填写配置名称和两端账号");
    if (!editing && (!form.source_password || !form.target_password)) return toast.error("首次创建必须填写两端密码");
    if (form.is_enabled && form.lifecycle_status !== "production") return toast.error("只有正式配置可以启用每日运行");
    const verificationComplete = form.feishu_app_id && form.feishu_app_secret && form.feishu_chat_id;
    if (!editing && !verificationComplete) return toast.error("首次创建必须填写完整飞书验证码配置");
    const selectedProjects = lines(form.include_projects);
    const payload: ReportConfigPayload = {
      name: form.name.trim(), source_base_url: "http://tg.91jtg.com", source_username: form.source_username.trim(),
      source_password: form.source_password || undefined, project_mode: selectedProjects.length ? "selected" : "all",
      include_projects: selectedProjects, exclude_projects: lines(form.exclude_projects),
      target_base_url: "https://www.zjzwfw.gov.cn", target_username: form.target_username.trim(),
      target_password: form.target_password || undefined, verification_type: "feishu",
      verification_config: verificationComplete ? { app_id: form.feishu_app_id.trim(), app_secret: form.feishu_app_secret.trim(), chat_id: form.feishu_chat_id.trim(), poll_interval: 5 } : undefined,
      schedule_time: form.schedule_time, schedule_timezone: "Asia/Shanghai", lifecycle_status: form.lifecycle_status,
      is_enabled: form.is_enabled, settings: {
        headless: form.headless,
        upload_timeout_minutes: Math.min(10, Math.max(1, Number(form.upload_timeout_minutes) || 10)),
        latest_entry_days: Math.max(1, Number(form.latest_entry_days) || 1),
      },
      remark: form.remark.trim() || null,
    };
    try {
      if (editing) await updateConfig.mutateAsync({ id: editing.id, payload }); else await createConfig.mutateAsync(payload);
      toast.success(editing ? "报送配置已更新" : "报送配置已创建"); setFormOpen(false);
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const runTest = async (mode: RunMode, danger?: boolean, needsSource?: "raw" | "converted") => {
    if (!selectedTestConfigId) return toast.error("请先选择配置");
    if (needsSource && !sourceRunId) return toast.error("请选择一条来源任务");
    if (danger && !window.confirm("该测试会向政务网产生真实业务提交，确认继续吗？")) return;
    try {
      const options = needsSource ? { source_run_id: sourceRunId } : {};
      const created = await createRun.mutateAsync({ configId: selectedTestConfigId, mode, options });
      toast.success("测试任务已进入队列"); setDetailRunId(created.id); setTab("runs");
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const startProduction = async (config: ReportConfig) => {
    try { await createRun.mutateAsync({ configId: config.id, mode: "production" }); toast.success("正式任务已进入队列"); setTab("runs"); }
    catch (error) { toast.error(errorMessage(error)); }
  };

  const exportItems = async (runId: string, outcome: ResultOutcome) => {
    try {
      await reportService.exportItems(runId, outcome);
      toast.success("Excel 已开始下载");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border bg-gradient-to-br from-emerald-950 via-[#0f6b5d] to-emerald-700 p-5 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-100"><Send className="size-4" />数据报送中心</div>
          <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => void invalidate()}><RefreshCw className="mr-2 size-4" />刷新</Button>{isAdmin && <Button size="sm" className="bg-white text-emerald-900 hover:bg-emerald-50" onClick={openCreate}><Plus className="mr-2 size-4" />新增配置</Button>}</div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 rounded-xl border bg-white p-1.5">
        {visibleTabs.map((key) => <Button key={key} size="sm" variant={activeTab === key ? "default" : "ghost"} className={activeTab === key ? "bg-[#0f6b5d]" : ""} onClick={() => setTab(key)}>{tabLabel(key)}</Button>)}
      </nav>

      {activeTab === "dashboard" && isAdmin && <Dashboard summary={summary.data} runs={runRows.slice(0, 6)} onRun={setDetailRunId} />}
      {activeTab === "configs" && isAdmin && <ConfigPanel rows={configRows} result={configs.data} loading={configs.isLoading} keyword={configKeywordInput} onKeyword={setConfigKeywordInput} onSearch={() => { setConfigKeyword(configKeywordInput.trim()); setConfigPage(1); }} onClear={() => { setConfigKeywordInput(""); setConfigKeyword(""); setConfigPage(1); }} status={configStatus} onStatus={(value) => { setConfigStatus(value); setConfigPage(1); }} page={configPage} onPage={setConfigPage} pageSize={configPageSize} onPageSize={(value) => { setConfigPageSize(value); setConfigPage(1); }} onEdit={openEdit} onRun={startProduction} onDelete={async (config) => { if (!window.confirm(`确认删除“${config.name}”？历史数据仍会保留。`)) return; try { await deleteConfig.mutateAsync(config.id); toast.success("配置已删除"); } catch (error) { toast.error(errorMessage(error)); } }} />}
      {activeTab === "tests" && isAdmin && <TestCenter configs={configOptionRows} selectedConfig={selectedTestConfigId} onConfig={setTestConfigId} sourceRun={sourceRunId} onSourceRun={setSourceRunId} rawRuns={rawSourceRuns} convertedRuns={convertedSourceRuns} running={createRun.isPending} onRun={runTest} />}
      {activeTab === "runs" && <RunsPanel rows={runListRows} result={runList.data} loading={runList.isLoading} keyword={runKeywordInput} onKeyword={setRunKeywordInput} onSearch={() => { setRunKeyword(runKeywordInput.trim()); setRunPage(1); }} onClear={() => { setRunKeywordInput(""); setRunKeyword(""); setRunPage(1); }} status={runStatus} onStatus={(value) => { setRunStatus(value); setRunPage(1); }} page={runPage} onPage={setRunPage} pageSize={runPageSize} onPageSize={(value) => { setRunPageSize(value); setRunPage(1); }} onDetail={setDetailRunId} onCancel={async (run) => { try { await cancelRun.mutateAsync(run.id); toast.success("已请求取消任务"); } catch (error) { toast.error(errorMessage(error)); } }} onRetry={async (run) => { if (["production", "test_submit", "test_full"].includes(run.run_mode) && !window.confirm("该任务可能已经产生过真实提交，重试可能再次向政务网提交数据，确认继续吗？")) return; try { await retryRun.mutateAsync(run.id); toast.success("重试任务已进入队列"); } catch (error) { toast.error(errorMessage(error)); } }} />}
      {activeTab === "data" && isAdmin && <DataPanel runs={completedDataRuns} runId={dataRunId} onRun={(id) => { setDataRunId(id); setDataPage(1); setDataOutcome("all"); }} result={items.data} loading={items.isLoading} page={dataPage} onPage={setDataPage} outcome={dataOutcome} onOutcome={(value) => { setDataOutcome(value); setDataPage(1); }} onExport={() => void exportItems(dataRunId, dataOutcome)} />}

      <ConfigDialog open={formOpen} onOpen={setFormOpen} editing={editing} form={form} setForm={setForm} submit={submitConfig} saving={createConfig.isPending || updateConfig.isPending} />
      <RunDetail open={Boolean(detailRunId)} onOpen={(open) => { if (!open) setDetailRunId(null); }} run={detail.data} loading={detail.isLoading} onDownload={(id, name) => void reportService.downloadArtifact(id, name)} itemResult={detailItems.data} itemsLoading={detailItems.isLoading} itemPage={detailItemPage} onItemPage={setDetailItemPage} outcome={detailOutcome} onOutcome={(value) => { setDetailOutcome(value); setDetailItemPage(1); }} onExport={() => detailRunId && void exportItems(detailRunId, detailOutcome)} />
    </div>
  );
}

function Dashboard({ summary, runs, onRun }: { summary?: Awaited<ReturnType<typeof reportService.summary>>; runs: ReportRun[]; onRun: (id: string) => void }) {
  const stats = [
    ["正式配置", summary?.enabled_config_count ?? 0, Settings2], ["运行中", summary?.running_count ?? 0, Activity],
    ["等待队列", summary?.queued_count ?? 0, Clock3], ["今日成功", summary?.today_success_count ?? 0, CheckCircle2],
    ["今日异常", summary?.today_failure_count ?? 0, AlertTriangle], ["今日人员", summary?.today_item_count ?? 0, Users],
  ] as const;
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{stats.map(([label, value, Icon]) => <div key={label} className="rounded-xl border bg-white p-4"><Icon className="size-4 text-[#0f6b5d]" /><div className="mt-3 text-2xl font-semibold">{value}</div><div className="text-xs text-slate-500">{label}</div></div>)}</div><div className="grid gap-4 lg:grid-cols-[1fr_320px]"><section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">最近任务</h2><div className="mt-3 space-y-2">{runs.length ? runs.map((run) => <button key={run.id} onClick={() => onRun(run.id)} className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left hover:bg-slate-50"><div><div className="text-sm font-medium">{run.config_name}</div><div className="text-xs text-slate-500">{modeLabel(run.run_mode)} · {formatTime(run.created_at)}</div></div><RunStatusBadge status={run.status} /></button>) : <Empty text="暂无运行任务" />}</div></section><section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Worker 状态</h2><p className="mt-1 text-xs text-slate-500">最多一个 Worker 运行，每次只启动一个 Chromium。</p><div className="mt-3 space-y-2">{summary?.workers?.length ? summary.workers.map((worker) => <div key={worker.worker_id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><span className="truncate text-sm font-medium">{worker.pod_name || worker.worker_id}</span><StatusBadge status={worker.status} /></div><div className="mt-1 text-xs text-slate-500">{worker.worker_version || "-"} · {formatTime(worker.last_seen_at)}</div></div>) : <Empty text="Worker 尚未连接" />}</div></section></div></div>;
}

function ConfigPanel({ rows, result, loading, keyword, onKeyword, onSearch, onClear, status, onStatus, page, onPage, pageSize, onPageSize, onEdit, onRun, onDelete }: { rows: ReportConfig[]; result?: Awaited<ReturnType<typeof reportService.configs>>; loading: boolean; keyword: string; onKeyword: (value: string) => void; onSearch: () => void; onClear: () => void; status: string; onStatus: (value: string) => void; page: number; onPage: (page: number) => void; pageSize: number; onPageSize: (value: number) => void; onEdit: (row: ReportConfig) => void; onRun: (row: ReportConfig) => void; onDelete: (row: ReportConfig) => void }) {
  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return <div className="space-y-4">
    <form className="flex flex-wrap gap-2 rounded-xl border bg-white p-4" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
      <Input className="min-w-64 max-w-md flex-1" value={keyword} onChange={(event) => onKeyword(event.target.value)} placeholder="搜索配置名称、项目名称或账号" />
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => onStatus(event.target.value)}><option value="">全部状态</option><option value="production">正式</option><option value="testing">测试中</option><option value="draft">草稿</option><option value="paused">暂停</option></select>
      <Button type="submit" className="bg-[#0f6b5d]" disabled={loading}><Search className="mr-2 size-4" />搜索</Button>
      {keyword && <Button type="button" variant="outline" onClick={onClear}>清空</Button>}
    </form>
    <ConfigTable rows={rows} loading={loading} page={page} pageSize={pageSize} onEdit={onEdit} onRun={onRun} onDelete={onDelete} />
    <ResultPagination total={total} page={page} pageCount={pageCount} pageSize={pageSize} loading={loading} onPage={onPage} onPageSize={onPageSize} />
  </div>;
}

function ConfigTable({ rows, loading, page, pageSize, onEdit, onRun, onDelete }: { rows: ReportConfig[]; loading: boolean; page: number; pageSize: number; onEdit: (row: ReportConfig) => void; onRun: (row: ReportConfig) => void; onDelete: (row: ReportConfig) => void }) {
  return <section className="overflow-hidden rounded-xl border bg-white"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-16">序号</TableHead><TableHead>配置名称</TableHead><TableHead>状态</TableHead><TableHead>项目范围</TableHead><TableHead>每日运行</TableHead><TableHead>下次运行</TableHead><TableHead>更新时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{loading ? <MessageRow text="配置加载中" /> : rows.length ? rows.map((row, index) => <TableRow key={row.id}><TableCell>{(page - 1) * pageSize + index + 1}</TableCell><TableCell><div className="max-w-72 truncate font-medium" title={row.name}>{row.name}</div>{row.active_run_count > 0 && <div className="mt-1 text-xs text-blue-600">{row.active_run_count} 个任务运行中</div>}</TableCell><TableCell><LifecycleBadge config={row} /></TableCell><TableCell><div className="max-w-80 truncate" title={row.project_mode === "all" ? "全部项目" : row.include_projects.join("、")}>{row.project_mode === "all" ? "全部项目" : `${row.include_projects.length} 个指定项目`}</div></TableCell><TableCell className="whitespace-nowrap">{row.schedule_time.slice(0, 5)}</TableCell><TableCell className="whitespace-nowrap">{row.next_run_at ? formatTime(row.next_run_at) : "未调度"}</TableCell><TableCell className="whitespace-nowrap">{formatTime(row.updated_at)}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => onEdit(row)}><Pencil className="mr-2 size-4" />编辑</Button><Button size="sm" variant="outline" disabled={!row.is_enabled || row.lifecycle_status !== "production"} onClick={() => onRun(row)}><Play className="mr-2 size-4" />运行</Button><Button size="icon" variant="ghost" title="删除" onClick={() => onDelete(row)}><Trash2 className="size-4 text-red-500" /></Button></div></TableCell></TableRow>) : <MessageRow text="暂无报送配置" />}</TableBody></Table></div></section>;
}

function TestCenter({ configs, selectedConfig, onConfig, sourceRun, onSourceRun, rawRuns, convertedRuns, running, onRun }: { configs: ReportConfig[]; selectedConfig: string; onConfig: (id: string) => void; sourceRun: string; onSourceRun: (id: string) => void; rawRuns: ReportRun[]; convertedRuns: ReportRun[]; running: boolean; onRun: (mode: RunMode, danger?: boolean, source?: "raw" | "converted") => void }) {
  return <div className="space-y-4"><section className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2"><Beaker className="size-5 text-[#0f6b5d]" /><div><h2 className="font-semibold">分阶段测试中心</h2><p className="text-xs text-slate-500">测试任务也进入统一队列，全局一次只运行一个任务。</p></div></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="报送配置"><NativeSelect value={selectedConfig} onChange={onConfig} options={configs.map((item) => ({ value: item.id, label: item.name }))} placeholder="请选择配置" /></Field><Field label="来源任务（转换/上传测试时选择）"><NativeSelect value={sourceRun} onChange={onSourceRun} options={[...new Map([...rawRuns, ...convertedRuns].map((run) => [run.id, run])).values()].map((run) => ({ value: run.id, label: `${run.config_name} · ${modeLabel(run.run_mode)} · ${formatTime(run.created_at)}` }))} placeholder="请选择来源任务" /></Field></div></section><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{testCases.map((test) => { const candidates = test.needsSource === "raw" ? rawRuns : convertedRuns; const sourceValid = !test.needsSource || candidates.some((run) => run.id === sourceRun); return <section key={test.mode} className={`rounded-xl border bg-white p-4 ${test.danger ? "border-amber-300" : ""}`}><div className="flex items-center justify-between"><span className={`flex size-9 items-center justify-center rounded-lg ${test.danger ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-[#0f6b5d]"}`}>{test.danger ? <AlertTriangle className="size-4" /> : <Beaker className="size-4" />}</span>{test.danger && <Badge variant="outline" className="border-amber-300 text-amber-700">真实外部操作</Badge>}</div><h3 className="mt-3 font-semibold">{test.title}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{test.description}</p><Button className={`mt-4 w-full ${test.danger ? "bg-amber-600 hover:bg-amber-700" : "bg-[#0f6b5d] hover:bg-[#0b5148]"}`} size="sm" disabled={running || !selectedConfig || !sourceValid} onClick={() => onRun(test.mode, test.danger, test.needsSource)}>{running ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}开始测试</Button></section>; })}</div></div>;
}

function RunsPanel({ rows, result, loading, keyword, onKeyword, onSearch, onClear, status, onStatus, page, onPage, pageSize, onPageSize, onDetail, onCancel, onRetry }: { rows: ReportRun[]; result?: Awaited<ReturnType<typeof reportService.runs>>; loading: boolean; keyword: string; onKeyword: (value: string) => void; onSearch: () => void; onClear: () => void; status: string; onStatus: (value: string) => void; page: number; onPage: (page: number) => void; pageSize: number; onPageSize: (value: number) => void; onDetail: (id: string) => void; onCancel: (run: ReportRun) => void; onRetry: (run: ReportRun) => void }) {
  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return <div className="space-y-4"><form className="flex flex-wrap gap-2 rounded-xl border bg-white p-4" onSubmit={(event) => { event.preventDefault(); onSearch(); }}><Input className="min-w-64 max-w-md flex-1" value={keyword} onChange={(event) => onKeyword(event.target.value)} placeholder="搜索项目名称、配置名称或失败原因" /><select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => onStatus(event.target.value)}><option value="">全部状态</option><option value="pending">等待</option><option value="running">运行中</option><option value="cancelling">取消中</option><option value="success">成功</option><option value="failed">失败</option><option value="cancelled">已取消</option></select><Button type="submit" className="bg-[#0f6b5d]" disabled={loading}><Search className="mr-2 size-4" />搜索</Button>{keyword && <Button type="button" variant="outline" onClick={onClear}>清空</Button>}</form><RunsTable rows={rows} loading={loading} onDetail={onDetail} onCancel={onCancel} onRetry={onRetry} /><ResultPagination total={total} page={page} pageCount={pageCount} pageSize={pageSize} loading={loading} onPage={onPage} onPageSize={onPageSize} /></div>;
}

function RunsTable({ rows, loading, onDetail, onCancel, onRetry }: { rows: ReportRun[]; loading: boolean; onDetail: (id: string) => void; onCancel: (run: ReportRun) => void; onRetry: (run: ReportRun) => void }) {
  return <section className="overflow-hidden rounded-xl border bg-white"><Table><TableHeader><TableRow><TableHead>配置/类型</TableHead><TableHead>状态</TableHead><TableHead className="w-80 min-w-56 max-w-80">进度 / 系统失败原因</TableHead><TableHead>项目</TableHead><TableHead>人员</TableHead><TableHead className="min-w-72">报送结果</TableHead><TableHead className="min-w-52">抓取数据时间范围（北京时间）</TableHead><TableHead>开始时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{loading ? <MessageRow text="任务加载中" /> : rows.length ? rows.map((run) => { const failed = run.status === "failed"; const retryable = failed || run.status === "cancelled"; return <TableRow key={run.id}><TableCell><button className="text-left font-medium hover:underline" onClick={() => onDetail(run.id)}>{run.config_name}</button><div className="text-xs text-slate-500">{modeLabel(run.run_mode)}</div></TableCell><TableCell><RunStatusBadge status={run.status} /></TableCell><TableCell className="max-w-80"><div>{stageLabel(run.failure_stage || run.current_stage)}</div>{failed && <div className="mt-1 line-clamp-2 break-all text-xs leading-5 text-red-600" title={run.failure_reason || undefined}>{run.failure_reason || "系统执行失败，请进入详情查看运行日志"}</div>}</TableCell><TableCell>{run.discovered_count}</TableCell><TableCell>{run.item_count}</TableCell><TableCell><RunResultSummary run={run} /></TableCell><TableCell>{run.data_time_from_beijing && run.data_time_to_beijing ? `${run.data_time_from_beijing} 00:00 至 ${run.data_time_to_beijing} 23:59` : "-"}</TableCell><TableCell>{formatTime(run.started_at || run.created_at)}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => onDetail(run.id)}>详情</Button>{["pending", "running"].includes(run.status) && <Button size="icon" variant="ghost" title="取消" onClick={() => onCancel(run)}><Square className="size-4" /></Button>}{retryable && <Button size="icon" variant="ghost" title="重试" onClick={() => onRetry(run)}><RefreshCw className="size-4" /></Button>}</div></TableCell></TableRow>; }) : <MessageRow text="暂无运行任务" />}</TableBody></Table></section>;
}

function RunResultSummary({ run }: { run: ReportRun }) {
  const success = run.reported_success_count ?? run.success_count;
  const skipped = run.skipped_count ?? run.failure_count;
  return <div className="space-y-1 text-sm"><div><span className="font-medium text-emerald-700">成功 {success} 条</span><span className="ml-3 font-medium text-amber-700">跳过 {skipped} 条</span></div>{skipped > 0 && <div className="text-xs leading-5 text-slate-500">已上报/已存在 {run.already_reported_count ?? 0} 条 · 备案/进场时间不符 {run.record_time_skipped_count ?? 0} 条 · 其他 {run.other_skipped_count ?? skipped} 条</div>}</div>;
}

function DataPanel({ runs, runId, onRun, result, loading, page, onPage, outcome, onOutcome, onExport }: { runs: ReportRun[]; runId: string; onRun: (id: string) => void; result?: Awaited<ReturnType<typeof reportService.items>>; loading: boolean; page: number; onPage: (page: number) => void; outcome: ResultOutcome; onOutcome: (value: ResultOutcome) => void; onExport: () => void }) {
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const pageSize = result?.page_size ?? 50;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return <div className="space-y-4"><section className="rounded-xl border bg-white p-4"><Field label="选择含人员数据的任务"><NativeSelect value={runId} onChange={onRun} options={runs.map((run) => ({ value: run.id, label: `${run.config_name} · ${modeLabel(run.run_mode)} · ${formatTime(run.created_at)} · ${run.item_count} 条` }))} placeholder="请选择任务" /></Field><p className="mt-2 text-xs text-slate-500">身份证和手机号在数据库中加密保存，页面和导出文件均脱敏展示。</p></section><section className="overflow-hidden rounded-xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><OutcomeTabs value={outcome} counts={result?.counts} onChange={onOutcome} /><Button size="sm" variant="outline" disabled={!runId || loading} onClick={onExport}><Download className="mr-2 size-4" />导出当前分类 Excel</Button></div><div className="max-h-[60vh] overflow-auto"><Table><TableHeader className="sticky top-0 z-10 bg-white"><TableRow><TableHead>项目</TableHead><TableHead>来源行</TableHead><TableHead>姓名</TableHead><TableHead>性别</TableHead><TableHead>身份证</TableHead><TableHead>手机号</TableHead><TableHead>报送结果</TableHead><TableHead>错误/说明</TableHead></TableRow></TableHeader><TableBody>{loading ? <MessageRow text="数据加载中" /> : items.length ? items.map((item) => <TableRow key={item.id}><TableCell className="max-w-64 truncate">{item.project_name}</TableCell><TableCell>{item.source_row_no ?? "-"}</TableCell><TableCell className="font-medium">{item.person_name}</TableCell><TableCell>{item.gender || "-"}</TableCell><TableCell>{item.identity_masked || "-"}</TableCell><TableCell>{item.phone_masked || "-"}</TableCell><TableCell><PersonResult item={item} /></TableCell><TableCell className="max-w-72 text-xs text-red-600">{item.last_error || (item.status === "result_unknown" ? "政府只返回批量汇总，无法确认此人结果" : "-")}</TableCell></TableRow>) : <MessageRow text={runId ? "当前分类暂无人员数据" : "请先选择任务"} />}</TableBody></Table></div><ResultPagination total={total} page={page} pageCount={pageCount} loading={loading} onPage={onPage} /></section></div>;
}

function OutcomeTabs({ value, counts, onChange }: { value: ResultOutcome; counts?: ResultCounts; onChange: (value: ResultOutcome) => void }) {
  const options: Array<{ value: ResultOutcome; label: string; count: number }> = [
    { value: "all", label: "全部", count: counts?.all ?? 0 },
    { value: "success", label: "已成功", count: counts?.success ?? 0 },
    { value: "failed", label: "已跳过", count: counts?.failed ?? 0 },
    { value: "unknown", label: "待核对", count: counts?.unknown ?? 0 },
  ];
  return <div className="flex flex-wrap gap-1">{options.map((option) => <Button key={option.value} size="sm" variant={value === option.value ? "default" : "outline"} className={value === option.value ? "bg-[#0f6b5d]" : ""} onClick={() => onChange(option.value)}>{option.label}<Badge variant="secondary" className="ml-2 min-w-6 justify-center">{option.count}</Badge></Button>)}</div>;
}

function PageSizeSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <select className="h-10 rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(Number(event.target.value))}><option value={10}>每页 10 条</option><option value={20}>每页 20 条</option><option value={50}>每页 50 条</option></select>;
}

function ResultPagination({ total, page, pageCount, pageSize = 50, loading, onPage, onPageSize }: { total: number; page: number; pageCount: number; pageSize?: number; loading: boolean; onPage: (page: number) => void; onPageSize?: (value: number) => void }) {
  if (!total) return null;
  return <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm"><span className="text-slate-500">共 {total} 条，第 {page}/{pageCount} 页</span><div className="flex items-center gap-2">{onPageSize && <PageSizeSelect value={pageSize} onChange={onPageSize} />}<Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>上一页</Button><Button size="sm" variant="outline" disabled={page >= pageCount || loading} onClick={() => onPage(page + 1)}>下一页</Button></div></div>;
}

function ConfigDialog({ open, onOpen, editing, form, setForm, submit, saving }: { open: boolean; onOpen: (open: boolean) => void; editing: ReportConfig | null; form: ConfigForm; setForm: Dispatch<SetStateAction<ConfigForm>>; submit: (event: FormEvent) => void; saving: boolean }) {
  const set = <K extends keyof ConfigForm>(key: K, value: ConfigForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  return <Dialog open={open} onOpenChange={onOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><form onSubmit={submit}><DialogHeader><DialogTitle>{editing ? "编辑报送配置" : "新增报送配置"}</DialogTitle><DialogDescription>编辑时会回填并明文显示当前密码和飞书配置，可直接修改后保存。</DialogDescription></DialogHeader><div className="mt-4 space-y-4"><FormSection title="基础与源网站"><div className="grid gap-4 md:grid-cols-2"><TextField label="配置名称" value={form.name} onChange={(value) => set("name", value)} /><TextField label="源站账号" value={form.source_username} onChange={(value) => set("source_username", value)} /><TextField label="源站密码" value={form.source_password} onChange={(value) => set("source_password", value)} placeholder="请输入密码" /><TextAreaField className="md:col-span-2" label="要拉取的项目名称（一行一个）" value={form.include_projects} onChange={(value) => set("include_projects", value)} placeholder="例如：东部新城明湖南区工程（二期）景观段I标段" description="填写后只拉取名称完全一致的项目，其他项目不处理；留空表示拉取全部项目。" /><TextAreaField className="md:col-span-2" label="额外排除项目（一行一个，可选）" value={form.exclude_projects} onChange={(value) => set("exclude_projects", value)} /></div></FormSection><FormSection title="目标网站与短信验证码"><div className="grid gap-4 md:grid-cols-2"><TextField label="政务网手机号/账号" value={form.target_username} onChange={(value) => set("target_username", value)} /><TextField label="政务网密码" value={form.target_password} onChange={(value) => set("target_password", value)} placeholder="请输入密码" /><TextField label="飞书 App ID" value={form.feishu_app_id} onChange={(value) => set("feishu_app_id", value)} /><TextField label="飞书 App Secret" value={form.feishu_app_secret} onChange={(value) => set("feishu_app_secret", value)} placeholder="请输入 Secret" /><TextField className="md:col-span-2" label="飞书群 Chat ID" value={form.feishu_chat_id} onChange={(value) => set("feishu_chat_id", value)} /></div></FormSection><FormSection title="运行策略"><div className="grid gap-4 md:grid-cols-3"><TextField label="每日运行时间" type="time" value={form.schedule_time} onChange={(value) => set("schedule_time", value)} /><Field label="配置阶段"><NativeSelect value={form.lifecycle_status} onChange={(value) => set("lifecycle_status", value as LifecycleStatus)} options={[{ value: "draft", label: "草稿" }, { value: "testing", label: "测试中" }, { value: "production", label: "正式" }, { value: "paused", label: "暂停" }]} /></Field><TextField label="上传超时（分钟）" type="number" value={form.upload_timeout_minutes} onChange={(value) => set("upload_timeout_minutes", value)} /><TextField label="最新进场天数" type="number" value={form.latest_entry_days} onChange={(value) => set("latest_entry_days", value)} placeholder="30" /><CheckField label="启用每日运行" checked={form.is_enabled} onChange={(value) => set("is_enabled", value)} /><CheckField label="无界面 Chromium" checked={form.headless} onChange={(value) => set("headless", value)} /><TextAreaField className="md:col-span-3" label="备注" value={form.remark} onChange={(value) => set("remark", value)} /></div></FormSection></div><DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={() => onOpen(false)}>取消</Button><Button type="submit" disabled={saving} className="bg-[#0f6b5d]">{saving && <Loader2 className="mr-2 size-4 animate-spin" />}保存配置</Button></DialogFooter></form></DialogContent></Dialog>;
}

function RunDetail({
  open,
  onOpen,
  run,
  loading,
  onDownload,
  itemResult,
  itemsLoading,
  itemPage,
  onItemPage,
  outcome,
  onOutcome,
  onExport,
}: {
  open: boolean;
  onOpen: (open: boolean) => void;
  run?: ReportRun;
  loading: boolean;
  onDownload: (id: string, name: string) => void;
  itemResult?: Awaited<ReturnType<typeof reportService.items>>;
  itemsLoading: boolean;
  itemPage: number;
  onItemPage: (page: number) => void;
  outcome: ResultOutcome;
  onOutcome: (value: ResultOutcome) => void;
  onExport: () => void;
}) {
  const pageCount = Math.max(
    1,
    Math.ceil((itemResult?.total ?? 0) / (itemResult?.page_size ?? 50)),
  );
  const finalResultArtifacts = latestFinalResultArtifacts(run?.artifacts ?? []);
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>运行详情</DialogTitle>
          <DialogDescription>
            {run
              ? `${run.config_name} · ${modeLabel(run.run_mode)}`
              : "正在加载"}
          </DialogDescription>
        </DialogHeader>
        {loading || !run ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <MiniStat
                label="状态"
                value={<RunStatusBadge status={run.status} />}
              />
              <MiniStat
                label="当前阶段"
                value={stageLabel(run.current_stage)}
              />
              <MiniStat label="人员条数" value={run.item_count} />
              <MiniStat label="报送结果" value={<RunResultSummary run={run} />} />
            </div>
            {run.error_summary && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {run.error_summary}
              </div>
            )}
            <section>
              <h3 className="mb-2 font-semibold">项目结果</h3>
              <div className="space-y-2">
                {run.projects?.length ? (
                  run.projects.map((project) => (
                    <div
                      key={project.id}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                        <div>
                          <div className="font-medium">
                            {project.external_project_name}
                          </div>
                          <div className="text-xs text-amber-700">
                            {project.last_error}
                          </div>
                        </div>
                        {run.status === "failed" ? <StatusBadge status="failed" /> : <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">流程完成</Badge>}
                        <span>成功 {project.upload_success_count} / 跳过 {project.upload_failure_count}</span>
                      </div>
                      <ProjectResultNote project={project} />
                    </div>
                  ))
                ) : (
                  <Empty text="尚无项目结果" />
                )}
              </div>
            </section>
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">人员报送结果</h3>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={itemsLoading}
                  onClick={onExport}
                >
                  <Download className="mr-2 size-4" />
                  导出当前分类 Excel
                </Button>
              </div>
              <div className="overflow-hidden rounded-lg border">
                <div className="border-b p-3">
                  <OutcomeTabs
                    value={outcome}
                    counts={itemResult?.counts}
                    onChange={onOutcome}
                  />
                </div>
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-white">
                      <TableRow>
                        <TableHead>姓名</TableHead>
                        <TableHead>项目</TableHead>
                        <TableHead>来源行</TableHead>
                        <TableHead>报送结果</TableHead>
                        <TableHead>完成时间</TableHead>
                        <TableHead>错误/说明</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsLoading ? (
                        <MessageRow text="人员结果加载中" />
                      ) : itemResult?.items.length ? (
                        itemResult.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.person_name}
                            </TableCell>
                            <TableCell className="max-w-72 truncate">
                              {item.project_name}
                            </TableCell>
                            <TableCell>{item.source_row_no ?? "-"}</TableCell>
                            <TableCell>
                              <PersonResult item={item} />
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatTime(item.pushed_at)}
                            </TableCell>
                            <TableCell className="max-w-72 text-xs text-red-600">
                              {item.last_error ||
                                (item.status === "result_unknown"
                                  ? "政府只返回批量汇总，无法确认此人结果"
                                  : "-")}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <MessageRow text="当前分类暂无人员数据" />
                      )}
                    </TableBody>
                  </Table>
                </div>
                <ResultPagination
                  total={itemResult?.total ?? 0}
                  page={itemPage}
                  pageCount={pageCount}
                  loading={itemsLoading}
                  onPage={onItemPage}
                />
              </div>
            </section>
            <section>
              <h3 className="mb-2 font-semibold">对方平台最终失败结果</h3>
              <div className="flex flex-wrap gap-2">
                {finalResultArtifacts.length ? (
                  finalResultArtifacts.map((artifact) => (
                    <Button
                      key={artifact.id}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onDownload(artifact.id, artifact.original_filename)
                      }
                    >
                      <Download className="mr-2 size-4" />
                      {artifact.original_filename}
                    </Button>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">对方平台未返回失败结果文件</span>
                )}
              </div>
            </section>
            <section>
              <h3 className="mb-2 font-semibold">运行日志</h3>
              <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-200">
                {run.events?.length ? (
                  run.events.map((event) => (
                    <div
                      key={event.id}
                      className={
                        event.level === "error"
                          ? "text-red-300"
                          : event.level === "warning"
                            ? "text-amber-300"
                            : ""
                      }
                    >
                      <span className="text-slate-500">
                        {formatTime(event.created_at)}
                      </span>{" "}
                      [{stageLabel(event.stage)}] {event.message}
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500">暂无日志</div>
                )}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function latestFinalResultArtifacts(artifacts: RunArtifact[]) {
  const latestByProject = new Map<string, RunArtifact>();
  artifacts.filter((artifact) => artifact.artifact_type === "error_detail").forEach((artifact) => {
    const key = artifact.run_project_id || "run";
    const current = latestByProject.get(key);
    if (!current || new Date(artifact.created_at).getTime() > new Date(current.created_at).getTime()) latestByProject.set(key, artifact);
  });
  return Array.from(latestByProject.values()).sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function ProjectResultNote({ project }: { project: RunProject }) {
  if (
    !(
      project.upload_success_count > 0 &&
      project.upload_failure_count > 0 &&
      project.target_receipt?.person_details_available === false
    )
  )
    return null;
  return (
    <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
      政府平台确认成功 {project.upload_success_count} 条、跳过{" "}
      {project.upload_failure_count}{" "}
      条，但错误明细未返回完整人员名单，无法可靠定位具体姓名。
    </div>
  );
}

function PersonResult({ item }: { item: ReportItem }) {
  if (item.target_result?.already_exists)
    return (
      <div>
        <Badge
          variant="outline"
          className="border-amber-200 bg-amber-50 text-amber-700"
        >
          政府平台已存在
        </Badge>
        <div className="mt-1 text-xs text-slate-500">
          已跳过，未重复提交
        </div>
      </div>
    );
  if (item.status === "result_unknown")
    return (
      <div>
        <Badge
          variant="outline"
          className="border-amber-200 bg-amber-50 text-amber-700"
        >
          未对应到个人
        </Badge>
        <div className="mt-1 text-xs text-slate-500">
          仅有批量汇总，无法确认此人结果
        </div>
      </div>
    );
  if (item.status === "submitted") return <StatusBadge status="submitted" />;
  if (item.status === "validated") return <StatusBadge status="validated" />;
  if (["failed", "submitted_with_errors", "validated_with_errors"].includes(item.status)) return <div><Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">已跳过</Badge>{item.last_error && <div className="mt-1 max-w-72 text-xs text-amber-700">{item.last_error}</div>}</div>;
  return (
    <div>
      <StatusBadge status={item.status} />
      {item.last_error && (
        <div className="mt-1 max-w-72 text-xs text-red-600">
          {item.last_error}
        </div>
      )}
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status === "partial_success" ? "success" : status} />;
}

function StatusBadge({ status }: { status: string }) {
  const color = ["success", "submitted", "validated", "idle"].includes(status)
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : ["failed", "offline"].includes(status)
      ? "border-red-200 bg-red-50 text-red-700"
      : ["running", "busy"].includes(status)
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : [
              "partial_success",
              "submitted_with_errors",
              "validated_with_errors",
              "warning",
            ].includes(status)
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <Badge variant="outline" className={color}>
      {statusLabel(status)}
    </Badge>
  );
}
function LifecycleBadge({ config }: { config: ReportConfig }) {
  return config.is_enabled ? (
    <Badge className="bg-emerald-600">正式启用</Badge>
  ) : (
    <Badge variant="outline">
      {
        {
          draft: "草稿",
          testing: "测试中",
          production: "正式未启用",
          paused: "已暂停",
        }[config.lifecycle_status]
      }
    </Badge>
  );
}
function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border p-4">
      <h3 className="mb-4 font-semibold">{title}</h3>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function TextField({ label, value, onChange, type = "text", placeholder, className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; className?: string }) { return <div className={`space-y-2 ${className}`}><Label>{label}</Label><Input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></div>; }
function TextAreaField({ label, value, onChange, disabled, placeholder, description, className = "" }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; description?: string; className?: string }) { return <div className={`space-y-2 ${className}`}><Label>{label}</Label><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50" value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />{description && <p className="text-xs text-slate-500">{description}</p>}</div>; }
function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm"><Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />{label}</label>; }
function NativeSelect({ value, onChange, options, placeholder }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string }) { return <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{placeholder && <option value="">{placeholder}</option>}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>; }
function Empty({ text }: { text: string }) { return <div className="rounded-lg border border-dashed py-8 text-center text-sm text-slate-500">{text}</div>; }
function MessageRow({ text }: { text: string }) { return <TableRow><TableCell colSpan={10} className="h-28 text-center text-slate-500">{text}</TableCell></TableRow>; }
function lines(value: string) { return Array.from(new Set(value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))); }
function formatTime(value?: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-"; }
function tabLabel(tab: Tab) { return { dashboard: "调试-工作台", configs: "报送配置", tests: "调试-测试中心", runs: "运行任务", data: "调试-报送数据" }[tab]; }
function modeLabel(mode: RunMode) { return { production: "正式运行", test_source_login: "源站登录测试", test_project_list: "项目读取测试", test_download: "下载测试", test_transform: "转换测试", test_target_login: "目标站登录测试", test_upload_validate: "上传校验", test_submit: "真实提交测试", test_full: "全流程测试" }[mode]; }
function stageLabel(stage: string) { return ({ queued: "排队", starting: "启动", source_login: "源站登录", project_list: "读取项目", download: "下载", prepare_source: "读取源文件", transform: "转换", prepare_upload: "准备上传", target_login: "目标站登录", target_upload: "目标站上报", finalizing: "汇总", success: "完成", failed: "失败", cancelled: "取消" } as Record<string, string>)[stage] ?? stage; }
function statusLabel(status: string) { return ({ pending: "等待", running: "运行中", cancelling: "取消中", cancelled: "已取消", success: "成功", partial_success: "部分成功", failed: "失败", submitted: "已提交", submitted_with_errors: "提交有错误", validated: "校验通过", validated_with_errors: "校验有错误", result_unknown: "未对应到个人", idle: "空闲", busy: "忙碌", offline: "离线", converted: "已转换", downloaded: "已下载" } as Record<string, string>)[status] ?? status; }
function errorMessage(error: unknown) { const value = error as { response?: { data?: { message?: string } }; message?: string }; return value.response?.data?.message || value.message || "操作失败"; }
