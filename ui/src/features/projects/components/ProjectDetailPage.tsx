import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Eye,
  FileDown,
  Layers3,
  List,
  LogIn,
  LogOut,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Upload,
  Users,
  WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { updateAdminWindowTitle } from "@/components/layout/admin-window-storage";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import { getApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/stores/use-auth-store";
import {
  attendanceFormFields,
  buildDefaultFormState,
  buildFormStateFromRecord,
  buildPayloadFromForm,
  dateInputToday,
  datetimeLocalNow,
  getFieldOptionLabel,
  projectFormFields,
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
  constructionProjectKeys,
  useCreateAttendanceMutation,
  useCreateAttendanceDeviceIssueReportMutation,
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
  useAttendanceDeviceIssueReportsQuery,
  useProjectAllTeamsQuery,
  useProjectAllUnitsQuery,
  useProjectAllWorkersQuery,
  useProjectAttendanceCalendarQuery,
  useProjectAttendanceDevicesQuery,
  useProjectAttendanceQuery,
  useProjectQuery,
  usePreviewYongxinAttendanceRepairMutation,
  useRepairUnitReportingMutation,
  useRepairTeamReportingMutation,
  useRepairYongxinAttendanceMutation,
  useRepairWorkerReportingMutation,
  useProjectTeamsQuery,
  useProjectUnitsQuery,
  useProjectWageBatchesQuery,
  useProjectWorkersQuery,
  useUpdateAttendanceMutation,
  useUpdateProjectMutation,
  useUpdateTeamMutation,
  useUpdateUnitMutation,
  useUpdateWageBatchMutation,
  useUpdateWorkerMutation,
} from "../hooks/use-construction-projects";
import type {
  ConstructionAttendancePayload,
  ConstructionAttendanceRecord,
  ConstructionAttendanceDeviceIssueAction,
  ConstructionAttendanceDeviceIssueReport,
  ConstructionAttendanceDeviceIssueStatus,
  ConstructionProject,
  ConstructionProjectPayload,
  ConstructionTeam,
  ConstructionTeamPayload,
  ConstructionTeamReportingSummary,
  ConstructionUnit as ApiConstructionUnit,
  ConstructionUnitPayload,
  ConstructionWageBatch,
  ConstructionWageBatchPayload,
  ConstructionWageItem,
  ConstructionWageListFilters,
  ConstructionWageListResponse,
  ConstructionWorker,
  ConstructionWorkerPayload,
  YongxinAttendanceRepairPreviewResult,
} from "../types/construction-types";
import {
  buildProjectOverviewAudit,
  type ProjectOverviewAudit,
} from "../lib/project-overview-metrics";
import { DEFAULT_PROJECT_DETAIL_TAB, getProjectInfoCellClassName } from "../lib/project-detail-layout";
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
  PROJECT_PAGE_SIZE_OPTIONS,
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
import { AttendanceGeneratorDialog } from "./AttendanceGeneratorDialog";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { ProjectReportingPlatforms } from "./ProjectReportingPlatforms";
import { AttendanceMachinePanel } from "./AttendanceMachinePanel";

const allTabs = ["项目基本信息", "建设单位", "班组信息", "项目工人", "考勤记录", "考勤机模式", "工资统计"] as const;
type DetailTab = (typeof allTabs)[number];

// 考勤机模式（人脸考勤点）：功能开发中，暂时隐藏项目详情内的配置入口
const SHOW_ATTENDANCE_MACHINE_TAB = false;
const tabs: readonly DetailTab[] = SHOW_ATTENDANCE_MACHINE_TAB
  ? allTabs
  : allTabs.filter((tab) => tab !== "考勤机模式");
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
type AdvancedExportTarget = "workers" | "attendance";
type AdvancedExportScopeFilters = {
  keyword: string;
  unitIds: string[];
  teamIds: string[];
  workerIds: string[];
  workStatus: string;
  workType: string;
};
type AdvancedExportFormatOption = {
  value: string;
  label: string;
  description: string;
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
type FaceIssueSummary = {
  deviceCount: number;
  onlineDeviceCount: number;
  activeWorkerCount: number;
  missingAvatarWorkerCount: number;
  fullyIssuedWorkerCount: number;
  incompleteWorkerCount: number;
  successTargetCount: number;
  totalTargetCount: number;
};
type TablePaginationConfig = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
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
const DEFAULT_ADVANCED_EXPORT_SCOPE: AdvancedExportScopeFilters = {
  keyword: "",
  unitIds: ["all"],
  teamIds: ["all"],
  workerIds: ["all"],
  workStatus: "all",
  workType: "all",
};

const ATTENDANCE_ADVANCED_EXPORT_OPTIONS: AdvancedExportFormatOption[] = [
  { value: "attendance_time", label: "按考勤时间", description: "月历格式显示每日进场/出场时间" },
  { value: "work_record", label: "按记工", description: "按工时折算 0.5/1 个工" },
  { value: "attendance_status", label: "按是否考勤", description: "有考勤显示勾选标记，空白表示无记录" },
  { value: "work_hours", label: "按工时", description: "按每日最早进场和最晚出场估算工时" },
  { value: "attendance_records", label: "逐条考勤记录", description: "每条打卡记录一行，含设备和照片路径" },
];

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
  const queryClient = useQueryClient();
  const authUser = useAuthUser();
  const isSystemAdmin = authUser?.role === "admin";
  const [unitPage, setUnitPage] = useState(1);
  const [teamPage, setTeamPage] = useState(1);
  const [workerPage, setWorkerPage] = useState(1);
  const [attendancePage, setAttendancePage] = useState(1);
  const [unitPageSize, setUnitPageSize] = useState<(typeof PROJECT_PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PROJECT_TABLE_PAGE_SIZE);
  const [teamPageSize, setTeamPageSize] = useState<(typeof PROJECT_PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PROJECT_TABLE_PAGE_SIZE);
  const [workerPageSize, setWorkerPageSize] = useState<(typeof PROJECT_PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PROJECT_TABLE_PAGE_SIZE);
  const [attendancePageSize, setAttendancePageSize] = useState<(typeof PROJECT_PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PROJECT_TABLE_PAGE_SIZE);
  const [attendanceViewMode, setAttendanceViewMode] = useState<AttendanceViewMode>("calendar");
  const [attendanceCalendarMonth, setAttendanceCalendarMonth] = useState(currentPayrollMonth());
  const [attendanceCalendarPage, setAttendanceCalendarPage] = useState(1);
  const [attendanceCalendarPageSize, setAttendanceCalendarPageSize] = useState(20);
  const [workerTreeSelection, setWorkerTreeSelection] = useState<WorkerTreeSelection>({ kind: "all" });
  const [reissuingWorkerId, setReissuingWorkerId] = useState<string | null>(null);
  const [issueDetailWorker, setIssueDetailWorker] = useState<Worker | null>(null);
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
        pageSize: unitPageSize,
        keyword: appliedUnitFilters.keyword,
        companyType: normalizeSelectFilter(appliedUnitFilters.companyType),
        salaryCalcType: normalizeSelectFilter(appliedUnitFilters.salaryCalcType),
      }),
    [appliedUnitFilters.companyType, appliedUnitFilters.keyword, appliedUnitFilters.salaryCalcType, unitPage, unitPageSize]
  );
  const teamListFilters = useMemo(
    () =>
      buildProjectResourceListParams({
        page: teamPage,
        pageSize: teamPageSize,
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
    [appliedTeamFilters.attendanceConfigured, appliedTeamFilters.keyword, appliedTeamFilters.unitId, appliedTeamFilters.workType, teamPage, teamPageSize]
  );
  const workerListFilters = useMemo(
    () =>
      buildProjectResourceListParams({
        page: workerPage,
        pageSize: workerPageSize,
        unitId: workerScopeFilter.unitId,
        teamId: normalizeSelectFilter(appliedWorkerFilters.teamId) || workerScopeFilter.teamId,
        keyword: appliedWorkerFilters.keyword,
        workStatus: normalizeSelectFilter(appliedWorkerFilters.workStatus),
        workType: normalizeSelectFilter(appliedWorkerFilters.workType),
      }),
    [appliedWorkerFilters.keyword, appliedWorkerFilters.teamId, appliedWorkerFilters.workStatus, appliedWorkerFilters.workType, workerPage, workerPageSize, workerScopeFilter.teamId, workerScopeFilter.unitId]
  );
  const attendanceListFilters = useMemo(
    () =>
      buildProjectResourceListParams({
        page: attendancePage,
        pageSize: attendancePageSize,
        keyword: appliedAttendanceFilters.keyword,
        attendanceDate: appliedAttendanceFilters.attendanceDate || null,
        direction: normalizeSelectFilter(appliedAttendanceFilters.direction),
      }),
    [appliedAttendanceFilters.attendanceDate, appliedAttendanceFilters.direction, appliedAttendanceFilters.keyword, attendancePage, attendancePageSize]
  );
  const attendanceCalendarFilters = useMemo(
    () =>
      buildProjectResourceListParams({
        page: 1,
        keyword: appliedAttendanceFilters.keyword,
        attendanceDate: appliedAttendanceFilters.attendanceDate || null,
        direction: normalizeSelectFilter(appliedAttendanceFilters.direction),
      }),
    [appliedAttendanceFilters.attendanceDate, appliedAttendanceFilters.direction, appliedAttendanceFilters.keyword]
  );
  const attendanceDeviceListFilters = useMemo(
    () => buildProjectResourceListParams({ page: 1, pageSize: 100 }),
    []
  );
  const issueDetailFilters = useMemo(
    () => ({
      page: 1,
      page_size: 100,
      project_id: projectId,
      worker_id: issueDetailWorker?.id,
    }),
    [issueDetailWorker?.id, projectId]
  );
  const unitQuery = useProjectUnitsQuery(projectId, unitListFilters);
  const teamQuery = useProjectTeamsQuery(projectId, teamListFilters);
  const workerQuery = useProjectWorkersQuery(projectId, workerListFilters);
  const attendanceQuery = useProjectAttendanceQuery(projectId, attendanceListFilters);
  const attendanceDevicesQuery = useProjectAttendanceDevicesQuery(projectId, attendanceDeviceListFilters);
  const workerIssueReportsQuery = useAttendanceDeviceIssueReportsQuery(
    issueDetailFilters,
    Boolean(issueDetailWorker)
  );
  const attendanceCalendarQuery = useProjectAttendanceCalendarQuery(
    projectId,
    appliedAttendanceFilters.attendanceDate
      ? appliedAttendanceFilters.attendanceDate.slice(0, 7)
      : attendanceCalendarMonth,
    attendanceCalendarPage,
    attendanceCalendarPageSize,
    attendanceCalendarFilters
  );
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
  const repairUnitReporting = useRepairUnitReportingMutation(projectId);
  const createTeam = useCreateTeamMutation(projectId);
  const updateTeam = useUpdateTeamMutation(projectId);
  const deleteTeam = useDeleteTeamMutation(projectId);
  const repairTeamReporting = useRepairTeamReportingMutation(projectId);
  const repairWorkerReporting = useRepairWorkerReportingMutation(projectId);
  const createWorker = useCreateWorkerMutation(projectId);
  const updateWorker = useUpdateWorkerMutation(projectId);
  const deleteWorker = useDeleteWorkerMutation(projectId);
  const createAttendance = useCreateAttendanceMutation(projectId);
  const updateAttendance = useUpdateAttendanceMutation(projectId);
  const deleteAttendance = useDeleteAttendanceMutation(projectId);
  const repairYongxinAttendance = useRepairYongxinAttendanceMutation(projectId);
  const previewYongxinAttendanceRepair = usePreviewYongxinAttendanceRepairMutation(projectId);
  const createAttendanceDeviceIssueReport = useCreateAttendanceDeviceIssueReportMutation();
  const createWageBatch = useCreateWageBatchMutation(projectId);
  const updateWageBatch = useUpdateWageBatchMutation(projectId);
  const deleteWageBatch = useDeleteWageBatchMutation(projectId);
  const importWageBatch = useImportWageBatchMutation(projectId);
  const updateProject = useUpdateProjectMutation(projectId);
  const project = useMemo(
    () => (projectQuery.data ? apiProjectToDetail(projectQuery.data) : null),
    [projectQuery.data]
  );
  const projectName = projectQuery.data?.name?.trim() ?? "";

  useEffect(() => {
    if (!projectName) return;
    updateAdminWindowTitle(`/app/admin/projects/${projectId}`, projectName);
  }, [projectId, projectName]);
  const tableRawUnits = useMemo(() => unitQuery.data?.items ?? [], [unitQuery.data]);
  const tableRawTeams = useMemo(() => teamQuery.data?.items ?? [], [teamQuery.data]);
  const tableRawWorkers = useMemo(() => workerQuery.data?.items ?? [], [workerQuery.data]);
  const tableRawAttendance = useMemo(() => attendanceQuery.data?.items ?? [], [attendanceQuery.data]);
  const attendanceDevices = useMemo(() => attendanceDevicesQuery.data?.items ?? [], [attendanceDevicesQuery.data]);
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
  const baseTableAttendance = useMemo(
    () => tableRawAttendance.map((record) => apiAttendanceToDetail(record, rawWorkers, rawTeams)),
    [rawTeams, rawWorkers, tableRawAttendance]
  );
  const attendanceCalendarRows = useMemo(() => {
    const workerById = new Map(projectWorkers.map((worker) => [worker.id, worker]));
    return buildAttendanceCalendarRowsFromSummary(attendanceCalendarQuery.data?.items ?? []).map((row) => {
      const worker = row.workerId ? workerById.get(row.workerId) : undefined;
      return {
        ...row,
        workType: worker?.workType ?? row.workType,
        workerType: worker?.workerType ?? row.workerType,
        attendanceDays: Object.values(row.days).filter((day) => day.records.length > 0 || day.workingHours > 0 || day.workPoint > 0).length,
      };
    });
  }, [attendanceCalendarQuery.data, projectWorkers]);
  const attendanceSummaryByWorker = useMemo(() => {
    const summaries = new Map<string, Pick<AttendanceRecord, "attendanceDays" | "workingHours" | "workPoint">>();
    for (const row of attendanceCalendarRows) {
      const key = row.workerId ?? `${row.worker}::${row.team}`;
      summaries.set(key, {
        attendanceDays: Object.values(row.days).filter((day) => day.records.length > 0 || day.workingHours > 0 || day.workPoint > 0).length,
        workingHours: row.monthlyWorkingHours,
        workPoint: row.monthlyWorkPoint,
      });
    }
    return summaries;
  }, [attendanceCalendarRows]);
  const tableAttendance = useMemo(
    () =>
      baseTableAttendance.map((record) => ({
        ...record,
        ...(attendanceSummaryByWorker.get(record.workerId ?? `${record.worker}::${record.team}`) ?? {}),
      })),
    [attendanceSummaryByWorker, baseTableAttendance]
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
  const faceIssueSummary = useMemo<FaceIssueSummary>(() => {
    const deviceCount = attendanceDevicesQuery.data?.total ?? attendanceDevices.length;
    const onlineDeviceCount = attendanceDevices.filter((device) => device.online_status === "online").length;
    const activeWorkers = projectWorkers.filter((worker) => worker.status === "在场");
    const totalTargetCount = deviceCount * activeWorkers.length;
    const successTargetCount = activeWorkers.reduce(
      (sum, worker) => sum + Math.min(worker.issuedDeviceSuccessCount ?? 0, deviceCount),
      0
    );
    const fullyIssuedWorkerCount =
      deviceCount > 0
        ? activeWorkers.filter((worker) => Boolean(worker.avatar) && (worker.issuedDeviceSuccessCount ?? 0) >= deviceCount).length
        : 0;

    return {
      deviceCount,
      onlineDeviceCount,
      activeWorkerCount: activeWorkers.length,
      missingAvatarWorkerCount: activeWorkers.filter((worker) => !worker.avatar).length,
      fullyIssuedWorkerCount,
      incompleteWorkerCount:
        deviceCount > 0
          ? activeWorkers.filter((worker) => !worker.avatar || (worker.issuedDeviceSuccessCount ?? 0) < deviceCount).length
          : 0,
      successTargetCount,
      totalTargetCount,
    };
  }, [attendanceDevices, attendanceDevicesQuery.data?.total, projectWorkers]);
  const [activeTab, setActiveTab] = useState<DetailTab>(DEFAULT_PROJECT_DETAIL_TAB);
  const [dialogMode, setDialogMode] = useState<DetailDialogMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<DetailFormState>({});
  const [formOpen, setFormOpen] = useState(false);
  const [projectFormState, setProjectFormState] = useState<DetailFormState>({});
  // 打开编辑弹窗时的初始快照，提交只包含变更字段，防止未回显/未填写字段被覆盖清空
  const [projectFormInitial, setProjectFormInitial] = useState<DetailFormState | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [advancedExportOpen, setAdvancedExportOpen] = useState(false);
  const [attendanceGeneratorOpen, setAttendanceGeneratorOpen] = useState(false);
  const [yongxinRepairOpen, setYongxinRepairOpen] = useState(false);
  const [yongxinRepairStartDate, setYongxinRepairStartDate] = useState(dateInputToday());
  const [yongxinRepairEndDate, setYongxinRepairEndDate] = useState(dateInputToday());
  const [yongxinRepairTeamId, setYongxinRepairTeamId] = useState("all");
  const [yongxinRepairWorkerKeyword, setYongxinRepairWorkerKeyword] = useState("");
  const [yongxinRepairWorkerIds, setYongxinRepairWorkerIds] = useState<string[]>([]);
  const [yongxinRepairPreview, setYongxinRepairPreview] = useState<YongxinAttendanceRepairPreviewResult | null>(null);
  const yongxinRepairWorkers = useMemo(() => {
    const keyword = yongxinRepairWorkerKeyword.trim().toLowerCase();
    return rawWorkers.filter((worker) => {
      if (yongxinRepairTeamId !== "all" && worker.team_id !== yongxinRepairTeamId) return false;
      if (!keyword) return true;
      return `${worker.name ?? ""} ${worker.id_card ?? ""}`.toLowerCase().includes(keyword);
    });
  }, [rawWorkers, yongxinRepairTeamId, yongxinRepairWorkerKeyword]);
  const [advancedExportTarget, setAdvancedExportTarget] = useState<AdvancedExportTarget>("workers");
  const [advancedExportFormats, setAdvancedExportFormats] = useState<string[]>([]);
  const [advancedExportScope, setAdvancedExportScope] = useState<AdvancedExportScopeFilters>(
    DEFAULT_ADVANCED_EXPORT_SCOPE
  );
  const [advancedExportMonth, setAdvancedExportMonth] = useState(attendanceCalendarMonth);
  const [advancedExportAttendanceFilter, setAdvancedExportAttendanceFilter] = useState("all");
  const [advancedExportSortBy, setAdvancedExportSortBy] = useState("attendance_days_desc");
  const [advancedExporting, setAdvancedExporting] = useState(false);
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

  useEffect(() => {
    if (activeTab === "考勤记录") setAttendanceViewMode("calendar");
  }, [activeTab]);

  const handleWorkerTreeSelectionChange = (selection: WorkerTreeSelection) => {
    setWorkerTreeSelection(selection);
    setWorkerPage(1);
  };

  const applyModuleFilters = () => {
    if (activeTab === "建设单位") {
      setAppliedUnitFilters(unitFilters);
      setUnitPage(1);
      void queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.unitsRoot(projectId),
      });
    }
    if (activeTab === "班组信息") {
      setAppliedTeamFilters(teamFilters);
      setTeamPage(1);
      void queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.teamsRoot(projectId),
      });
    }
    if (activeTab === "项目工人") {
      setAppliedWorkerFilters(workerFilters);
      setWorkerPage(1);
      void queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.workersRoot(projectId),
      });
    }
    if (activeTab === "考勤记录") {
      setAppliedAttendanceFilters(attendanceFilters);
      if (attendanceFilters.attendanceDate) {
        setAttendanceCalendarMonth(attendanceFilters.attendanceDate.slice(0, 7));
      }
      setAttendancePage(1);
      void queryClient.invalidateQueries({
        queryKey: constructionProjectKeys.attendanceRoot(projectId),
      });
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
      setAttendanceCalendarMonth(currentPayrollMonth());
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

  const openProjectEditDialog = () => {
    if (!projectQuery.data) {
      toast.info("项目数据尚未加载，暂不能编辑。");
      return;
    }
    const initial = buildFormStateFromRecord(
      projectFormFields,
      projectQuery.data as unknown as Record<string, unknown>
    );
    setProjectFormState(initial);
    setProjectFormInitial(initial);
    setProjectFormOpen(true);
  };

  const handleSubmitProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectFormState.name?.trim()) {
      toast.error("请填写项目名称");
      return;
    }

    try {
      const payload = buildPayloadFromForm(
        projectFormFields,
        projectFormState,
        { initialState: projectFormInitial ?? undefined }
      ) as ConstructionProjectPayload;
      if (Object.keys(payload).length === 0) {
        toast.info("没有需要保存的修改");
        return;
      }
      await updateProject.mutateAsync(payload);
      setProjectFormOpen(false);
      toast.success("项目已修改");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "项目修改失败");
    }
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

    const deleteMessages: Record<string, string> = {
      建设单位: "确认删除这条参建单位记录？删除后将不再显示。",
      班组信息: "确认删除这个班组？如已上报市平台，将同步办理班组退场；平台退场失败时本地班组不会删除。",
      项目工人: "确认删除这名工人？如已上报市平台，将先同步办理人员退场；平台退场失败时本地人员不会删除。",
      考勤记录: "确认删除这条考勤记录？删除后无法在列表中恢复。",
      工资统计: "确认删除这条工资记录？删除后无法在列表中恢复。",
    };
    const deleteMessage = deleteMessages[activeTab];
    if (!deleteMessage || !window.confirm(deleteMessage)) return;

    try {
      if (activeTab === "建设单位") await deleteUnit.mutateAsync(id);
      if (activeTab === "班组信息") await deleteTeam.mutateAsync(id);
      if (activeTab === "项目工人") await deleteWorker.mutateAsync(id);
      if (activeTab === "考勤记录") await deleteAttendance.mutateAsync(id);
      if (activeTab === "工资统计") await deleteWageBatch.mutateAsync(id);
      toast.success("记录已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const handleRepairTeamReporting = async () => {
    if (!window.confirm("确认修正失败和未传的班组上报？普通班组和管理班组都会重新调用已启用的市住建接口。")) {
      return;
    }

    try {
      const result = await repairTeamReporting.mutateAsync();
      const totals = result.reporting_summary.reduce(
        (current, item) => ({
          success: current.success + item.success_count,
          failure: current.failure + item.failure_count,
          notReported: current.notReported + item.not_reported_count,
        }),
        { success: 0, failure: 0, notReported: 0 }
      );
      if (result.attempted_count === 0) {
        toast.info("当前没有需要修正的班组上报");
      } else if (totals.failure > 0 || totals.notReported > 0) {
        toast.warning(`已修正 ${result.attempted_count} 个班组，成功 ${totals.success}，仍失败 ${totals.failure}，未传 ${totals.notReported}`);
      } else {
        toast.success(`已修正 ${result.attempted_count} 个班组，当前成功 ${totals.success}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修正班组上报失败");
    }
  };

  const handleRepairUnitReporting = async () => {
    if (!window.confirm("确认修正失败和未传的参建单位上报？系统将重新调用已启用的甬薪或薪乐达单位接口。")) {
      return;
    }

    try {
      const result = await repairUnitReporting.mutateAsync();
      const totals = result.reporting_summary.reduce(
        (current, item) => ({
          success: current.success + item.success_count,
          failure: current.failure + item.failure_count,
          notReported: current.notReported + item.not_reported_count,
        }),
        { success: 0, failure: 0, notReported: 0 }
      );
      if (result.attempted_count === 0) {
        toast.info("当前没有可安全重试的参建单位上报");
      } else if (totals.failure > 0 || totals.notReported > 0) {
        toast.warning(`已提交 ${result.attempted_count} 家单位修正，后台处理中；当前成功 ${totals.success}，失败 ${totals.failure}，未传 ${totals.notReported}`);
      } else {
        toast.success(`已提交 ${result.attempted_count} 家单位修正，当前成功 ${totals.success}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修正参建单位上报失败");
    }
  };

  const handleRepairWorkerReporting = async () => {
    if (!window.confirm("确认修正失败和未传的工人上报？系统将分别重新调用已启用的市住建、甬薪或薪乐达接口，已成功的平台不会重复发送。")) {
      return;
    }

    try {
      const result = await repairWorkerReporting.mutateAsync();
      const totals = result.reporting_summary.reduce(
        (current, item) => ({
          success: current.success + item.success_count,
          failure: current.failure + item.failure_count,
          notReported: current.notReported + item.not_reported_count,
        }),
        { success: 0, failure: 0, notReported: 0 }
      );
      if (result.attempted_count === 0) {
        toast.info("当前没有需要修正的工人上报");
      } else if (totals.failure > 0 || totals.notReported > 0) {
        toast.warning(`已修正 ${result.attempted_count} 名工人，成功 ${totals.success}，仍失败 ${totals.failure}，未传 ${totals.notReported}`);
      } else {
        toast.success(`已修正 ${result.attempted_count} 名工人，当前成功 ${totals.success}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修正工人上报失败");
    }
  };

  const handleReissueWorker = async (worker: Worker) => {
    if (!project) {
      toast.info("项目数据尚未加载，暂不能补发考勤机。");
      return;
    }
    if (worker.status !== "在场") {
      toast.info("离场人员禁止下发考勤机。");
      return;
    }

    const loadedDevices = attendanceDevices.length > 0
      ? attendanceDevices
      : (await attendanceDevicesQuery.refetch()).data?.items ?? [];
    const devices = loadedDevices.filter((device) => (device.serial_number ?? "").trim());
    if (devices.length === 0) {
      toast.info("当前项目暂无可补发的考勤机。");
      return;
    }

    setReissuingWorkerId(worker.id);
    let successCount = 0;
    let lastError = "";
    try {
      for (const device of devices) {
        try {
          await createAttendanceDeviceIssueReport.mutateAsync({
            project_id: projectId,
            worker_id: worker.id,
            attendance_device_id: device.id,
            action: "update",
            issued_at: new Date().toISOString(),
            remark: "项目工人列表手动补发",
          });
          successCount += 1;
        } catch (error) {
          lastError = error instanceof Error ? error.message : "考勤机补发失败";
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: constructionProjectKeys.workersRoot(projectId) }),
        queryClient.invalidateQueries({ queryKey: constructionProjectKeys.attendanceDeviceIssueReportsRoot() }),
      ]);

      if (successCount === devices.length) {
        toast.success(`已补发 ${successCount}/${devices.length} 台考勤机`);
      } else {
        toast.error(`补发完成 ${successCount}/${devices.length} 台，${lastError || "部分设备失败"}`);
      }
    } finally {
      setReissuingWorkerId(null);
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
        validateWorkerCreatePayload(payload, rawWorkers, editingId ?? undefined);
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

  const openAdvancedExportDialog = (target: AdvancedExportTarget) => {
    const scopedUnitId = workerScopeFilter.unitId ?? "";
    const scopedTeamId = workerScopeFilter.teamId ?? "";
    const selectedTeamId = normalizeSelectFilter(appliedWorkerFilters.teamId) || scopedTeamId;
    setAdvancedExportTarget(target);
    setAdvancedExportFormats(target === "workers" ? [] : ["attendance_time"]);
    setAdvancedExportScope(
      target === "workers"
        ? {
            keyword: "",
            unitIds: scopedUnitId ? [scopedUnitId] : ["all"],
            teamIds: selectedTeamId ? [selectedTeamId] : ["all"],
            workerIds: ["all"],
            workStatus: appliedWorkerFilters.workStatus,
            workType: "all",
          }
        : {
            ...DEFAULT_ADVANCED_EXPORT_SCOPE,
          }
    );
    setAdvancedExportMonth(attendanceCalendarMonth || currentPayrollMonth());
    setAdvancedExportAttendanceFilter("all");
    setAdvancedExportSortBy("attendance_days_desc");
    setAdvancedExportOpen(true);
  };

  const handleAdvancedExportSubmit = async () => {
    if (!project) {
      toast.info("项目数据尚未加载，暂不能导出。");
      return;
    }
    if (advancedExportTarget === "attendance" && advancedExportFormats.length === 0) {
      toast.info("请选择至少一种导出格式。");
      return;
    }

    const scopeFilters = buildAdvancedExportScopePayload(advancedExportScope, advancedExportTarget);
    const payload =
      advancedExportTarget === "workers"
        ? scopeFilters
        : {
            ...scopeFilters,
            formats: advancedExportFormats,
            attendance_month: advancedExportMonth,
            attendance_filter: advancedExportAttendanceFilter,
            sort_by: advancedExportSortBy,
          };

    setAdvancedExporting(true);
    try {
      const blob =
        advancedExportTarget === "workers"
          ? await constructionProjectService.exportWorkersAdvanced(projectId, payload)
          : await constructionProjectService.exportAttendanceAdvanced(projectId, payload);
      const suffix = advancedExportTarget === "workers" ? "项目工人高级导出" : "高级考勤导出";
      downloadBlob(`${safeFilename(project.name)}-${suffix}.csv`, blob);
      toast.success("导出文件已生成");
      setAdvancedExportOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
    } finally {
      setAdvancedExporting(false);
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
        openAdvancedExportDialog("workers");
        return;
      }
      if (activeTab === "考勤记录") {
        openAdvancedExportDialog("attendance");
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

  // Reset calendar page when month or filters change
  useEffect(() => {
    setAttendanceCalendarPage(1);
  }, [attendanceCalendarMonth, appliedAttendanceFilters.attendanceDate, appliedAttendanceFilters.direction, appliedAttendanceFilters.keyword]);

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
              <div className="text-xs font-medium text-[#0f6b5d] dark:text-primary">劳务管理模块</div>
              <div className="truncate text-sm font-semibold text-slate-950 dark:text-foreground">{activeTab}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "考勤记录" && isSystemAdmin ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-2 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                onClick={() => {
                  const startDate = `${attendanceCalendarMonth}-01`;
                  const monthEnd = lastDateOfMonth(attendanceCalendarMonth);
                  const today = dateInputToday();
                  setYongxinRepairStartDate(startDate);
                  setYongxinRepairEndDate(today.startsWith(`${attendanceCalendarMonth}-`) ? today : monthEnd);
                  setYongxinRepairTeamId("all");
                  setYongxinRepairWorkerKeyword("");
                  setYongxinRepairWorkerIds([]);
                  setYongxinRepairPreview(null);
                  setYongxinRepairOpen(true);
                }}
              >
                <Upload className="size-4" />
                甬薪补推考勤
              </Button>
            ) : null}
            {activeTab === "考勤记录" && isSystemAdmin ? (
              <Button
                size="sm"
                className="h-8 gap-2 bg-violet-600 text-white hover:bg-violet-700"
                onClick={() => setAttendanceGeneratorOpen(true)}
              >
                <WandSparkles className="size-4" />
                考勤生成工具
              </Button>
            ) : null}
            {activeTab !== "考勤机模式" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-2 border-slate-200 bg-white dark:border-border dark:bg-background"
                onClick={handleExportActiveTab}
              >
                <Download className="size-4" />
                {getExportButtonLabel(activeTab)}
              </Button>
            ) : null}
            {activeTab !== "考勤记录" && activeTab !== "考勤机模式" ? (
              <Button
                size="sm"
                className="h-8 gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
                onClick={() => {
                  if (activeTab === "项目基本信息") {
                    openProjectEditDialog();
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

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        {activeTab !== "项目基本信息" && activeTab !== "考勤机模式" && (
          <div
            className={cn(
              "border-b px-3 py-2",
              activeTab === "工资统计"
                ? "border-[#e8eaec] bg-white dark:border-border dark:bg-background"
                : "border-slate-100 bg-[#f8faf9] dark:border-border dark:bg-muted/30"
            )}
          >
            {activeTab === "工资统计" ? (
              <WageFiltersBar
                filters={wageFilters}
                onChange={handleWageFilterChange}
                onReset={() => setWageFilters({ payrollMonth: "", status: "all", page: 1 })}
              />
            ) : (
              <ModuleFilters
                activeTab={activeTab}
                showReportingPlatforms={isSystemAdmin}
                units={units}
                teams={projectTeams}
                unitFilters={unitFilters}
                onUnitFiltersChange={(patch) => setUnitFilters((current) => ({ ...current, ...patch }))}
                unitReportingSummary={unitQuery.data?.reporting_summary ?? []}
                onRepairUnitReporting={() => void handleRepairUnitReporting()}
                isRepairingUnitReporting={repairUnitReporting.isPending}
                teamFilters={teamFilters}
                teamReportingSummary={teamQuery.data?.reporting_summary ?? []}
                onRepairTeamReporting={() => void handleRepairTeamReporting()}
                isRepairingTeamReporting={repairTeamReporting.isPending}
                onTeamFiltersChange={(patch) => setTeamFilters((current) => ({ ...current, ...patch }))}
                workerFilters={workerFilters}
                workerReportingSummary={workerQuery.data?.reporting_summary ?? []}
                onRepairWorkerReporting={() => void handleRepairWorkerReporting()}
                isRepairingWorkerReporting={repairWorkerReporting.isPending}
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
              faceIssueSummary={faceIssueSummary}
              reportingPlatforms={projectQuery.data?.reporting_platforms}
              showReportingPlatforms={isSystemAdmin}
            />
          )}
          {activeTab === "建设单位" && (
            <UnitsTab
              units={tableUnits}
              pagination={{
                page: unitQuery.data?.page ?? unitPage,
                pageSize: unitQuery.data?.page_size ?? unitPageSize,
                total: unitQuery.data?.total ?? 0,
                onPageChange: setUnitPage,
                onPageSizeChange: (s) => { setUnitPageSize(s as (typeof PROJECT_PAGE_SIZE_OPTIONS)[number]); setUnitPage(1); },
              }}
              onEdit={openEditDialog}
              onDelete={handleDeleteRecord}
              editable
              showReportingPlatforms={isSystemAdmin}
            />
          )}
          {activeTab === "班组信息" && (
            <TeamsTab
              teams={tableTeams}
              pagination={{
                page: teamQuery.data?.page ?? teamPage,
                pageSize: teamQuery.data?.page_size ?? teamPageSize,
                total: teamQuery.data?.total ?? 0,
                onPageChange: setTeamPage,
                onPageSizeChange: (s) => { setTeamPageSize(s as (typeof PROJECT_PAGE_SIZE_OPTIONS)[number]); setTeamPage(1); },
              }}
              onEdit={openEditDialog}
              onDelete={handleDeleteRecord}
              editable
              showReportingPlatforms={isSystemAdmin}
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
                pageSize: workerQuery.data?.page_size ?? workerPageSize,
                total: workerQuery.data?.total ?? 0,
                onPageChange: setWorkerPage,
                onPageSizeChange: (s) => { setWorkerPageSize(s as (typeof PROJECT_PAGE_SIZE_OPTIONS)[number]); setWorkerPage(1); },
              }}
              onRetireWorker={updateWorker.mutateAsync}
              onReissueWorker={handleReissueWorker}
              onViewIssueDetails={setIssueDetailWorker}
              reissuingWorkerId={reissuingWorkerId}
              onEdit={openEditDialog}
              onDelete={handleDeleteRecord}
              editable
              showReportingPlatforms={isSystemAdmin}
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
                pageSize: attendanceQuery.data?.page_size ?? attendancePageSize,
                total: attendanceQuery.data?.total ?? 0,
                onPageChange: setAttendancePage,
                onPageSizeChange: (s) => { setAttendancePageSize(s as (typeof PROJECT_PAGE_SIZE_OPTIONS)[number]); setAttendancePage(1); },
              }}
              calendarPagination={{
                page: attendanceCalendarPage,
                pageSize: attendanceCalendarPageSize,
                total: attendanceCalendarQuery.data?.total ?? 0,
                onPageChange: setAttendanceCalendarPage,
                onPageSizeChange: (s) => { setAttendanceCalendarPageSize(s); setAttendanceCalendarPage(1); },
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
              editable
            />
          )}
          {activeTab === "考勤机模式" && (
            <AttendanceMachinePanel projectId={projectId} />
          )}
        </div>
      </section>

      <AttendanceGeneratorDialog
        open={attendanceGeneratorOpen}
        projectId={projectId}
        projectName={projectName}
        workers={projectWorkers}
        onOpenChange={setAttendanceGeneratorOpen}
        onCommitted={() => {
          setAttendancePage(1);
          void queryClient.invalidateQueries({ queryKey: constructionProjectKeys.attendanceRoot(projectId) });
        }}
      />

      <Dialog open={yongxinRepairOpen} onOpenChange={setYongxinRepairOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>甬薪补推考勤</DialogTitle>
            <DialogDescription>
              先选择班组和工人并预览待补推记录，确认后才会加入甬薪队列。已成功、处理中或结果待核对的数据不会重复发送。
            </DialogDescription>
          </DialogHeader>
          {!yongxinRepairPreview ? <>
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <div className="space-y-2"><label className="text-sm font-medium" htmlFor="yongxin-repair-start">开始日期</label><Input id="yongxin-repair-start" type="date" value={yongxinRepairStartDate} onChange={(event) => setYongxinRepairStartDate(event.target.value)} /></div>
              <div className="space-y-2"><label className="text-sm font-medium" htmlFor="yongxin-repair-end">结束日期</label><Input id="yongxin-repair-end" type="date" value={yongxinRepairEndDate} onChange={(event) => setYongxinRepairEndDate(event.target.value)} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">班组</label><Select value={yongxinRepairTeamId} onValueChange={(value) => { setYongxinRepairTeamId(value); setYongxinRepairWorkerIds([]); }}><SelectTrigger><SelectValue placeholder="全部班组" /></SelectTrigger><SelectContent><SelectItem value="all">全部班组</SelectItem>{rawTeams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name || "未命名班组"}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><label className="text-sm font-medium" htmlFor="yongxin-repair-worker-search">搜索工人</label><Input id="yongxin-repair-worker-search" value={yongxinRepairWorkerKeyword} onChange={(event) => setYongxinRepairWorkerKeyword(event.target.value)} placeholder="姓名或身份证号" /></div>
            </div>
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2 text-sm">
                <span>可选工人 {yongxinRepairWorkers.length} 人，已选 {yongxinRepairWorkerIds.length} 人</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => {
                  const visibleIds = yongxinRepairWorkers.map((worker) => worker.id);
                  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => yongxinRepairWorkerIds.includes(id));
                  setYongxinRepairWorkerIds((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds])));
                }}>{yongxinRepairWorkers.length > 0 && yongxinRepairWorkers.every((worker) => yongxinRepairWorkerIds.includes(worker.id)) ? "取消全选" : "全选当前"}</Button>
              </div>
              <div className="grid max-h-56 gap-1 overflow-y-auto p-2 sm:grid-cols-2">
                {yongxinRepairWorkers.map((worker) => <label key={worker.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50"><Checkbox checked={yongxinRepairWorkerIds.includes(worker.id)} onCheckedChange={(checked) => setYongxinRepairWorkerIds((current) => checked ? [...current, worker.id] : current.filter((id) => id !== worker.id))} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{worker.name || "未命名工人"}</span><span className="block truncate text-xs text-muted-foreground">{worker.id_card || "无身份证号"}</span></span></label>)}
                {yongxinRepairWorkers.length === 0 ? <div className="col-span-2 py-8 text-center text-sm text-muted-foreground">当前条件下没有工人</div> : null}
              </div>
            </div>
          </> : <>
            <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border bg-slate-50 p-3"><div className="text-xs text-muted-foreground">已选工人</div><div className="mt-1 text-xl font-semibold">{yongxinRepairWorkerIds.length} 人</div></div><div className="rounded-lg border bg-slate-50 p-3"><div className="text-xs text-muted-foreground">实际涉及工人</div><div className="mt-1 text-xl font-semibold">{yongxinRepairPreview.worker_count} 人</div></div><div className="rounded-lg border bg-slate-50 p-3"><div className="text-xs text-muted-foreground">待补推记录</div><div className="mt-1 text-xl font-semibold">{yongxinRepairPreview.record_count} 条</div></div></div>
            {yongxinRepairPreview.has_more ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">当前符合条件的记录超过 500 条，本批只展示并推送前 500 条。</div> : null}
            <div className="max-h-[42vh] overflow-auto rounded-lg border"><Table><TableHeader className="sticky top-0 bg-slate-50"><TableRow><TableHead>工人</TableHead><TableHead>班组</TableHead><TableHead>方向</TableHead><TableHead>考勤时间</TableHead><TableHead>当前状态</TableHead></TableRow></TableHeader><TableBody>{yongxinRepairPreview.records.map((record) => <TableRow key={record.attendance_id}><TableCell><div className="font-medium">{record.worker_name}</div><div className="text-xs text-muted-foreground">{record.worker_identity || "无身份证号"}</div></TableCell><TableCell>{record.team_name || "未分配班组"}</TableCell><TableCell>{record.direction === 0 ? "进场" : "出场"}</TableCell><TableCell>{new Date(record.trigger_time).toLocaleString("zh-CN", { hour12: false })}</TableCell><TableCell>{record.current_status ? <div><div>{formatYongxinJobStatus(record.current_status)}</div><div className="max-w-52 truncate text-xs text-red-600" title={record.current_message || ""}>{record.current_message}</div></div> : "未上报"}</TableCell></TableRow>)}</TableBody></Table>{yongxinRepairPreview.records.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">所选范围没有需要补推的考勤记录</div> : null}</div>
          </>}
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
            每批最多加入 500 条。考勤上传、图片上传以及异步结果查询都会写入“平台对接管理 → 平台日志”，可按甬薪、成功/失败、工人姓名、身份证号或异步流水号搜索。
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" asChild>
              <a href={`/app/admin/platform-integrations?tab=logs&project_id=${encodeURIComponent(projectId)}&platform_type=yongxin_v2`}>
                查看平台日志
              </a>
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setYongxinRepairOpen(false)}>取消</Button>
              {yongxinRepairPreview ? <Button type="button" variant="outline" disabled={repairYongxinAttendance.isPending} onClick={() => setYongxinRepairPreview(null)}>返回修改</Button> : null}
              {!yongxinRepairPreview ? <Button
                type="button"
                disabled={previewYongxinAttendanceRepair.isPending || !yongxinRepairStartDate || !yongxinRepairEndDate || yongxinRepairWorkerIds.length === 0}
                className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
                onClick={async () => {
                  if (yongxinRepairEndDate < yongxinRepairStartDate) {
                    toast.error("结束日期不能早于开始日期");
                    return;
                  }
                  try {
                    const result = await previewYongxinAttendanceRepair.mutateAsync({ start_date: yongxinRepairStartDate, end_date: yongxinRepairEndDate, worker_ids: yongxinRepairWorkerIds });
                    setYongxinRepairPreview(result);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "甬薪考勤补推预览失败");
                  }
                }}
              >
                {previewYongxinAttendanceRepair.isPending ? "生成预览中…" : <><Eye className="mr-2 size-4" />预览待补推数据</>}
              </Button> : <Button type="button" disabled={repairYongxinAttendance.isPending || yongxinRepairPreview.records.length === 0} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]" onClick={async () => {
                try {
                  const result = await repairYongxinAttendance.mutateAsync({ start_date: yongxinRepairStartDate, end_date: yongxinRepairEndDate, worker_ids: yongxinRepairWorkerIds, attendance_ids: yongxinRepairPreview.records.map((record) => record.attendance_id) });
                  toast.success(`已加入 ${result.queued_count} 条甬薪考勤补推任务${result.has_more ? "，完成后请继续补推下一批" : ""}`);
                  setYongxinRepairOpen(false);
                } catch (error) { toast.error(error instanceof Error ? error.message : "甬薪考勤补推失败"); }
              }}>{repairYongxinAttendance.isPending ? "加入队列中…" : `确认补推 ${yongxinRepairPreview.record_count} 条`}</Button>}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdvancedExportDialog
        open={advancedExportOpen}
        target={advancedExportTarget}
        formats={advancedExportFormats}
        scope={advancedExportScope}
        units={units}
        teams={projectTeams}
        workers={projectWorkers}
        attendanceFilter={advancedExportAttendanceFilter}
        sortBy={advancedExportSortBy}
        isSubmitting={advancedExporting}
        onOpenChange={setAdvancedExportOpen}
        onFormatsChange={setAdvancedExportFormats}
        onScopeChange={(patch) => setAdvancedExportScope((current) => ({ ...current, ...patch }))}
        onAttendanceFilterChange={setAdvancedExportAttendanceFilter}
        onSortByChange={setAdvancedExportSortBy}
        onSubmit={handleAdvancedExportSubmit}
      />

      <WorkerIssueDetailsDialog
        open={Boolean(issueDetailWorker)}
        worker={issueDetailWorker}
        reports={workerIssueReportsQuery.data?.items ?? []}
        total={workerIssueReportsQuery.data?.total ?? 0}
        isLoading={workerIssueReportsQuery.isLoading || workerIssueReportsQuery.isFetching}
        isError={workerIssueReportsQuery.isError}
        onOpenChange={(open) => {
          if (!open) setIssueDetailWorker(null);
        }}
      />

      <Dialog open={projectFormOpen} onOpenChange={setProjectFormOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>编辑项目</DialogTitle>
            <DialogDescription>修改当前项目的基本信息。</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleSubmitProject}>
            <ConstructionRecordForm
              fields={projectFormFields}
              state={projectFormState}
              onChange={(key, value) =>
                setProjectFormState((current) => ({ ...current, [key]: value }))
              }
              onBulkChange={(values) =>
                setProjectFormState((current) => ({ ...current, ...values }))
              }
              uploadContext={{ bizType: "project", bizId: projectId }}
              maxHeightClassName="max-h-[68vh]"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProjectFormOpen(false)}>
                取消
              </Button>
              <Button
                type="submit"
                disabled={updateProject.isPending}
                className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
              >
                {updateProject.isPending ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

function AdvancedExportDialog({
  open,
  target,
  formats,
  scope,
  units,
  teams,
  workers,
  attendanceFilter,
  sortBy,
  isSubmitting,
  onOpenChange,
  onFormatsChange,
  onScopeChange,
  onAttendanceFilterChange,
  onSortByChange,
  onSubmit,
}: {
  open: boolean;
  target: AdvancedExportTarget;
  formats: string[];
  scope: AdvancedExportScopeFilters;
  units: ConstructionUnit[];
  teams: Team[];
  workers: Worker[];
  attendanceFilter: string;
  sortBy: string;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onFormatsChange: (formats: string[]) => void;
  onScopeChange: (patch: Partial<AdvancedExportScopeFilters>) => void;
  onAttendanceFilterChange: (value: string) => void;
  onSortByChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const title = target === "workers" ? "项目人员导出" : "高级考勤导出";
  const selectedAttendanceFormat = formats[0] ?? "attendance_time";
  const unitOptions = units.map((unit) => ({ value: unit.id, label: unit.name }));
  const unitNameById = new Map(units.map((unit) => [unit.id, unit.name]));
  const selectedUnitNames = isAllExportSelection(scope.unitIds)
    ? []
    : scope.unitIds.map((unitId) => unitNameById.get(unitId)).filter(Boolean);
  const filteredTeams = selectedUnitNames.length === 0
    ? teams
    : teams.filter((team) => selectedUnitNames.includes(team.unitName));
  const teamOptions = filteredTeams.map((team) => ({
    value: team.id,
    label: `${team.unitName} / ${team.name}`,
  }));
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const selectedTeamNames = isAllExportSelection(scope.teamIds)
    ? []
    : scope.teamIds.map((teamId) => teamNameById.get(teamId)).filter(Boolean);
  const workerOptions = workers
    .filter((worker) => selectedUnitNames.length === 0 || selectedUnitNames.includes(worker.unit))
    .filter((worker) => selectedTeamNames.length === 0 || selectedTeamNames.includes(worker.team))
    .filter((worker) => {
      if (scope.workStatus === "1") return worker.status === "在场";
      if (scope.workStatus === "2") return worker.status === "离场";
      return true;
    })
    .map((worker) => ({
      value: worker.id,
      label: worker.name,
      description: worker.idCard || worker.phone || worker.team,
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={target === "workers" ? "sm:max-w-5xl" : "sm:max-w-2xl"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {target === "attendance" ? (
            <DialogDescription>按筛选范围生成组合导出包。</DialogDescription>
          ) : null}
        </DialogHeader>

        {target === "workers" ? (
          <div className="space-y-5 py-2">
            <AdvancedExportField label="参建单位">
              <AdvancedExportMultiSelect
                value={scope.unitIds}
                options={unitOptions}
                allLabel="全部单位"
                onChange={(unitIds) => onScopeChange({ unitIds, teamIds: ["all"], workerIds: ["all"] })}
              />
            </AdvancedExportField>
            <AdvancedExportField label="班组">
              <AdvancedExportMultiSelect
                value={scope.teamIds}
                options={teamOptions}
                allLabel="全部班组"
                onChange={(teamIds) => onScopeChange({ teamIds, workerIds: ["all"] })}
              />
            </AdvancedExportField>
            <AdvancedExportField label="人员">
              <AdvancedExportMultiSelect
                value={scope.workerIds}
                options={workerOptions}
                allLabel="全部人员"
                onChange={(workerIds) => onScopeChange({ workerIds })}
              />
            </AdvancedExportField>
            <AdvancedExportField label="人员筛选">
              <div className="flex flex-wrap gap-7">
                {[
                  { label: "全部", value: "all" },
                  { label: "在职", value: "1" },
                  { label: "离职", value: "2" },
                ].map((option) => {
                  const active = scope.workStatus === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        "flex items-center gap-2 text-sm font-medium",
                        active ? "text-[#0f6b5d]" : "text-slate-600 hover:text-[#0f6b5d] dark:text-muted-foreground"
                      )}
                      onClick={() => onScopeChange({ workStatus: option.value, workerIds: ["all"] })}
                    >
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-full border",
                          active ? "border-[#0f6b5d]" : "border-slate-300"
                        )}
                      >
                        {active ? <span className="size-2 rounded-full bg-[#0f6b5d]" /> : null}
                      </span>
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </AdvancedExportField>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <AdvancedExportField label="导出方式">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  {ATTENDANCE_ADVANCED_EXPORT_OPTIONS.map((option) => {
                    const active = selectedAttendanceFormat === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          "flex items-center gap-2 text-sm font-medium",
                          active ? "text-[#0f6b5d]" : "text-slate-600 hover:text-[#0f6b5d] dark:text-muted-foreground"
                        )}
                        onClick={() => onFormatsChange([option.value])}
                      >
                        <span
                          className={cn(
                            "flex size-4 items-center justify-center rounded-full border",
                            active ? "border-[#0f6b5d]" : "border-slate-300"
                          )}
                        >
                          {active ? <span className="size-2 rounded-full bg-[#0f6b5d]" /> : null}
                        </span>
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <div className="text-xs text-slate-500 dark:text-muted-foreground">
                  {ATTENDANCE_ADVANCED_EXPORT_OPTIONS.find((option) => option.value === selectedAttendanceFormat)?.description}
                </div>
              </div>
            </AdvancedExportField>
            <AdvancedExportField label="参建单位">
              <AdvancedExportMultiSelect
                value={scope.unitIds}
                options={unitOptions}
                allLabel="全部单位"
                onChange={(unitIds) => onScopeChange({ unitIds, teamIds: ["all"], workerIds: ["all"] })}
              />
            </AdvancedExportField>
            <AdvancedExportField label="班组">
              <AdvancedExportMultiSelect
                value={scope.teamIds}
                options={teamOptions}
                allLabel="全部班组"
                onChange={(teamIds) => onScopeChange({ teamIds, workerIds: ["all"] })}
              />
            </AdvancedExportField>
            <AdvancedExportField label="人员">
              <AdvancedExportMultiSelect
                value={scope.workerIds}
                options={workerOptions}
                allLabel="全部人员"
                onChange={(workerIds) => onScopeChange({ workerIds })}
              />
            </AdvancedExportField>
            <AdvancedExportField label="人员筛选">
              <div className="flex flex-wrap gap-7">
                {[
                  { label: "全部人员", value: "all" },
                  { label: "有考勤人员", value: "has_attendance" },
                  { label: "无考勤人员", value: "no_attendance" },
                ].map((option) => {
                  const active = attendanceFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        "flex items-center gap-2 text-sm font-medium",
                        active ? "text-[#0f6b5d]" : "text-slate-600 hover:text-[#0f6b5d] dark:text-muted-foreground"
                      )}
                      onClick={() => onAttendanceFilterChange(option.value)}
                    >
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-full border",
                          active ? "border-[#0f6b5d]" : "border-slate-300"
                        )}
                      >
                        {active ? <span className="size-2 rounded-full bg-[#0f6b5d]" /> : null}
                      </span>
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </AdvancedExportField>
            <AdvancedExportField label="排序方式">
              <Select value={sortBy} onValueChange={onSortByChange}>
                <SelectTrigger className="h-10 w-full bg-white dark:bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendance_days_desc">考勤天数从高到低</SelectItem>
                  <SelectItem value="name_asc">按姓名排序</SelectItem>
                  <SelectItem value="team_asc">按班组排序</SelectItem>
                  <SelectItem value="entry_time_desc">进场时间从近到远</SelectItem>
                  <SelectItem value="entry_time_asc">进场时间从远到近</SelectItem>
                  <SelectItem value="work_type_asc">按工种排序</SelectItem>
                </SelectContent>
              </Select>
            </AdvancedExportField>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={isSubmitting || (target === "attendance" && formats.length === 0)} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]" onClick={onSubmit}>
            {isSubmitting ? "导出中..." : "导出"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdvancedExportField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-start">
      <div className="pt-2 text-sm font-medium text-slate-600 dark:text-muted-foreground">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function AdvancedExportMultiSelect({
  value,
  options,
  allLabel,
  onChange,
  compact = false,
}: {
  value: string[];
  options: Array<{ value: string; label: string; description?: string }>;
  allLabel: string;
  onChange: (value: string[]) => void;
  compact?: boolean;
}) {
  const selectedAll = isAllExportSelection(value);
  const selectedOptions = selectedAll ? [] : options.filter((option) => value.includes(option.value));

  const setAll = () => onChange(["all"]);
  const toggleOption = (optionValue: string, checked: boolean) => {
    const current = selectedAll ? [] : value.filter((item) => item !== "all");
    const next = checked
      ? [...current, optionValue]
      : current.filter((item) => item !== optionValue);
    onChange(next.length > 0 ? Array.from(new Set(next)) : ["all"]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-auto min-h-10 w-full shrink justify-between gap-2 whitespace-normal border-slate-200 bg-white px-3 py-1.5 text-left font-normal dark:border-border dark:bg-background",
            compact && "min-h-8 py-1 text-sm"
          )}
        >
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {selectedAll ? (
              <span className="truncate text-slate-600 dark:text-muted-foreground">{allLabel}</span>
            ) : (
              <>
                {selectedOptions.slice(0, 3).map((option) => (
                  <span
                    key={option.value}
                    className="max-w-[220px] truncate rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-muted dark:text-muted-foreground"
                  >
                    {option.label}
                  </span>
                ))}
                {selectedOptions.length > 3 ? (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-muted dark:text-muted-foreground">
                    +{selectedOptions.length - 3}
                  </span>
                ) : null}
              </>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
        <DropdownMenuCheckboxItem
          checked={selectedAll}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={setAll}
        >
          {allLabel}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {options.length === 0 ? (
          <DropdownMenuItem disabled>暂无可选数据</DropdownMenuItem>
        ) : (
          options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={!selectedAll && value.includes(option.value)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) => toggleOption(option.value, Boolean(checked))}
            >
              <span className="min-w-0">
                <span className="block truncate">{option.label}</span>
                {option.description ? (
                  <span className="block truncate text-xs text-slate-500 dark:text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isAllExportSelection(value: string[]) {
  return value.length === 0 || value.includes("all");
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
  showReportingPlatforms,
  units,
  teams,
  unitFilters,
  onUnitFiltersChange,
  unitReportingSummary,
  onRepairUnitReporting,
  isRepairingUnitReporting,
  teamFilters,
  teamReportingSummary,
  onRepairTeamReporting,
  isRepairingTeamReporting,
  onTeamFiltersChange,
  workerFilters,
  workerReportingSummary,
  onRepairWorkerReporting,
  isRepairingWorkerReporting,
  onWorkerFiltersChange,
  attendanceFilters,
  onAttendanceFiltersChange,
  onSearch,
  onReset,
}: {
  activeTab: DetailTab;
  showReportingPlatforms: boolean;
  units: ConstructionUnit[];
  teams: Team[];
  unitFilters: UnitLedgerFilters;
  onUnitFiltersChange: (patch: Partial<UnitLedgerFilters>) => void;
  unitReportingSummary: ConstructionTeamReportingSummary[];
  onRepairUnitReporting: () => void;
  isRepairingUnitReporting: boolean;
  teamFilters: TeamLedgerFilters;
  teamReportingSummary: ConstructionTeamReportingSummary[];
  onRepairTeamReporting: () => void;
  isRepairingTeamReporting: boolean;
  onTeamFiltersChange: (patch: Partial<TeamLedgerFilters>) => void;
  workerFilters: WorkerLedgerFilters;
  workerReportingSummary: ConstructionTeamReportingSummary[];
  onRepairWorkerReporting: () => void;
  isRepairingWorkerReporting: boolean;
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
      <div className={cn("grid gap-2", showReportingPlatforms && "xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,2.2fr)]")}>
        {showReportingPlatforms ? <TeamReportingOverview summary={unitReportingSummary} onRepair={onRepairUnitReporting} isRepairing={isRepairingUnitReporting} /> : null}
        <FilterGrid compact onSearch={onSearch} onReset={onReset}>
          <FilterInput label="关键词" placeholder="单位名称、信用代码、负责人" value={unitFilters.keyword} onChange={(event) => onUnitFiltersChange({ keyword: event.target.value })} />
          <FilterSelect label="单位类型" value={unitFilters.companyType} onValueChange={(companyType) => onUnitFiltersChange({ companyType })} options={selectOptionsFromField(unitFormFields, "company_type", "全部类型")} />
          <FilterSelect label="计薪方式" value={unitFilters.salaryCalcType} onValueChange={(salaryCalcType) => onUnitFiltersChange({ salaryCalcType })} options={selectOptionsFromField(unitFormFields, "salary_calc_type", "全部计薪方式")} />
        </FilterGrid>
      </div>
    );
  }

  if (activeTab === "班组信息") {
    return (
      <div className={cn("grid gap-2", showReportingPlatforms && "xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,2.2fr)]")}>
        {showReportingPlatforms ? <TeamReportingOverview summary={teamReportingSummary} onRepair={onRepairTeamReporting} isRepairing={isRepairingTeamReporting} /> : null}
        <FilterGrid compact onSearch={onSearch} onReset={onReset}>
          <FilterInput label="关键词" placeholder="班组名称、班组长" value={teamFilters.keyword} onChange={(event) => onTeamFiltersChange({ keyword: event.target.value })} />
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
      </div>
    );
  }

  if (activeTab === "项目工人") {
    return (
      <div className={cn("grid gap-2", showReportingPlatforms && "xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,2.2fr)]")}>
        {showReportingPlatforms ? <TeamReportingOverview summary={workerReportingSummary} onRepair={onRepairWorkerReporting} isRepairing={isRepairingWorkerReporting} /> : null}
        <FilterGrid compact onSearch={onSearch} onReset={onReset}>
          <FilterInput label="关键词" placeholder="姓名、身份证、手机号" value={workerFilters.keyword} onChange={(event) => onWorkerFiltersChange({ keyword: event.target.value })} />
          <FilterSelect label="所属班组" value={workerFilters.teamId} onValueChange={(teamId) => onWorkerFiltersChange({ teamId })} options={[{ label: "全部班组", value: "all" }, ...teams.map((team) => ({ label: `${team.unitName} / ${team.name}`, value: team.id }))]} />
          <FilterSelect label="工人状态" value={workerFilters.workStatus} onValueChange={(workStatus) => onWorkerFiltersChange({ workStatus })} options={selectOptionsFromField(workerFormFields, "work_status", "全部状态")} />
          <FilterSelect label="工种" value={workerFilters.workType} onValueChange={(workType) => onWorkerFiltersChange({ workType })} options={selectOptionsFromField(workerFormFields, "work_type", "全部工种")} />
        </FilterGrid>
      </div>
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
  // 工资统计采用经典后台风格：label 左置的行内筛选 + 蓝色查询按钮
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-1">
      <label className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-sm font-medium text-[#303133] dark:text-foreground">发放月份</span>
        <Input
          type="month"
          value={filters.payrollMonth}
          onChange={(event) => onChange({ payrollMonth: event.target.value })}
          className="h-8 w-[190px] rounded-sm border-[#dcdfe6] bg-white shadow-none dark:border-border dark:bg-background"
        />
      </label>
      <label className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-sm font-medium text-[#303133] dark:text-foreground">状态</span>
        <Select value={filters.status} onValueChange={(status) => onChange({ status })}>
          <SelectTrigger className="h-8 w-[160px] rounded-sm border-[#dcdfe6] bg-white shadow-none dark:border-border dark:bg-background">
            <SelectValue />
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
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" className="h-8 rounded-sm bg-[#1890ff] px-4 text-white hover:bg-[#40a9ff]" onClick={() => onChange({ page: 1 })}>
          <Search className="size-4" />
          查询
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-sm border-[#dcdfe6] bg-white px-4 text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff] dark:border-border dark:bg-background dark:text-foreground"
          onClick={onReset}
        >
          重置
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
                      <Input className="h-8 w-full min-w-0 px-2" type="number" step="0.01" inputMode="decimal" value={row.payable_amount_yuan} onChange={(event) => patchRow(rowKey, { payable_amount_yuan: event.target.value })} />
                    </TableCell>
                    <TableCell className="px-1">
                      <Input className="h-8 w-full min-w-0 px-2" type="number" step="0.01" inputMode="decimal" value={row.paid_amount_yuan} onChange={(event) => patchRow(rowKey, { paid_amount_yuan: event.target.value })} />
                    </TableCell>
                    <TableCell className="px-1">
                      <Input className="h-8 w-full min-w-0 px-2" type="number" step="0.01" inputMode="decimal" value={row.unpaid_amount_yuan} onChange={(event) => patchRow(rowKey, { unpaid_amount_yuan: event.target.value })} />
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
  compact = false,
}: {
  children: ReactNode;
  onSearch: () => void;
  onReset: () => void;
  compact?: boolean;
}) {
  return (
    <div className={cn(
      "grid gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-border dark:bg-background sm:grid-cols-2",
      compact
        ? "2xl:grid-cols-[minmax(180px,2fr)_repeat(3,minmax(120px,1fr))_auto]"
        : "xl:grid-cols-[minmax(240px,2fr)_repeat(3,minmax(140px,1fr))_auto]"
    )}>
      {children}
      <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1 xl:justify-end">
        <Button type="button" size="sm" variant="outline" className="h-8 gap-2 border-slate-200 bg-white dark:border-border dark:bg-background" onClick={onReset}>
          <RotateCcw className="size-4" />
          重置
        </Button>
        <Button type="button" size="sm" className="h-8 gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]" onClick={onSearch}>
          <Search className="size-4" />
          查询
        </Button>
      </div>
    </div>
  );
}

function TeamReportingOverview({
  summary,
  onRepair,
  isRepairing,
}: {
  summary: ConstructionTeamReportingSummary[];
  onRepair: () => void;
  isRepairing: boolean;
}) {
  const repairableCount = summary.reduce(
    (total, platform) => total + platform.failure_count + platform.not_reported_count,
    0
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-border dark:bg-background">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground">上报平台</div>
        {repairableCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs text-[#0f6b5d]"
            disabled={isRepairing}
            onClick={onRepair}
          >
            <RefreshCw className={cn("size-3.5", isRepairing && "animate-spin")} />
            {isRepairing ? "修正中" : `修正上报 ${repairableCount}`}
          </Button>
        )}
      </div>
      {summary.length === 0 ? (
        <div className="mt-2 text-xs text-slate-400">未配置上报平台</div>
      ) : (
        <div className="mt-1.5 space-y-1.5">
          {summary.map((platform) => (
            <div key={`${platform.platform_type}-${platform.platform_name}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-foreground">{platform.platform_name}</span>
              <span className="text-emerald-600">成功 {platform.success_count}</span>
              <span className="text-red-600">失败 {platform.failure_count}</span>
              <span className="text-slate-400">未传 {platform.not_reported_count}</span>
              {platform.ignored_count > 0 && <span className="text-slate-400">跳过 {platform.ignored_count}</span>}
            </div>
          ))}
        </div>
      )}
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

function normalizeExportSelection(values: string[]) {
  return values.filter((value) => value && value !== "all");
}

function buildAdvancedExportScopePayload(
  scope: AdvancedExportScopeFilters,
  target: AdvancedExportTarget
) {
  const payload: Record<string, unknown> = {};
  const unitIds = normalizeExportSelection(scope.unitIds);
  const teamIds = normalizeExportSelection(scope.teamIds);
  const workerIds = normalizeExportSelection(scope.workerIds);
  if (target === "attendance" && scope.keyword.trim()) {
    payload.keyword = scope.keyword.trim();
  }
  if (unitIds.length > 0) {
    payload.unit_ids = unitIds;
  }
  if (teamIds.length > 0) {
    payload.team_ids = teamIds;
  }
  if (workerIds.length > 0) {
    payload.worker_ids = workerIds;
  }
  if (normalizeSelectFilter(scope.workStatus)) {
    payload.work_status = scope.workStatus;
  }
  if (target === "attendance" && normalizeSelectFilter(scope.workType)) {
    payload.work_type = scope.workType;
  }
  return payload;
}

function ProjectInfoTab({
  project,
  unitCount,
  teamCount,
  workerCount,
  audit,
  faceIssueSummary,
  reportingPlatforms,
  showReportingPlatforms,
}: {
  project: Project;
  unitCount: number;
  teamCount: number;
  workerCount: number;
  audit: ProjectOverviewAudit | null;
  faceIssueSummary: FaceIssueSummary;
  reportingPlatforms: ConstructionProject["reporting_platforms"];
  showReportingPlatforms: boolean;
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

      <FaceIssueSummaryPanel summary={faceIssueSummary} />

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
          {showReportingPlatforms ? (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Upload className="size-4 text-[#0f6b5d]" />
                上报平台
              </div>
              <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-border dark:bg-background">
                <ProjectReportingPlatforms platforms={reportingPlatforms} />
              </div>
              <div className="my-3 border-t border-slate-200 dark:border-border" />
            </>
          ) : null}
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

function FaceIssueSummaryPanel({ summary }: { summary: FaceIssueSummary }) {
  const deviceHelper =
    summary.deviceCount > 0
      ? `${summary.onlineDeviceCount} 台在线`
      : "请先绑定考勤机";
  const incompleteHelper =
    summary.deviceCount > 0
      ? `含无头像 ${summary.missingAvatarWorkerCount} 人`
      : "暂无下发目标";
  const statusLabel =
    summary.deviceCount === 0
      ? "未配置"
      : summary.incompleteWorkerCount > 0
        ? "待处理"
        : "已完成";

  return (
    <div className="rounded-lg border border-slate-200 bg-[#fbfcfc] p-3 dark:border-border dark:bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-foreground">考勤机人脸下发</div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">
            统计在场工人头像下发到项目考勤机的最新成功情况。
          </div>
        </div>
        <span
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-semibold",
            summary.deviceCount === 0 || summary.incompleteWorkerCount > 0
              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          )}
        >
          {statusLabel}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCell label="绑定考勤机" value={`${summary.deviceCount} 台`} helper={deviceHelper} compact />
        <MetricCell
          label="下发成功"
          value={`${summary.successTargetCount}/${summary.totalTargetCount}`}
          helper="成功/应下发"
          accent="teal"
          compact
        />
        <MetricCell
          label="未成功人员"
          value={`${summary.incompleteWorkerCount} 人`}
          helper={incompleteHelper}
          accent={summary.incompleteWorkerCount > 0 ? "amber" : "teal"}
          compact
        />
        <MetricCell
          label="全量完成人员"
          value={`${summary.fullyIssuedWorkerCount}/${summary.activeWorkerCount}`}
          helper="在场工人"
          accent="slate"
          compact
        />
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
  showReportingPlatforms,
}: {
  units: ConstructionUnit[];
  pagination: TablePaginationConfig;
  editable: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  showReportingPlatforms: boolean;
}) {
  return (
    <DataTable
      empty="暂无参建单位"
      headers={editable ? ["单位名称", "单位类型", "统一社会信用代码", "负责人", "计薪方式", "人数", "操作"] : ["单位名称", "单位类型", "统一社会信用代码", "负责人", "计薪方式", "人数"]}
      rows={units.map((unit) => [
        <div key={`${unit.id}-reporting`} className="min-w-[220px] space-y-1.5">
          <div className="font-medium text-slate-800 dark:text-foreground">{unit.name}</div>
          {showReportingPlatforms ? <EntityReportingPlatforms platforms={unit.reportingPlatforms} /> : null}
        </div>,
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
  showReportingPlatforms,
}: {
  teams: Team[];
  pagination: TablePaginationConfig;
  editable: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  showReportingPlatforms: boolean;
}) {
  return (
    <DataTable
      empty="暂无班组"
      headers={editable ? ["管理班组", "班组名称", "参建单位", "工种", "班组长", "人数", "计薪方式", "考勤时段", "状态", "操作"] : ["管理班组", "班组名称", "参建单位", "工种", "班组长", "人数", "计薪方式", "考勤时段", "状态"]}
      rows={teams.map((team) => [
        <span
          key={`${team.id}-manage-team`}
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
            team.isManageTeam
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-slate-100 text-slate-500 dark:bg-muted dark:text-muted-foreground"
          )}
        >
          {team.isManageTeam ? "是" : "否"}
        </span>,
        <div key={`${team.id}-reporting`} className="min-w-[220px] space-y-1.5">
          <div className="font-medium text-slate-800 dark:text-foreground">{team.name}</div>
          {showReportingPlatforms ? <EntityReportingPlatforms platforms={team.reportingPlatforms} /> : null}
        </div>,
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

function EntityReportingPlatforms({
  platforms,
  showLabel = true,
}: {
  platforms: ConstructionUnit["reportingPlatforms"] | Team["reportingPlatforms"];
  showLabel?: boolean;
}) {
  if (!platforms?.length) {
    return (
      <div className="text-[11px] text-slate-400">
        {showLabel ? "上报平台：未配置" : "未配置"}
      </div>
    );
  }

  return (
    <div className="space-y-1 text-[11px]">
      {showLabel ? <div className="text-slate-400">上报平台</div> : null}
      {platforms.map((platform) => {
        const isSuccess = platform.status === "success";
        const isFailed = platform.status === "failed" || platform.status === "pending";
        const isIgnored = platform.status === "ignored";
        const statusText = isSuccess
          ? "成功"
          : isFailed
            ? `失败${platform.failure_reason ? `：${platform.failure_reason}` : ""}`
            : isIgnored
                ? "已跳过（市平台无法获取工人ID）"
                : "未传";

        return (
          <div key={`${platform.platform_type}-${platform.platform_name}`} className="max-w-[320px] space-y-0.5">
            <div
              className={cn(
                "flex items-start gap-1",
                isSuccess
                  ? "text-emerald-600"
                  : isFailed
                    ? "text-red-600"
                    : "text-slate-400"
              )}
              title={`${platform.platform_name}：${statusText}`}
            >
              <span className="mt-[3px] size-1.5 shrink-0 rounded-full bg-current" />
              <span className="break-words">{platform.platform_name}：{statusText}</span>
            </div>
            {platform.yongjian_code ? (
              <div className="break-all pl-2.5 text-emerald-600" title={`甬建码：${platform.yongjian_code}`}>
                甬建码：{platform.yongjian_code}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
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
  onReissueWorker,
  onViewIssueDetails,
  reissuingWorkerId,
  editable,
  onEdit,
  onDelete,
  showReportingPlatforms,
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
  onReissueWorker: (worker: Worker) => Promise<void>;
  onViewIssueDetails: (worker: Worker) => void;
  reissuingWorkerId: string | null;
  editable: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  showReportingPlatforms: boolean;
}) {
  const workerTree = buildWorkerTree(units, teams, treeWorkers);
  const selectedKey = getWorkerTreeSelectionKey(selection);
  const activeUnit = selection.kind === "all" ? undefined : workerTree.find((unit) => unit.name === selection.unitName);
  const activeTeam =
    selection.kind === "team" ? activeUnit?.teams.find((team) => team.name === selection.teamName) : undefined;
  const scopedWorkers = workers;
  const [downloadingWorkerId, setDownloadingWorkerId] = useState<string | null>(null);
  const [reentryWorker, setReentryWorker] = useState<Worker | null>(null);
  const [reentryTeamId, setReentryTeamId] = useState("");
  const [reentryEntryTime, setReentryEntryTime] = useState(dateInputToday());
  const [reentrySaving, setReentrySaving] = useState(false);
  const [editingEntryWorker, setEditingEntryWorker] = useState<Worker | null>(null);
  const [editingEntryDate, setEditingEntryDate] = useState("");
  const [editingEntrySaving, setEditingEntrySaving] = useState(false);
  const [attendanceWorker, setAttendanceWorker] = useState<Worker | null>(null);
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

  const openReentry = (worker: Worker) => {
    const team = teams.find((item) => item.name === worker.team && item.unitName === worker.unit) ?? teams[0];
    if (!team) {
      toast.info("请先维护班组，再办理进场。");
      return;
    }
    setReentryWorker(worker);
    setReentryTeamId(team.id);
    setReentryEntryTime(dateInputToday());
  };

  const submitReentry = async () => {
    const team = teams.find((item) => item.id === reentryTeamId);
    if (!reentryWorker || !team || !reentryEntryTime || reentrySaving) return;

    setReentrySaving(true);
    try {
      await onRetireWorker({
        workerId: reentryWorker.id,
        payload: {
          ...(team.unitId ? { unit_id: team.unitId } : {}),
          team_id: team.id,
          work_status: 1,
          entry_time: reentryEntryTime,
          exit_time: null,
        },
      });
      setReentryWorker(null);
      toast.success("工人已进场");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "进场失败");
    } finally {
      setReentrySaving(false);
    }
  };

  const submitEditEntryTime = async () => {
    if (!editingEntryWorker || !editingEntryDate || editingEntrySaving) return;
    setEditingEntrySaving(true);
    try {
      await onRetireWorker({
        workerId: editingEntryWorker.id,
        payload: { entry_time: editingEntryDate },
      });
      setEditingEntryWorker(null);
      toast.success("进场日期修改成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修改进场日期失败");
    } finally {
      setEditingEntrySaving(false);
    }
  };

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
          headers={[
            ...(showReportingPlatforms ? ["上报平台"] : []),
            "头像", "姓名", "手机号", "班组", "工种", "下发成功", "状态", "进场日期",
            ...(editable ? ["操作"] : []),
          ]}
          tableClassName={showReportingPlatforms ? (editable ? "min-w-[980px]" : "min-w-[900px]") : (editable ? "min-w-[830px]" : "min-w-[750px]")}
          cellClassNames={[
            ...(showReportingPlatforms ? ["w-[150px]"] : []),
            "w-14",
            "w-20",
            "w-28",
            "w-24",
            "w-24",
            "w-20",
            "w-16",
            "w-28",
            ...(editable ? ["w-14"] : []),
          ]}
          scrollX
          rows={scopedWorkers.map((worker) => [
            ...(showReportingPlatforms ? [<div key={`${worker.id}-reporting`} className="max-w-[150px]"><EntityReportingPlatforms platforms={worker.reportingPlatforms} showLabel={false} /></div>] : []),
            <WorkerAvatar key={`${worker.id}-avatar`} src={worker.avatar} name={worker.name} />,
            <button
              key={`${worker.id}-name`}
              type="button"
              className="cursor-pointer font-medium text-[#0f6b5d] hover:text-[#0b5148] hover:underline"
              onClick={() => setAttendanceWorker(worker)}
            >
              {worker.name}
            </button>,
            worker.phone,
            worker.team,
            worker.workType,
            <WorkerIssueCountBadge
              key={`${worker.id}-issue-count`}
              count={worker.issuedDeviceSuccessCount ?? 0}
              total={worker.issuedDeviceTotalCount ?? 0}
              onClick={() => onViewIssueDetails(worker)}
            />,
            <ProjectStatusBadge key={worker.id} value={worker.status} />,
            worker.entryDate,
            ...(editable ? [<RowActions key={`${worker.id}-actions`} onEdit={() => onEdit(worker.id)} onDelete={() => onDelete(worker.id)} extraActions={[
              ...(worker.status === "在场"
                ? [{
                    label: reissuingWorkerId === worker.id ? "补发中..." : "考勤机补发",
                    icon: Upload,
                    disabled: reissuingWorkerId !== null,
                    onSelect: () => void onReissueWorker(worker),
                  }]
                : []),
              worker.status === "离场"
                ? { label: "进场", icon: LogIn, onSelect: () => openReentry(worker) }
                : { label: "退场", icon: LogOut, onSelect: () => void retireWorker(worker, onRetireWorker) },
              { label: "修改进场日期", icon: CalendarDays, onSelect: () => {
                setEditingEntryWorker(worker);
                setEditingEntryDate(worker.entryDate || dateInputToday());
              } },
              { label: "下载合同模板", icon: FileDown, disabled: downloadingWorkerId === worker.id, onSelect: () => void downloadWorkerContract(projectId, worker, setDownloadingWorkerId) },
            ]} />] : []),
          ])}
          pagination={pagination}
        />
      </div>
      <Dialog open={Boolean(reentryWorker)} onOpenChange={(open) => {
        if (!open && !reentrySaving) setReentryWorker(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>办理进场</DialogTitle>
            <DialogDescription>{reentryWorker?.name ?? "工人"}将恢复为在场状态。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-foreground">
              所属班组
              <Select value={reentryTeamId} onValueChange={setReentryTeamId}>
                <SelectTrigger><SelectValue placeholder="请选择班组" /></SelectTrigger>
                <SelectContent>
                  {teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.unitName} / {team.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-foreground">
              进场日期
              <Input type="date" value={reentryEntryTime} onChange={(event) => setReentryEntryTime(event.target.value)} />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={reentrySaving} onClick={() => setReentryWorker(null)}>取消</Button>
            <Button type="button" disabled={!reentryTeamId || !reentryEntryTime || reentrySaving} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]" onClick={() => void submitReentry()}>
              {reentrySaving ? "提交中..." : "确认进场"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editingEntryWorker)} onOpenChange={(open) => {
        if (!open && !editingEntrySaving) setEditingEntryWorker(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改进场日期</DialogTitle>
            <DialogDescription>修改 {editingEntryWorker?.name ?? "该工人"} 的进场日期。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2 text-sm font-medium text-slate-700 dark:text-foreground">
              当前进场日期
              <div className="rounded-md border bg-[#f8faf9] px-3 py-2 text-sm text-slate-900 dark:bg-background dark:text-foreground">
                {editingEntryWorker?.entryDate || "未设置"}
              </div>
            </div>
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-foreground">
              新进场日期
              <Input type="date" value={editingEntryDate} onChange={(event) => setEditingEntryDate(event.target.value)} />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={editingEntrySaving} onClick={() => setEditingEntryWorker(null)}>取消</Button>
            <Button type="button" disabled={!editingEntryDate || editingEntrySaving} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]" onClick={() => void submitEditEntryTime()}>
              {editingEntrySaving ? "提交中..." : "确认修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <WorkerAttendanceDialog
        open={Boolean(attendanceWorker)}
        worker={attendanceWorker}
        projectId={projectId}
        onOpenChange={(open) => {
          if (!open) setAttendanceWorker(null);
        }}
      />
    </div>
  );
}

function WorkerAttendanceDialog({
  open,
  worker,
  projectId,
  onOpenChange,
}: {
  open: boolean;
  worker: Worker | null;
  projectId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const DIALOG_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
  const [page, setPage] = useState(1);
  const [dialogPageSize, setDialogPageSize] = useState<(typeof DIALOG_PAGE_SIZE_OPTIONS)[number]>(20);
  const [attendanceDate, setAttendanceDate] = useState("");

  useEffect(() => {
    setPage(1);
    setAttendanceDate("");
  }, [open, worker?.id]);

  const queryFilters = useMemo(() => {
    if (!open || !worker) return undefined;
    return {
      worker_id: worker.id,
      page_size: dialogPageSize,
      page,
      ...(attendanceDate ? { attendance_date: attendanceDate } : {}),
    };
  }, [open, worker, page, dialogPageSize, attendanceDate]);

  const attendanceQuery = useProjectAttendanceQuery(projectId, queryFilters);
  const isQueryEnabled = open && Boolean(worker);
  const rawItems = isQueryEnabled ? (attendanceQuery.data?.items ?? []) : [];
  const total = attendanceQuery.data?.total ?? 0;
  const totalPages = getTotalPages(total, dialogPageSize);

  const records: AttendanceRecord[] = useMemo(() => {
    if (!worker) return [];
    return rawItems.map((record) => ({
      id: record.id,
      projectId: record.project_id,
      workerId: record.worker_id,
      worker: worker.name,
      team: worker.team,
      workType: worker.workType,
      workerType: worker.workerType,
      direction: (record.direction === 1 ? "出场" : "进场") as AttendanceRecord["direction"],
      time: formatBeijingDateTime(record.trigger_time) || formatBeijingDateTime(record.original_time) || "",
      device: record.equipment_id ?? record.serial_number ?? "未填写",
      photoUrl: normalizeAttendancePhoto(record.closeup_photo ?? record.photo_path ?? record.overall_photo),
      status: "有效" as const,
    }));
  }, [rawItems, worker]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>考勤记录</DialogTitle>
          <DialogDescription>
            {worker ? `${worker.name} · ${worker.team} · ${worker.workType || "未填写工种"}` : "查看工人考勤记录"}
          </DialogDescription>
        </DialogHeader>

        {/* Date filter */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-muted-foreground">
            <span className="shrink-0">考勤日期</span>
            <Input
              type="date"
              className="h-8 w-44"
              value={attendanceDate}
              onChange={(event) => {
                setAttendanceDate(event.target.value);
                setPage(1);
              }}
            />
          </label>
          {attendanceDate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-slate-500 hover:text-slate-700"
              onClick={() => { setAttendanceDate(""); setPage(1); }}
            >
              清除
            </Button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200 dark:border-border">
          <Table className="min-w-[880px] table-fixed">
            <TableHeader className="bg-[#f8faf9] dark:bg-muted/30">
              <TableRow>
                <TableHead className="w-16 px-3 text-slate-500 dark:text-muted-foreground">照片</TableHead>
                <TableHead className="w-24 text-slate-500 dark:text-muted-foreground">工人</TableHead>
                <TableHead className="w-28 text-slate-500 dark:text-muted-foreground">班组名称</TableHead>
                <TableHead className="w-24 text-slate-500 dark:text-muted-foreground">工种</TableHead>
                <TableHead className="w-24 text-slate-500 dark:text-muted-foreground">工人类型</TableHead>
                <TableHead className="w-20 text-right text-slate-500 dark:text-muted-foreground">进出</TableHead>
                <TableHead className="w-44 text-slate-500 dark:text-muted-foreground">考勤时间</TableHead>
                <TableHead className="w-36 text-slate-500 dark:text-muted-foreground">设备</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isQueryEnabled ? null : attendanceQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                    考勤记录加载中...
                  </TableCell>
                </TableRow>
              ) : attendanceQuery.isError ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-red-600 dark:text-red-400">
                    考勤记录加载失败
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                    暂无考勤记录
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id} className="hover:bg-[#f8faf9]/70 dark:hover:bg-muted/30">
                    <TableCell className="px-3 py-2">
                      <AttendancePhoto src={record.photoUrl} alt={`${record.worker} 考勤照片`} />
                    </TableCell>
                    <TableCell className="truncate font-medium text-slate-800 dark:text-foreground">
                      {record.worker}
                    </TableCell>
                    <TableCell className="truncate text-slate-600 dark:text-muted-foreground">
                      {record.team}
                    </TableCell>
                    <TableCell className="truncate text-slate-600 dark:text-muted-foreground">
                      {record.workType ?? "未填写"}
                    </TableCell>
                    <TableCell className="truncate text-slate-600 dark:text-muted-foreground">
                      {record.workerType ?? "未填写"}
                    </TableCell>
                    <TableCell className="text-right">
                      <AttendanceDirectionBadge direction={record.direction} />
                    </TableCell>
                    <TableCell className="text-sm text-slate-700 dark:text-foreground">
                      {record.time}
                    </TableCell>
                    <TableCell className="truncate text-sm text-slate-600 dark:text-muted-foreground" title={record.device}>
                      {record.device}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-muted-foreground">
            <span>共 {total} 条记录{total > 0 ? `，第 ${page} / ${totalPages} 页` : ""}</span>
            <span className="text-xs">每页</span>
            <select
              value={dialogPageSize}
              onChange={(event) => { setDialogPageSize(Number(event.target.value) as (typeof DIALOG_PAGE_SIZE_OPTIONS)[number]); setPage(1); }}
              className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs text-slate-700 outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background dark:text-foreground"
              aria-label="选择每页条数"
            >
              {DIALOG_PAGE_SIZE_OPTIONS.map((option) => (<option key={option} value={option}>{option} 条</option>))}
            </select>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkerIssueCountBadge({ count, total, onClick }: { count: number; total: number; onClick: () => void }) {
  const completed = total > 0 && count >= total;
  const partial = count > 0 && !completed;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-w-12 items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold transition-colors hover:border-[#0f6b5d] hover:text-[#0f6b5d] focus:outline-none focus:ring-2 focus:ring-[#0f6b5d]/20",
        completed
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          : partial
            ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
          : "border-slate-200 bg-slate-50 text-slate-500 dark:border-border dark:bg-muted dark:text-muted-foreground"
      )}
      title="查看考勤机下发明细"
    >
      {count}/{total}
    </button>
  );
}

function WorkerAvatar({ src, name }: { src?: string | null; name: string }) {
  const fallback = getWorkerAvatarFallback(name);

  return (
    <Avatar size="lg" className="border border-slate-200 bg-emerald-50 dark:border-border dark:bg-emerald-950">
      {src ? <AvatarImage src={src} alt={`${name || "工人"}头像`} className="object-cover" /> : null}
      <AvatarFallback className="bg-emerald-50 font-semibold text-[#0f6b5d] dark:bg-emerald-950 dark:text-emerald-300">
        {fallback}
      </AvatarFallback>
    </Avatar>
  );
}

function getWorkerAvatarFallback(name: string) {
  return (name || "工").trim().slice(0, 1) || "工";
}

function WorkerIssueDetailsDialog({
  open,
  worker,
  reports,
  total,
  isLoading,
  isError,
  onOpenChange,
}: {
  open: boolean;
  worker: Worker | null;
  reports: ConstructionAttendanceDeviceIssueReport[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const successCount = reports.filter((report) => report.status === "success").length;
  const pendingCount = reports.filter((report) => report.status === "pending").length;
  const failedCount = reports.filter((report) => report.status === "failed").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>考勤机下发明细</DialogTitle>
          <DialogDescription>
            {worker ? `${worker.name} · ${worker.phone || worker.idCard || "未填写联系方式"}` : "查看工人在各考勤机的下发记录。"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-4">
          <IssueDetailStat label="记录数" value={total} />
          <IssueDetailStat label="成功" value={successCount} accent="emerald" />
          <IssueDetailStat label="下发中" value={pendingCount} accent="amber" />
          <IssueDetailStat label="失败" value={failedCount} accent="red" />
        </div>

        <div className="max-h-[58vh] overflow-auto rounded-lg border border-slate-200 dark:border-border">
          <Table className="min-w-[860px] table-fixed">
            <TableHeader className="bg-[#f8faf9] dark:bg-muted/30">
              <TableRow>
                <TableHead className="w-[24%] px-4 text-slate-500 dark:text-muted-foreground">考勤机</TableHead>
                <TableHead className="w-[10%] text-slate-500 dark:text-muted-foreground">状态</TableHead>
                <TableHead className="w-[10%] text-slate-500 dark:text-muted-foreground">动作</TableHead>
                <TableHead className="w-[17%] text-slate-500 dark:text-muted-foreground">下发时间</TableHead>
                <TableHead className="w-[39%] text-slate-500 dark:text-muted-foreground">回执/原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                    下发明细加载中
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm text-red-600 dark:text-red-400">
                    下发明细加载失败
                  </TableCell>
                </TableRow>
              ) : reports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                    暂无考勤机下发记录
                  </TableCell>
                </TableRow>
              ) : (
                reports.map((report) => (
                  <TableRow key={report.id} className="hover:bg-[#f8faf9]/70 dark:hover:bg-muted/30">
                    <TableCell className="px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800 dark:text-foreground" title={report.device_name || ""}>
                          {report.device_name || "未关联考勤机"}
                        </div>
                        <div className="mt-1 truncate font-mono text-xs text-slate-500 dark:text-muted-foreground" title={report.serial_number || ""}>
                          {report.serial_number || "-"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <WorkerIssueStatusBadge status={report.status} />
                    </TableCell>
                    <TableCell>
                      <WorkerIssueActionBadge action={report.action} />
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-muted-foreground">
                      {formatBeijingDateTime(report.issued_at) || "-"}
                    </TableCell>
                    <TableCell>
                      <WorkerIssueMessage report={report} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IssueDetailStat({
  label,
  value,
  accent = "slate",
}: {
  label: string;
  value: number;
  accent?: "slate" | "emerald" | "amber" | "red";
}) {
  const accentClass = {
    slate: "text-slate-900 dark:text-foreground",
    emerald: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
    red: "text-red-700 dark:text-red-300",
  }[accent];

  return (
    <div className="rounded-lg border border-slate-200 bg-[#fbfcfc] px-3 py-2 dark:border-border dark:bg-card">
      <div className="text-xs text-slate-500 dark:text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold", accentClass)}>{value}</div>
    </div>
  );
}

function WorkerIssueStatusBadge({ status }: { status: ConstructionAttendanceDeviceIssueStatus }) {
  const config = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    pending: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
    failed: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  }[status];
  const label = status === "success" ? "成功" : status === "pending" ? "下发中" : "失败";

  return (
    <span className={cn("inline-flex rounded-md border px-2 py-1 text-xs font-semibold", config)}>
      {label}
    </span>
  );
}

function WorkerIssueActionBadge({ action }: { action: ConstructionAttendanceDeviceIssueAction }) {
  const config = {
    create: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
    update: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
    delete: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300",
  }[action];
  const label = action === "create" ? "新增" : action === "update" ? "修改" : "删除";

  return (
    <span className={cn("inline-flex rounded-md border px-2 py-1 text-xs font-semibold", config)}>
      {label}
    </span>
  );
}

function WorkerIssueMessage({ report }: { report: ConstructionAttendanceDeviceIssueReport }) {
  const message = readableWorkerIssueMessage(report);
  if (!message) {
    return <span className="text-xs text-slate-400 dark:text-muted-foreground">-</span>;
  }

  return (
    <div
      className={cn(
        "line-clamp-2 max-w-[420px] whitespace-normal break-words text-xs leading-5",
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

function readableWorkerIssueMessage(report: ConstructionAttendanceDeviceIssueReport) {
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
  calendarPagination,
}: {
  records: AttendanceRecord[];
  calendarRows: AttendanceCalendarRow[];
  viewMode: AttendanceViewMode;
  onViewModeChange: (mode: AttendanceViewMode) => void;
  calendarMonth: string;
  onCalendarMonthChange: (month: string) => void;
  pagination: TablePaginationConfig;
  calendarPagination: {
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
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
          headers={["照片", "工人", "班组名称", "工种", "工人类型", "考勤天数", "进出", "考勤时间", "来源", "设备", "甬薪状态"]}
          rows={records.map((record) => [
            <AttendancePhoto key={`${record.id}-photo`} src={record.photoUrl} alt={`${record.worker} 考勤照片`} />,
            record.worker,
            record.team,
            record.workType ?? "未填写",
            record.workerType ?? "未填写",
            record.attendanceDays ?? 0,
            <AttendanceDirectionBadge key={`${record.id}-direction`} direction={record.direction} />,
            record.time,
            record.generated ? <span key={`${record.id}-generated`} className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">生成</span> : "设备",
            record.device,
            <YongxinAttendanceStatus key={`${record.id}-yongxin`} record={record} />,
          ])}
          tableClassName="min-w-[1220px]"
          cellClassNames={["w-16", "w-24", "w-28", "w-24", "w-24", "w-20 text-right", "w-20", "w-44", "w-20", "w-36", "w-32"]}
          scrollX
          pagination={pagination}
        />
      ) : (
        <AttendanceCalendarTable
          key={calendarMonth}
          rows={calendarRows}
          dayCount={dayCount}
          total={calendarPagination.total}
          page={calendarPagination.page}
          pageSize={calendarPagination.pageSize}
          onPageChange={calendarPagination.onPageChange}
          onPageSizeChange={calendarPagination.onPageSizeChange}
        />
      )}
    </div>
  );
}

function formatYongxinJobStatus(status: string) {
  return ({
    pending: "排队中",
    processing: "处理中",
    retry: "等待重试",
    awaiting_result: "等待回执",
    waiting_dependency: "等待前置数据",
    waiting_data: "缺少资料",
    waiting_media: "缺少图片",
    success: "成功",
    completed: "成功",
    failed: "失败",
    delivery_unknown: "结果待核对",
    disabled: "任务已失效",
  } as Record<string, string>)[status] ?? status;
}

function YongxinAttendanceStatus({ record }: { record: AttendanceRecord }) {
  const reporting = record.yongxinReporting;
  const status = reporting?.status ?? "not_configured";
  const presentation: Record<string, { label: string; className: string }> = {
    not_configured: { label: "未启用", className: "border-slate-200 bg-slate-50 text-slate-500" },
    not_reported: { label: "未上报", className: "border-slate-300 bg-white text-slate-600" },
    pending: { label: "排队中", className: "border-blue-200 bg-blue-50 text-blue-700" },
    processing: { label: "处理中", className: "border-blue-200 bg-blue-50 text-blue-700" },
    retry: { label: "等待重试", className: "border-amber-200 bg-amber-50 text-amber-700" },
    awaiting_result: { label: "等待回执", className: "border-violet-200 bg-violet-50 text-violet-700" },
    waiting_dependency: { label: "等待前置", className: "border-amber-200 bg-amber-50 text-amber-700" },
    waiting_data: { label: "缺少资料", className: "border-orange-200 bg-orange-50 text-orange-700" },
    waiting_media: { label: "缺少图片", className: "border-orange-200 bg-orange-50 text-orange-700" },
    success: { label: "成功", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    completed: { label: "成功", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    failed: { label: "失败", className: "border-red-200 bg-red-50 text-red-700" },
    delivery_unknown: { label: "结果待核对", className: "border-rose-200 bg-rose-50 text-rose-700" },
    disabled: { label: "任务已失效", className: "border-slate-200 bg-slate-50 text-slate-500" },
  };
  const current = presentation[status] ?? { label: status, className: "border-slate-200 bg-slate-50 text-slate-600" };
  const details = [
    reporting?.message,
    reporting?.externalRequestId ? `异步流水号：${reporting.externalRequestId}` : null,
    reporting?.updatedAt ? `更新时间：${formatBeijingDateTime(reporting.updatedAt)}` : null,
  ].filter(Boolean).join("\n");
  const href = `/app/admin/platform-integrations?tab=logs&project_id=${encodeURIComponent(record.projectId)}&platform_type=yongxin_v2&keyword=${encodeURIComponent(record.id)}`;

  return (
    <a
      href={href}
      title={details || "点击查看该考勤的甬薪平台日志"}
      className={cn("inline-flex rounded-md border px-2 py-1 text-xs font-semibold hover:underline", current.className)}
    >
      {current.label}
    </a>
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

function AttendanceDirectionBadge({ direction }: { direction: AttendanceRecord["direction"] }) {
  const isOutbound = direction === "出场";
  return (
    <span
      className={cn(
        "inline-flex min-w-12 items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold",
        isOutbound
          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
          : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
      )}
    >
      {direction}
    </span>
  );
}

function AttendanceCalendarTable({
  rows,
  dayCount,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  rows: AttendanceCalendarRow[];
  dayCount: number;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);

  const leftColumns = [
    { key: "worker", width: 96, label: "工人" },
    { key: "team", width: 120, label: "班组名称" },
    { key: "workType", width: 86, label: "工种" },
    { key: "workerType", width: 86, label: "工人类型" },
    { key: "attendanceDays", width: 72, label: "考勤天数" },
    { key: "workingHours", width: 72, label: "工时" },
    { key: "workPoint", width: 72, label: "记工" },
  ] as const;

  const totalRowPages = Math.max(1, Math.ceil(total / pageSize));
  const currentRowPage = Math.min(page, totalRowPages);

  const handlePrevRowPage = () => onPageChange(Math.max(1, page - 1));
  const handleNextRowPage = () => onPageChange(Math.min(totalRowPages, page + 1));

  const getStickyLeft = (index: number) => {
    let left = 0;
    for (let i = 0; i < index; i++) {
      left += leftColumns[i].width;
    }
    return left;
  };

  const stickyHeaderClass = "bg-[#f8faf9] dark:bg-muted/30 border-r border-slate-200 dark:border-border";
  const stickyCellClass = "bg-white dark:bg-background border-r border-slate-200 dark:border-border";
  const dayCellClass = "border-r border-slate-200 dark:border-border";

  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-slate-200 dark:border-border">
      <div className="max-w-full overflow-x-auto">
        <Table className="min-w-[3084px] table-fixed text-[11px]">
          <colgroup>
            <col className="w-[96px]" />
            <col className="w-[120px]" />
            <col className="w-[86px]" />
            <col className="w-[86px]" />
            <col className="w-[72px]" />
            <col className="w-[72px]" />
            <col className="w-[72px]" />
            {days.map((day) => (
              <col key={day} className="w-[80px]" />
            ))}
          </colgroup>
          <TableHeader className="bg-[#f8faf9] dark:bg-muted/30">
            <TableRow>
              {leftColumns.map((col, index) => (
                <TableHead
                  key={col.key}
                  className={cn("px-1 text-xs", stickyHeaderClass)}
                  style={{ position: "sticky", left: getStickyLeft(index), zIndex: 20 }}
                >
                  {col.label}
                </TableHead>
              ))}
              {days.map((day) => (
                <TableHead key={day} className={cn("px-0.5 text-center text-[10px]", dayCellClass)}>
                  {day}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={dayCount + 7} className="h-24 text-center text-sm text-muted-foreground">
                  暂无月度考勤
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.workerId ?? `${row.worker}-${row.team}`}>
                  <TableCell
                    className={cn("truncate px-1 font-medium", stickyCellClass)}
                    style={{ position: "sticky", left: getStickyLeft(0), zIndex: 10 }}
                    title={row.worker}
                  >
                    {row.worker}
                  </TableCell>
                  <TableCell
                    className={cn("truncate px-1 text-slate-500 dark:text-muted-foreground", stickyCellClass)}
                    style={{ position: "sticky", left: getStickyLeft(1), zIndex: 10 }}
                    title={row.team}
                  >
                    {row.team}
                  </TableCell>
                  <TableCell
                    className={cn("truncate px-1 text-slate-500 dark:text-muted-foreground", stickyCellClass)}
                    style={{ position: "sticky", left: getStickyLeft(2), zIndex: 10 }}
                    title={row.workType ?? "未填写"}
                  >
                    {row.workType ?? "未填写"}
                  </TableCell>
                  <TableCell
                    className={cn("truncate px-1 text-slate-500 dark:text-muted-foreground", stickyCellClass)}
                    style={{ position: "sticky", left: getStickyLeft(3), zIndex: 10 }}
                    title={row.workerType ?? "未填写"}
                  >
                    {row.workerType ?? "未填写"}
                  </TableCell>
                  <TableCell
                    className={cn("px-1 text-center font-medium text-slate-700 dark:text-foreground", stickyCellClass)}
                    style={{ position: "sticky", left: getStickyLeft(4), zIndex: 10 }}
                  >
                    {row.attendanceDays ?? 0}
                  </TableCell>
                  <TableCell
                    className={cn("px-1 text-center font-medium text-slate-700 dark:text-foreground", stickyCellClass)}
                    style={{ position: "sticky", left: getStickyLeft(5), zIndex: 10 }}
                    title={`${formatCompactNumber(row.monthlyWorkingHours)} 小时`}
                  >
                    {formatCompactNumber(row.monthlyWorkingHours)}
                  </TableCell>
                  <TableCell
                    className={cn("px-1 text-center font-medium text-slate-700 dark:text-foreground", stickyCellClass)}
                    style={{ position: "sticky", left: getStickyLeft(6), zIndex: 10 }}
                    title={`${formatCompactNumber(row.monthlyWorkPoint)} 工`}
                  >
                    {formatCompactNumber(row.monthlyWorkPoint)}
                  </TableCell>
                  {days.map((day) => {
                    const cell = row.days[day];
                    return (
                      <TableCell key={day} className={cn("px-0.5 align-top", dayCellClass)}>
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

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-2 dark:border-border dark:bg-card">
        <div className="text-xs text-slate-500 dark:text-muted-foreground">
          共 {total} 人，每页 {pageSize} 条
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={currentRowPage <= 1}
            onClick={handlePrevRowPage}
          >
            <ChevronLeft className="mr-1 size-3.5" /> 上一页
          </Button>
          <span className="min-w-[80px] text-center text-xs text-slate-600 dark:text-muted-foreground">
            第 {currentRowPage} / {totalRowPages} 页
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={currentRowPage >= totalRowPages}
            onClick={handleNextRowPage}
          >
            下一页 <ChevronRight className="ml-1 size-3.5" />
          </Button>
          <select
            value={pageSize}
            onChange={(event) => { onPageSizeChange(Number(event.target.value)); onPageChange(1); }}
            className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-border dark:bg-background dark:text-foreground"
          >
            <option value={10}>10 条/页</option>
            <option value={20}>20 条/页</option>
            <option value={50}>50 条/页</option>
          </select>
        </div>
      </div>
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
  editable,
}: {
  data: ConstructionWageListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onImportFile: (file: File) => void;
  onPageChange: (page: number) => void;
  editable: boolean;
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

  // 工资统计采用经典后台风格：白底方角卡片 + 细灰边框 + 蓝色主按钮
  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <WageMetricCell label="发放人数" value={`${summary.employee_count ?? 0} 人`} helper="筛选范围内" />
        <WageMetricCell label="累计应发" value={`${formatCentsAsYuan(summary.payable_amount_cents)} 元`} helper="工资合计" />
        <WageMetricCell label="累计实发" value={`${formatCentsAsYuan(summary.paid_amount_cents)} 元`} helper="已发放" accent="green" />
        <WageMetricCell label="累计未发" value={`${formatCentsAsYuan(summary.unpaid_amount_cents)} 元`} helper="待发放" accent="orange" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8eaec] bg-white px-1 pb-3 dark:border-border dark:bg-transparent">
        <div>
          <h3 className="text-sm font-semibold text-[#303133] dark:text-foreground">工资单列表</h3>
          <p className="mt-0.5 text-xs text-[#909399] dark:text-muted-foreground">
            按发放月份汇总企业工资单与发放金额。
          </p>
        </div>
        {editable ? <div className="flex items-center gap-2">
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
            className="gap-2 rounded-sm bg-[#1890ff] text-white shadow-none hover:bg-[#40a9ff]"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" />
            导入工资表
          </Button>
        </div> : null}
      </div>

      <DataTable
        classic
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
          ...(editable ? ["操作"] : []),
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
          ...(editable
            ? [
                // 操作直接外露为文字按钮，不再收进下拉菜单
                <div key={`${item.id}-actions`} className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    className="text-[#1890ff] hover:text-[#40a9ff]"
                    onClick={() => onEdit(item.id)}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="text-[#f56c6c] hover:text-[#f78989]"
                    onClick={() => onDelete(item.id)}
                  >
                    删除
                  </button>
                </div>,
              ]
            : []),
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

// 工资统计专用的经典风格汇总卡片：白底方角 + 细灰边框，不影响其他页面共用的 MetricCell
function WageMetricCell({
  label,
  value,
  helper,
  accent = "default",
}: {
  label: string;
  value: string;
  helper?: string;
  accent?: "default" | "green" | "orange";
}) {
  const accentClass = {
    default: "text-[#303133] dark:text-foreground",
    green: "text-[#52c41a] dark:text-green-400",
    orange: "text-[#fa8c16] dark:text-amber-300",
  }[accent];

  return (
    <div className="min-w-0 rounded-sm border border-[#e8eaec] bg-white px-4 py-3 dark:border-border dark:bg-card">
      <div className="text-xs text-[#909399] dark:text-muted-foreground">{label}</div>
      <div className={cn("mt-1 truncate text-xl font-semibold tracking-normal", accentClass)}>{value}</div>
      {helper ? <div className="mt-0.5 text-xs text-[#c0c4cc] dark:text-muted-foreground">{helper}</div> : null}
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
        if (activeTab === "班组信息" && key === "is_manage_team") {
          setState((current) => ({
            ...current,
            is_manage_team: value,
            work_type: value === "true" ? "1001" : current.work_type === "1001" ? "" : current.work_type,
          }));
          return;
        }
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
  if (activeTab === "项目工人" || activeTab === "考勤记录") return "高级导出";
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

function lastDateOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function formatPayrollMonth(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 7);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  return value.replace("T", " ").slice(0, 16);
}

function formatBeijingDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace("T", " ").slice(0, 19);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .format(date)
    .replace(/\//g, "-");
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
  scrollX = false,
  classic = false,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
  pagination?: TablePaginationConfig;
  tableClassName?: string;
  cellClassNames?: string[];
  scrollX?: boolean;
  // 经典后台风格：白底表头黑字、细灰边框全格线、内容居中，目前仅工资统计启用
  classic?: boolean;
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
    <div className={cn(
      "min-w-0 max-w-full overflow-hidden border",
      classic ? "rounded-sm border-[#e8eaec] dark:border-border" : "rounded-lg border-slate-200 dark:border-border"
    )}>
      <div className={cn("max-w-full", scrollX ? "overflow-x-auto" : "overflow-x-hidden")}>
        <Table className={cn("w-full table-fixed", tableClassName)}>
          <TableHeader>
            <TableRow
              className={cn(
                classic
                  ? "border-b border-[#e8eaec] bg-white hover:bg-white dark:border-border dark:bg-background dark:hover:bg-background"
                  : "bg-[#f8faf9] hover:bg-[#f8faf9] dark:bg-muted/30 dark:hover:bg-muted/30"
              )}
            >
              {headers.map((header, index) => (
                <TableHead
                  key={header}
                  className={cn(
                    "px-4",
                    classic
                      ? "border-r border-[#e8eaec] text-center font-semibold text-[#303133] last:border-r-0 dark:border-border dark:text-foreground"
                      : "text-slate-500 dark:text-muted-foreground",
                    cellClassNames?.[index]
                  )}
                >
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
                <TableRow
                  key={`${currentPage}-${rowIndex}`}
                  className={cn(
                    classic
                      ? "border-b border-[#ebeef5] text-[#606266] hover:bg-[#f5f7fa] dark:border-border dark:text-foreground dark:hover:bg-muted/30"
                      : "hover:bg-[#f8faf9]/70 dark:hover:bg-muted/30"
                  )}
                >
                  {row.map((cell, cellIndex) => (
                    <TableCell
                      key={cellIndex}
                      className={cn(
                        "whitespace-nowrap px-2",
                        classic && "border-r border-[#ebeef5] text-center last:border-r-0 dark:border-border",
                        cellClassNames?.[cellIndex]
                      )}
                    >
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
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm",
            classic
              ? "border-[#e8eaec] bg-white text-[#606266] dark:border-border dark:bg-background dark:text-muted-foreground"
              : "border-slate-200 bg-[#f8faf9] text-slate-500 dark:border-border dark:bg-muted/30 dark:text-muted-foreground"
          )}
        >
          <span>
            显示 {from}-{to} 条，共 {total} 条
          </span>
          <div className="flex items-center gap-2">
            {pagination?.onPageSizeChange && (
              <>
                <span className="text-xs">每页</span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    pagination.onPageSizeChange?.(Number(event.target.value));
                  }}
                  className={cn(
                    "h-8 rounded-md border bg-white px-2 text-sm outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background dark:text-foreground",
                    classic && "border-[#dcdfe6] text-[#606266] dark:border-border dark:text-foreground"
                  )}
                  aria-label="选择每页条数"
                >
                  {PROJECT_PAGE_SIZE_OPTIONS.map((option) => (<option key={option} value={option}>{option} 条</option>))}
                </select>
              </>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-8 gap-1 bg-white dark:bg-background",
                classic
                  ? "rounded-sm border-[#dcdfe6] text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff] dark:border-border dark:text-foreground"
                  : "border-slate-200 dark:border-border"
              )}
              disabled={currentPage <= 1}
              onClick={() => changePage(currentPage - 1)}
            >
              <ChevronLeft className="size-4" />
              上一页
            </Button>
            <span className={cn("min-w-12 text-center text-xs font-medium", classic ? "text-[#1890ff]" : "text-slate-600 dark:text-muted-foreground")}>
              {currentPage} / {getTotalPages(total, pageSize)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-8 gap-1 bg-white dark:bg-background",
                classic
                  ? "rounded-sm border-[#dcdfe6] text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff] dark:border-border dark:text-foreground"
                  : "border-slate-200 dark:border-border"
              )}
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
    reportingPlatforms: unit.reporting_platforms,
  };
}

function apiTeamToDetail(team: ConstructionTeam, units: ApiConstructionUnit[], workerCount = 0): Team {
  const unit = units.find((item) => item.id === team.unit_id);

  return {
    id: team.id,
    projectId: team.project_id,
    isManageTeam: team.is_manage_team,
    unitId: team.unit_id,
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
    reportingPlatforms: team.reporting_platforms,
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
    avatar: normalizeWorkerAvatar(worker.avatar),
    gender: worker.gender === 0 ? "女" : "男",
    idCard: worker.id_card ?? "",
    phone: worker.phone ?? "",
    team: team?.name ?? "未匹配班组",
    unit: unit?.company_name ?? "未匹配单位",
    workType: getFieldOptionLabel(workerFormFields, "work_type", worker.work_type),
    workerType: getFieldOptionLabel(workerFormFields, "worker_type", worker.worker_type),
    issuedDeviceSuccessCount: worker.attendance_issue_success_device_count ?? 0,
    issuedDeviceTotalCount: worker.attendance_device_total_count ?? 0,
    reportingPlatforms: worker.reporting_platforms,
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
    workerId: record.worker_id,
    worker: worker?.name ?? "未匹配工人",
    team: team?.name ?? "未匹配班组",
    workType: getFieldOptionLabel(workerFormFields, "work_type", worker?.work_type, "未填写"),
    workerType: getFieldOptionLabel(workerFormFields, "worker_type", worker?.worker_type, "未填写"),
    direction: record.direction === 1 ? "出场" : "进场",
    time: formatBeijingDateTime(record.trigger_time) || formatBeijingDateTime(record.original_time),
    device: record.equipment_id ?? record.serial_number ?? "未填写",
    photoUrl: normalizeAttendancePhoto(record.closeup_photo ?? record.photo_path ?? record.overall_photo),
    generated: record.is_generated,
    status: "有效",
    yongxinReporting: record.yongxin_reporting ? {
      enabled: record.yongxin_reporting.enabled,
      jobId: record.yongxin_reporting.job_id,
      status: record.yongxin_reporting.status,
      message: record.yongxin_reporting.message,
      externalRequestId: record.yongxin_reporting.external_request_id,
      remoteState: record.yongxin_reporting.remote_state,
      updatedAt: record.yongxin_reporting.updated_at,
    } : undefined,
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

function normalizeWorkerAvatar(value: string | null | undefined) {
  const source = value?.trim();
  if (!source) return "";
  if (/^(https?:|data:|blob:)/i.test(source)) return source;
  if (source.startsWith("//")) return `${window.location.protocol}${source}`;
  if (source.startsWith("/9j") || source.startsWith("iVBOR") || source.startsWith("R0lGOD")) {
    return `data:image/jpeg;base64,${source}`;
  }
  if (source.startsWith("/")) return source;

  const apiBase = getApiUrl().replace(/\/$/, "");
  return `${apiBase}/${source}`;
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
