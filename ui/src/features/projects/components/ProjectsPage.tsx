import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Pencil,
  MapPin,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildDefaultFormState,
  buildFormStateFromRecord,
  buildPayloadFromForm,
  projectFormFields,
  type ConstructionFormState,
} from "../data/construction-form-fields";
import type { Project } from "../data/mock-projects";
import {
  useCreateProjectMutation,
  useDeleteProjectMutation,
  useProjectsPageQuery,
  useUpdateProjectMutation,
} from "../hooks/use-construction-projects";
import type {
  ConstructionProject,
  ConstructionProjectPayload,
} from "../types/construction-types";
import { formatProjectTitle } from "../lib/project-title";
import { buildProjectListParams } from "../lib/project-table-operations";
import { ConstructionRecordForm } from "./ConstructionRecordForm";
import { ProjectStatusBadge } from "./ProjectStatusBadge";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
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
const PROJECT_STATUS_FILTER: Partial<Record<Project["status"], number>> = {
  在建: 1,
  筹备: 2,
  完工: 6,
  停工: 7,
  竣工: 4,
};

type ProjectRow = Project & {
  source: "api";
  raw?: ConstructionProject;
};

export function ProjectsPage() {
  const navigate = useNavigate();
  const createProject = useCreateProjectMutation();
  const deleteProject = useDeleteProjectMutation();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("全部");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [formOpen, setFormOpen] = useState(false);
  const [projectForm, setProjectForm] = useState<ConstructionFormState>(() => buildDefaultFormState(projectFormFields));
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectPendingDelete, setProjectPendingDelete] = useState<ProjectRow | null>(null);
  const updateProject = useUpdateProjectMutation(editingProjectId ?? "");
  const projectListFilters = useMemo(
    () =>
      buildProjectListParams({
        page,
        pageSize,
        keyword,
        status: status === "全部" ? undefined : PROJECT_STATUS_FILTER[status as Project["status"]],
      }),
    [keyword, page, pageSize, status]
  );
  const projectsQuery = useProjectsPageQuery(projectListFilters);
  const realProjects = useMemo(() => projectsQuery.data?.items ?? [], [projectsQuery.data]);
  const projectRows = useMemo<ProjectRow[]>(() => {
    return realProjects.map(apiProjectToRow);
  }, [realProjects]);

  const projectTotal = projectsQuery.data?.total ?? 0;
  const totalWorkers = projectRows.reduce((sum, project) => sum + project.workerCount, 0);
  const totalAttendance = projectRows.reduce((sum, project) => sum + project.attendanceToday, 0);
  const buildingProjects = projectRows.filter((project) => project.status === "在建").length;
  const focusProjects = projectRows.filter((project) => project.risk !== "正常").length;
  const averageAttendance = totalWorkers > 0 ? Math.round((totalAttendance / totalWorkers) * 100) : 0;
  const statusOptions = ["全部", "在建", "筹备", "完工", "停工", "竣工"];
  const pageCount = Math.max(1, Math.ceil(projectTotal / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedProjects = projectRows;
  const rangeStart = projectTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, projectTotal);

  const handleOpenProject = (projectId: string) => {
    navigate({ to: "/app/admin/projects/$projectId", params: { projectId } });
  };
  const isSaving = createProject.isPending || updateProject.isPending;

  const openCreateForm = () => {
    setEditingProjectId(null);
    setProjectForm(buildDefaultFormState(projectFormFields));
    setFormOpen(true);
  };

  const openEditForm = (project: ProjectRow) => {
    setEditingProjectId(project.id);
    setProjectForm(projectToForm(project));
    setFormOpen(true);
  };

  const handleSubmitProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectForm.name?.trim()) {
      toast.error("请填写项目名称");
      return;
    }

    try {
      const payload = buildPayloadFromForm(projectFormFields, projectForm) as ConstructionProjectPayload;
      if (editingProjectId) {
        await updateProject.mutateAsync(payload);
        toast.success("项目已修改");
      } else {
        await createProject.mutateAsync(payload);
        toast.success("项目已新增");
      }
      setFormOpen(false);
      setEditingProjectId(null);
      setProjectForm(buildDefaultFormState(projectFormFields));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : editingProjectId ? "项目修改失败" : "项目新增失败");
    }
  };

  const handleDeleteProject = async () => {
    if (!projectPendingDelete || projectPendingDelete.source !== "api") {
      setProjectPendingDelete(null);
      return;
    }

    try {
      await deleteProject.mutateAsync(projectPendingDelete.id);
      toast.success("项目已删除");
      setProjectPendingDelete(null);
    } catch {
      toast.error("项目删除失败");
    }
  };

  return (
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="grid gap-3 border-b border-slate-100 px-4 py-3 dark:border-border lg:grid-cols-[minmax(220px,0.7fr)_minmax(520px,1.3fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <ClipboardList className="size-3.5" />
              项目台账
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-normal">项目管理</h1>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <CompactStat label="项目总数" value={projectTotal} helper={`${buildingProjects} 个在建（当前页）`} />
            <CompactStat label="在册工人" value={totalWorkers} helper="当前页合计" accent="teal" />
            <CompactStat label="今日打卡" value={totalAttendance} helper={`平均出勤 ${averageAttendance}%`} accent="teal" />
            <CompactStat label="重点关注" value={`${focusProjects} 个`} helper="关注/预警项目" accent="amber" />
          </div>

          <Button
            className="h-9 gap-2 justify-self-start bg-[#0f6b5d] text-white hover:bg-[#0b5148] lg:justify-self-end"
            onClick={openCreateForm}
          >
            <Plus className="size-4" />
            新增项目
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-[#f8faf9] px-4 py-2.5 dark:bg-muted/30">
          <div className="relative min-w-[280px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                setPage(1);
              }}
              placeholder="搜索项目名称、建设单位、承包单位"
              className="h-10 rounded-lg border-slate-200 bg-white pl-9 focus-visible:border-[#0f6b5d] focus-visible:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {statusOptions.map((item) => (
              <Button
                key={item}
                type="button"
                variant="outline"
                size="sm"
                className={
                  status === item
                    ? "h-9 border-[#0f6b5d] bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
                    : "h-9 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-border dark:bg-background dark:text-muted-foreground dark:hover:bg-muted/50 dark:hover:text-foreground"
                }
                onClick={() => {
                  setStatus(item);
                  setPage(1);
                }}
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <Table className="min-w-[1380px]">
          <TableHeader>
            <TableRow className="bg-[#f8faf9] hover:bg-[#f8faf9] dark:bg-muted/30 dark:hover:bg-muted/30">
              <TableHead className="w-[430px] px-5 text-slate-500 dark:text-muted-foreground">项目名称</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">所在地</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">建设 / 总包</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">项目经理</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">人员班组</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">今日考勤</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedProjects.length > 0 ? (
              paginatedProjects.map((project) => (
              <TableRow
                key={project.id}
                className="cursor-pointer hover:bg-[#f8faf9]/70 dark:hover:bg-muted/30"
                onDoubleClick={() => handleOpenProject(project.id)}
              >
                <TableCell className="px-5 py-4">
                  <div className="w-[390px] space-y-1">
                    <Link
                      to="/app/admin/projects/$projectId"
                      params={{ projectId: project.id }}
                      title={project.name}
                      className="block truncate font-medium text-slate-950 hover:text-[#0f6b5d] hover:underline dark:text-foreground dark:hover:text-primary"
                    >
                      {formatProjectTitle(project.name)}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-muted-foreground">
                      <Badge variant="outline" className="rounded-md border-slate-200 bg-white text-slate-500 dark:border-border dark:bg-background dark:text-muted-foreground">
                        {project.code}
                      </Badge>
                      <CalendarDays className="size-3.5" />
                      <span>{project.startDate}</span>
                      <span>至</span>
                      <span>{project.finishDate}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex max-w-[190px] items-center gap-1.5 text-sm">
                    <MapPin className="size-3.5 shrink-0 text-slate-400 dark:text-muted-foreground" />
                    <span className="truncate">{project.location}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <ProjectStatusBadge value={project.status} />
                </TableCell>
                <TableCell>
                  <div className="max-w-[220px] truncate text-sm">{project.buildUnit}</div>
                  <div className="mt-1 max-w-[220px] truncate text-xs text-slate-500 dark:text-muted-foreground">
                    {project.contractor}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium text-slate-800 dark:text-foreground">{project.manager}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">{project.managerPhone}</div>
                </TableCell>
                <TableCell>
                  <div className="inline-flex items-center gap-1.5 text-sm">
                    <Users className="size-3.5 text-slate-400 dark:text-muted-foreground" />
                    {project.workerCount} 人
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">{project.teamCount} 个班组</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 dark:text-foreground">{project.attendanceToday}</span>
                    <Badge variant="outline" className="rounded-md border-slate-200 bg-white dark:border-border dark:bg-background">
                      {project.attendanceRate}%
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-[#0f6b5d] hover:bg-emerald-50 hover:text-[#0b5148] dark:text-primary dark:hover:bg-accent dark:hover:text-accent-foreground"
                      onClick={() => handleOpenProject(project.id)}
                    >
                      详情
                      <ChevronRight className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-slate-600 hover:bg-slate-50 dark:text-muted-foreground dark:hover:bg-muted/40"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditForm(project);
                      }}
                    >
                      <Pencil className="size-4" />
                      编辑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                      onClick={(event) => {
                        event.stopPropagation();
                        setProjectPendingDelete(project);
                      }}
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
                  {projectsQuery.isLoading
                    ? "正在加载项目数据"
                    : projectsQuery.isError
                      ? "项目数据加载失败，请重新登录或检查后端服务"
                      : "暂无符合条件的项目"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-3 border-t border-slate-100 bg-[#f8faf9] px-5 py-3 text-sm text-slate-500 dark:border-border dark:bg-muted/30 dark:text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
          <span>
            显示 {rangeStart}-{rangeEnd} / 共 {projectTotal} 条记录
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs">每页</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                setPage(1);
              }}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background dark:text-foreground"
              aria-label="选择每页条数"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} 条
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-slate-200 bg-white dark:border-border dark:bg-background"
              disabled={currentPage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              上一页
            </Button>
            <span className="min-w-16 text-center text-xs text-slate-500 dark:text-muted-foreground">
              第 {currentPage} / {pageCount} 页
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-slate-200 bg-white dark:border-border dark:bg-background"
              disabled={currentPage >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editingProjectId ? "编辑项目" : "新增项目"}</DialogTitle>
            <DialogDescription>
              录入项目台账字段，平台对接字段暂不纳入。
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleSubmitProject}>
            <ConstructionRecordForm
              fields={projectFormFields}
              state={projectForm}
              onChange={(key, value) => setProjectForm((current) => ({ ...current, [key]: value }))}
              onBulkChange={(values) => setProjectForm((current) => ({ ...current, ...values }))}
              uploadContext={{ bizType: "project", bizId: editingProjectId ?? undefined }}
              maxHeightClassName="max-h-[68vh]"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isSaving} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]">
                {isSaving ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(projectPendingDelete)} onOpenChange={(open) => !open && setProjectPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除项目</DialogTitle>
            <DialogDescription>
              删除后该项目下单位、班组、工人与考勤记录会一并清理。确认删除
              {projectPendingDelete ? `「${projectPendingDelete.name}」` : ""}？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectPendingDelete(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteProject} disabled={deleteProject.isPending}>
              {deleteProject.isPending ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type CompactStatProps = {
  label: string;
  value: number | string;
  helper: string;
  accent?: "slate" | "teal" | "amber";
};

function CompactStat({ label, value, helper, accent = "slate" }: CompactStatProps) {
  const accentClass = {
    slate: "text-slate-950 dark:text-foreground",
    teal: "text-[#0f6b5d] dark:text-primary",
    amber: "text-amber-700 dark:text-amber-300",
  }[accent];

  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-[#f8faf9] px-3 py-2 dark:border-border dark:bg-muted/30">
      <div className="truncate text-xs font-medium text-slate-500 dark:text-muted-foreground">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold leading-none ${accentClass}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500 dark:text-muted-foreground">{helper}</div>
    </div>
  );
}

function apiProjectToRow(project: ConstructionProject): ProjectRow {
  const status = PROJECT_STATUS_LABEL[project.status ?? 1] ?? "在建";
  const startDate = project.start_date ?? "";
  const finishDate = project.finish_date ?? "";
  const laborCost = project.labor_cost == null ? "" : `${project.labor_cost} 万元`;

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
    startDate,
    finishDate,
    investment: project.invest_total == null ? "" : `${project.invest_total} 万元`,
    laborCost,
    workerCount: project.worker_count ?? 0,
    teamCount: project.team_count ?? 0,
    unitCount: project.unit_count ?? 0,
    attendanceToday: project.attendance_today ?? 0,
    attendanceRate: project.attendance_rate ?? 0,
    progress: 0,
    risk: "正常",
    realNameManager: project.real_name_manager ?? "未填写",
    laborManager: project.labor_manager ?? "未填写",
    workPermit: project.work_permit ?? "待办理",
    area: project.acreage == null ? "" : `${project.acreage} 平方米`,
    coordinates: [project.longitude, project.latitude].filter(Boolean).join(", "),
    source: "api",
    raw: project,
  };
}

function projectToForm(project: ProjectRow): ConstructionFormState {
  return buildFormStateFromRecord(projectFormFields, project.raw as Record<string, unknown> | undefined);
}
