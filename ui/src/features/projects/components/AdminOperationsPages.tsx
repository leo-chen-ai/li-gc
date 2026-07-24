import { useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Landmark,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RadioTower,
  RefreshCw,
  Search,
  TrendingUp,
  Trash2,
  Upload,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProjectSearchSelect } from "@/features/projects/components/ProjectSearchSelect";
import { constructionProjectService } from "@/features/projects/services/construction-project-service";
import {
  buildWorkHourRules,
  createDefaultWorkHourRuleForm,
  parseWorkHourRules,
  summarizeWorkHourRules,
  type WorkHourSegmentForm,
  type WorkHourRuleForm,
} from "@/features/projects/lib/work-hour-rules";
import {
  buildAdminOverviewMetrics,
  formatMoneyCompact as formatOverviewMoney,
  formatPercent as formatOverviewPercent,
  type AdminOverviewKpiIcon,
  type AdminOverviewMatrixRow,
  type AdminOverviewTone,
} from "@/features/projects/lib/admin-overview-metrics";
import {
  BUILT_IN_PLATFORM_OPTIONS,
  NINGBO_HOUSING_DEFAULT_BASE_URL,
  NINGBO_HOUSING_PLATFORM_NAME,
  NINGBO_HOUSING_PLATFORM_TYPE,
  YONGXIN_V2_PLATFORM_NAME,
  YONGXIN_V2_PLATFORM_TYPE,
  buildNingboHousingConfig,
  buildYongxinV2Config,
  createNingboHousingConfigForm,
  createYongxinV2ConfigForm,
  isNingboHousingConfig,
  isYongxinV2Config,
  parseNingboHousingConfig,
  parseYongxinV2Config,
  summarizePlatformConfig,
  validateNingboHousingConfig,
  validateYongxinV2Config,
} from "@/features/projects/lib/platform-configs";
import {
  useAllWorkHourConfigsQuery,
  useConstructionOverviewQuery,
  useContractTemplatesQuery,
  useCreateContractTemplateMutation,
  useCreatePlatformConfigMutation,
  useCreatePlatformLogMutation,
  useCreateWorkHourConfigMutation,
  useDeleteContractTemplateMutation,
  useDeletePlatformConfigMutation,
  useDeletePlatformLogMutation,
  useDeleteWorkHourConfigMutation,
  usePlatformConfigsQuery,
  usePlatformLogsQuery,
  useRetryPlatformJobMutation,
  useProjectsQuery,
  useUpdateContractTemplateMutation,
  useUpdatePlatformConfigMutation,
  useUpdatePlatformLogMutation,
  useUpdateWorkHourConfigMutation,
} from "@/features/projects/hooks/use-construction-projects";
import type {
  ConstructionContractTemplate,
  ConstructionContractTemplatePayload,
  ConstructionModuleListFilters,
  ConstructionPlatformConfig,
  ConstructionPlatformConfigPayload,
  ConstructionPlatformLog,
  ConstructionPlatformLogPayload,
  ConstructionProject,
  ConstructionWorkHourConfig,
  ConstructionWorkHourConfigPayload,
  JsonValue,
  UploadFileRecord,
} from "@/features/projects/types/construction-types";

const pageSize = 10;

