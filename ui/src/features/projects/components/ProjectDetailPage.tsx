import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Download,
  FileCheck2,
  Layers3,
  Pencil,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  TimerReset,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import {
  attendanceFormFields,
  buildDefaultFormState,
  buildFormStateFromRecord,
  buildPayloadFromForm,
  datetimeLocalNow,
  teamFormFields,
  unitFormFields,
  workerFormFields,
  type ConstructionFormField,
} from "../data/construction-form-fields";
import {
  type AttendanceRecord,
  type ConstructionUnit,
  type Project,
  type Team,
  type Worker,
} from "../data/mock-projects";
import {
  useCreateAttendanceMutation,
  useCreateTeamMutation,
  useCreateUnitMutation,
  useCreateWorkerMutation,
  useDeleteAttendanceMutation,
  useDeleteTeamMutation,
  useDeleteUnitMutation,
  useDeleteWorkerMutation,
  useProjectAttendanceQuery,
  useProjectQuery,
  useProjectTeamsQuery,
  useProjectUnitsQuery,
  useProjectWorkersQuery,
  useUpdateAttendanceMutation,
  useUpdateTeamMutation,
  useUpdateUnitMutation,
  useUpdateWorkerMutation,
} from "../hooks/use-construction-projects";
import type {
  ConstructionAttendancePayload,
  ConstructionAttendanceRecord,
  ConstructionProject,
  ConstructionTeam,
  ConstructionTeamPayload,
  ConstructionUnit as ApiConstructionUnit,
  ConstructionUnitPayload,
  ConstructionWorker,
  ConstructionWorkerPayload,
} from "../types/construction-types";
import {
  buildProjectOverviewAudit,
  countTodayEntries,
  type ProjectOverviewAudit,
} from "../lib/project-overview-metrics";
import { getProjectInfoCellClassName } from "../lib/project-detail-layout";
import { formatProjectTitle } from "../lib/project-title";
import { MetricCell } from "./MetricCell";
import { ConstructionRecordForm } from "./ConstructionRecordForm";
import { ProjectStatusBadge } from "./ProjectStatusBadge";

const tabs = ["项目基本信息", "建设单位", "班组信息", "项目工人", "考勤记录"] as const;
type DetailTab = (typeof tabs)[number];
type DetailDialogMode = "create" | "edit";
type DetailFormState = Record<string, string>;

