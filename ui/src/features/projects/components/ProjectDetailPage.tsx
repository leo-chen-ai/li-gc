import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  FileCheck2,
  Layers3,
  List,
  LogOut,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  TimerReset,
  Upload,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  dateInputToday,
  datetimeLocalNow,
  getFieldOptionLabel,
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
  useCreateWageBatchMutation,
  useCreateWorkerMutation,
  useDeleteAttendanceMutation,
  useDeleteTeamMutation,
  useDeleteUnitMutation,
  useDeleteWageBatchMutation,
  useDeleteWorkerMutation,
  useImportWageBatchMutation,
  useProjectAllTeamsQuery,
  useProjectAllUnitsQuery,
  useProjectAllWorkersQuery,
  useProjectAttendanceCalendarQuery,
  useProjectAttendanceQuery,
  useProjectQuery,
  useProjectTeamsQuery,
  useProjectUnitsQuery,
  useProjectWageBatchesQuery,
  useProjectWorkersQuery,
  useUpdateAttendanceMutation,
  useUpdateTeamMutation,
  useUpdateUnitMutation,
  useUpdateWageBatchMutation,
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
  ConstructionWageBatch,
  ConstructionWageBatchPayload,
  ConstructionWageItem,
  ConstructionWageListFilters,
  ConstructionWageListResponse,
  ConstructionWorker,
  ConstructionWorkerPayload,
} from "../types/construction-types";
import {
  buildProjectOverviewAudit,
  type ProjectOverviewAudit,
} from "../lib/project-overview-metrics";
import { getProjectInfoCellClassName } from "../lib/project-detail-layout";
import { formatProjectTitle } from "../lib/project-title";
import { buildTeamLeaderPatch } from "../lib/team-leader-selection";
import { resolveWorkerFormScopeDefaults } from "../lib/worker-form-scope";
import { validateWorkerCreatePayload } from "../lib/worker-form-validation";
import {
  buildAttendanceCalendarRowsFromSummary,
  getAttendanceMonthDays,
  type AttendanceCalendarRow,
} from "../lib/attendance-calendar";
import { countActiveWorkersByTeamId, countActiveWorkersByUnitId } from "../lib/project-resource-counts";
import {
  buildWageItemPayloads,
  buildProjectResourceListParams,
  buildExcelCsv,
  DEFAULT_PROJECT_TABLE_PAGE_SIZE,
  downloadCsv,
  type EditableWageRow,
  formatCentsAsYuan,
  getControlledTablePage,
  getPageItems,
  getTotalPages,
  parseWageExcelFile,
  parseYuanToCents,
  summarizeWageRows,
} from "../lib/project-table-operations";
import { constructionProjectService } from "../services/construction-project-service";
import { MetricCell } from "./MetricCell";
import { ConstructionRecordForm } from "./ConstructionRecordForm";
import { ProjectStatusBadge } from "./ProjectStatusBadge";

const tabs = ["项目基本信息", "建设单位", "班组信息", "项目工人", "考勤记录", "工资统计"] as const;
type DetailTab = (typeof tabs)[number];
type DetailDialogMode = "create" | "edit";
type DetailFormState = Record<string, string>;
type WageFilters = {
  payrollMonth: string;
  status: string;
  page: number;
};
type AttendanceViewMode = "list" | "calendar";
type UnitLedgerFilters = {
  keyword: string;
  companyType: string;
  salaryCalcType: string;
};
type TeamLedgerFilters = {
  keyword: string;
  unitId: string;
  workType: string;
  attendanceConfigured: string;
};
type WorkerLedgerFilters = {
  keyword: string;
  teamId: string;
  workStatus: string;
  workType: string;
};
type AttendanceLedgerFilters = {
  keyword: string;
  attendanceDate: string;
  direction: string;
};
type WorkerTreeSelection =
  | { kind: "all" }
  | { kind: "unit"; unitName: string }
  | { kind: "team"; unitName: string; teamName: string };
type WorkerTreeTeamNode = {
  name: string;
  type: string;
  workerCount: number;
};
type WorkerTreeUnitNode = {
  name: string;
  type: string;
  workerCount: number;
  teamCount: number;
  teams: WorkerTreeTeamNode[];
};
type TablePaginationConfig = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

const DEFAULT_UNIT_FILTERS: UnitLedgerFilters = {
  keyword: "",
  companyType: "all",
  salaryCalcType: "all",
};
const DEFAULT_TEAM_FILTERS: TeamLedgerFilters = {
  keyword: "",
  unitId: "all",
  workType: "all",
  attendanceConfigured: "all",
};
const DEFAULT_WORKER_FILTERS: WorkerLedgerFilters = {
  keyword: "",
  teamId: "all",
  workStatus: "all",
  workType: "all",
};
const DEFAULT_ATTENDANCE_FILTERS: AttendanceLedgerFilters = {
  keyword: "",
  attendanceDate: "",
  direction: "all",
};

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