export function AdminOverviewPage() {
  const overview = useConstructionOverviewQuery();
  const data = overview.data;
  const metrics = buildAdminOverviewMetrics(data);
  const attendanceTrend = data?.attendance_trend ?? [];
  const projectStatusData = (data?.project_status_distribution ?? []).map((item) => ({
    name: statusLabel(item.status),
    count: item.count,
  }));
  const platformStatusData = (data?.platform_status_distribution ?? []).map((item) => ({
    ...item,
    label: platformStatusLabel(item.status),
  }));
  const wagePaidWidth = `${Math.round(metrics.wage.paidRate * 100)}%`;

  return (
    <div className="space-y-3">
      <section className="rounded-xl border bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <BarChart3 className="size-3.5" />
              首页总览 / 经营数据
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
              <h1 className="text-xl font-semibold tracking-normal text-slate-950">经营数据总览</h1>
              <p className="text-sm text-slate-500">按项目、劳务、工资、考勤和平台对接汇总经营健康度。</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1"><CalendarDays className="size-3.5" />7 日考勤 {metrics.attendance.sevenDayCount} 次</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1"><TrendingUp className="size-3.5" />工资发放率 {formatOverviewPercent(metrics.wage.paidRate)}</span>
            <Button variant="outline" size="sm" onClick={() => void overview.refetch()} disabled={overview.isFetching}>
              <RefreshCw className={`mr-2 size-4 ${overview.isFetching ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>
        </div>
      </section>

      {overview.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          经营数据加载失败，请检查登录状态或后端服务。
        </div>
      ) : null}

      <section className="grid overflow-hidden rounded-xl border bg-white shadow-sm md:grid-cols-4 xl:grid-cols-7">
        {metrics.kpis.map((item) => (
          <OverviewKpiStrip key={item.label} {...item} />
        ))}
      </section>

      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <ChartCard title="项目经营矩阵">
          <div className="overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[1.05fr_1.15fr_1fr_0.9fr_1.5fr] bg-[#f8faf9] px-3 py-2 text-xs font-medium text-slate-500">
              <span>维度</span>
              <span>当前值</span>
              <span>健康度</span>
              <span>风险</span>
              <span>建议动作</span>
            </div>
            {metrics.matrixRows.map((row) => (
              <OverviewMatrixRow key={row.label} row={row} />
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title="资金与工资"
          action={<Badge variant="outline" className={metrics.wage.unpaidCents > 0 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{formatOverviewPercent(metrics.wage.paidRate)}</Badge>}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>已发工资 {formatOverviewMoney(metrics.wage.paidCents)}</span>
              <span>未发工资 {formatOverviewMoney(metrics.wage.unpaidCents)}</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-amber-100">
              <div className="h-full rounded-full bg-[#0f6b5d]" style={{ width: wagePaidWidth }} />
            </div>
            <MoneyRail label="应发工资" amount={metrics.wage.payableCents} icon={Landmark} />
            <MoneyRail label="已发工资" amount={metrics.wage.paidCents} icon={CheckCircle2} accent="#0f6b5d" />
            <MoneyRail label="未发工资" amount={metrics.wage.unpaidCents} icon={AlertTriangle} accent={metrics.wage.unpaidCents > 0 ? "#d97706" : "#0f6b5d"} />
            <div className="rounded-lg border bg-[#f8faf9] px-3 py-2 text-xs text-slate-600">
              工资发放率 = 已发工资 / 应发工资；未发工资 = 应发工资 - 已发工资。
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
        <ChartCard
          title="近 7 日考勤活跃"
          action={<span className="inline-flex items-center gap-1 text-xs text-slate-500"><Activity className="size-3.5" />日均 {metrics.attendance.sevenDayAverage.toFixed(1)} 次 · 峰值 {metrics.attendance.peakCount} 次</span>}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={attendanceTrend}>
              <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatShortDate} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} width={34} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => [`${value} 次`, "考勤"]} labelFormatter={(label) => `日期 ${label}`} />
              <Line type="monotone" dataKey="count" stroke="#0f6b5d" strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="项目状态分布">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={projectStatusData}>
              <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} width={30} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => [`${value} 个`, "项目"]} />
              <Bar dataKey="count" fill="#0f6b5d" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title="平台日志状态"
        action={<span className="text-xs text-slate-500">累计日志 {metrics.platform.totalCount} 条</span>}
      >
        <div className="grid gap-2 md:grid-cols-3">
          {platformStatusData.length === 0 ? (
            <EmptyOverviewState icon={ClipboardCheck} label="暂无平台日志" helper="平台推送或同步后会在这里统计状态。" />
          ) : (
            platformStatusData.map((item) => (
              <StatusPill key={item.status} status={item.status} label={item.label} count={item.count} total={metrics.platform.totalCount} />
            ))
          )}
        </div>
      </ChartCard>
    </div>
  );
}

export function ContractTemplateManagementPage() {
  const [filters, setFilters] = useState<ConstructionModuleListFilters>({ page: 1, page_size: pageSize });
  const query = useContractTemplatesQuery(filters);
  const createTemplate = useCreateContractTemplateMutation();
  const updateTemplate = useUpdateContractTemplateMutation();
  const deleteTemplate = useDeleteContractTemplateMutation();
  const [editing, setEditing] = useState<ConstructionContractTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    content:
      "",
    template_file: null as UploadFileRecord | null,
    template_file_object_key: "",
    template_file_name: "",
    template_file_content_type: "",
    is_enabled: true,
    is_default: false,
    remark: "",
  });
  const templates = query.data?.items ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      code: "",
      content: "",
      template_file: null,
      template_file_object_key: "",
      template_file_name: "",
      template_file_content_type: "",
      is_enabled: true,
      is_default: false,
      remark: "",
    });
    setDialogOpen(true);
  };
  const openEdit = (template: ConstructionContractTemplate) => {
    setEditing(template);
    setForm({
      name: template.name,
      code: template.code ?? "",
      content: template.content,
      template_file: uploadRecordFromJson(template.template_file),
      template_file_object_key: template.template_file_object_key ?? "",
      template_file_name: template.template_file_name ?? "",
      template_file_content_type: template.template_file_content_type ?? "",
      is_enabled: template.is_enabled,
      is_default: template.is_default,
      remark: template.remark ?? "",
    });
    setDialogOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("请填写模板名称");
      return;
    }
    if (!form.template_file_object_key && !form.content.trim()) {
      toast.error("请上传 Word 模板文件，或填写兜底文本模板");
      return;
    }
    const payload: ConstructionContractTemplatePayload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      content: form.content,
      template_file: form.template_file as unknown as JsonValue | null,
      template_file_object_key: form.template_file_object_key || null,
      template_file_name: form.template_file_name || null,
      template_file_content_type: form.template_file_content_type || null,
      is_enabled: form.is_enabled,
      is_default: form.is_default,
      remark: form.remark.trim() || null,
    };
    try {
      if (editing) {
        await updateTemplate.mutateAsync({ templateId: editing.id, payload });
        toast.success("合同模板已修改");
      } else {
        await createTemplate.mutateAsync(payload);
        toast.success("合同模板已新增");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存合同模板失败");
    }
  };

  const remove = async (template: ConstructionContractTemplate) => {
    if (!window.confirm(`确认删除合同模板「${template.name}」？`)) return;
    try {
      await deleteTemplate.mutateAsync(template.id);
      toast.success("合同模板已删除");
    } catch {
      toast.error("删除合同模板失败");
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<FileText className="size-4" />}
        label="劳务分包合同模板"
        title="劳务分包合同模板"
        description="上传 Word 合同模板，下载时自动把工人、项目、班组等变量渲染进去。"
        action={<Button onClick={openCreate} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]"><Plus className="mr-2 size-4" />新增模板</Button>}
      />
      <ListToolbar
        keyword={filters.keyword ?? ""}
        onKeywordChange={(keyword) => setFilters((current) => ({ ...current, keyword, page: 1 }))}
        placeholder="搜索模板名称、编码、备注"
      />
      <DataTable
        loading={query.isLoading}
        colSpan={8}
        headers={["模板名称", "编码", "模板文件", "状态", "默认", "更新时间", "备注", "操作"]}
      >
        {templates.map((template) => (
          <TableRow key={template.id}>
            <TableCell className="max-w-[260px] truncate font-medium">{template.name}</TableCell>
            <TableCell>{template.code || "-"}</TableCell>
            <TableCell className="max-w-[220px] truncate">{template.template_file_name || "文本兜底"}</TableCell>
            <TableCell><EnabledBadge enabled={template.is_enabled} /></TableCell>
            <TableCell>{template.is_default ? <Badge className="bg-[#0f6b5d]">默认</Badge> : "-"}</TableCell>
            <TableCell>{formatDateTime(template.updated_at)}</TableCell>
            <TableCell className="max-w-[260px] truncate">{template.remark || "-"}</TableCell>
            <TableCell className="text-right">
              <RowActions onEdit={() => openEdit(template)} onDelete={() => void remove(template)} />
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      <Pager total={query.data?.total ?? 0} page={filters.page ?? 1} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-4xl">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editing ? "编辑合同模板" : "新增合同模板"}</DialogTitle>
              <DialogDescription>上传 .docx 模板，支持中文变量如 {"{{项目名称}}"}、{"{{工人姓名}}"}；没有值的变量会原样保留。</DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <TextField label="模板名称" value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} required />
              <TextField label="模板编码" value={form.code} onChange={(code) => setForm((current) => ({ ...current, code }))} />
              <ContractTemplateUploadField
                fileName={form.template_file_name}
                isUploaded={Boolean(form.template_file_object_key)}
                onUploaded={(record) => setForm((current) => ({
                  ...current,
                  template_file: record,
                  template_file_object_key: record.object_key,
                  template_file_name: record.original_filename || record.object_key.split("/").pop() || "模板.docx",
                  template_file_content_type: record.content_type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                }))}
                onClear={() => setForm((current) => ({
                  ...current,
                  template_file: null,
                  template_file_object_key: "",
                  template_file_name: "",
                  template_file_content_type: "",
                }))}
              />
              <CheckboxField label="启用模板" checked={form.is_enabled} onChange={(is_enabled) => setForm((current) => ({ ...current, is_enabled }))} />
              <CheckboxField label="设为全局默认" checked={form.is_default} onChange={(is_default) => setForm((current) => ({ ...current, is_default }))} />
              <TextareaField className="md:col-span-2" label="兜底文本模板（没有上传 Word 文件时使用）" value={form.content} onChange={(content) => setForm((current) => ({ ...current, content }))} rows={4} />
              <TextareaField className="md:col-span-2" label="备注" value={form.remark} onChange={(remark) => setForm((current) => ({ ...current, remark }))} rows={3} />
            </div>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={createTemplate.isPending || updateTemplate.isPending} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function WorkHourConfigPage() {
  const [keyword, setKeyword] = useState("");
  const projectsQuery = useProjectsQuery();
  const configsQuery = useAllWorkHourConfigsQuery();
  const createConfig = useCreateWorkHourConfigMutation();
  const updateConfig = useUpdateWorkHourConfigMutation();
  const deleteConfig = useDeleteWorkHourConfigMutation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ConstructionProject | null>(null);
  const [editing, setEditing] = useState<ConstructionWorkHourConfig | null>(null);
  const [form, setForm] = useState({
    project_id: "",
    name: "",
    algorithm_type: "tiered_duration",
    rules: createDefaultWorkHourRuleForm(),
    is_enabled: true,
    remark: "",
  });
  const projects = projectsQuery.data ?? [];
  const configByProject = latestWorkHourConfigByProject(configsQuery.data ?? []);
  const rows = projects.filter((project) =>
    projectMatchesWorkHourKeyword(project, configByProject.get(project.id), keyword)
  );
  const configuredCount = projects.filter((project) => configByProject.get(project.id)?.is_enabled).length;

  const openProjectConfig = (project: ConstructionProject) => {
    const config = configByProject.get(project.id) ?? null;
    setSelectedProject(project);
    setEditing(config);
    setForm({
      project_id: project.id,
      name: config?.name || `${project.name || "项目"}工时段配置`,
      algorithm_type: "tiered_duration",
      rules: config ? parseWorkHourRules(config.rules) : createDefaultWorkHourRuleForm(),
      is_enabled: config?.is_enabled ?? true,
      remark: config?.remark ?? "",
    });
    setDialogOpen(true);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.project_id) {
      toast.error("请选择项目");
      return;
    }
    const payload: ConstructionWorkHourConfigPayload = {
      project_id: form.project_id,
      name: form.name.trim() || `${selectedProject?.name || "项目"}工时段配置`,
      algorithm_type: "tiered_duration",
      rules: buildWorkHourRules(form.rules),
      is_enabled: form.is_enabled,
      remark: form.remark.trim() || null,
    };
    try {
      if (editing) {
        await updateConfig.mutateAsync({ configId: editing.id, payload });
        toast.success("工时配置已修改");
      } else {
        await createConfig.mutateAsync(payload);
        toast.success("工时配置已新增");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存工时配置失败");
    }
  };
  const resetProjectConfig = async (project: ConstructionProject, config: ConstructionWorkHourConfig | undefined) => {
    if (!config) return;
    if (!window.confirm(`确认恢复「${project.name || "未命名项目"}」默认工时规则？`)) return;
    try {
      await deleteConfig.mutateAsync(config.id);
      toast.success("项目已恢复默认工时规则");
    } catch {
      toast.error("恢复默认工时规则失败");
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Clock3 className="size-4" />}
        label="工时配置"
        title="项目工时配置"
        description="打开即显示所有项目；每个项目单独配置工时段，保存后影响该项目考勤月历的记工计算。"
      />
      <div className="grid gap-3 rounded-lg border bg-[#f8faf9] p-3 lg:grid-cols-[minmax(260px,1fr)_auto_auto] lg:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索项目名称、总承包单位、建设单位" className="pl-9" />
        </div>
        <MetricPill label="项目" value={projects.length} />
        <MetricPill label="已配置" value={configuredCount} />
      </div>
      <DataTable loading={projectsQuery.isLoading || configsQuery.isLoading} colSpan={7} headers={["项目名称", "总承包单位", "建设单位", "配置状态", "工时段规则", "更新时间", "操作"]}>
        {rows.map((project) => {
          const config = configByProject.get(project.id);
          return (
          <TableRow key={project.id}>
            <TableCell className="max-w-[300px] truncate font-medium">{project.name || "未命名项目"}</TableCell>
            <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">{project.contractor || "-"}</TableCell>
            <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">{project.build_unit || "-"}</TableCell>
            <TableCell><WorkHourConfigStatusBadge config={config} /></TableCell>
            <TableCell className="max-w-[460px] truncate text-xs text-muted-foreground">{workHourConfigRuleSummary(config)}</TableCell>
            <TableCell>{config ? formatDateTime(config.updated_at) : "-"}</TableCell>
            <TableCell className="text-right">
              <div className="inline-flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => openProjectConfig(project)} className="text-[#0f6b5d]">
                  <Pencil className="mr-1 size-3.5" />工时配置
                </Button>
                {config ? (
                  <Button variant="ghost" size="sm" onClick={() => void resetProjectConfig(project, config)} className="text-red-600">
                    <Trash2 className="mr-1 size-3.5" />恢复默认
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
          );
        })}
      </DataTable>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-5xl">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editing ? "编辑项目工时段配置" : "配置项目工时段"}</DialogTitle>
              <DialogDescription>
                {selectedProject?.name || "当前项目"}：默认不配置时 2-4 小时算 0.5，4-20 小时算 1，20 小时以上算 1.5。
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>项目</Label>
                <div className="flex h-10 items-center rounded-md border bg-[#f8faf9] px-3 text-sm">{selectedProject?.name || "-"}</div>
              </div>
              <CheckboxField label="启用该项目工时配置" checked={form.is_enabled} onChange={(is_enabled) => setForm((current) => ({ ...current, is_enabled }))} />
              <WorkHourRuleFields
                value={form.rules}
                onChange={(rules) => setForm((current) => ({ ...current, rules }))}
              />
              <TextareaField className="md:col-span-2" label="备注" value={form.remark} onChange={(remark) => setForm((current) => ({ ...current, remark }))} rows={3} />
            </div>
            <DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button type="submit" disabled={createConfig.isPending || updateConfig.isPending} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]">{createConfig.isPending || updateConfig.isPending ? "保存中" : "保存"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PlatformIntegrationPage() {
  const [tab, setTab] = useState<"configs" | "logs">("configs");
  const [filters, setFilters] = useState<ConstructionModuleListFilters>({ page: 1, page_size: pageSize });
  const tabControls = <PlatformTabControls tab={tab} setTab={setTab} />;
  return (
    <div className="space-y-4">
      <PageHeader icon={<Link2 className="size-4" />} label="平台对接管理" title="平台对接管理" description="维护项目平台配置、查看今日 API 交互统计和推送日志。" />
      {tab === "configs" ? (
        <PlatformConfigPanel filters={filters} setFilters={setFilters} tabControls={tabControls} />
      ) : (
        <PlatformLogPanel filters={filters} setFilters={setFilters} tabControls={tabControls} />
      )}
    </div>
  );
}

function PlatformTabControls({ tab, setTab }: { tab: "configs" | "logs"; setTab: (tab: "configs" | "logs") => void }) {
  return (
    <div className="inline-flex rounded-md border bg-white p-1">
      <Button type="button" size="sm" variant={tab === "configs" ? "default" : "ghost"} onClick={() => setTab("configs")} className={tab === "configs" ? "bg-[#0f6b5d]" : ""}>平台配置</Button>
      <Button type="button" size="sm" variant={tab === "logs" ? "default" : "ghost"} onClick={() => setTab("logs")} className={tab === "logs" ? "bg-[#0f6b5d]" : ""}>平台日志</Button>
    </div>
  );
}

function PlatformConfigPanel({ filters, setFilters, tabControls }: { filters: ConstructionModuleListFilters; setFilters: (updater: (current: ConstructionModuleListFilters) => ConstructionModuleListFilters) => void; tabControls: ReactNode }) {
  const query = usePlatformConfigsQuery(filters);
  const createConfig = useCreatePlatformConfigMutation();
  const updateConfig = useUpdatePlatformConfigMutation();
  const deleteConfig = useDeletePlatformConfigMutation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ConstructionPlatformConfig | null>(null);
  const [form, setForm] = useState(createNingboHousingConfigForm);
  const rows = query.data?.items ?? [];
  const selectedPlatform = BUILT_IN_PLATFORM_OPTIONS.find((option) => option.value === form.platform_type);
  const openCreate = () => { setEditing(null); setForm(createNingboHousingConfigForm()); setDialogOpen(true); };
  const openEdit = (config: ConstructionPlatformConfig) => {
    if (!isNingboHousingConfig(config) && !isYongxinV2Config(config)) {
      toast.error("当前平台暂未内置配置表单");
      return;
    }
    setEditing(config);
    setForm(isYongxinV2Config(config) ? parseYongxinV2Config(config) : parseNingboHousingConfig(config));
    setDialogOpen(true);
  };
  const selectPlatform = (platform_type: string) => {
    const empty = platform_type === YONGXIN_V2_PLATFORM_TYPE
      ? createYongxinV2ConfigForm()
      : createNingboHousingConfigForm();
    setForm((current) => ({
      ...empty,
      project_id: current.project_id,
      platform_type,
      base_url: platform_type === NINGBO_HOUSING_PLATFORM_TYPE ? NINGBO_HOUSING_DEFAULT_BASE_URL : "",
      is_enabled: current.is_enabled,
      remark: current.remark,
    }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const isYongxin = form.platform_type === YONGXIN_V2_PLATFORM_TYPE;
    const validationError = isYongxin ? validateYongxinV2Config(form) : validateNingboHousingConfig(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const payload: ConstructionPlatformConfigPayload = {
      project_id: form.project_id,
      platform_name: isYongxin ? YONGXIN_V2_PLATFORM_NAME : NINGBO_HOUSING_PLATFORM_NAME,
      platform_type: isYongxin ? YONGXIN_V2_PLATFORM_TYPE : NINGBO_HOUSING_PLATFORM_TYPE,
      config: isYongxin ? buildYongxinV2Config(form) : buildNingboHousingConfig(form),
      is_enabled: form.is_enabled,
      remark: form.remark.trim() || null,
    };
    try {
      if (editing) { await updateConfig.mutateAsync({ configId: editing.id, payload }); toast.success("平台配置已修改"); }
      else { await createConfig.mutateAsync(payload); toast.success("平台配置已新增"); }
      setDialogOpen(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "保存平台配置失败"); }
  };
  const remove = async (config: ConstructionPlatformConfig) => {
    if (!window.confirm(`确认删除平台配置「${config.platform_name}」？`)) return;
    try { await deleteConfig.mutateAsync(config.id); toast.success("平台配置已删除"); } catch { toast.error("删除平台配置失败"); }
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3 shadow-sm">
        {tabControls}
        <Button onClick={openCreate} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]"><Plus className="mr-2 size-4" />新增平台配置</Button>
      </div>
      <ModuleFilters filters={filters} setFilters={setFilters} placeholder="搜索项目、平台、备注" />
      <DataTable loading={query.isLoading} colSpan={7} headers={["平台名称", "项目", "类型", "状态", "配置", "更新时间", "操作"]}>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.platform_name}</TableCell>
            <TableCell className="max-w-[260px] truncate">{row.project_name || row.project_id}</TableCell>
            <TableCell>{platformTypeLabel(row.platform_type)}</TableCell>
            <TableCell><EnabledBadge enabled={row.is_enabled} /></TableCell>
            <TableCell className="max-w-[320px] truncate text-xs text-slate-500">{summarizePlatformConfig(row)}</TableCell>
            <TableCell>{formatDateTime(row.updated_at)}</TableCell>
            <TableCell className="text-right"><RowActions onEdit={() => openEdit(row)} onDelete={() => void remove(row)} /></TableCell>
          </TableRow>
        ))}
      </DataTable>
      <Pager total={query.data?.total ?? 0} page={filters.page ?? 1} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editing ? "编辑平台配置" : "新增平台配置"}</DialogTitle>
              <DialogDescription>先选择项目和对接平台，再填写该平台需要的配置。</DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <section className="rounded-lg border p-4">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-slate-900">基础关联</div>
                  <div className="mt-1 text-xs text-slate-500">一个项目可以添加多个不同的对接平台。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>山淮筑项目 <span className="text-red-500">*</span></Label><ProjectSearchSelect value={form.project_id} onValueChange={(project_id) => setForm((current) => ({ ...current, project_id }))} /></div>
                  <div className="space-y-2">
                    <Label>对接平台 <span className="text-red-500">*</span></Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0f6b5d]/20"
                      value={form.platform_type}
                      disabled={Boolean(editing)}
                      onChange={(event) => selectPlatform(event.target.value)}
                    >
                      <option value="">请选择对接平台</option>
                      {BUILT_IN_PLATFORM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2"><CheckboxField label="启用该平台配置" checked={form.is_enabled} onChange={(is_enabled) => setForm((current) => ({ ...current, is_enabled }))} /></div>
                </div>
              </section>

              {selectedPlatform ? <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#0f6b5d] text-white"><Landmark className="size-5" /></span>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-950">{selectedPlatform.label}</div>
                  <div className="mt-0.5 text-xs text-slate-600">实名制平台第三方数据直连接口</div>
                </div>
                <Badge variant="outline" className="ml-auto border-emerald-200 bg-white text-emerald-700">已内置</Badge>
              </div> : null}

              {form.platform_type === NINGBO_HOUSING_PLATFORM_TYPE ? <>
                <section className="rounded-lg border p-4">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-slate-900">接口凭证</div>
                  <div className="mt-1 text-xs text-slate-500">AppKey 和 AppSecret 由宁波市住建平台提供，系统会自动生成请求签名。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <PlatformCredentialField className="md:col-span-2" label="接口地址" value={form.base_url} onChange={(base_url) => setForm((current) => ({ ...current, base_url }))} placeholder="http://183.136.157.18:7334" />
                  <PlatformCredentialField label="AppKey" value={form.app_key} onChange={(app_key) => setForm((current) => ({ ...current, app_key }))} autoComplete="off" />
                  <PlatformCredentialField label="AppSecret" value={form.app_secret} onChange={(app_secret) => setForm((current) => ({ ...current, app_secret }))} type="password" autoComplete="new-password" />
                </div>
                </section>

                <section className="rounded-lg border p-4">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-slate-900">宁波项目参数</div>
                  <div className="mt-1 text-xs text-slate-500">以下信息可在宁波平台项目详情中查看。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <PlatformCredentialField label="项目 GUID" value={form.project_guid} onChange={(project_guid) => setForm((current) => ({ ...current, project_guid }))} />
                  <PlatformCredentialField label="宁波平台项目 ID" value={form.external_project_id} onChange={(external_project_id) => setForm((current) => ({ ...current, external_project_id }))} inputMode="numeric" />
                  <PlatformCredentialField label="统一社会信用代码" value={form.corp_code} onChange={(corp_code) => setForm((current) => ({ ...current, corp_code }))} />
                  <PlatformCredentialField label="发改立项编号" value={form.approval_number} onChange={(approval_number) => setForm((current) => ({ ...current, approval_number }))} />
                </div>
                </section>
              </> : null}

              {form.platform_type === YONGXIN_V2_PLATFORM_TYPE ? <>
                <section className="rounded-lg border p-4">
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-slate-900">接口凭证</div>
                    <div className="mt-1 text-xs text-slate-500">凭证由甬薪精管平台提供。测试模式只生成异步任务和日志，不发起真实请求。</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <PlatformCredentialField className="md:col-span-2" label="接口地址" value={form.base_url} onChange={(base_url) => setForm((current) => ({ ...current, base_url }))} placeholder="https://平台提供的接口地址/" />
                    <PlatformCredentialField label="项目对接码" value={form.project_code} onChange={(project_code) => setForm((current) => ({ ...current, project_code }))} autoComplete="off" />
                    <div className="space-y-2">
                      <Label>运行模式</Label>
                      <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.mode} onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value as "test" | "production" }))}>
                        <option value="test">测试模式（不发真实请求）</option>
                        <option value="production">正式模式（自动推送）</option>
                      </select>
                    </div>
                    <PlatformCredentialField label="AppKey" value={form.app_key} onChange={(app_key) => setForm((current) => ({ ...current, app_key }))} autoComplete="off" />
                    <PlatformCredentialField label="AppSecret" value={form.app_secret} onChange={(app_secret) => setForm((current) => ({ ...current, app_secret }))} type="password" autoComplete="new-password" />
                  </div>
                </section>

                <section className="rounded-lg border p-4">
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-slate-900">异步同步范围</div>
                    <div className="mt-1 text-xs text-slate-500">每个平台单独排队、限流、重试和记录日志；一个平台失败不会影响本地业务或其他平台。</div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <CheckboxField label="同步参建单位" checked={form.sync_units} onChange={(sync_units) => setForm((current) => ({ ...current, sync_units }))} />
                    <CheckboxField label="同步班组" checked={form.sync_teams} onChange={(sync_teams) => setForm((current) => ({ ...current, sync_teams }))} />
                    <CheckboxField label="同步人员与进退场" checked={form.sync_workers} onChange={(sync_workers) => setForm((current) => ({ ...current, sync_workers }))} />
                    <CheckboxField label="考勤机数据自动推送" checked={form.sync_attendance} onChange={(sync_attendance) => setForm((current) => ({ ...current, sync_attendance }))} />
                    <PlatformCredentialField className="md:col-span-2" label="历史考勤补传起始日期（留空则从启用时开始）" value={form.attendance_backfill_from} onChange={(attendance_backfill_from) => setForm((current) => ({ ...current, attendance_backfill_from }))} type="date" required={false} />
                  </div>
                </section>
              </> : null}

              <TextareaField label="备注" value={form.remark} onChange={(remark) => setForm((current) => ({ ...current, remark }))} rows={3} />
            </div>
            <DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button type="submit" disabled={createConfig.isPending || updateConfig.isPending} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]">{createConfig.isPending || updateConfig.isPending ? "保存中" : "保存配置"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PlatformLogPanel({ filters, setFilters, tabControls }: { filters: ConstructionModuleListFilters; setFilters: (updater: (current: ConstructionModuleListFilters) => ConstructionModuleListFilters) => void; tabControls: ReactNode }) {
  const query = usePlatformLogsQuery(filters);
  const createLog = useCreatePlatformLogMutation();
  const updateLog = useUpdatePlatformLogMutation();
  const deleteLog = useDeletePlatformLogMutation();
  const retryJob = useRetryPlatformJobMutation();
  const configsQuery = usePlatformConfigsQuery({ project_id: filters.project_id, page: 1, page_size: 100 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ConstructionPlatformLog | null>(null);
  const [detailLog, setDetailLog] = useState<ConstructionPlatformLog | null>(null);
  const [form, setForm] = useState({ project_id: "", platform_config_id: "", platform_name: "", operation: "人员上传", direction: "push", status: "success", request_count: "1", success_count: "1", failure_count: "0", message: "", payload: "{}" });
  const rows = query.data?.items ?? [];
  const summary = query.data?.summary;
  const platformOptions = [
    ...BUILT_IN_PLATFORM_OPTIONS,
    ...(configsQuery.data?.items ?? []).map((config) => ({
      value: config.platform_type,
      label: config.platform_name || platformTypeLabel(config.platform_type),
    })),
  ].filter((option, index, options) => options.findIndex((item) => item.value === option.value) === index);
  const openCreate = () => { setEditing(null); setForm({ project_id: filters.project_id ?? "", platform_config_id: "", platform_name: "", operation: "人员上传", direction: "push", status: "success", request_count: "1", success_count: "1", failure_count: "0", message: "", payload: "{}" }); setDialogOpen(true); };
  const openEdit = (log: ConstructionPlatformLog) => { setEditing(log); setForm({ project_id: log.project_id, platform_config_id: log.platform_config_id ?? "", platform_name: log.platform_name ?? "", operation: log.operation, direction: log.direction, status: log.status, request_count: String(log.request_count), success_count: String(log.success_count), failure_count: String(log.failure_count), message: log.message ?? "", payload: JSON.stringify(log.payload ?? {}, null, 2) }); setDialogOpen(true); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const payloadJson = parseJsonObject(form.payload);
    if (!form.project_id || !form.operation.trim() || !payloadJson.ok) { toast.error(!payloadJson.ok ? "日志 payload 必须是 JSON 对象" : "请选择项目并填写操作"); return; }
    const payload: ConstructionPlatformLogPayload = { project_id: form.project_id, platform_config_id: form.platform_config_id || null, platform_name: form.platform_name.trim() || null, operation: form.operation.trim(), direction: form.direction.trim() || "push", status: form.status, request_count: Number(form.request_count) || 0, success_count: Number(form.success_count) || 0, failure_count: Number(form.failure_count) || 0, message: form.message.trim() || null, payload: payloadJson.value };
    try {
      if (editing) { await updateLog.mutateAsync({ logId: editing.id, payload }); toast.success("平台日志已修改"); }
      else { await createLog.mutateAsync(payload); toast.success("平台日志已新增"); }
      setDialogOpen(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "保存平台日志失败"); }
  };
  const remove = async (log: ConstructionPlatformLog) => { if (!window.confirm(`确认删除日志「${log.operation}」？`)) return; try { await deleteLog.mutateAsync(log.id); toast.success("平台日志已删除"); } catch { toast.error("删除平台日志失败"); } };
  const retry = async (log: ConstructionPlatformLog) => {
    if (!window.confirm(`确认重新执行「${log.operation}」？`)) return;
    try { await retryJob.mutateAsync(log.id); toast.success("任务已重新进入异步队列"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "任务重试失败"); }
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3 shadow-sm">
        {tabControls}
        <Button onClick={openCreate} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]"><Plus className="mr-2 size-4" />新增平台日志</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4"><MetricCell label="今日请求" value={summary?.today_request_count ?? 0} helper="API 交互量" /><MetricCell label="今日成功" value={summary?.today_success_count ?? 0} helper="成功条数" /><MetricCell label="今日失败" value={summary?.today_failure_count ?? 0} helper="失败条数" /><MetricCell label="日志条数" value={summary?.today_log_count ?? 0} helper="今日记录" /></div>
      <PlatformLogFilters filters={filters} setFilters={setFilters} platformOptions={platformOptions} />
      <DataTable loading={query.isLoading} colSpan={9} headers={["平台", "项目", "操作", "方向", "状态", "请求/成功/失败", "消息", "时间", "操作"]}>
        {rows.map((row) => (
          <TableRow key={row.id}><TableCell className="font-medium">{row.platform_name || "-"}</TableCell><TableCell className="max-w-[240px] truncate">{row.project_name || row.project_id}</TableCell><TableCell>{row.operation}</TableCell><TableCell>{row.direction}</TableCell><TableCell><PlatformStatusBadge status={row.status} /></TableCell><TableCell>{row.request_count}/{row.success_count}/{row.failure_count}</TableCell><TableCell className="max-w-[320px] truncate text-xs text-slate-500" title={row.message ?? undefined}>{row.message || "-"}</TableCell><TableCell>{formatDateTime(row.occurred_at)}</TableCell><TableCell className="text-right">{row.source === "system" ? <div className="inline-flex gap-1"><Button type="button" size="sm" variant="ghost" onClick={() => setDetailLog(row)}>详情</Button>{platformLogPlatformCode(row.payload) === YONGXIN_V2_PLATFORM_TYPE && (row.status === "failed" || row.status === "waiting_data" || row.status === "waiting_media") ? <Button type="button" size="sm" variant="outline" disabled={retryJob.isPending} onClick={() => void retry(row)}><RefreshCw className="mr-1 size-3" />重试</Button> : null}</div> : <RowActions onEdit={() => openEdit(row)} onDelete={() => void remove(row)} />}</TableCell></TableRow>
        ))}
      </DataTable>
      <Pager total={query.data?.total ?? 0} page={filters.page ?? 1} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} />
      <Dialog open={Boolean(detailLog)} onOpenChange={(open) => { if (!open) setDetailLog(null); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader><DialogTitle>平台任务详情</DialogTitle><DialogDescription>{detailLog ? `${detailLog.platform_name ?? "平台"} · ${detailLog.operation} · ${formatDateTime(detailLog.occurred_at)}` : ""}</DialogDescription></DialogHeader>
          {detailLog ? <div className="space-y-3"><div className="grid gap-3 rounded-lg border bg-slate-50 p-3 text-sm md:grid-cols-3"><div><span className="text-slate-500">状态：</span><PlatformStatusBadge status={detailLog.status} /></div><div><span className="text-slate-500">请求次数：</span>{detailLog.request_count}</div><div><span className="text-slate-500">消息：</span>{detailLog.message || "-"}</div></div><pre className="max-h-[55vh] overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(detailLog.payload ?? {}, null, 2)}</pre></div> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="sm:max-w-4xl"><form onSubmit={submit}><DialogHeader><DialogTitle>{editing ? "编辑平台日志" : "新增平台日志"}</DialogTitle><DialogDescription>用于展示平台推送、上传等交互日志。</DialogDescription></DialogHeader><div className="mt-4 grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>项目</Label><ProjectSearchSelect value={form.project_id} onValueChange={(project_id) => setForm((current) => ({ ...current, project_id }))} /></div><div className="space-y-2"><Label>平台配置</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={form.platform_config_id} onChange={(event) => { const selected = configsQuery.data?.items.find((item) => item.id === event.target.value); setForm((current) => ({ ...current, platform_config_id: event.target.value, platform_name: selected?.platform_name ?? current.platform_name })); }}><option value="">不关联配置</option>{(configsQuery.data?.items ?? []).map((config) => <option key={config.id} value={config.id}>{config.platform_name}</option>)}</select></div><TextField label="平台名称" value={form.platform_name} onChange={(platform_name) => setForm((current) => ({ ...current, platform_name }))} /><TextField label="操作" value={form.operation} onChange={(operation) => setForm((current) => ({ ...current, operation }))} /><TextField label="方向" value={form.direction} onChange={(direction) => setForm((current) => ({ ...current, direction }))} /><TextField label="状态" value={form.status} onChange={(status) => setForm((current) => ({ ...current, status }))} /><TextField label="请求数" value={form.request_count} onChange={(request_count) => setForm((current) => ({ ...current, request_count }))} /><TextField label="成功数" value={form.success_count} onChange={(success_count) => setForm((current) => ({ ...current, success_count }))} /><TextField label="失败数" value={form.failure_count} onChange={(failure_count) => setForm((current) => ({ ...current, failure_count }))} /><TextField label="消息" value={form.message} onChange={(message) => setForm((current) => ({ ...current, message }))} /><TextareaField className="md:col-span-2" label="Payload JSON" value={form.payload} onChange={(payload) => setForm((current) => ({ ...current, payload }))} rows={6} /></div><DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button type="submit" className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]">保存</Button></DialogFooter></form></DialogContent></Dialog>
    </>
  );
}

function OverviewKpiStrip({
  label,
  value,
  helper,
  progress,
  tone,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  progress: number;
  tone: AdminOverviewTone;
  icon: AdminOverviewKpiIcon;
}) {
  const clampedProgress = clampPercent(progress);
  const accent = toneAccent(tone);
  const Icon = overviewKpiIconMap[icon];

  return (
    <div className="min-w-0 border-b border-r px-4 py-3 last:border-r-0 md:[&:nth-child(4n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(4n)]:border-r xl:last:border-r-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-slate-100">
            <Icon className="size-4" style={{ color: accent }} />
          </span>
          <div className="truncate text-xs font-medium text-slate-500">{label}</div>
        </div>
        <span className="size-2 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="mt-1 truncate text-2xl font-semibold tracking-normal text-slate-950">{value}</div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${Math.round(clampedProgress * 100)}%`, backgroundColor: accent }} />
      </div>
      <div className="mt-1 truncate text-xs text-slate-500">{helper}</div>
    </div>
  );
}