const PROJECT_STATUS_LABEL: Record<number, Project["status"]> = {
  1: "在建",
  2: "筹备",
  3: "筹备",
  4: "竣工",
  5: "在建",
  6: "完工",
  7: "停工",
  8: "竣工",
};

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const projectQuery = useProjectQuery(projectId);
  const unitQuery = useProjectUnitsQuery(projectId);
  const teamQuery = useProjectTeamsQuery(projectId);
  const workerQuery = useProjectWorkersQuery(projectId);
  const attendanceQuery = useProjectAttendanceQuery(projectId);
  const createUnit = useCreateUnitMutation(projectId);
  const updateUnit = useUpdateUnitMutation(projectId);
  const deleteUnit = useDeleteUnitMutation(projectId);
  const createTeam = useCreateTeamMutation(projectId);
  const updateTeam = useUpdateTeamMutation(projectId);
  const deleteTeam = useDeleteTeamMutation(projectId);
  const createWorker = useCreateWorkerMutation(projectId);
  const updateWorker = useUpdateWorkerMutation(projectId);
  const deleteWorker = useDeleteWorkerMutation(projectId);
  const createAttendance = useCreateAttendanceMutation(projectId);
  const updateAttendance = useUpdateAttendanceMutation(projectId);
  const deleteAttendance = useDeleteAttendanceMutation(projectId);
  const project = useMemo(
    () => (projectQuery.data ? apiProjectToDetail(projectQuery.data) : null),
    [projectQuery.data]
  );
  const rawUnits = useMemo(() => unitQuery.data ?? [], [unitQuery.data]);
  const rawTeams = useMemo(() => teamQuery.data ?? [], [teamQuery.data]);
  const rawWorkers = useMemo(() => workerQuery.data ?? [], [workerQuery.data]);
  const rawAttendance = useMemo(() => attendanceQuery.data ?? [], [attendanceQuery.data]);
  const units = useMemo(
    () => rawUnits.map(apiUnitToDetail),
    [rawUnits]
  );
  const projectTeams = useMemo(
    () => rawTeams.map((team) => apiTeamToDetail(team, rawUnits)),
    [rawTeams, rawUnits]
  );
  const projectWorkers = useMemo(
    () => rawWorkers.map((worker) => apiWorkerToDetail(worker, rawTeams, rawUnits)),
    [rawTeams, rawUnits, rawWorkers]
  );
  const attendance = useMemo(
    () => rawAttendance.map((record) => apiAttendanceToDetail(record, rawWorkers, rawTeams)),
    [rawAttendance, rawTeams, rawWorkers]
  );
  const projectMetrics = useMemo(() => {
    if (!project) return null;

    const workerCount = projectWorkers.length || project.workerCount;
    const teamCount = projectTeams.length || project.teamCount;
    const unitCount = units.length || project.unitCount;
    const attendanceToday = attendanceQuery.data == null ? project.attendanceToday : countTodayEntries(attendance);
    const attendanceRate = workerCount > 0 ? Math.round((attendanceToday / workerCount) * 100) : project.attendanceRate;

    return {
      ...project,
      unitCount,
      teamCount,
      workerCount,
      attendanceToday,
      attendanceRate,
    };
  }, [attendance, attendanceQuery.data, project, projectTeams.length, projectWorkers.length, units.length]);
  const overviewAudit = useMemo(() => {
    if (!projectMetrics) return null;

    return buildProjectOverviewAudit(projectMetrics, {
      units,
      teams: projectTeams,
      workers: projectWorkers,
      attendance,
    });
  }, [attendance, projectMetrics, projectTeams, projectWorkers, units]);
  const [activeTab, setActiveTab] = useState<DetailTab>("项目基本信息");
  const [dialogMode, setDialogMode] = useState<DetailDialogMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<DetailFormState>({});
  const [formOpen, setFormOpen] = useState(false);
  const isMutating =
    createUnit.isPending ||
    updateUnit.isPending ||
    createTeam.isPending ||
    updateTeam.isPending ||
    createWorker.isPending ||
    updateWorker.isPending ||
    createAttendance.isPending ||
    updateAttendance.isPending;

  const openCreateDialog = () => {
    if (!project) {
      toast.info("项目数据尚未加载，暂不能维护台账。");
      return;
    }
    setDialogMode("create");
    setEditingId(null);
    setFormState(defaultFormForTab(activeTab, rawUnits, rawTeams, rawWorkers));
    setFormOpen(true);
  };

  const openEditDialog = (id: string) => {
    if (!project) {
      toast.info("项目数据尚未加载，暂不能维护台账。");
      return;
    }
    const state = formStateForRecord(activeTab, id, rawUnits, rawTeams, rawWorkers, rawAttendance);
    setDialogMode("edit");
    setEditingId(id);
    setFormState(state);
    setFormOpen(true);
  };

  const handleDeleteRecord = async (id: string) => {
    if (!project) {
      toast.info("项目数据尚未加载，暂不能维护台账。");
      return;
    }

    try {
      if (activeTab === "建设单位") await deleteUnit.mutateAsync(id);
      if (activeTab === "班组信息") await deleteTeam.mutateAsync(id);
      if (activeTab === "项目工人") await deleteWorker.mutateAsync(id);
      if (activeTab === "考勤记录") await deleteAttendance.mutateAsync(id);
      toast.success("记录已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const handleSubmitRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project) return;

    try {
      if (activeTab === "建设单位") {
        const payload = buildPayloadFromForm(unitFormFields, formState) as ConstructionUnitPayload;
        if (dialogMode === "edit" && editingId) {
          await updateUnit.mutateAsync({ unitId: editingId, payload });
        } else {
          await createUnit.mutateAsync(payload);
        }
      }
      if (activeTab === "班组信息") {
        const payload = buildPayloadFromForm(teamFormFields, formState) as ConstructionTeamPayload;
        if (dialogMode === "edit" && editingId) {
          await updateTeam.mutateAsync({ teamId: editingId, payload });
        } else {
          await createTeam.mutateAsync(payload);
        }
      }
      if (activeTab === "项目工人") {
        const payload = buildPayloadFromForm(workerFormFields, formState) as ConstructionWorkerPayload;
        if (dialogMode === "edit" && editingId) {
          await updateWorker.mutateAsync({ workerId: editingId, payload });
        } else {
          await createWorker.mutateAsync(payload);
        }
      }
      if (activeTab === "考勤记录") {
        const payload = buildPayloadFromForm(attendanceFormFields, formState) as ConstructionAttendancePayload;
        if (dialogMode === "edit" && editingId) {
          await updateAttendance.mutateAsync({ attendanceId: editingId, payload });
        } else {
          await createAttendance.mutateAsync(payload);
        }
      }
      toast.success(dialogMode === "edit" ? "记录已修改" : "记录已新增");
      setFormOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : dialogMode === "edit" ? "修改失败" : "新增失败");
    }
  };

  if (!project || !projectMetrics) {
    return (
      <div className="space-y-5 text-slate-950 dark:text-foreground">
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-2 text-slate-600 hover:bg-emerald-50 hover:text-[#0f6b5d] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground">
          <Link to="/app/admin/projects">
            <ArrowLeft className="size-4" />
            返回项目列表
          </Link>
        </Button>
        <ProjectUnavailableState isLoading={projectQuery.isLoading} isError={projectQuery.isError} />
      </div>
    );
  }

  return (
    <div className="space-y-5 text-slate-950 dark:text-foreground">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-2 text-slate-600 hover:bg-emerald-50 hover:text-[#0f6b5d] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground">
          <Link to="/app/admin/projects">
            <ArrowLeft className="size-4" />
            返回项目列表
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2 border-slate-200 bg-white dark:border-border dark:bg-background">
            <Download className="size-4" />
            导出档案
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
            onClick={() => {
              if (activeTab === "项目基本信息") {
                toast.info("项目基础信息可在项目列表点击编辑维护。");
                return;
              }
              openCreateDialog();
            }}
          >
            <Pencil className="size-4" />
            {activeTab === "项目基本信息" ? "编辑项目" : `新增${activeTab.replace("信息", "").replace("记录", "")}`}
          </Button>
        </div>
      </div>

      <div className="sticky top-0 z-20 rounded-lg border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur dark:border-border dark:bg-card/95">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="shrink-0">
            <div className="text-xs font-medium text-[#0f6b5d] dark:text-primary">项目管理模块</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-950 dark:text-foreground">{activeTab}</div>
          </div>
          <div className="flex min-w-0 flex-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "relative h-10 shrink-0 px-4 text-sm font-medium text-slate-500 transition-colors hover:text-slate-950 dark:text-muted-foreground dark:hover:text-foreground",
                  activeTab === tab && "text-[#0f6b5d] dark:text-primary"
                )}
              >
                {tab}
                {activeTab === tab && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[#0f6b5d] dark:bg-primary" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === "项目基本信息" && overviewAudit && (
        <ProjectOverviewReport project={projectMetrics} attendance={attendance} audit={overviewAudit} />
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="border-b border-slate-100 bg-[#f8faf9] px-4 py-2 dark:border-border dark:bg-muted/30">
          <ModuleFilters activeTab={activeTab} units={units} teams={projectTeams} />
        </div>

        <div className="p-5">
          {activeTab === "项目基本信息" && (
            <ProjectInfoTab
              project={projectMetrics}
              unitCount={projectMetrics.unitCount}
              teamCount={projectMetrics.teamCount}
              workerCount={projectMetrics.workerCount}
              audit={overviewAudit}
            />
          )}
          {activeTab === "建设单位" && <UnitsTab units={units} onEdit={openEditDialog} onDelete={handleDeleteRecord} editable />}
          {activeTab === "班组信息" && <TeamsTab teams={projectTeams} onEdit={openEditDialog} onDelete={handleDeleteRecord} editable />}
          {activeTab === "项目工人" && <WorkersTab units={units} teams={projectTeams} workers={projectWorkers} onEdit={openEditDialog} onDelete={handleDeleteRecord} editable />}
          {activeTab === "考勤记录" && <AttendanceTab records={attendance} onEdit={openEditDialog} onDelete={handleDeleteRecord} editable />}
        </div>
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{dialogMode === "edit" ? `编辑${activeTab}` : `新增${activeTab}`}</DialogTitle>
            <DialogDescription>录入当前模块的台账字段。</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleSubmitRecord}>
            <DynamicDetailForm
              activeTab={activeTab}
              state={formState}
              setState={setFormState}
              units={rawUnits}
              teams={rawTeams}
              workers={rawWorkers}
              bizId={editingId ?? undefined}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isMutating} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]">
                {isMutating ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectUnavailableState({
  isLoading,
  isError,
}: {
  isLoading: boolean;
  isError: boolean;
}) {
  const title = isLoading ? "项目数据加载中" : isError ? "项目加载失败" : "项目不存在";
  const message = isLoading
    ? "正在读取项目台账"
    : isError
      ? "请检查登录状态或后端服务"
      : "该项目地址已失效，请从项目列表重新进入";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-border dark:bg-card">
      <h2 className="text-lg font-semibold text-slate-950 dark:text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-muted-foreground">{message}</p>
      {!isLoading && (
        <Button asChild className="mt-5 bg-[#0f6b5d] text-white hover:bg-[#0b5148]">
          <Link to="/app/admin/projects">返回项目列表</Link>
        </Button>
      )}
    </section>
  );
}

function ModuleFilters({
  activeTab,
  units,
  teams,
}: {
  activeTab: DetailTab;
  units: ConstructionUnit[];
  teams: Team[];
}) {
  if (activeTab === "项目基本信息") {
    return (
      <FilterGrid>
        <FilterInput label="关键词" placeholder="项目名称、项目编码、施工许可证" />
        <FilterSelect label="资料状态" placeholder="全部状态" options={["全部状态", "已完善", "待补充", "待核对"]} />
        <FilterSelect label="风险状态" placeholder="全部风险" options={["全部风险", "正常", "待关注", "预警"]} />
        <FilterSelect label="项目状态" placeholder="全部项目状态" options={["全部项目状态", "在建", "筹备", "完工", "停工", "竣工"]} />
      </FilterGrid>
    );
  }

  if (activeTab === "建设单位") {
    return (
      <FilterGrid>
        <FilterInput label="关键词" placeholder="单位名称、信用代码、负责人" />
        <FilterSelect label="单位类型" placeholder="全部类型" options={["全部类型", "建设单位", "总承包单位", "劳务分包单位", "监理单位"]} />
        <FilterSelect label="计薪方式" placeholder="全部计薪方式" options={["全部计薪方式", "按月", "按日", "项目管理"]} />
        <FilterSelect label="建档状态" placeholder="全部状态" options={["全部状态", "已建档", "待补充", "待核对"]} />
      </FilterGrid>
    );
  }

  if (activeTab === "班组信息") {
    return (
      <FilterGrid>
        <FilterInput label="关键词" placeholder="班组名称、班组长、工种" />
        <FilterSelect label="参建单位" placeholder="全部单位" options={["全部单位", ...units.map((unit) => unit.name)]} />
        <FilterSelect label="班组状态" placeholder="全部状态" options={["全部状态", "正常", "待核对", "停用"]} />
        <FilterSelect label="考勤时段" placeholder="全部时段" options={["全部时段", "已配置", "待配置", "异常"]} />
      </FilterGrid>
    );
  }

  if (activeTab === "项目工人") {
    return (
      <FilterGrid>
        <FilterInput label="关键词" placeholder="姓名、身份证、手机号" />
        <FilterSelect label="所属班组" placeholder="全部班组" options={["全部班组", ...teams.map((team) => team.name)]} />
        <FilterSelect label="工人状态" placeholder="全部状态" options={["全部状态", "在场", "离场", "黑名单", "待实名"]} />
        <FilterSelect label="工种" placeholder="全部工种" options={["全部工种", "钢筋工", "木工", "安装工", "架子工"]} />
      </FilterGrid>
    );
  }

  return (
    <FilterGrid>
      <FilterInput label="关键词" placeholder="工人姓名、班组、设备" />
      <FilterInput label="考勤日期" type="date" />
      <FilterSelect label="进出方向" placeholder="全部方向" options={["全部方向", "进场", "出场"]} />
      <FilterSelect label="考勤状态" placeholder="全部状态" options={["全部状态", "有效", "待补图", "异常"]} />
    </FilterGrid>
  );
}

function FilterGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-border dark:bg-background sm:grid-cols-2 xl:grid-cols-[minmax(240px,2fr)_repeat(3,minmax(140px,1fr))_auto]">
      {children}
      <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1 xl:justify-end">
        <Button size="sm" variant="outline" className="h-8 gap-2 border-slate-200 bg-white dark:border-border dark:bg-background">
          <RotateCcw className="size-4" />
          重置
        </Button>
        <Button size="sm" className="h-8 gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]">
          <Search className="size-4" />
          查询
        </Button>
      </div>
    </div>
  );
}