const wageFormFields: ConstructionFormField[] = [
  {
    key: "payroll_month",
    label: "发放月份",
    valueType: "string",
    required: true,
    section: "工资单信息",
    placeholder: "例如 2026-05",
  },
  {
    key: "company_name",
    label: "企业名称",
    valueType: "string",
    required: true,
    section: "工资单信息",
  },
  {
    key: "employee_count",
    label: "发放人数",
    valueType: "number",
    section: "工资单信息",
  },
  {
    key: "status",
    label: "状态",
    valueType: "string",
    control: "select",
    section: "工资单信息",
    defaultValue: "draft",
    options: [
      { label: "草稿", value: "draft" },
      { label: "已确认", value: "confirmed" },
      { label: "已发放", value: "paid" },
      { label: "导入", value: "imported" },
    ],
  },
  {
    key: "payable_amount_yuan",
    label: "应发金额(元)",
    valueType: "number",
    section: "金额信息",
  },
  {
    key: "paid_amount_yuan",
    label: "实发金额(元)",
    valueType: "number",
    section: "金额信息",
  },
  {
    key: "unpaid_amount_yuan",
    label: "未发金额(元)",
    valueType: "number",
    section: "金额信息",
  },
  {
    key: "remark",
    label: "备注",
    valueType: "string",
    control: "textarea",
    section: "金额信息",
    wide: true,
  },
];

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const [unitPage, setUnitPage] = useState(1);
  const [teamPage, setTeamPage] = useState(1);
  const [workerPage, setWorkerPage] = useState(1);
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendanceViewMode, setAttendanceViewMode] = useState<AttendanceViewMode>("calendar");
  const [attendanceCalendarMonth, setAttendanceCalendarMonth] = useState(currentPayrollMonth());
  const [workerTreeSelection, setWorkerTreeSelection] = useState<WorkerTreeSelection>({ kind: "all" });
  const [unitFilters, setUnitFilters] = useState<UnitLedgerFilters>(DEFAULT_UNIT_FILTERS);
  const [appliedUnitFilters, setAppliedUnitFilters] = useState<UnitLedgerFilters>(DEFAULT_UNIT_FILTERS);
  const [teamFilters, setTeamFilters] = useState<TeamLedgerFilters>(DEFAULT_TEAM_FILTERS);
  const [appliedTeamFilters, setAppliedTeamFilters] = useState<TeamLedgerFilters>(DEFAULT_TEAM_FILTERS);
  const [workerFilters, setWorkerFilters] = useState<WorkerLedgerFilters>(DEFAULT_WORKER_FILTERS);
  const [appliedWorkerFilters, setAppliedWorkerFilters] = useState<WorkerLedgerFilters>(DEFAULT_WORKER_FILTERS);
  const [attendanceFilters, setAttendanceFilters] = useState<AttendanceLedgerFilters>(DEFAULT_ATTENDANCE_FILTERS);
  const [appliedAttendanceFilters, setAppliedAttendanceFilters] = useState<AttendanceLedgerFilters>(DEFAULT_ATTENDANCE_FILTERS);
  const projectQuery = useProjectQuery(projectId);
  const allUnitQuery = useProjectAllUnitsQuery(projectId);
  const allTeamQuery = useProjectAllTeamsQuery(projectId);
  const allWorkerQuery = useProjectAllWorkersQuery(projectId);
  const rawUnits = useMemo(() => allUnitQuery.data ?? [], [allUnitQuery.data]);
  const rawTeams = useMemo(() => allTeamQuery.data ?? [], [allTeamQuery.data]);
  const rawWorkers = useMemo(() => allWorkerQuery.data ?? [], [allWorkerQuery.data]);
  const workerScopeFilter = useMemo(() => {
    if (workerTreeSelection.kind === "all") return {};

    const unit = rawUnits.find((item) => item.company_name === workerTreeSelection.unitName);
    const team =
      workerTreeSelection.kind === "team"
        ? rawTeams.find((item) => item.name === workerTreeSelection.teamName && (!unit || item.unit_id === unit.id))
        : undefined;

    return {
      unitId: unit?.id,
      teamId: team?.id,
    };
  }, [rawTeams, rawUnits, workerTreeSelection]);
  const unitListFilters = useMemo(
    () =>
      buildProjectResourceListParams({
        page: unitPage,
        keyword: appliedUnitFilters.keyword,
        companyType: normalizeSelectFilter(appliedUnitFilters.companyType),
        salaryCalcType: normalizeSelectFilter(appliedUnitFilters.salaryCalcType),
      }),
    [appliedUnitFilters.companyType, appliedUnitFilters.keyword, appliedUnitFilters.salaryCalcType, unitPage]
  );
  const teamListFilters = useMemo(
    () =>
      buildProjectResourceListParams({
        page: teamPage,
        keyword: appliedTeamFilters.keyword,
        unitId: normalizeSelectFilter(appliedTeamFilters.unitId),
        workType: normalizeSelectFilter(appliedTeamFilters.workType),
        attendanceConfigured:
          appliedTeamFilters.attendanceConfigured === "configured"
            ? true
            : appliedTeamFilters.attendanceConfigured === "missing"
              ? false
              : null,
      }),
    [appliedTeamFilters.attendanceConfigured, appliedTeamFilters.keyword, appliedTeamFilters.unitId, appliedTeamFilters.workType, teamPage]
  );
  const workerListFilters = useMemo(
    () =>
      buildProjectResourceListParams({
        page: workerPage,
        unitId: workerScopeFilter.unitId,
        teamId: normalizeSelectFilter(appliedWorkerFilters.teamId) || workerScopeFilter.teamId,
        keyword: appliedWorkerFilters.keyword,
        workStatus: normalizeSelectFilter(appliedWorkerFilters.workStatus),
        workType: normalizeSelectFilter(appliedWorkerFilters.workType),
      }),
    [appliedWorkerFilters.keyword, appliedWorkerFilters.teamId, appliedWorkerFilters.workStatus, appliedWorkerFilters.workType, workerPage, workerScopeFilter.teamId, workerScopeFilter.unitId]
  );
  const attendanceListFilters = useMemo(
    () =>
      buildProjectResourceListParams({
        page: attendancePage,
        keyword: appliedAttendanceFilters.keyword,
        attendanceDate: appliedAttendanceFilters.attendanceDate || null,
        direction: normalizeSelectFilter(appliedAttendanceFilters.direction),
      }),
    [appliedAttendanceFilters.attendanceDate, appliedAttendanceFilters.direction, appliedAttendanceFilters.keyword, attendancePage]
  );
  const unitQuery = useProjectUnitsQuery(projectId, unitListFilters);
  const teamQuery = useProjectTeamsQuery(projectId, teamListFilters);
  const workerQuery = useProjectWorkersQuery(projectId, workerListFilters);
  const attendanceQuery = useProjectAttendanceQuery(projectId, attendanceListFilters);
  const attendanceCalendarQuery = useProjectAttendanceCalendarQuery(projectId, attendanceCalendarMonth);
  const [wageFilters, setWageFilters] = useState<WageFilters>({
    payrollMonth: "",
    status: "all",
    page: 1,
  });
  const [wageRows, setWageRows] = useState<EditableWageRow[]>([]);
  const wageListFilters = useMemo<ConstructionWageListFilters>(
    () => ({
      payroll_month: wageFilters.payrollMonth || undefined,
      status: wageFilters.status === "all" ? undefined : wageFilters.status,
      page: wageFilters.page,
      page_size: DEFAULT_PROJECT_TABLE_PAGE_SIZE,
    }),
    [wageFilters.page, wageFilters.payrollMonth, wageFilters.status]
  );
  const wageQuery = useProjectWageBatchesQuery(projectId, wageListFilters);
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
  const createWageBatch = useCreateWageBatchMutation(projectId);
  const updateWageBatch = useUpdateWageBatchMutation(projectId);
  const deleteWageBatch = useDeleteWageBatchMutation(projectId);
  const importWageBatch = useImportWageBatchMutation(projectId);
  const project = useMemo(
    () => (projectQuery.data ? apiProjectToDetail(projectQuery.data) : null),
    [projectQuery.data]
  );
  const tableRawUnits = useMemo(() => unitQuery.data?.items ?? [], [unitQuery.data]);
  const tableRawTeams = useMemo(() => teamQuery.data?.items ?? [], [teamQuery.data]);
  const tableRawWorkers = useMemo(() => workerQuery.data?.items ?? [], [workerQuery.data]);
  const tableRawAttendance = useMemo(() => attendanceQuery.data?.items ?? [], [attendanceQuery.data]);
  const workerCountByUnitId = useMemo(
    () => countActiveWorkersByUnitId(rawWorkers),
    [rawWorkers]
  );
  const workerCountByTeamId = useMemo(
    () => countActiveWorkersByTeamId(rawWorkers),
    [rawWorkers]
  );
  const units = useMemo(
    () => rawUnits.map((unit) => apiUnitToDetail(unit, workerCountByUnitId.get(unit.id) ?? 0)),
    [rawUnits, workerCountByUnitId]
  );
  const tableUnits = useMemo(
    () => tableRawUnits.map((unit) => apiUnitToDetail(unit, workerCountByUnitId.get(unit.id) ?? 0)),
    [tableRawUnits, workerCountByUnitId]
  );
  const projectTeams = useMemo(
    () => rawTeams.map((team) => apiTeamToDetail(team, rawUnits, workerCountByTeamId.get(team.id) ?? 0)),
    [rawTeams, rawUnits, workerCountByTeamId]
  );
  const tableTeams = useMemo(
    () => tableRawTeams.map((team) => apiTeamToDetail(team, rawUnits, workerCountByTeamId.get(team.id) ?? 0)),
    [rawUnits, tableRawTeams, workerCountByTeamId]
  );
  const projectWorkers = useMemo(
    () => rawWorkers.map((worker) => apiWorkerToDetail(worker, rawTeams, rawUnits)),
    [rawTeams, rawUnits, rawWorkers]
  );
  const tableWorkers = useMemo(
    () => tableRawWorkers.map((worker) => apiWorkerToDetail(worker, rawTeams, rawUnits)),
    [rawTeams, rawUnits, tableRawWorkers]
  );
  const tableAttendance = useMemo(
    () => tableRawAttendance.map((record) => apiAttendanceToDetail(record, rawWorkers, rawTeams)),
    [rawTeams, rawWorkers, tableRawAttendance]
  );
  const attendanceCalendarRows = useMemo(
    () => buildAttendanceCalendarRowsFromSummary(attendanceCalendarQuery.data?.items ?? []),
    [attendanceCalendarQuery.data]
  );
  const projectMetrics = useMemo(() => {
    if (!project) return null;

    const workerCount = projectWorkers.length || project.workerCount;
    const teamCount = projectTeams.length || project.teamCount;
    const unitCount = units.length || project.unitCount;
    const attendanceToday = project.attendanceToday;
    const attendanceRate = workerCount > 0 ? Math.round((attendanceToday / workerCount) * 100) : project.attendanceRate;

    return {
      ...project,
      unitCount,
      teamCount,
      workerCount,
      attendanceToday,
      attendanceRate,
    };
  }, [project, projectTeams.length, projectWorkers.length, units.length]);
  const overviewAudit = useMemo(() => {
    if (!projectMetrics) return null;

    return buildProjectOverviewAudit(projectMetrics, {
      units,
      teams: projectTeams,
      workers: projectWorkers,
      attendance: tableAttendance,
    });
  }, [projectMetrics, projectTeams, projectWorkers, tableAttendance, units]);
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
    updateAttendance.isPending ||
    createWageBatch.isPending ||
    updateWageBatch.isPending ||
    importWageBatch.isPending;

  const handleWorkerTreeSelectionChange = (selection: WorkerTreeSelection) => {
    setWorkerTreeSelection(selection);
    setWorkerPage(1);
  };

  const applyModuleFilters = () => {
    if (activeTab === "建设单位") {
      setAppliedUnitFilters(unitFilters);
      setUnitPage(1);
    }
    if (activeTab === "班组信息") {
      setAppliedTeamFilters(teamFilters);
      setTeamPage(1);
    }
    if (activeTab === "项目工人") {
      setAppliedWorkerFilters(workerFilters);
      setWorkerPage(1);
    }
    if (activeTab === "考勤记录") {
      setAppliedAttendanceFilters(attendanceFilters);
      setAttendancePage(1);
    }
  };

  const resetModuleFilters = () => {
    if (activeTab === "建设单位") {
      setUnitFilters(DEFAULT_UNIT_FILTERS);
      setAppliedUnitFilters(DEFAULT_UNIT_FILTERS);
      setUnitPage(1);
    }
    if (activeTab === "班组信息") {
      setTeamFilters(DEFAULT_TEAM_FILTERS);
      setAppliedTeamFilters(DEFAULT_TEAM_FILTERS);
      setTeamPage(1);
    }
    if (activeTab === "项目工人") {
      setWorkerFilters(DEFAULT_WORKER_FILTERS);
      setAppliedWorkerFilters(DEFAULT_WORKER_FILTERS);
      setWorkerPage(1);
    }
    if (activeTab === "考勤记录") {
      setAttendanceFilters(DEFAULT_ATTENDANCE_FILTERS);
      setAppliedAttendanceFilters(DEFAULT_ATTENDANCE_FILTERS);
      setAttendancePage(1);
    }
  };

  const openCreateDialog = () => {
    if (!project) {
      toast.info("项目数据尚未加载，暂不能维护台账。");
      return;
    }
    setDialogMode("create");
    setEditingId(null);
    setFormState(defaultFormForTab(activeTab, rawUnits, rawTeams, rawWorkers, workerTreeSelection));
    if (activeTab === "工资统计") setWageRows([]);
    setFormOpen(true);
  };

  const openEditDialog = (id: string) => {
    if (!project) {
      toast.info("项目数据尚未加载，暂不能维护台账。");
      return;
    }
    if (activeTab === "工资统计") {
      const wageRecord = wageQuery.data?.items.find((item) => item.id === id);
      setDialogMode("edit");
      setEditingId(id);
      setFormState(wageRecord ? formStateForWageRecord(wageRecord) : defaultFormForTab(activeTab, rawUnits, rawTeams, rawWorkers, workerTreeSelection));
      setWageRows(wageRecord ? wageRowsFromRecord(wageRecord.items ?? []) : []);
      setFormOpen(true);
      return;
    }
    const state = formStateForRecord(activeTab, id, rawUnits, rawTeams, rawWorkers, tableRawAttendance);
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
      if (activeTab === "工资统计") await deleteWageBatch.mutateAsync(id);
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
          validateWorkerCreatePayload(payload);
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
      if (activeTab === "工资统计") {
        const payload = buildWagePayloadFromForm(formState, wageRows);
        if (dialogMode === "edit" && editingId) {
          await updateWageBatch.mutateAsync({ batchId: editingId, payload });
        } else {
          await createWageBatch.mutateAsync(payload);
        }
      }
      toast.success(dialogMode === "edit" ? "记录已修改" : "记录已新增");
      setFormOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : dialogMode === "edit" ? "修改失败" : "新增失败");
    }
  };

  const handleWageFilterChange = (patch: Partial<WageFilters>) => {
    setWageFilters((current) => ({
      ...current,
      ...patch,
      page: patch.page ?? 1,
    }));
  };

  const handleWageImportFile = async (file: File) => {
    if (!project) {
      toast.info("项目数据尚未加载，暂不能导入工资表。");
      return;
    }
    if (!wageFilters.payrollMonth) {
      toast.info("请先选择发放月份，再导入工资表。");
      return;
    }

    try {
      const rows = await parseWageExcelFile(file);
      await importWageBatch.mutateAsync({
        payroll_month: wageFilters.payrollMonth,
        company_name: project.contractor || project.buildUnit || project.name,
        status: "imported",
        rows,
      });
      toast.success(`已导入 ${rows.length} 条工资明细`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "工资表导入失败");
    }
  };

  const handleExportActiveTab = async () => {
    if (!project) {
      toast.info("项目数据尚未加载，暂不能导出台账。");
      return;
    }

    try {
      if (activeTab === "建设单位") {
        exportUnitsCsv(project.name, units);
        return;
      }
      if (activeTab === "班组信息") {
        exportTeamsCsv(project.name, projectTeams);
        return;
      }
      if (activeTab === "项目工人") {
        exportWorkersCsv(project.name, projectWorkers);
        return;
      }
      if (activeTab === "考勤记录") {
        const records = await constructionProjectService.listAllAttendance(projectId);
        exportAttendanceCsv(
          project.name,
          records.map((record) => apiAttendanceToDetail(record, rawWorkers, rawTeams))
        );
        return;
      }
      if (activeTab === "工资统计") {
        const blob = await constructionProjectService.exportWageBatches(projectId, wageListFilters);
        downloadBlob(`${safeFilename(project.name)}-工资统计.csv`, blob);
        toast.success("工资统计已导出");
        return;
      }
      toast.info("当前模块暂无可导出的台账数据。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
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
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      <div className="sticky top-0 z-20 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-border dark:bg-card/95">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="-ml-2 h-8 gap-2 text-slate-600 hover:bg-emerald-50 hover:text-[#0f6b5d] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground">
              <Link to="/app/admin/projects">
                <ArrowLeft className="size-4" />
                返回
              </Link>
            </Button>
            <div className="min-w-0 border-l border-slate-200 pl-3 dark:border-border">
              <div className="text-xs font-medium text-[#0f6b5d] dark:text-primary">项目管理模块</div>
              <div className="truncate text-sm font-semibold text-slate-950 dark:text-foreground">{activeTab}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-2 border-slate-200 bg-white dark:border-border dark:bg-background"
              onClick={handleExportActiveTab}
            >
              <Download className="size-4" />
              {getExportButtonLabel(activeTab)}
            </Button>
            {activeTab !== "考勤记录" ? (
              <Button
                size="sm"
                className="h-8 gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
                onClick={() => {
                  if (activeTab === "项目基本信息") {
                    toast.info("项目基础信息可在项目列表点击编辑维护。");
                    return;
                  }
                  openCreateDialog();
                }}
              >
                <Pencil className="size-4" />
                {getCreateButtonLabel(activeTab)}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap border-t border-slate-100 pt-1 dark:border-border">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "relative h-8 shrink-0 px-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-950 dark:text-muted-foreground dark:hover:text-foreground",
                  activeTab === tab && "text-[#0f6b5d] dark:text-primary"
                )}
              >
                {tab}
                {activeTab === tab && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[#0f6b5d] dark:bg-primary" />}
              </button>
            ))}
        </div>
      </div>

      {activeTab === "项目基本信息" && overviewAudit && (
        <ProjectOverviewReport project={projectMetrics} attendance={tableAttendance} audit={overviewAudit} />
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        {activeTab !== "项目基本信息" && (
          <div className="border-b border-slate-100 bg-[#f8faf9] px-3 py-2 dark:border-border dark:bg-muted/30">
            {activeTab === "工资统计" ? (
              <WageFiltersBar
                filters={wageFilters}
                onChange={handleWageFilterChange}
                onReset={() => setWageFilters({ payrollMonth: "", status: "all", page: 1 })}
              />
            ) : (
              <ModuleFilters
                activeTab={activeTab}
                units={units}
                teams={projectTeams}
                unitFilters={unitFilters}
                onUnitFiltersChange={(patch) => setUnitFilters((current) => ({ ...current, ...patch }))}
                teamFilters={teamFilters}
                onTeamFiltersChange={(patch) => setTeamFilters((current) => ({ ...current, ...patch }))}
                workerFilters={workerFilters}
                onWorkerFiltersChange={(patch) => setWorkerFilters((current) => ({ ...current, ...patch }))}
                attendanceFilters={attendanceFilters}
                onAttendanceFiltersChange={(patch) => setAttendanceFilters((current) => ({ ...current, ...patch }))}
                onSearch={applyModuleFilters}
                onReset={resetModuleFilters}
              />
            )}
          </div>
        )}

        <div className="p-4">
          {activeTab === "项目基本信息" && (
            <ProjectInfoTab
              project={projectMetrics}
              unitCount={projectMetrics.unitCount}
              teamCount={projectMetrics.teamCount}
              workerCount={projectMetrics.workerCount}
              audit={overviewAudit}
            />
          )}
          {activeTab === "建设单位" && (
            <UnitsTab
              units={tableUnits}
              pagination={{
                page: unitQuery.data?.page ?? unitPage,
                pageSize: unitQuery.data?.page_size ?? DEFAULT_PROJECT_TABLE_PAGE_SIZE,
                total: unitQuery.data?.total ?? 0,
                onPageChange: setUnitPage,
              }}
              onEdit={openEditDialog}
              onDelete={handleDeleteRecord}
              editable
            />
          )}
          {activeTab === "班组信息" && (
            <TeamsTab
              teams={tableTeams}
              pagination={{
                page: teamQuery.data?.page ?? teamPage,
                pageSize: teamQuery.data?.page_size ?? DEFAULT_PROJECT_TABLE_PAGE_SIZE,
                total: teamQuery.data?.total ?? 0,
                onPageChange: setTeamPage,
              }}
              onEdit={openEditDialog}
              onDelete={handleDeleteRecord}
              editable
            />
          )}
          {activeTab === "项目工人" && (
            <WorkersTab
              projectId={projectId}
              units={units}
              teams={projectTeams}
              workers={tableWorkers}
              treeWorkers={projectWorkers}
              selection={workerTreeSelection}
              onSelectionChange={handleWorkerTreeSelectionChange}
              pagination={{
                page: workerQuery.data?.page ?? workerPage,
                pageSize: workerQuery.data?.page_size ?? DEFAULT_PROJECT_TABLE_PAGE_SIZE,
                total: workerQuery.data?.total ?? 0,
                onPageChange: setWorkerPage,
              }}
              onRetireWorker={updateWorker.mutateAsync}
              onEdit={openEditDialog}
              onDelete={handleDeleteRecord}
              editable
            />
          )}
          {activeTab === "考勤记录" && (
            <AttendanceTab
              records={tableAttendance}
              calendarRows={attendanceCalendarRows}
              viewMode={attendanceViewMode}
              onViewModeChange={setAttendanceViewMode}
              calendarMonth={attendanceCalendarMonth}
              onCalendarMonthChange={setAttendanceCalendarMonth}
              pagination={{
                page: attendanceQuery.data?.page ?? attendancePage,
                pageSize: attendanceQuery.data?.page_size ?? DEFAULT_PROJECT_TABLE_PAGE_SIZE,
                total: attendanceQuery.data?.total ?? 0,
                onPageChange: setAttendancePage,
              }}
            />
          )}
          {activeTab === "工资统计" && (
            <WageStatisticsTab
              data={wageQuery.data}
              isLoading={wageQuery.isLoading}
              isError={wageQuery.isError}
              onEdit={openEditDialog}
              onDelete={handleDeleteRecord}
              onImportFile={handleWageImportFile}
              onPageChange={(page) => setWageFilters((current) => ({ ...current, page }))}
            />
          )}
        </div>
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-5xl",
            activeTab === "工资统计" &&
              "flex h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 p-0 sm:max-w-[calc(100vw-2rem)]"
          )}
        >
          <DialogHeader
            className={cn(
              activeTab === "工资统计" && "border-b border-slate-200 px-6 py-4 pr-12 dark:border-border"
            )}
          >
            <DialogTitle>{dialogMode === "edit" ? `编辑${activeTab}` : `新增${activeTab}`}</DialogTitle>
            <DialogDescription>录入当前模块的台账字段。</DialogDescription>
          </DialogHeader>
          <form
            className={cn(
              "grid gap-4",
              activeTab === "工资统计" && "min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] px-6 pb-4"
            )}
            onSubmit={handleSubmitRecord}
          >
            <div className={cn(activeTab === "工资统计" && "min-h-0 space-y-4 overflow-y-auto pr-1 pt-4")}>
              <DynamicDetailForm
                activeTab={activeTab}
                state={formState}
                setState={setFormState}
                units={rawUnits}
                teams={rawTeams}
                workers={rawWorkers}
                bizId={editingId ?? undefined}
              />
              {activeTab === "工资统计" ? (
                <WageItemsEditor
                  workers={rawWorkers}
                  teams={rawTeams}
                  rows={wageRows}
                  onChange={setWageRows}
                />
              ) : null}
            </div>
            <DialogFooter
              className={cn(
                activeTab === "工资统计" && "border-t border-slate-200 bg-background pt-4 dark:border-border"
              )}
            >
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
  unitFilters,
  onUnitFiltersChange,
  teamFilters,
  onTeamFiltersChange,
  workerFilters,
  onWorkerFiltersChange,
  attendanceFilters,
  onAttendanceFiltersChange,
  onSearch,
  onReset,
}: {
  activeTab: DetailTab;
  units: ConstructionUnit[];
  teams: Team[];
  unitFilters: UnitLedgerFilters;
  onUnitFiltersChange: (patch: Partial<UnitLedgerFilters>) => void;
  teamFilters: TeamLedgerFilters;
  onTeamFiltersChange: (patch: Partial<TeamLedgerFilters>) => void;
  workerFilters: WorkerLedgerFilters;
  onWorkerFiltersChange: (patch: Partial<WorkerLedgerFilters>) => void;
  attendanceFilters: AttendanceLedgerFilters;
  onAttendanceFiltersChange: (patch: Partial<AttendanceLedgerFilters>) => void;
  onSearch: () => void;
  onReset: () => void;
}) {
  if (activeTab === "项目基本信息") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 dark:border-border dark:bg-background dark:text-muted-foreground">
        项目基本信息为档案展示，无需列表筛选。
      </div>
    );
  }

  if (activeTab === "建设单位") {
    return (
      <FilterGrid onSearch={onSearch} onReset={onReset}>
        <FilterInput label="关键词" placeholder="单位名称、信用代码、负责人" value={unitFilters.keyword} onChange={(event) => onUnitFiltersChange({ keyword: event.target.value })} />
        <FilterSelect label="单位类型" value={unitFilters.companyType} onValueChange={(companyType) => onUnitFiltersChange({ companyType })} options={selectOptionsFromField(unitFormFields, "company_type", "全部类型")} />
        <FilterSelect label="计薪方式" value={unitFilters.salaryCalcType} onValueChange={(salaryCalcType) => onUnitFiltersChange({ salaryCalcType })} options={selectOptionsFromField(unitFormFields, "salary_calc_type", "全部计薪方式")} />
      </FilterGrid>
    );
  }

  if (activeTab === "班组信息") {
    return (
      <FilterGrid onSearch={onSearch} onReset={onReset}>
        <FilterInput label="关键词" placeholder="班组名称、班组长、班组编号" value={teamFilters.keyword} onChange={(event) => onTeamFiltersChange({ keyword: event.target.value })} />
        <FilterSelect label="参建单位" value={teamFilters.unitId} onValueChange={(unitId) => onTeamFiltersChange({ unitId })} options={[{ label: "全部单位", value: "all" }, ...units.map((unit) => ({ label: unit.name, value: unit.id }))]} />
        <FilterSelect label="工种" value={teamFilters.workType} onValueChange={(workType) => onTeamFiltersChange({ workType })} options={selectOptionsFromField(teamFormFields, "work_type", "全部工种")} />
        <FilterSelect
          label="考勤时段"
          value={teamFilters.attendanceConfigured}
          onValueChange={(attendanceConfigured) => onTeamFiltersChange({ attendanceConfigured })}
          options={[
            { label: "全部时段", value: "all" },
            { label: "已配置", value: "configured" },
            { label: "待配置", value: "missing" },
          ]}
        />
      </FilterGrid>
    );
  }

  if (activeTab === "项目工人") {
    return (
      <FilterGrid onSearch={onSearch} onReset={onReset}>
        <FilterInput label="关键词" placeholder="姓名、身份证、手机号" value={workerFilters.keyword} onChange={(event) => onWorkerFiltersChange({ keyword: event.target.value })} />
        <FilterSelect label="所属班组" value={workerFilters.teamId} onValueChange={(teamId) => onWorkerFiltersChange({ teamId })} options={[{ label: "全部班组", value: "all" }, ...teams.map((team) => ({ label: `${team.unitName} / ${team.name}`, value: team.id }))]} />
        <FilterSelect label="工人状态" value={workerFilters.workStatus} onValueChange={(workStatus) => onWorkerFiltersChange({ workStatus })} options={selectOptionsFromField(workerFormFields, "work_status", "全部状态")} />
        <FilterSelect label="工种" value={workerFilters.workType} onValueChange={(workType) => onWorkerFiltersChange({ workType })} options={selectOptionsFromField(workerFormFields, "work_type", "全部工种")} />
      </FilterGrid>
    );
  }

  return (
    <FilterGrid onSearch={onSearch} onReset={onReset}>
      <FilterInput label="关键词" placeholder="工人姓名、班组、设备" value={attendanceFilters.keyword} onChange={(event) => onAttendanceFiltersChange({ keyword: event.target.value })} />
      <FilterInput label="考勤日期" type="date" value={attendanceFilters.attendanceDate} onChange={(event) => onAttendanceFiltersChange({ attendanceDate: event.target.value })} />
      <FilterSelect label="进出方向" value={attendanceFilters.direction} onValueChange={(direction) => onAttendanceFiltersChange({ direction })} options={selectOptionsFromField(attendanceFormFields, "direction", "全部方向")} />
    </FilterGrid>
  );
}