const overviewKpiIconMap: Record<AdminOverviewKpiIcon, LucideIcon> = {
  projects: FolderKanban,
  units: Building2,
  teams: BriefcaseBusiness,
  workers: UsersRound,
  attendance: ClipboardCheck,
  platform: RadioTower,
  wages: WalletCards,
};

function OverviewMatrixRow({ row }: { row: AdminOverviewMatrixRow }) {
  const accent = toneAccent(row.tone);

  return (
    <div className="grid grid-cols-[1.05fr_1.15fr_1fr_0.9fr_1.5fr] items-center border-t px-3 py-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-2 font-medium text-slate-800">
        <span className="size-2 rounded-full" style={{ backgroundColor: accent }} />
        <span className="truncate">{row.label}</span>
      </div>
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-950">{row.current}</div>
        <div className="truncate text-xs text-slate-500">{row.detail}</div>
      </div>
      <div className="min-w-0 pr-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <Badge variant="outline" className={toneBadgeClass(row.tone)}>{row.health}</Badge>
          <span className="text-xs text-slate-500">{Math.round(clampPercent(row.score) * 100)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${Math.round(clampPercent(row.score) * 100)}%`, backgroundColor: accent }} />
        </div>
      </div>
      <div><Badge variant="outline" className={toneBadgeClass(row.tone)}>{row.risk}</Badge></div>
      <div className="truncate text-xs text-slate-600">{row.action}</div>
    </div>
  );
}

function MoneyRail({
  icon: Icon,
  label,
  amount,
  accent = "#334155",
}: {
  icon: LucideIcon;
  label: string;
  amount: number;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="rounded-md bg-[#f8faf9] p-1.5" style={{ color: accent }}>
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
      <span className="text-sm font-semibold text-slate-950">{formatMoneyCompact(amount)}</span>
    </div>
  );
}

function StatusPill({ status, label, count, total }: { status: string; label: string; count: number; total: number }) {
  const good = status === "success";
  const danger = status === "failed";
  const percent = total > 0 ? count / total : 0;

  return (
    <div className="rounded-lg border bg-white px-3 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <span className={`size-2 rounded-full ${good ? "bg-emerald-500" : danger ? "bg-red-500" : "bg-slate-400"}`} />
          {label}
        </div>
        <span className="text-lg font-semibold text-slate-950">{count}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${good ? "bg-[#0f6b5d]" : danger ? "bg-red-500" : "bg-slate-400"}`} style={{ width: `${Math.round(percent * 100)}%` }} />
      </div>
      <div className="mt-1 text-xs text-slate-500">占比 {formatPercent(percent)}</div>
    </div>
  );
}