function FilterInput({
  label,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
}) {
  return (
    <label className={cn("min-w-0 space-y-1", className)}>
      <span className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground">{label}</span>
      <div className="relative">
        {props.type !== "date" && <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />}
        <Input {...props} className={props.type === "date" ? "h-8" : "h-8 pl-9"} />
      </div>
    </label>
  );
}

function FilterSelect({
  label,
  placeholder,
  options,
}: {
  label: string;
  placeholder: string;
  options: string[];
}) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground">{label}</span>
      <Select>
        <SelectTrigger className="h-8 w-full bg-white dark:bg-input/30">
          <div className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="size-4 shrink-0 text-slate-400" />
            <SelectValue placeholder={placeholder} />
          </div>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function ProjectInfoTab({
  project,
  unitCount,
  teamCount,
  workerCount,
  audit,
}: {
  project: Project;
  unitCount: number;
  teamCount: number;
  workerCount: number;
  audit: ProjectOverviewAudit | null;
}) {
  const items = [
    ["项目名称", formatProjectTitle(project.name), project.name],
    ["项目编码", project.code],
    ["施工许可证", project.workPermit],
    ["项目地址", project.address],
    ["建设单位", project.buildUnit],
    ["总承包单位", project.contractor],
    ["项目经理", `${project.manager} / ${project.managerPhone}`],
    ["实名制专管员", project.realNameManager],
    ["劳资专管员", project.laborManager],
    ["总投资", project.investment],
    ["总劳务费", project.laborCost],
    ["建筑面积", project.area],
    ["项目周期", `${project.startDate} 至 ${project.finishDate}`],
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCell label="参建单位" value={`${unitCount} 家`} helper="单位档案" compact />
        <MetricCell label="班组数量" value={`${teamCount} 个`} helper="班组台账" compact />
        <MetricCell label="项目工人" value={`${workerCount} 人`} helper="实名名册" accent="teal" compact />
        <MetricCell label="今日考勤" value={`${project.attendanceToday} 人`} helper="现场打卡" accent="teal" compact />
        <MetricCell label="实名考勤率" value={`${project.attendanceRate}%`} helper="考勤覆盖" accent="amber" compact />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 dark:border-border dark:bg-border sm:grid-cols-2">
          {items.map(([label, value, fullValue], index) => (
            <div
              key={label}
              className={cn(
                "bg-white px-4 py-3 dark:bg-card",
                getProjectInfoCellClassName(index, items.length)
              )}
            >
              <div className="text-xs text-slate-500 dark:text-muted-foreground">{label}</div>
              <div title={fullValue} className="mt-1 break-words text-sm font-medium text-slate-900 dark:text-foreground">
                {value}
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 bg-[#fbfcfc] p-4 dark:border-border dark:bg-card">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="size-4 text-[#0f6b5d]" />
            项目核对重点
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <CheckLine label="施工许可证" value={audit?.workPermit.value ?? "待核对"} attention={audit?.workPermit.attention} />
            <CheckLine label="建设单位信息" value={audit?.unitMatch.value ?? "待核对"} attention={audit?.unitMatch.attention} />
            <CheckLine label="班组考勤时段" value={audit?.teamAttendance.value ?? "待核对"} attention={audit?.teamAttendance.attention} />
            <CheckLine label="今日考勤异常" value={audit?.attendanceExceptions.value ?? "待核对"} attention={audit?.attendanceExceptions.attention} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectOverviewReport({
  project,
  attendance,
  audit,
}: {
  project: Project;
  attendance: AttendanceRecord[];
  audit: ProjectOverviewAudit;
}) {
  const exceptionCount = attendance.filter((record) => record.status !== "有效").length;
  const missingAttendanceCount = Math.max(project.workerCount - project.attendanceToday, 0);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr_0.9fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-normal">今日现场</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">工人进出与异常考勤概览。</p>
          </div>
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            实时更新
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <AttendanceSummary label="已进场" value={project.attendanceToday} max={project.workerCount} />
          <AttendanceSummary label="未打卡" value={missingAttendanceCount} max={project.workerCount} tone="amber" />
          <AttendanceSummary label="待处理" value={exceptionCount} max={Math.max(attendance.length, 1)} tone="red" />
        </div>
        <div className="mt-4 space-y-3">
          {attendance.slice(0, 3).map((record) => (
            <div key={record.id} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm dark:border-border">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 dark:text-foreground">{record.worker}</span>
                  <span className="text-xs text-slate-400 dark:text-muted-foreground">{record.team}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-muted-foreground">
                  <span>{record.time}</span>
                  <span>{record.device}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-border dark:bg-background dark:text-muted-foreground">
                  {record.direction}
                </span>
                <ProjectStatusBadge value={record.status} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-[#fbfcfc] p-4 dark:border-border dark:bg-card">
        <div className="flex items-center gap-2">
          <FileCheck2 className="size-4 text-[#0f6b5d]" />
          <h3 className="text-base font-semibold tracking-normal">项目资料完整度</h3>
        </div>
        <div className="mt-4 space-y-4">
          <ProgressLine label="基础信息" value={audit.completeness.basicInfo} tone={audit.completeness.basicInfo < 80 ? "amber" : "teal"} />
          <ProgressLine label="单位信息" value={audit.completeness.unitInfo} tone={audit.completeness.unitInfo < 80 ? "amber" : "teal"} />
          <ProgressLine label="班组信息" value={audit.completeness.teamInfo} tone={audit.completeness.teamInfo < 80 ? "amber" : "teal"} />
          <ProgressLine label="实名考勤" value={audit.completeness.realNameAttendance} tone={audit.completeness.realNameAttendance < 80 ? "amber" : "teal"} />
        </div>
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
          {audit.recommendation}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-[#fcfdfc] p-4 dark:border-border dark:bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-normal">风险与待办</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">进入详情页后优先看的处理队列。</p>
          </div>
          <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            {audit.pendingRiskCount} 项
          </span>
        </div>
        <div className="mt-4 space-y-3">
          <RiskLine icon={CheckCircle2} label="施工许可证" value={audit.workPermit.value} done={audit.workPermit.done} />
          <RiskLine icon={Building2} label="建设单位信息" value={audit.unitMatch.value} done={audit.unitMatch.done} />
          <RiskLine icon={TimerReset} label="班组考勤时段" value={audit.teamAttendance.value} done={audit.teamAttendance.done} />
          <RiskLine icon={ShieldAlert} label="今日考勤异常" value={audit.attendanceExceptions.value} done={audit.attendanceExceptions.done} />
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-border">
          <div className="text-xs font-medium text-slate-500 dark:text-muted-foreground">项目负责人</div>
          <div className="mt-2 grid gap-2 text-sm">
            <div>
              <div className="font-semibold text-slate-900 dark:text-foreground">{project.manager}</div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">{project.managerPhone}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span className="rounded-md bg-slate-50 px-2 py-1 text-slate-600 dark:bg-muted dark:text-muted-foreground">实名制 {project.realNameManager}</span>
              <span className="rounded-md bg-slate-50 px-2 py-1 text-slate-600 dark:bg-muted dark:text-muted-foreground">劳资 {project.laborManager}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttendanceSummary({
  label,
  value,
  max,
  tone = "teal",
}: {
  label: string;
  value: number;
  max: number;
  tone?: "teal" | "amber" | "red";
}) {
  const width = Math.max(4, Math.min(100, Math.round((value / max) * 100)));
  const barClass = {
    teal: "bg-[#0f6b5d]",
    amber: "bg-amber-500",
    red: "bg-red-500",
  }[tone];

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-500 dark:text-muted-foreground">{label}</span>
        <span className="font-semibold text-slate-900 dark:text-foreground">{value}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-muted">
        <div className={cn("h-full rounded-full", barClass)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function ProgressLine({ label, value, tone = "teal" }: { label: string; value: number; tone?: "teal" | "amber" }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-muted-foreground">{label}</span>
        <span className={cn("font-medium", tone === "amber" ? "text-amber-700 dark:text-amber-300" : "text-[#0f6b5d] dark:text-primary")}>{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-muted">
        <div
          className={cn("h-full rounded-full", tone === "amber" ? "bg-amber-500" : "bg-[#0f6b5d]")}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function RiskLine({
  icon: Icon,
  label,
  value,
  done = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  done?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-border dark:bg-background">
      <span className={cn("rounded-md p-1.5", done ? "bg-emerald-50 text-[#0f6b5d] dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300")}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-900 dark:text-foreground">{label}</div>
        <div className={cn("mt-1 text-xs", done ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>{value}</div>
      </div>
    </div>
  );
}

function CheckLine({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-border dark:bg-background">
      <span className="text-slate-500 dark:text-muted-foreground">{label}</span>
      <span className={cn("font-medium", attention ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300")}>
        {value}
      </span>
    </div>
  );
}

function UnitsTab({
  units,
  editable,
  onEdit,
  onDelete,
}: {
  units: ConstructionUnit[];
  editable: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <DataTable
      empty="暂无参建单位"
      headers={editable ? ["单位名称", "单位类型", "统一社会信用代码", "负责人", "计薪方式", "人数", "操作"] : ["单位名称", "单位类型", "统一社会信用代码", "负责人", "计薪方式", "人数"]}
      rows={units.map((unit) => [
        unit.name,
        unit.type,
        unit.creditCode,
        `${unit.manager} / ${unit.phone}`,
        unit.salaryType,
        `${unit.workers} 人`,
        ...(editable ? [<RowActions key={unit.id} onEdit={() => onEdit(unit.id)} onDelete={() => onDelete(unit.id)} />] : []),
      ])}
    />
  );
}

function TeamsTab({
  teams,
  editable,
  onEdit,
  onDelete,
}: {
  teams: Team[];
  editable: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <DataTable
      empty="暂无班组"
      headers={editable ? ["班组名称", "参建单位", "工种", "班组长", "人数", "计薪方式", "考勤时段", "状态", "操作"] : ["班组名称", "参建单位", "工种", "班组长", "人数", "计薪方式", "考勤时段", "状态"]}
      rows={teams.map((team) => [
        team.name,
        team.unitName,
        team.type,
        `${team.leader} / ${team.phone}`,
        `${team.workerCount} 人`,
        team.salaryType,
        `${team.attendanceStart} - ${team.attendanceEnd}`,
        <ProjectStatusBadge key={team.id} value={team.status} />,
        ...(editable ? [<RowActions key={`${team.id}-actions`} onEdit={() => onEdit(team.id)} onDelete={() => onDelete(team.id)} />] : []),
      ])}
    />
  );
}

function WorkersTab({
  units,
  teams,
  workers,
  editable,
  onEdit,
  onDelete,
}: {
  units: ConstructionUnit[];
  teams: Team[];
  workers: Worker[];
  editable: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [selectedUnit, setSelectedUnit] = useState("全部单位");
  const unitSummaries = buildWorkerUnitSummaries(units, teams, workers);
  const activeSummary = unitSummaries.find((unit) => unit.name === selectedUnit) ?? unitSummaries[0];
  const scopedWorkers = activeSummary.name === "全部单位" ? workers : workers.filter((worker) => worker.unit === activeSummary.name);
  const scopedTeams = Array.from(new Set(scopedWorkers.map((worker) => worker.team).filter(Boolean)));

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-slate-200 bg-[#fbfcfc] p-3 dark:border-border dark:bg-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">参建单位</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">按单位查看班组与工人</p>
          </div>
          <Users className="size-4 text-[#0f6b5d] dark:text-primary" />
        </div>
        <div className="space-y-2">
          {unitSummaries.map((unit) => (
            <button
              key={unit.name}
              type="button"
              onClick={() => setSelectedUnit(unit.name)}
              className={cn(
                "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                activeSummary.name === unit.name
                  ? "border-[#0f6b5d] bg-emerald-50 text-[#0f6b5d] dark:border-primary dark:bg-emerald-950/40 dark:text-primary"
                  : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-border dark:bg-background dark:text-foreground dark:hover:bg-accent"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{unit.name}</div>
                  <div className="mt-1 truncate text-xs text-slate-500 dark:text-muted-foreground">{unit.type}</div>
                </div>
                <span className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm dark:bg-card dark:text-muted-foreground">
                  {unit.workerCount} 人
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-muted-foreground">
                <Layers3 className="size-3.5" />
                <span>{unit.teamCount} 个班组</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-border dark:bg-card">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">工人数据</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">
              当前范围：{activeSummary.name}，{activeSummary.teamCount} 个班组，{scopedWorkers.length} 名工人
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scopedTeams.slice(0, 4).map((team) => (
              <span key={team} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-border dark:bg-muted dark:text-muted-foreground">
                {team}
              </span>
            ))}
            {scopedTeams.length > 4 ? (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500 dark:border-border dark:bg-muted dark:text-muted-foreground">
                +{scopedTeams.length - 4}
              </span>
            ) : null}
          </div>
        </div>
        <DataTable
          empty="暂无工人"
          headers={editable ? ["姓名", "性别", "身份证", "手机号", "班组", "参建单位", "工种", "状态", "进场日期", "操作"] : ["姓名", "性别", "身份证", "手机号", "班组", "参建单位", "工种", "状态", "进场日期"]}
          rows={scopedWorkers.map((worker) => [
            worker.name,
            worker.gender,
            worker.idCard,
            worker.phone,
            worker.team,
            worker.unit,
            worker.workType,
            <ProjectStatusBadge key={worker.id} value={worker.status} />,
            worker.entryDate,
            ...(editable ? [<RowActions key={`${worker.id}-actions`} onEdit={() => onEdit(worker.id)} onDelete={() => onDelete(worker.id)} />] : []),
          ])}
        />
      </div>
    </div>
  );
}

function buildWorkerUnitSummaries(units: ConstructionUnit[], teams: Team[], workers: Worker[]) {
  const unitNames = Array.from(new Set([...units.map((unit) => unit.name), ...workers.map((worker) => worker.unit)])).filter(Boolean);
  const allTeamCount = new Set([...teams.map((team) => team.name), ...workers.map((worker) => worker.team)]).size;

  return [
    {
      name: "全部单位",
      type: "项目全部工人",
      workerCount: workers.length,
      teamCount: allTeamCount,
    },
    ...unitNames.map((unitName) => {
      const unit = units.find((item) => item.name === unitName);
      const unitWorkers = workers.filter((worker) => worker.unit === unitName);
      const unitTeamCount = new Set([
        ...teams.filter((team) => team.unitName === unitName).map((team) => team.name),
        ...unitWorkers.map((worker) => worker.team),
      ]).size;

      return {
        name: unitName,
        type: unit?.type ?? "未匹配单位",
        workerCount: unitWorkers.length,
        teamCount: unitTeamCount,
      };
    }),
  ];
}

function AttendanceTab({
  records,
  editable,
  onEdit,
  onDelete,
}: {
  records: AttendanceRecord[];
  editable: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <DataTable
      empty="暂无考勤记录"
      headers={editable ? ["工人", "班组", "进出", "考勤时间", "设备", "状态", "操作"] : ["工人", "班组", "进出", "考勤时间", "设备", "状态"]}
      rows={records.map((record) => [
        record.worker,
        record.team,
        record.direction,
        record.time,
        record.device,
        <ProjectStatusBadge key={record.id} value={record.status} />,
        ...(editable ? [<RowActions key={`${record.id}-actions`} onEdit={() => onEdit(record.id)} onDelete={() => onDelete(record.id)} />] : []),
      ])}
    />
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <Button type="button" variant="ghost" size="sm" className="text-[#0f6b5d]" onClick={onEdit}>
        编辑
      </Button>
      <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onDelete}>
        删除
      </Button>
    </div>
  );
}

function DynamicDetailForm({
  activeTab,
  state,
  setState,
  units,
  teams,
  workers,
  bizId,
}: {
  activeTab: DetailTab;
  state: DetailFormState;
  setState: Dispatch<SetStateAction<DetailFormState>>;
  units: ReturnType<typeof useProjectUnitsQuery>["data"];
  teams: ReturnType<typeof useProjectTeamsQuery>["data"];
  workers: ReturnType<typeof useProjectWorkersQuery>["data"];
  bizId?: string;
}) {
  const fields = formFieldsForTab(activeTab);
  const optionSources = {
    units: (units ?? []).map((unit) => ({
      label: unit.company_name ?? unit.id,
      value: unit.id,
    })),
    teams: (teams ?? []).map((team) => ({
      label: team.name ?? team.id,
      value: team.id,
    })),
    workers: (workers ?? []).map((worker) => ({
      label: worker.id_card ? `${worker.name ?? worker.id} / ${worker.id_card}` : worker.name ?? worker.id,
      value: worker.id,
    })),
  };

  return (
    <ConstructionRecordForm
      fields={fields}
      state={state}
      onChange={(key, value) => setState((current) => ({ ...current, [key]: value }))}
      onBulkChange={(values) => setState((current) => ({ ...current, ...values }))}
      optionSources={optionSources}
      uploadContext={{ bizType: uploadBizTypeForTab(activeTab), bizId }}
    />
  );
}

function uploadBizTypeForTab(activeTab: DetailTab) {
  if (activeTab === "建设单位") return "unit";
  if (activeTab === "班组信息") return "team";
  if (activeTab === "项目工人") return "worker";
  if (activeTab === "考勤记录") return "attendance";
  return "project";
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-border">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow className="bg-[#f8faf9] hover:bg-[#f8faf9] dark:bg-muted/30 dark:hover:bg-muted/30">
            {headers.map((header) => (
              <TableHead key={header} className="px-4 text-slate-500 dark:text-muted-foreground">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={headers.length} className="h-32 text-center text-slate-500 dark:text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, rowIndex) => (
              <TableRow key={rowIndex} className="hover:bg-[#f8faf9]/70 dark:hover:bg-muted/30">
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex} className="whitespace-nowrap px-4">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function apiProjectToDetail(project: ConstructionProject): Project {
  const status = PROJECT_STATUS_LABEL[project.status ?? 1] ?? "在建";

  return {
    id: project.id,
    name: project.name ?? "未命名项目",
    code: project.contract_number ?? project.id.slice(0, 8),
    status,
    location: project.address_code_list ?? project.address_code ?? "未填写",
    address: project.address ?? "未填写",
    contractor: project.contractor ?? "未填写",
    buildUnit: project.build_unit ?? "未填写",
    manager: project.manager ?? "未填写",
    managerPhone: project.manager_phone ?? "",
    startDate: project.start_date ?? "",
    finishDate: project.finish_date ?? "",
    investment: project.invest_total == null ? "" : `${project.invest_total} 万元`,
    laborCost: project.labor_cost == null ? "" : `${project.labor_cost} 万元`,
    workerCount: 0,
    teamCount: 0,
    unitCount: 0,
    attendanceToday: 0,
    attendanceRate: 0,
    progress: 0,
    risk: "正常",
    realNameManager: project.real_name_manager ?? "未填写",
    laborManager: project.labor_manager ?? "未填写",
    workPermit: project.work_permit ?? "待办理",
    area: project.acreage == null ? "" : `${project.acreage} 平方米`,
    coordinates: [project.longitude, project.latitude].filter(Boolean).join(", "),
  };
}

function apiUnitToDetail(unit: ApiConstructionUnit): ConstructionUnit {
  return {
    id: unit.id,
    projectId: unit.project_id,
    name: unit.company_name ?? "未命名单位",
    type: unit.company_type == null ? "未填写" : String(unit.company_type),
    creditCode: unit.company_credit_code ?? "",
    manager: unit.manager_name ?? "未填写",
    phone: unit.manager_phone ?? "",
    workers: 0,
    salaryType: unit.salary_calc_type == null ? "未填写" : String(unit.salary_calc_type),
  };
}

function apiTeamToDetail(team: ConstructionTeam, units: ApiConstructionUnit[]): Team {
  const unit = units.find((item) => item.id === team.unit_id);

  return {
    id: team.id,
    projectId: team.project_id,
    unitName: unit?.company_name ?? "未匹配单位",
    name: team.name ?? "未命名班组",
    type: team.work_type == null ? "未填写" : String(team.work_type),
    leader: team.leader_name ?? "未填写",
    phone: team.leader_phone ?? "",
    workerCount: 0,
    salaryType: team.settlement_type == null ? "未填写" : String(team.settlement_type),
    attendanceStart: team.attendance_start_time ?? "",
    attendanceEnd: team.attendance_end_time ?? "",
    status: team.attendance_start_time && team.attendance_end_time ? "正常" : "待完善",
  };
}

function apiWorkerToDetail(
  worker: ConstructionWorker,
  teams: ConstructionTeam[],
  units: ApiConstructionUnit[]
): Worker {
  const team = teams.find((item) => item.id === worker.team_id);
  const unit = units.find((item) => item.id === worker.unit_id);

  return {
    id: worker.id,
    projectId: worker.project_id,
    name: worker.name ?? "未命名工人",
    gender: worker.gender === 0 ? "女" : "男",
    idCard: worker.id_card ?? "",
    phone: worker.phone ?? "",
    team: team?.name ?? "未匹配班组",
    unit: unit?.company_name ?? "未匹配单位",
    workType: worker.work_type == null ? "未填写" : String(worker.work_type),
    status: worker.work_status === 2 ? "离场" : worker.auth_status === 1 ? "未认证" : "在场",
    entryDate: worker.entry_time ?? "",
  };
}

function apiAttendanceToDetail(
  record: ConstructionAttendanceRecord,
  workers: ConstructionWorker[],
  teams: ConstructionTeam[]
): AttendanceRecord {
  const worker = workers.find((item) => item.id === record.worker_id);
  const team = teams.find((item) => item.id === worker?.team_id);

  return {
    id: record.id,
    projectId: record.project_id,
    worker: worker?.name ?? "未匹配工人",
    team: team?.name ?? "未匹配班组",
    direction: record.direction === 1 ? "出场" : "进场",
    time: record.original_time ?? record.trigger_time,
    device: record.equipment_id ?? record.serial_number ?? "未填写",
    status: record.photo_path || record.overall_photo || record.closeup_photo ? "有效" : "待补图",
  };
}

function defaultFormForTab(
  activeTab: DetailTab,
  units: ApiConstructionUnit[],
  teams: ConstructionTeam[],
  workers: ConstructionWorker[]
): DetailFormState {
  return buildDefaultFormState(formFieldsForTab(activeTab), {
    unit_id: units[0]?.id ?? "",
    team_id: teams[0]?.id ?? "",
    worker_id: workers[0]?.id ?? "",
    trigger_time: datetimeLocalNow(),
  });
}

function formStateForRecord(
  activeTab: DetailTab,
  id: string,
  units: ApiConstructionUnit[],
  teams: ConstructionTeam[],
  workers: ConstructionWorker[],
  attendance: ConstructionAttendanceRecord[]
): DetailFormState {
  const record = recordForTab(activeTab, id, units, teams, workers, attendance);

  return buildFormStateFromRecord(formFieldsForTab(activeTab), record, {
    unit_id: record?.unit_id == null ? units[0]?.id ?? "" : String(record.unit_id),
    team_id: record?.team_id == null ? teams[0]?.id ?? "" : String(record.team_id),
    worker_id: record?.worker_id == null ? workers[0]?.id ?? "" : String(record.worker_id),
  });
}

function formFieldsForTab(activeTab: DetailTab): ConstructionFormField[] {
  if (activeTab === "建设单位") return unitFormFields;
  if (activeTab === "班组信息") return teamFormFields;
  if (activeTab === "项目工人") return workerFormFields;
  if (activeTab === "考勤记录") return attendanceFormFields;
  return [];
}

function recordForTab(
  activeTab: DetailTab,
  id: string,
  units: ApiConstructionUnit[],
  teams: ConstructionTeam[],
  workers: ConstructionWorker[],
  attendance: ConstructionAttendanceRecord[]
): Record<string, unknown> | undefined {
  if (activeTab === "建设单位") {
    return units.find((item) => item.id === id) as Record<string, unknown> | undefined;
  }
  if (activeTab === "班组信息") {
    return teams.find((item) => item.id === id) as Record<string, unknown> | undefined;
  }
  if (activeTab === "项目工人") {
    return workers.find((item) => item.id === id) as Record<string, unknown> | undefined;
  }
  if (activeTab === "考勤记录") {
    return attendance.find((item) => item.id === id) as Record<string, unknown> | undefined;
  }
  return undefined;
}