function WageFiltersBar({
  filters,
  onChange,
  onReset,
}: {
  filters: WageFilters;
  onChange: (patch: Partial<WageFilters>) => void;
  onReset: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-border dark:bg-background sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(160px,1fr)_auto]">
      <label className="min-w-0 space-y-1">
        <span className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground">发放月份</span>
        <Input
          type="month"
          value={filters.payrollMonth}
          onChange={(event) => onChange({ payrollMonth: event.target.value })}
          className="h-8"
        />
      </label>
      <label className="min-w-0 space-y-1">
        <span className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground">状态</span>
        <Select value={filters.status} onValueChange={(status) => onChange({ status })}>
          <SelectTrigger className="h-8 w-full bg-white dark:bg-input/30">
            <div className="flex min-w-0 items-center gap-2">
              <SlidersHorizontal className="size-4 shrink-0 text-slate-400" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="draft">草稿</SelectItem>
            <SelectItem value="imported">导入</SelectItem>
            <SelectItem value="confirmed">已确认</SelectItem>
            <SelectItem value="paid">已发放</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1 xl:justify-end">
        <Button size="sm" variant="outline" className="h-8 gap-2 border-slate-200 bg-white dark:border-border dark:bg-background" onClick={onReset}>
          <RotateCcw className="size-4" />
          重置
        </Button>
        <Button size="sm" className="h-8 gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]" onClick={() => onChange({ page: 1 })}>
          <Search className="size-4" />
          查询
        </Button>
      </div>
    </div>
  );
}