function EmptyOverviewState({ icon: Icon, label, helper }: { icon: LucideIcon; label: string; helper: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-[#f8faf9] px-3 py-4 text-center md:col-span-3">
      <Icon className="mx-auto size-5 text-slate-400" />
      <div className="mt-2 text-sm font-medium text-slate-700">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

function PageHeader({ icon, label, title, description, action }: { icon: ReactNode; label: string; title: string; description: string; action?: ReactNode }) {
  return <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">{icon}{label}</div><h1 className="mt-3 text-2xl font-semibold tracking-normal">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</div></section>;
}

function MetricCell({ label, value, helper }: { label: string; value: number | string; helper: string }) {
  return <div className="rounded-lg border bg-white p-4 shadow-sm"><div className="text-xs font-medium text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold text-[#0f6b5d]">{value}</div><div className="mt-1 text-xs text-muted-foreground">{helper}</div></div>;
}

function ChartCard({ title, children, className = "", action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ListToolbar({ keyword, onKeywordChange, placeholder }: { keyword: string; onKeywordChange: (keyword: string) => void; placeholder: string }) {
  return <div className="rounded-lg border bg-[#f8faf9] p-3"><div className="relative max-w-xl"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder={placeholder} className="pl-9" /></div></div>;
}

function ModuleFilters({ filters, setFilters, placeholder }: { filters: ConstructionModuleListFilters; setFilters: (updater: (current: ConstructionModuleListFilters) => ConstructionModuleListFilters) => void; placeholder: string }) {
  return <div className="grid gap-3 rounded-lg border bg-[#f8faf9] p-3 lg:grid-cols-[minmax(260px,1fr)_minmax(280px,1fr)_auto]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={filters.keyword ?? ""} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value, page: 1 }))} placeholder={placeholder} className="pl-9" /></div><ProjectSearchSelect value={filters.project_id ?? ""} includeAllOption allOptionLabel="全部项目" onValueChange={(project_id) => setFilters((current) => ({ ...current, project_id: project_id || undefined, page: 1 }))} /><Button variant="outline" onClick={() => setFilters((current) => ({ page: 1, page_size: current.page_size ?? pageSize }))}>重置</Button></div>;
}

function PlatformLogFilters({
  filters,
  setFilters,
  platformOptions,
}: {
  filters: ConstructionModuleListFilters;
  setFilters: (updater: (current: ConstructionModuleListFilters) => ConstructionModuleListFilters) => void;
  platformOptions: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-3 rounded-lg border bg-[#f8faf9] p-3 lg:grid-cols-[minmax(240px,1fr)_minmax(220px,0.8fr)_minmax(180px,0.6fr)_minmax(180px,0.6fr)_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.keyword ?? ""}
          onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value, page: 1 }))}
          placeholder="搜索项目、平台、操作、消息"
          className="pl-9"
        />
      </div>
      <ProjectSearchSelect
        value={filters.project_id ?? ""}
        includeAllOption
        allOptionLabel="全部项目"
        onValueChange={(project_id) => setFilters((current) => ({ ...current, project_id: project_id || undefined, page: 1 }))}
      />
      <select
        aria-label="平台类型"
        className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0f6b5d]/20"
        value={filters.platform_type ?? ""}
        onChange={(event) => setFilters((current) => ({ ...current, platform_type: event.target.value || undefined, page: 1 }))}
      >
        <option value="">全部平台</option>
        {platformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <select
        aria-label="任务状态"
        className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0f6b5d]/20"
        value={filters.status ?? ""}
        onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value || undefined, page: 1 }))}
      >
        <option value="">全部状态</option>
        <option value="pending">排队中</option>
        <option value="processing">处理中</option>
        <option value="retry">等待重试</option>
        <option value="awaiting_result">等待平台回执</option>
        <option value="waiting_dependency">等待前置数据</option>
        <option value="waiting_data">等待补充资料</option>
        <option value="waiting_media">等待图片</option>
        <option value="success">成功</option>
        <option value="failed">失败</option>
        <option value="delivery_unknown">结果待核对</option>
        <option value="disabled">平台已停用</option>
      </select>
      <Button variant="outline" onClick={() => setFilters((current) => ({ page: 1, page_size: current.page_size ?? pageSize }))}>重置</Button>
    </div>
  );
}