function WageItemsEditor({
  workers,
  teams,
  rows,
  onChange,
}: {
  workers: ConstructionWorker[];
  teams: ConstructionTeam[];
  rows: EditableWageRow[];
  onChange: (rows: EditableWageRow[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const selectedWorkerIds = useMemo(() => new Set(rows.map((row) => row.worker_id).filter(Boolean)), [rows]);
  const visibleWorkers = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return workers
      .filter((worker) => {
        if (!normalized) return true;
        return [worker.name, worker.id_card, worker.phone, teamNameForWorker(worker, teams)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalized));
      })
      .slice(0, 80);
  }, [keyword, teams, workers]);
  const summary = summarizeWageRows(rows);

  const toggleWorker = (worker: ConstructionWorker, checked: boolean) => {
    if (checked) {
      if (selectedWorkerIds.has(worker.id)) return;
      onChange([...rows, wageRowFromWorker(worker, teams)]);
      return;
    }
    onChange(rows.filter((row) => row.worker_id !== worker.id));
  };

  const patchRow = (rowKey: string, patch: Partial<EditableWageRow>) => {
    onChange(rows.map((row) => ((row.row_key ?? row.worker_id) === rowKey ? { ...row, ...patch } : row)));
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-[#fbfcfc] p-3 dark:border-border dark:bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">工资明细</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">
            选择本次发工资的工人，并填写每个人的应发、实发和未发金额。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-muted-foreground sm:grid-cols-4">
          <span>人数：{summary.employee_count}</span>
          <span>应发：{formatCentsAsYuan(summary.payable_amount_cents)}</span>
          <span>实发：{formatCentsAsYuan(summary.paid_amount_cents)}</span>
          <span>未发：{formatCentsAsYuan(summary.unpaid_amount_cents)}</span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-md border border-slate-200 bg-white p-2 dark:border-border dark:bg-background">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索姓名、身份证、手机号、班组"
            className="h-8"
          />
          <div className="mt-2 max-h-[min(54vh,36rem)] space-y-1 overflow-y-auto pr-1">
            {visibleWorkers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-muted-foreground">暂无可选工人</div>
            ) : (
              visibleWorkers.map((worker) => (
                <label
                  key={worker.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={selectedWorkerIds.has(worker.id)}
                    onChange={(event) => toggleWorker(worker, event.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800 dark:text-foreground">
                      {worker.name ?? "未命名工人"}
                    </span>
                    <span className="block truncate text-slate-500 dark:text-muted-foreground">
                      {[teamNameForWorker(worker, teams), worker.id_card, worker.phone].filter(Boolean).join(" / ")}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="max-w-full overflow-hidden rounded-md border border-slate-200 bg-white dark:border-border dark:bg-background">
          <Table className="w-full table-fixed text-xs">
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[13%]" />
              <col className="w-[9%]" />
              <col className="w-[7%]" />
              <col className="w-[13%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[6%]" />
            </colgroup>
            <TableHeader>
              <TableRow className="bg-[#f8faf9] hover:bg-[#f8faf9] dark:bg-muted/30 dark:hover:bg-muted/30">
                {["姓名", "身份证", "班组", "考勤天数", "工资卡号", "工资银行", "应发(元)", "实发(元)", "未发(元)", "调整原因", "操作"].map((header) => (
                  <TableHead key={header} className="px-1 text-xs text-slate-500 dark:text-muted-foreground">
                    <span className="block truncate" title={header}>
                      {header}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-24 text-center text-sm text-slate-500 dark:text-muted-foreground">
                    先从左侧选择本次发工资的工人
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const rowKey = row.row_key ?? row.worker_id ?? row.id_card;
                  return (
                  <TableRow key={rowKey || row.id_card || row.worker_name}>
                    <TableCell className="px-1 text-xs font-medium">
                      <span className="block truncate" title={row.worker_name || "未命名"}>
                        {row.worker_name || "未命名"}
                      </span>
                    </TableCell>
                    <TableCell className="px-1 text-xs text-slate-500">
                      <span className="block truncate" title={row.id_card}>
                        {row.id_card}
                      </span>
                    </TableCell>
                    <TableCell className="px-1 text-xs text-slate-500">
                      <span className="block truncate" title={row.team_name}>
                        {row.team_name}
                      </span>
                    </TableCell>
                    <TableCell className="px-1">
                      <Input className="h-8 w-full min-w-0 px-2" value={row.attendance_days} onChange={(event) => patchRow(rowKey, { attendance_days: event.target.value })} />
                    </TableCell>
                    <TableCell className="px-1">
                      <Input className="h-8 w-full min-w-0 px-2" value={row.wage_card_number} onChange={(event) => patchRow(rowKey, { wage_card_number: event.target.value })} />
                    </TableCell>
                    <TableCell className="px-1">
                      <Input className="h-8 w-full min-w-0 px-2" value={row.wage_bank} onChange={(event) => patchRow(rowKey, { wage_bank: event.target.value })} />
                    </TableCell>
                    <TableCell className="px-1">
                      <Input className="h-8 w-full min-w-0 px-2" type="number" value={row.payable_amount_yuan} onChange={(event) => patchRow(rowKey, { payable_amount_yuan: event.target.value })} />
                    </TableCell>
                    <TableCell className="px-1">
                      <Input className="h-8 w-full min-w-0 px-2" type="number" value={row.paid_amount_yuan} onChange={(event) => patchRow(rowKey, { paid_amount_yuan: event.target.value })} />
                    </TableCell>
                    <TableCell className="px-1">
                      <Input className="h-8 w-full min-w-0 px-2" type="number" value={row.unpaid_amount_yuan} onChange={(event) => patchRow(rowKey, { unpaid_amount_yuan: event.target.value })} />
                    </TableCell>
                    <TableCell className="px-1">
                      <Input className="h-8 w-full min-w-0 px-2" value={row.adjustment_reason} onChange={(event) => patchRow(rowKey, { adjustment_reason: event.target.value })} />
                    </TableCell>
                    <TableCell className="px-1">
                      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-red-600" onClick={() => onChange(rows.filter((item) => (item.row_key ?? item.worker_id) !== rowKey))}>
                        移除
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}

function FilterGrid({
  children,
  onSearch,
  onReset,
}: {
  children: ReactNode;
  onSearch: () => void;
  onReset: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-border dark:bg-background sm:grid-cols-2 xl:grid-cols-[minmax(240px,2fr)_repeat(3,minmax(140px,1fr))_auto]">
      {children}
      <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1 xl:justify-end">
        <Button size="sm" variant="outline" className="h-8 gap-2 border-slate-200 bg-white dark:border-border dark:bg-background" onClick={onReset}>
          <RotateCcw className="size-4" />
          重置
        </Button>
        <Button size="sm" className="h-8 gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]" onClick={onSearch}>
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
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-8 w-full bg-white dark:bg-input/30">
          <div className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="size-4 shrink-0 text-slate-400" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function selectOptionsFromField(
  fields: ConstructionFormField[],
  key: string,
  allLabel: string
) {
  const field = fields.find((item) => item.key === key);
  return [
    { label: allLabel, value: "all" },
    ...(field?.options ?? []).map((option) => ({
      label: option.label,
      value: option.value,
    })),
  ];
}

function normalizeSelectFilter(value: string) {
  return value && value !== "all" ? value : null;
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

      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 dark:border-border dark:bg-border sm:grid-cols-2">
          {items.map(([label, value, fullValue], index) => (
            <div
              key={label}
              className={cn(
                "bg-white px-3 py-2 dark:bg-card",
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
        <div className="rounded-lg border border-slate-200 bg-[#fbfcfc] p-3 dark:border-border dark:bg-card">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="size-4 text-[#0f6b5d]" />
            项目核对重点
          </div>
          <div className="mt-3 space-y-2 text-sm">
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
    <div className="grid gap-3 xl:grid-cols-[1fr_0.9fr_0.9fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-border dark:bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-normal">今日现场</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">工人进出与异常考勤概览。</p>
          </div>
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            实时更新
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <AttendanceSummary label="已进场" value={project.attendanceToday} max={project.workerCount} />
          <AttendanceSummary label="未打卡" value={missingAttendanceCount} max={project.workerCount} tone="amber" />
          <AttendanceSummary label="待处理" value={exceptionCount} max={Math.max(attendance.length, 1)} tone="red" />
        </div>
        <div className="mt-3 space-y-2">
          {attendance.slice(0, 3).map((record) => (
            <div key={record.id} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-sm dark:border-border">
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

      <div className="rounded-lg border border-slate-200 bg-[#fbfcfc] p-3 dark:border-border dark:bg-card">
        <div className="flex items-center gap-2">
          <FileCheck2 className="size-4 text-[#0f6b5d]" />
          <h3 className="text-base font-semibold tracking-normal">项目资料完整度</h3>
        </div>
        <div className="mt-3 space-y-3">
          <ProgressLine label="基础信息" value={audit.completeness.basicInfo} tone={audit.completeness.basicInfo < 80 ? "amber" : "teal"} />
          <ProgressLine label="单位信息" value={audit.completeness.unitInfo} tone={audit.completeness.unitInfo < 80 ? "amber" : "teal"} />
          <ProgressLine label="班组信息" value={audit.completeness.teamInfo} tone={audit.completeness.teamInfo < 80 ? "amber" : "teal"} />
          <ProgressLine label="实名考勤" value={audit.completeness.realNameAttendance} tone={audit.completeness.realNameAttendance < 80 ? "amber" : "teal"} />
        </div>
        <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
          {audit.recommendation}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-[#fcfdfc] p-3 dark:border-border dark:bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-normal">风险与待办</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">进入详情页后优先看的处理队列。</p>
          </div>
          <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            {audit.pendingRiskCount} 项
          </span>
        </div>
        <div className="mt-3 space-y-2">
          <RiskLine icon={CheckCircle2} label="施工许可证" value={audit.workPermit.value} done={audit.workPermit.done} />
          <RiskLine icon={Building2} label="建设单位信息" value={audit.unitMatch.value} done={audit.unitMatch.done} />
          <RiskLine icon={TimerReset} label="班组考勤时段" value={audit.teamAttendance.value} done={audit.teamAttendance.done} />
          <RiskLine icon={ShieldAlert} label="今日考勤异常" value={audit.attendanceExceptions.value} done={audit.attendanceExceptions.done} />
        </div>
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-border">
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
  pagination,
  editable,
  onEdit,
  onDelete,
}: {
  units: ConstructionUnit[];
  pagination: TablePaginationConfig;
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
      pagination={pagination}
    />
  );
}

function TeamsTab({
  teams,
  pagination,
  editable,
  onEdit,
  onDelete,
}: {
  teams: Team[];
  pagination: TablePaginationConfig;
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
      pagination={pagination}
    />
  );
}

function WorkersTab({
  projectId,
  units,
  teams,
  workers,
  treeWorkers,
  selection,
  onSelectionChange,
  pagination,
  onRetireWorker,
  editable,
  onEdit,
  onDelete,
}: {
  projectId: string;
  units: ConstructionUnit[];
  teams: Team[];
  workers: Worker[];
  treeWorkers: Worker[];
  selection: WorkerTreeSelection;
  onSelectionChange: (selection: WorkerTreeSelection) => void;
  pagination: TablePaginationConfig;
  onRetireWorker: (args: { workerId: string; payload: ConstructionWorkerPayload }) => Promise<unknown>;
  editable: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const workerTree = buildWorkerTree(units, teams, treeWorkers);
  const selectedKey = getWorkerTreeSelectionKey(selection);
  const activeUnit = selection.kind === "all" ? undefined : workerTree.find((unit) => unit.name === selection.unitName);
  const activeTeam =
    selection.kind === "team" ? activeUnit?.teams.find((team) => team.name === selection.teamName) : undefined;
  const scopedWorkers = workers;
  const [downloadingWorkerId, setDownloadingWorkerId] = useState<string | null>(null);
  const scopedTeams =
    selection.kind === "team"
      ? activeTeam
        ? [activeTeam.name]
        : []
      : Array.from(
          new Set(
            treeWorkers
              .filter((worker) => selection.kind === "all" || worker.unit === selection.unitName)
              .map((worker) => worker.team)
              .filter(Boolean)
          )
        );
  const scopedTeamCount = selection.kind === "team" ? (activeTeam ? 1 : 0) : scopedTeams.length;
  const totalTeamCount = workerTree.reduce((count, unit) => count + unit.teamCount, 0);
  const scopeName =
    selection.kind === "all"
      ? "全部单位"
      : selection.kind === "team"
        ? `${selection.unitName} / ${selection.teamName}`
        : selection.unitName;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-slate-200 bg-[#fbfcfc] p-3 dark:border-border dark:bg-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">单位班组</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">按组织树查看工人</p>
          </div>
          <Users className="size-4 text-[#0f6b5d] dark:text-primary" />
        </div>
        <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => onSelectionChange({ kind: "all" })}
            aria-pressed={selection.kind === "all"}
            className={cn(
              "w-full rounded-md border px-3 py-2 text-left transition-colors",
              selection.kind === "all"
                ? "border-[#0f6b5d] bg-emerald-50 text-[#0f6b5d] dark:border-primary dark:bg-emerald-950/40 dark:text-primary"
                : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-border dark:bg-background dark:text-foreground dark:hover:bg-accent"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">全部单位</div>
                <div className="mt-1 truncate text-xs text-slate-500 dark:text-muted-foreground">
                  {workerTree.length} 家单位 · {totalTeamCount} 个班组
                </div>
              </div>
              <span className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm dark:bg-card dark:text-muted-foreground">
                {workers.length} 人
              </span>
            </div>
          </button>

          {workerTree.map((unit) => {
            const unitKey = `unit:${unit.name}`;
            const unitActive = selectedKey === unitKey || (selection.kind === "team" && selection.unitName === unit.name);

            return (
              <div key={unit.name} className="space-y-1">
                <button
                  type="button"
                  onClick={() => onSelectionChange({ kind: "unit", unitName: unit.name })}
                  aria-pressed={unitActive}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left transition-colors",
                    unitActive
                      ? "border-[#0f6b5d] bg-emerald-50 text-[#0f6b5d] dark:border-primary dark:bg-emerald-950/40 dark:text-primary"
                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-border dark:bg-background dark:text-foreground dark:hover:bg-accent"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <ChevronRight
                        className={cn("mt-0.5 size-3.5 shrink-0 text-slate-400 transition-transform", unitActive && "rotate-90 text-[#0f6b5d]")}
                      />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Building2 className="size-3.5 shrink-0" />
                          <span className="truncate text-sm font-medium">{unit.name}</span>
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500 dark:text-muted-foreground">{unit.type}</div>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm dark:bg-card dark:text-muted-foreground">
                      {unit.workerCount} 人
                    </span>
                  </div>
                </button>

                <div className="ml-4 space-y-1 border-l border-slate-200 pl-2 dark:border-border">
                  {unit.teams.length === 0 ? (
                    <div className="rounded-md px-3 py-2 text-xs text-slate-400 dark:text-muted-foreground">暂无班组</div>
                  ) : (
                    unit.teams.map((team) => {
                      const teamKey = `team:${unit.name}:${team.name}`;
                      const teamActive = selectedKey === teamKey;

                      return (
                        <button
                          key={teamKey}
                          type="button"
                          onClick={() => onSelectionChange({ kind: "team", unitName: unit.name, teamName: team.name })}
                          aria-pressed={teamActive}
                          className={cn(
                            "w-full rounded-md px-3 py-2 text-left transition-colors",
                            teamActive
                              ? "bg-[#0f6b5d] text-white shadow-sm"
                              : "text-slate-600 hover:bg-emerald-50 hover:text-[#0f6b5d] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <Layers3 className="size-3.5 shrink-0" />
                                <span className="truncate text-sm font-medium">{team.name}</span>
                              </div>
                              <div className={cn("mt-1 truncate text-xs", teamActive ? "text-emerald-50/90" : "text-slate-400 dark:text-muted-foreground")}>
                                {team.type}
                              </div>
                            </div>
                            <span
                              className={cn(
                                "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                                teamActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500 dark:bg-muted dark:text-muted-foreground"
                              )}
                            >
                              {team.workerCount}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
          {workerTree.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500 dark:border-border dark:bg-background dark:text-muted-foreground">
              暂无单位和班组
            </div>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-border dark:bg-card">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">工人数据</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">
              当前范围：{scopeName}，{scopedTeamCount} 个班组，{pagination.total} 名工人
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
            ...(editable ? [<RowActions key={`${worker.id}-actions`} onEdit={() => onEdit(worker.id)} onDelete={() => onDelete(worker.id)} extraActions={[
              ...(worker.status === "离场" ? [] : [{ label: "退场", icon: LogOut, onSelect: () => void retireWorker(worker, onRetireWorker) }]),
              { label: "下载合同模板", icon: FileDown, disabled: downloadingWorkerId === worker.id, onSelect: () => void downloadWorkerContract(projectId, worker, setDownloadingWorkerId) },
            ]} />] : []),
          ])}
          pagination={pagination}
        />
      </div>
    </div>
  );
}

function getWorkerTreeSelectionKey(selection: WorkerTreeSelection) {
  if (selection.kind === "all") return "all";
  if (selection.kind === "unit") return `unit:${selection.unitName}`;
  return `team:${selection.unitName}:${selection.teamName}`;
}

function buildWorkerTree(units: ConstructionUnit[], teams: Team[], workers: Worker[]): WorkerTreeUnitNode[] {
  const unitNames = Array.from(
    new Set([...units.map((unit) => unit.name), ...teams.map((team) => team.unitName), ...workers.map((worker) => worker.unit)])
  ).filter(Boolean);

  return unitNames
    .map((unitName) => {
      const unit = units.find((item) => item.name === unitName);
      const unitTeams = teams.filter((team) => team.unitName === unitName);
      const unitWorkers = workers.filter((worker) => worker.unit === unitName);
      const teamNames = Array.from(new Set([...unitTeams.map((team) => team.name), ...unitWorkers.map((worker) => worker.team)])).filter(Boolean);
      const teamNodes = teamNames
        .map((teamName) => {
          const team = unitTeams.find((item) => item.name === teamName) ?? teams.find((item) => item.name === teamName);

          return {
            name: teamName,
            type: team?.type ?? "未配置工种",
            workerCount: unitWorkers.filter((worker) => worker.team === teamName).length,
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));

      return {
        name: unitName,
        type: unit?.type ?? "未匹配单位",
        workerCount: unitWorkers.length,
        teamCount: teamNodes.length,
        teams: teamNodes,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
}

function AttendanceTab({
  records,
  calendarRows,
  viewMode,
  onViewModeChange,
  calendarMonth,
  onCalendarMonthChange,
  pagination,
}: {
  records: AttendanceRecord[];
  calendarRows: AttendanceCalendarRow[];
  viewMode: AttendanceViewMode;
  onViewModeChange: (mode: AttendanceViewMode) => void;
  calendarMonth: string;
  onCalendarMonthChange: (month: string) => void;
  pagination: TablePaginationConfig;
}) {
  const dayCount = getAttendanceMonthDays(calendarMonth);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-[#fbfcfc] px-4 py-3 dark:border-border dark:bg-card">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">考勤记录</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">
            列表查看原始打卡，月历按人员汇总每天最早进场、最迟出场、工时与记工。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === "calendar" ? (
            <Input
              type="month"
              value={calendarMonth}
              onChange={(event) => onCalendarMonthChange(event.target.value)}
              className="h-8 w-[150px] bg-white dark:bg-background"
            />
          ) : null}
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 dark:border-border dark:bg-background">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "list" ? "default" : "ghost"}
              className={cn("h-7 gap-1.5 px-2.5", viewMode === "list" && "bg-[#0f6b5d] text-white hover:bg-[#0b5148]")}
              onClick={() => onViewModeChange("list")}
            >
              <List className="size-3.5" />
              列表
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "calendar" ? "default" : "ghost"}
              className={cn("h-7 gap-1.5 px-2.5", viewMode === "calendar" && "bg-[#0f6b5d] text-white hover:bg-[#0b5148]")}
              onClick={() => onViewModeChange("calendar")}
            >
              <CalendarDays className="size-3.5" />
              月历
            </Button>
          </div>
        </div>
      </div>

      {viewMode === "list" ? (
        <DataTable
          empty="暂无考勤记录"
          headers={["照片", "工人", "班组", "进出", "考勤时间", "设备"]}
          rows={records.map((record) => [
            <AttendancePhoto key={`${record.id}-photo`} src={record.photoUrl} alt={`${record.worker} 考勤照片`} />,
            record.worker,
            record.team,
            record.direction,
            record.time,
            record.device,
          ])}
          pagination={pagination}
        />
      ) : (
        <AttendanceCalendarTable rows={calendarRows} dayCount={dayCount} />
      )}
    </div>
  );
}

function AttendancePhoto({ src, alt }: { src: string | undefined; alt: string }) {
  if (!src) {
    return <span className="text-xs text-slate-400 dark:text-muted-foreground">无照片</span>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-12 w-12 rounded-md border border-slate-200 object-cover dark:border-border"
      loading="lazy"
    />
  );
}

function AttendanceCalendarTable({
  rows,
  dayCount,
}: {
  rows: AttendanceCalendarRow[];
  dayCount: number;
}) {
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);
  const dayColumnWidth = `${78 / Math.max(dayCount, 1)}%`;

  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-slate-200 dark:border-border">
      <Table className="w-full table-fixed text-[11px]">
        <colgroup>
          <col className="w-[6%]" />
          <col className="w-[7%]" />
          <col className="w-[4.5%]" />
          <col className="w-[4.5%]" />
          {days.map((day) => (
            <col key={day} style={{ width: dayColumnWidth }} />
          ))}
        </colgroup>
        <TableHeader className="bg-[#f8faf9] dark:bg-muted/30">
          <TableRow>
            <TableHead className="px-1 text-xs">工人</TableHead>
            <TableHead className="px-1 text-xs">班组</TableHead>
            <TableHead className="px-1 text-center text-[10px]">工时合计</TableHead>
            <TableHead className="px-1 text-center text-[10px]">记工合计</TableHead>
            {days.map((day) => (
              <TableHead key={day} className="px-0.5 text-center text-[10px]">
                {day}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={dayCount + 4} className="h-24 text-center text-sm text-muted-foreground">
                暂无月度考勤
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={`${row.worker}-${row.team}`}>
                <TableCell className="truncate px-1 font-medium" title={row.worker}>
                  {row.worker}
                </TableCell>
                <TableCell className="truncate px-1 text-slate-500 dark:text-muted-foreground" title={row.team}>
                  {row.team}
                </TableCell>
                <TableCell className="px-1 text-center font-medium text-slate-700 dark:text-foreground" title={`${formatCompactNumber(row.monthlyWorkingHours)} 小时`}>
                  {formatCompactNumber(row.monthlyWorkingHours)}
                </TableCell>
                <TableCell className="px-1 text-center font-medium text-slate-700 dark:text-foreground" title={`${formatCompactNumber(row.monthlyWorkPoint)} 工`}>
                  {formatCompactNumber(row.monthlyWorkPoint)}
                </TableCell>
                {days.map((day) => {
                  const cell = row.days[day];
                  return (
                    <TableCell key={day} className="px-0.5 align-top">
                      {cell ? (
                        <div className="space-y-0.5 text-center text-[10px] leading-3">
                          {cell.records.slice(0, 2).map((record) => (
                            <div
                              key={record.id}
                              className={cn(
                                "truncate rounded px-0.5",
                                record.direction === "进场"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                              )}
                            >
                              {record.time}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center text-xs text-slate-300">--</div>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function WageStatisticsTab({
  data,
  isLoading,
  isError,
  onEdit,
  onDelete,
  onImportFile,
  onPageChange,
}: {
  data: ConstructionWageListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onImportFile: (file: File) => void;
  onPageChange: (page: number) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const items = data?.items ?? [];
  const summary = data?.summary ?? {
    employee_count: 0,
    payable_amount_cents: 0,
    paid_amount_cents: 0,
    unpaid_amount_cents: 0,
  };

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        工资统计加载失败，请检查后端服务或登录状态。
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCell label="发放人数" value={`${summary.employee_count ?? 0} 人`} helper="筛选范围内" compact />
        <MetricCell label="累计应发" value={`${formatCentsAsYuan(summary.payable_amount_cents)} 元`} helper="工资合计" compact />
        <MetricCell label="累计实发" value={`${formatCentsAsYuan(summary.paid_amount_cents)} 元`} helper="已发放" accent="teal" compact />
        <MetricCell label="累计未发" value={`${formatCentsAsYuan(summary.unpaid_amount_cents)} 元`} helper="待发放" accent="amber" compact />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-[#fbfcfc] px-4 py-3 dark:border-border dark:bg-card">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">工资单列表</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">
            按发放月份汇总企业工资单与发放金额。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onImportFile(file);
              event.currentTarget.value = "";
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2 border-slate-200 bg-white dark:border-border dark:bg-background"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" />
            导入工资表
          </Button>
        </div>
      </div>

      <DataTable
        tableClassName="min-w-0 w-full table-fixed"
        cellClassNames={[
          "w-[7%]",
          "w-[12%]",
          "w-[6%]",
          "w-[9%]",
          "w-[9%]",
          "w-[9%]",
          "w-[9%]",
          "w-[9%]",
          "w-[9%]",
          "w-[9%]",
          "w-[5%]",
          "w-[7%]",
        ]}
        empty={isLoading ? "工资统计加载中" : "暂无工资单"}
        headers={[
          "发放月份",
          "企业名称",
          "发放人数",
          "应发金额(元)",
          "实发金额(元)",
          "未发金额(元)",
          "修改时间",
          "最后修改人",
          "创建人",
          "创建日期",
          "状态",
          "操作",
        ]}
        rows={items.map((item) => [
          formatPayrollMonth(item.payroll_month),
          item.company_name ?? "未填写",
          `${item.employee_count ?? 0} 人`,
          formatCentsAsYuan(item.payable_amount_cents),
          formatCentsAsYuan(item.paid_amount_cents),
          formatCentsAsYuan(item.unpaid_amount_cents),
          formatDateTime(item.updated_at),
          item.updated_by_name ?? "系统",
          item.created_by_name ?? "系统",
          formatDateTime(item.created_at),
          <ProjectStatusBadge key={`${item.id}-status`} value={getWageStatusLabel(item.status)} />,
          <RowActions key={`${item.id}-actions`} onEdit={() => onEdit(item.id)} onDelete={() => onDelete(item.id)} />,
        ])}
        pagination={
          data
            ? {
                page: data.page,
                pageSize: data.page_size,
                total: data.total,
                onPageChange,
              }
            : undefined
        }
      />
    </div>
  );
}

function RowActions({
  onEdit,
  onDelete,
  extraActions = [],
}: {
  onEdit: () => void;
  onDelete: () => void;
  extraActions?: Array<{
    label: string;
    icon: LucideIcon;
    disabled?: boolean;
    onSelect: () => void;
  }>;
}) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="mr-2 size-4" />
            编辑
          </DropdownMenuItem>
          {extraActions.map((action) => (
            <DropdownMenuItem key={action.label} disabled={action.disabled} onSelect={action.onSelect}>
              <action.icon className="mr-2 size-4" />
              {action.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-red-600 focus:text-red-700">
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

async function downloadWorkerContract(
  projectId: string,
  worker: Worker,
  setDownloadingWorkerId: Dispatch<SetStateAction<string | null>>
) {
  setDownloadingWorkerId(worker.id);
  try {
    const blob = await constructionProjectService.downloadWorkerContract(projectId, worker.id);
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${safeFilename(worker.name || "工人")}-合同模板.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    toast.success("合同模板已下载");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "下载合同模板失败");
  } finally {
    setDownloadingWorkerId(null);
  }
}

async function retireWorker(
  worker: Worker,
  updateWorker: (args: { workerId: string; payload: ConstructionWorkerPayload }) => Promise<unknown>
) {
  const today = dateInputToday();
  const selected = window.prompt("请选择退场日期，留空默认今天", today);
  if (selected === null) return;

  const exitDate = selected.trim() || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exitDate)) {
    toast.error("退场日期格式应为 YYYY-MM-DD");
    return;
  }

  try {
    await updateWorker({
      workerId: worker.id,
      payload: {
        work_status: 2,
        exit_time: exitDate,
      },
    });
    toast.success("工人已退场");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "退场失败");
  }
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
  units: ApiConstructionUnit[] | undefined;
  teams: ConstructionTeam[] | undefined;
  workers: ConstructionWorker[] | undefined;
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
      label: [worker.name ?? worker.id, worker.phone, worker.id_card].filter(Boolean).join(" / "),
      value: worker.id,
    })),
  };

  return (
    <ConstructionRecordForm
      fields={fields}
      state={state}
      onChange={(key, value) => {
        if (activeTab === "班组信息" && key === "leader_id") {
          setState((current) => ({
            ...current,
            ...buildTeamLeaderPatch(workers, value),
          }));
          return;
        }
        setState((current) => ({ ...current, [key]: value }));
      }}
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
  if (activeTab === "工资统计") return "wage";
  return "project";
}

function getExportButtonLabel(activeTab: DetailTab) {
  if (activeTab === "项目基本信息") return "导出档案";
  if (activeTab === "工资统计") return "导出工资";
  return "导出数据";
}

function getCreateButtonLabel(activeTab: DetailTab) {
  if (activeTab === "项目基本信息") return "编辑项目";
  if (activeTab === "工资统计") return "新增工资单";
  return `新增${activeTab.replace("信息", "").replace("记录", "")}`;
}

function buildWagePayloadFromForm(state: DetailFormState, rows: EditableWageRow[] = []): ConstructionWageBatchPayload {
  const summary = summarizeWageRows(rows);
  const hasRows = rows.length > 0;
  const payableAmount = hasRows ? summary.payable_amount_cents : parseYuanToCents(state.payable_amount_yuan);
  const paidAmount = hasRows ? summary.paid_amount_cents : parseYuanToCents(state.paid_amount_yuan);
  const unpaidAmount = hasRows
    ? summary.unpaid_amount_cents
    : state.unpaid_amount_yuan
      ? parseYuanToCents(state.unpaid_amount_yuan)
      : Math.max(payableAmount - paidAmount, 0);

  return {
    payroll_month: state.payroll_month,
    company_name: state.company_name,
    employee_count: hasRows ? summary.employee_count : Number(state.employee_count || 0),
    payable_amount_cents: payableAmount,
    paid_amount_cents: paidAmount,
    unpaid_amount_cents: unpaidAmount,
    status: (state.status || "draft") as ConstructionWageBatchPayload["status"],
    remark: state.remark,
    rows: buildWageItemPayloads(rows),
  };
}

function formStateForWageRecord(record: ConstructionWageBatch): DetailFormState {
  return {
    payroll_month: formatPayrollMonth(record.payroll_month),
    company_name: record.company_name ?? "",
    employee_count: String(record.employee_count ?? 0),
    payable_amount_yuan: formatCentsAsYuan(record.payable_amount_cents),
    paid_amount_yuan: formatCentsAsYuan(record.paid_amount_cents),
    unpaid_amount_yuan: formatCentsAsYuan(record.unpaid_amount_cents),
    status: record.status ?? "draft",
    remark: record.remark ?? "",
  };
}

function wageRowFromWorker(worker: ConstructionWorker, teams: ConstructionTeam[]): EditableWageRow {
  return {
    row_key: worker.id,
    worker_id: worker.id,
    worker_name: worker.name ?? "",
    id_card: worker.id_card ?? "",
    team_name: teamNameForWorker(worker, teams),
    attendance_days: "",
    monthly_settlement: "",
    daily_settlement: "",
    wage_card_number: worker.salary_bank_card ?? "",
    wage_bank: worker.salary_bank ?? "",
    payable_amount_yuan: "",
    paid_amount_yuan: "",
    adjustment_amount_yuan: "0",
    unpaid_amount_yuan: "",
    adjustment_reason: "",
  };
}

function wageRowsFromRecord(items: ConstructionWageItem[]): EditableWageRow[] {
  return items.map((item) => ({
    row_key: item.id,
    worker_id: item.worker_id ?? "",
    worker_name: item.worker_name ?? "",
    id_card: item.id_card ?? "",
    team_name: item.team_name ?? "",
    attendance_days: item.attendance_days ?? "",
    monthly_settlement: item.monthly_settlement ?? "",
    daily_settlement: item.daily_settlement ?? "",
    wage_card_number: item.wage_card_number ?? "",
    wage_bank: item.wage_bank ?? "",
    payable_amount_yuan: formatCentsAsYuan(item.payable_amount_cents),
    paid_amount_yuan: formatCentsAsYuan(item.paid_amount_cents),
    adjustment_amount_yuan: formatCentsAsYuan(item.adjustment_amount_cents),
    unpaid_amount_yuan: formatCentsAsYuan(item.unpaid_amount_cents),
    adjustment_reason: item.adjustment_reason ?? "",
  }));
}

function teamNameForWorker(worker: ConstructionWorker, teams: ConstructionTeam[]) {
  return teams.find((team) => team.id === worker.team_id)?.name ?? "";
}

function exportUnitsCsv(projectName: string, units: ConstructionUnit[]) {
  downloadCsv(
    `${safeFilename(projectName)}-建设单位.csv`,
    buildExcelCsv({
      headers: ["单位名称", "单位类型", "统一社会信用代码", "负责人", "负责人电话", "计薪方式", "人数"],
      rows: units.map((unit) => [
        unit.name,
        unit.type,
        { value: unit.creditCode, text: true },
        unit.manager,
        { value: unit.phone, text: true },
        unit.salaryType,
        unit.workers,
      ]),
    })
  );
  toast.success("建设单位数据已导出");
}

function exportTeamsCsv(projectName: string, teams: Team[]) {
  downloadCsv(
    `${safeFilename(projectName)}-班组信息.csv`,
    buildExcelCsv({
      headers: ["班组名称", "参建单位", "工种", "班组长", "班组长电话", "人数", "计薪方式", "考勤开始", "考勤结束", "状态"],
      rows: teams.map((team) => [
        team.name,
        team.unitName,
        team.type,
        team.leader,
        { value: team.phone, text: true },
        team.workerCount,
        team.salaryType,
        team.attendanceStart,
        team.attendanceEnd,
        team.status,
      ]),
    })
  );
  toast.success("班组信息已导出");
}

function exportWorkersCsv(projectName: string, workers: Worker[]) {
  downloadCsv(
    `${safeFilename(projectName)}-项目工人.csv`,
    buildExcelCsv({
      headers: ["姓名", "性别", "身份证", "手机号", "班组", "参建单位", "工种", "状态", "进场日期"],
      rows: workers.map((worker) => [
        worker.name,
        worker.gender,
        { value: worker.idCard, text: true },
        { value: worker.phone, text: true },
        worker.team,
        worker.unit,
        worker.workType,
        worker.status,
        worker.entryDate,
      ]),
    })
  );
  toast.success("项目工人数据已导出");
}

function exportAttendanceCsv(projectName: string, records: AttendanceRecord[]) {
  downloadCsv(
    `${safeFilename(projectName)}-考勤记录.csv`,
    buildExcelCsv({
      headers: ["工人", "班组", "进出方向", "考勤时间", "设备", "状态"],
      rows: records.map((record) => [
        record.worker,
        record.team,
        record.direction,
        record.time,
        record.device,
        record.status,
      ]),
    })
  );
  toast.success("考勤记录已导出");
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string) {
  return (value || "项目").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function currentPayrollMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatPayrollMonth(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 7);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  return value.replace("T", " ").slice(0, 16);
}

function getWageStatusLabel(status: string): Parameters<typeof ProjectStatusBadge>[0]["value"] {
  const labels: Record<string, Parameters<typeof ProjectStatusBadge>[0]["value"]> = {
    draft: "草稿",
    imported: "导入",
    confirmed: "已确认",
    paid: "已发放",
  };

  return labels[status] ?? "草稿";
}

function DataTable({
  headers,
  rows,
  empty,
  pagination,
  tableClassName,
  cellClassNames,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
  pagination?: TablePaginationConfig;
  tableClassName?: string;
  cellClassNames?: string[];
}) {
  const [localPage, setLocalPage] = useState(1);
  const total = pagination?.total ?? rows.length;
  const pageSize = pagination?.pageSize ?? DEFAULT_PROJECT_TABLE_PAGE_SIZE;
  const currentPage = pagination
    ? getControlledTablePage(pagination.page, total, pageSize)
    : Math.min(Math.max(localPage, 1), getTotalPages(total, pageSize));
  const visibleRows = pagination ? rows : getPageItems(rows, currentPage, pageSize);
  const shouldPaginate = total > pageSize;
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  useEffect(() => {
    const nextPage = pagination
      ? getControlledTablePage(pagination.page, total, pageSize)
      : Math.min(Math.max(localPage, 1), getTotalPages(total, pageSize));
    if (pagination) {
      if (total > 0 && nextPage !== pagination.page) pagination.onPageChange(nextPage);
      return;
    }
    if (nextPage !== localPage) setLocalPage(nextPage);
  }, [localPage, pageSize, pagination, total]);

  const changePage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), getTotalPages(total, pageSize));
    if (pagination) {
      pagination.onPageChange(nextPage);
      return;
    }
    setLocalPage(nextPage);
  };

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200 dark:border-border">
      <div className="max-w-full overflow-x-hidden">
        <Table className={cn("w-full table-fixed", tableClassName)}>
          <TableHeader>
            <TableRow className="bg-[#f8faf9] hover:bg-[#f8faf9] dark:bg-muted/30 dark:hover:bg-muted/30">
              {headers.map((header, index) => (
                <TableHead key={header} className={cn("px-4 text-slate-500 dark:text-muted-foreground", cellClassNames?.[index])}>
                  <span className="block truncate" title={header}>
                    {header}
                  </span>
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
              visibleRows.map((row, rowIndex) => (
                <TableRow key={`${currentPage}-${rowIndex}`} className="hover:bg-[#f8faf9]/70 dark:hover:bg-muted/30">
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} className={cn("whitespace-nowrap px-2", cellClassNames?.[cellIndex])}>
                      <div className="min-w-0 truncate">{cell}</div>
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {shouldPaginate ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-[#f8faf9] px-4 py-3 text-sm text-slate-500 dark:border-border dark:bg-muted/30 dark:text-muted-foreground">
          <span>
            显示 {from}-{to} 条，共 {total} 条
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 border-slate-200 bg-white dark:border-border dark:bg-background"
              disabled={currentPage <= 1}
              onClick={() => changePage(currentPage - 1)}
            >
              <ChevronLeft className="size-4" />
              上一页
            </Button>
            <span className="min-w-12 text-center text-xs font-medium text-slate-600 dark:text-muted-foreground">
              {currentPage} / {getTotalPages(total, pageSize)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 border-slate-200 bg-white dark:border-border dark:bg-background"
              disabled={currentPage >= getTotalPages(total, pageSize)}
              onClick={() => changePage(currentPage + 1)}
            >
              下一页
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
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

function apiUnitToDetail(unit: ApiConstructionUnit, workerCount = 0): ConstructionUnit {
  return {
    id: unit.id,
    projectId: unit.project_id,
    name: unit.company_name ?? "未命名单位",
    type: getFieldOptionLabel(unitFormFields, "company_type", unit.company_type),
    creditCode: unit.company_credit_code ?? "",
    manager: unit.manager_name ?? "未填写",
    phone: unit.manager_phone ?? "",
    workers: workerCount,
    salaryType: getFieldOptionLabel(unitFormFields, "salary_calc_type", unit.salary_calc_type),
  };
}

function apiTeamToDetail(team: ConstructionTeam, units: ApiConstructionUnit[], workerCount = 0): Team {
  const unit = units.find((item) => item.id === team.unit_id);

  return {
    id: team.id,
    projectId: team.project_id,
    unitName: unit?.company_name ?? "未匹配单位",
    name: team.name ?? "未命名班组",
    type: getFieldOptionLabel(teamFormFields, "work_type", team.work_type),
    leader: team.leader_name ?? "未填写",
    phone: team.leader_phone ?? "",
    workerCount,
    salaryType: getFieldOptionLabel(teamFormFields, "settlement_type", team.settlement_type),
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
    workType: getFieldOptionLabel(workerFormFields, "work_type", worker.work_type),
    status: worker.work_status === 2 ? "离场" : "在场",
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
    photoUrl: normalizeAttendancePhoto(record.closeup_photo ?? record.photo_path ?? record.overall_photo),
    status: "有效",
  };
}

function normalizeAttendancePhoto(value: string | null | undefined) {
  const source = value?.trim();
  if (!source) return undefined;
  if (source.startsWith("data:image") || source.startsWith("http://") || source.startsWith("https://")) {
    return source;
  }
  if (source.startsWith("/9j") || source.startsWith("iVBOR") || source.startsWith("R0lGOD")) {
    return `data:image/jpeg;base64,${source}`;
  }
  if (source.startsWith("/")) return source;
  return `data:image/jpeg;base64,${source}`;
}

function defaultFormForTab(
  activeTab: DetailTab,
  units: ApiConstructionUnit[],
  teams: ConstructionTeam[],
  workers: ConstructionWorker[],
  workerSelection: WorkerTreeSelection
): DetailFormState {
  if (activeTab === "工资统计") {
    return {
      ...buildDefaultFormState(wageFormFields),
      payroll_month: currentPayrollMonth(),
      status: "draft",
    };
  }

  const workerScopeDefaults = resolveWorkerFormScopeDefaults(units, teams, workerSelection);

  return buildDefaultFormState(formFieldsForTab(activeTab), {
    unit_id: activeTab === "项目工人" ? workerScopeDefaults.unit_id : units[0]?.id ?? "",
    team_id: activeTab === "项目工人" ? workerScopeDefaults.team_id : teams[0]?.id ?? "",
    work_type: activeTab === "项目工人" ? workerScopeDefaults.work_type : "",
    entry_time: activeTab === "项目工人" ? dateInputToday() : "",
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
  if (activeTab === "工资统计") return wageFormFields;
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