function DataTable({ loading, headers, colSpan, children }: { loading: boolean; headers: string[]; colSpan: number; children: ReactNode }) {
  const empty = !loading && (!children || (Array.isArray(children) && children.length === 0));
  return <div className="overflow-hidden rounded-lg border bg-white shadow-sm"><div className="w-full overflow-x-auto"><Table><TableHeader><TableRow>{headers.map((header) => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />加载中</TableCell></TableRow> : empty ? <TableRow><TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">暂无数据</TableCell></TableRow> : children}</TableBody></Table></div></div>;
}

function Pager({ total, page, onPageChange }: { total: number; page: number; onPageChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return <div className="flex items-center justify-between text-sm text-muted-foreground"><span>显示 {(page - 1) * pageSize + (total > 0 ? 1 : 0)}-{Math.min(page * pageSize, total)} 条，共 {total} 条</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</Button><span>{page}/{pageCount}</span><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>下一页</Button></div></div>;
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return <div className="inline-flex items-center gap-1"><Button variant="ghost" size="sm" onClick={onEdit} className="text-[#0f6b5d]"><Pencil className="mr-1 size-3.5" />编辑</Button><Button variant="ghost" size="sm" onClick={onDelete} className="text-red-600"><Trash2 className="mr-1 size-3.5" />删除</Button></div>;
}

function TextField({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <div className="space-y-2"><Label>{label}{required ? <span className="text-red-500"> *</span> : null}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function PlatformCredentialField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  className = "",
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password" | "date";
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "numeric";
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label>{label} {required ? <span className="text-red-500">*</span> : null}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ContractTemplateUploadField({
  fileName,
  isUploaded,
  onUploaded,
  onClear,
}: {
  fileName: string;
  isUploaded: boolean;
  onUploaded: (record: UploadFileRecord) => void;
  onClear: () => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const handleChange = async (file: File | undefined) => {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".docx")) {
      setError("只能上传 Word 模板文件（.docx）");
      return;
    }
    setError("");
    setIsUploading(true);
    try {
      const record = await constructionProjectService.uploadFile(file, {
        bizType: "contract_templates",
        fieldKey: "template_file",
      });
      onUploaded(record);
      toast.success("合同模板文件已上传");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "模板文件上传失败");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2 md:col-span-2">
      <Label>Word 模板文件</Label>
      <div className="flex flex-col gap-2 rounded-md border bg-[#f8faf9] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{isUploaded ? fileName || "已上传模板文件" : "上传 .docx 模板文件"}</div>
          <div className="text-xs text-muted-foreground">支持 {"{{项目名称}}"}、{"{{工人姓名}}"}、{"{{班组名称}}"} 等变量。</div>
          {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isUploaded ? <Button type="button" variant="outline" size="sm" onClick={onClear}>移除</Button> : null}
          <label className="inline-flex h-9 cursor-pointer items-center rounded-md bg-[#0f6b5d] px-3 text-sm font-medium text-white hover:bg-[#0b5148]">
            <Upload className="mr-2 size-4" />
            {isUploading ? "上传中" : "选择文件"}
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              disabled={isUploading}
              onChange={(event) => void handleChange(event.target.files?.[0])}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function WorkHourRuleFields({ value, onChange }: { value: WorkHourRuleForm; onChange: (value: WorkHourRuleForm) => void }) {
  const updateSegment = (index: number, patch: Partial<WorkHourSegmentForm>) => {
    onChange({
      ...value,
      segments: value.segments.map((segment, segmentIndex) => (
        segmentIndex === index ? { ...segment, ...patch } : segment
      )),
    });
  };
  const addSegment = () => {
    const last = value.segments.at(-1);
    const startHour = last?.endHour || "0";
    const endHour = Math.min(24, Math.max(Number(startHour) + 1, Number(startHour) || 0)).toString();
    onChange({
      ...value,
      segments: [
        ...value.segments,
        {
          id: `segment-${Date.now()}`,
          startHour,
          endHour,
          rate: last?.rate || "1",
        },
      ],
    });
  };
  const removeSegment = (index: number) => {
    if (value.segments.length <= 1) return;
    if (!window.confirm(`确认删除第 ${index + 1} 个计费分段？`)) return;
    onChange({
      ...value,
      segments: value.segments.filter((_, segmentIndex) => segmentIndex !== index),
    });
  };

  return (
    <div className="md:col-span-2 space-y-4 rounded-lg border bg-[#f8faf9] p-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">工时段配置</div>
            <div className="mt-1 text-xs text-slate-500">不配置时默认：2-4 小时算 0.5，4-20 小时算 1，20 小时以上算 1.5。</div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addSegment}>
            <Plus className="mr-1 size-3.5" />新增分段
          </Button>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#f8faf9]">
                <TableHead className="w-20 text-center">序号</TableHead>
                <TableHead>开始小时</TableHead>
                <TableHead>结束小时</TableHead>
                <TableHead>工时</TableHead>
                <TableHead className="w-32">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {value.segments.map((segment, index) => (
                <TableRow key={segment.id}>
                  <TableCell className="text-center text-sm text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <HourStepField value={segment.startHour} min={0} max={24} step={0.5} onChange={(next) => updateSegment(index, { startHour: next })} />
                  </TableCell>
                  <TableCell>
                    <HourStepField value={segment.endHour} min={0} max={24} step={0.5} onChange={(next) => updateSegment(index, { endHour: next })} />
                  </TableCell>
                  <TableCell>
                    <HourStepField value={segment.rate} min={0} max={24} step={0.5} onChange={(next) => updateSegment(index, { rate: next })} />
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="sm" className="text-red-600" disabled={value.segments.length <= 1} onClick={() => removeSegment(index)}>
                      <Trash2 className="mr-1 size-3.5" />删除
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function HourStepField({ value, onChange, min, max, step }: { value: string; onChange: (value: string) => void; min: number; max: number; step: number }) {
  const update = (delta: number) => {
    const current = Number(value);
    const next = Math.min(max, Math.max(min, (Number.isFinite(current) ? current : 0) + delta));
    onChange(formatStepNumber(next));
  };

  return (
    <div className="grid h-9 max-w-[220px] grid-cols-[36px_minmax(60px,1fr)_36px] overflow-hidden rounded-md border bg-white">
      <button type="button" className="border-r text-lg text-slate-500 hover:bg-slate-50" onClick={() => update(-step)}>-</button>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 bg-white px-2 text-center text-sm outline-none"
      />
      <button type="button" className="border-l text-lg text-slate-500 hover:bg-slate-50" onClick={() => update(step)}>+</button>
    </div>
  );
}

function TextareaField({ label, value, onChange, rows, className = "" }: { label: string; value: string; onChange: (value: string) => void; rows: number; className?: string }) {
  return <div className={`space-y-2 ${className}`}><Label>{label}</Label><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0f6b5d]/20" /></div>;
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  return enabled ? <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">启用</Badge> : <Badge variant="outline">停用</Badge>;
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border bg-white px-4 py-2 text-sm"><span className="text-muted-foreground">{label}</span><span className="ml-2 font-semibold text-[#0f6b5d]">{value}</span></div>;
}

function latestWorkHourConfigByProject(configs: ConstructionWorkHourConfig[]) {
  const map = new Map<string, ConstructionWorkHourConfig>();
  for (const config of configs) {
    const current = map.get(config.project_id);
    if (!current || new Date(config.updated_at).getTime() >= new Date(current.updated_at).getTime()) {
      map.set(config.project_id, config);
    }
  }
  return map;
}

function projectMatchesWorkHourKeyword(
  project: ConstructionProject,
  config: ConstructionWorkHourConfig | undefined,
  keyword: string
) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return true;
  return [
    project.name,
    project.contractor,
    project.build_unit,
    project.work_permit,
    config?.name,
    config?.remark,
    workHourConfigRuleSummary(config),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function WorkHourConfigStatusBadge({ config }: { config: ConstructionWorkHourConfig | undefined }) {
  if (!config) {
    return <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">默认规则</Badge>;
  }
  if (!config.is_enabled) {
    return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">已停用</Badge>;
  }
  return <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">已配置</Badge>;
}

function workHourConfigRuleSummary(config: ConstructionWorkHourConfig | undefined) {
  if (!config || !config.is_enabled) {
    return `默认规则：${summarizeWorkHourRules(buildWorkHourRules(createDefaultWorkHourRuleForm()))}`;
  }
  return summarizeWorkHourRules(config.rules);
}

function formatStepNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function PlatformStatusBadge({ status }: { status: string }) {
  if (status === "success") return <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">成功</Badge>;
  if (status === "failed") return <Badge className="bg-red-50 text-red-700 hover:bg-red-50">失败</Badge>;
  const labels: Record<string, string> = {
    pending: "排队中",
    processing: "处理中",
    retry: "等待重试",
    awaiting_result: "等待平台回执",
    waiting_dependency: "等待前置数据",
    waiting_media: "等待图片",
    waiting_data: "等待补充资料",
    delivery_unknown: "结果待核对",
    disabled: "平台已停用",
  };
  return <Badge variant="outline" className={status === "delivery_unknown" ? "border-amber-300 bg-amber-50 text-amber-800" : ""}>{labels[status] ?? status}</Badge>;
}

function parseJsonObject(value: string): { ok: true; value: JsonValue } | { ok: false } {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ok: true, value: parsed } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function platformLogPlatformCode(value: JsonValue): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return typeof value.platform_code === "string" ? value.platform_code : null;
}

function uploadRecordFromJson(value: JsonValue | null): UploadFileRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const objectKey = typeof value.object_key === "string" ? value.object_key : "";
  if (!objectKey) return null;
  return {
    id: typeof value.id === "string" ? value.id : "",
    biz_type: typeof value.biz_type === "string" ? value.biz_type : null,
    biz_id: typeof value.biz_id === "string" ? value.biz_id : null,
    field_key: typeof value.field_key === "string" ? value.field_key : null,
    original_filename: typeof value.original_filename === "string" ? value.original_filename : null,
    object_key: objectKey,
    bucket: typeof value.bucket === "string" ? value.bucket : null,
    endpoint: typeof value.endpoint === "string" ? value.endpoint : null,
    public_base_url: typeof value.public_base_url === "string" ? value.public_base_url : "",
    public_url: typeof value.public_url === "string" ? value.public_url : "",
    storage_driver: typeof value.storage_driver === "string" ? value.storage_driver : "",
    content_type: typeof value.content_type === "string" ? value.content_type : null,
    size_bytes: typeof value.size_bytes === "number" ? value.size_bytes : 0,
    uploaded_by: typeof value.uploaded_by === "string" ? value.uploaded_by : null,
    created_at: typeof value.created_at === "string" ? value.created_at : "",
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatMoneyCompact(cents: number) {
  const yuan = cents / 100;
  if (Math.abs(yuan) >= 10000) return `${(yuan / 10000).toFixed(2)} 万`;
  return `${yuan.toFixed(2)} 元`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function toneAccent(tone: AdminOverviewTone) {
  return {
    good: "#0f6b5d",
    warn: "#d97706",
    danger: "#dc2626",
    neutral: "#64748b",
  }[tone];
}

function toneBadgeClass(tone: AdminOverviewTone) {
  return {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-red-200 bg-red-50 text-red-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-600",
  }[tone];
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(5);
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function statusLabel(status: number | string | null | undefined) {
  const map: Record<string, string> = { "1": "在建", "2": "竣工", "3": "停工" };
  return map[String(status ?? "")] ?? String(status ?? "未填");
}

function platformStatusLabel(status: string) {
  return status === "success" ? "成功" : status === "failed" ? "失败" : status;
}

function platformTypeLabel(type: string) {
  const map: Record<string, string> = { ningbo_housing: "宁波市住建", yongxin_v2: "甬薪精管 V2", real_name: "实名制", wage: "工资监管", attendance: "考勤平台" };
  return map[type] ?? type;
}
