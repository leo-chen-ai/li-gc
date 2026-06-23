import { useMemo, useState } from "react";
import { FileClock, Search, UserRound } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { useProjectOptionsQuery } from "@/features/projects/hooks/use-construction-projects";

type IssueAction = "新增" | "修改" | "删除";
type IssueStatus = "成功" | "下发中" | "失败";

type IssueReportRecord = {
  id: string;
  project_id: string;
  project_name: string;
  worker_name: string;
  avatar_url: string | null;
  device_name: string;
  issued_at: string;
  status: IssueStatus;
  action: IssueAction;
};

const fallbackReports: IssueReportRecord[] = [
  {
    id: "issue-1",
    project_id: "fallback-1",
    project_name: "淮安高铁商务区综合体项目",
    worker_name: "张建国",
    avatar_url: null,
    device_name: "南门进场考勤机",
    issued_at: "2026-06-19 08:12",
    status: "成功",
    action: "新增",
  },
  {
    id: "issue-2",
    project_id: "fallback-1",
    project_name: "淮安高铁商务区综合体项目",
    worker_name: "李红梅",
    avatar_url: null,
    device_name: "东门通用考勤机",
    issued_at: "2026-06-19 09:24",
    status: "下发中",
    action: "修改",
  },
  {
    id: "issue-3",
    project_id: "fallback-2",
    project_name: "山淮新能源装备厂房二期",
    worker_name: "周海",
    avatar_url: null,
    device_name: "生活区出场考勤机",
    issued_at: "2026-06-18 17:35",
    status: "失败",
    action: "删除",
  },
];

export function AttendanceDeviceIssueReportsPage() {
  const projectsQuery = useProjectOptionsQuery();
  const projects = projectsQuery.data ?? [];
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [keyword, setKeyword] = useState("");

  const reports = useMemo<IssueReportRecord[]>(() => {
    if (projects.length === 0) return fallbackReports;

    return fallbackReports.map((report, index) => ({
      ...report,
      project_id: projects[index % projects.length]?.id ?? report.project_id,
      project_name: projects[index % projects.length]?.name ?? report.project_name,
    }));
  }, [projects]);
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name || project.id])),
    [projects]
  );

  const filteredReports = useMemo(() => {
    const normalizedKeyword = keyword.trim();

    return reports.filter((report) => {
      const project = projects.find((item) => item.id === report.project_id);
      const projectName = project?.name || report.project_name;
      const matchesProject = !selectedProjectId || report.project_id === selectedProjectId;
      const matchesKeyword =
        !normalizedKeyword ||
        [
          report.worker_name,
          report.device_name,
          report.status,
          report.action,
          projectName,
        ]
          .filter(Boolean)
          .join(" ")
          .includes(normalizedKeyword);

      return matchesProject && matchesKeyword;
    });
  }, [keyword, projects, reports, selectedProjectId]);

  const successCount = filteredReports.filter((report) => report.status === "成功").length;
  const pendingCount = filteredReports.filter((report) => report.status === "下发中").length;
  const failedCount = filteredReports.filter((report) => report.status === "失败").length;

  return (
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="grid gap-4 border-b border-slate-100 px-5 py-4 dark:border-border lg:grid-cols-[minmax(260px,1fr)_minmax(420px,1.2fr)] lg:items-start">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              <FileClock className="size-3.5" />
              考勤机管理
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-normal">考勤机人员下发报告</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
              按项目查看人员资料下发到考勤机的动作、时间和状态。
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <CompactStat label="当前记录" value={filteredReports.length} helper="筛选结果" />
            <CompactStat label="成功" value={successCount} helper="已完成下发" accent="teal" />
            <CompactStat label="下发中" value={pendingCount} helper="等待设备回执" accent="amber" />
            <CompactStat label="失败" value={failedCount} helper="需要重试处理" accent="red" />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-[#f8faf9] px-5 py-3 dark:bg-muted/30">
          <label className="min-w-[260px] flex-1 space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">选择项目</span>
            <ProjectSearchSelect
              value={selectedProjectId}
              onValueChange={setSelectedProjectId}
              includeAllOption
              allOptionLabel="全部项目"
              disabled={projectsQuery.isLoading}
            />
          </label>

          <label className="min-w-[280px] flex-1 space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">搜索</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索姓名、考勤机、状态、动作"
                className="h-10 rounded-lg border-slate-200 bg-white pl-9 focus-visible:border-[#0f6b5d] focus-visible:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
              />
            </div>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-border">
          <h2 className="text-base font-semibold tracking-normal">下发记录</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
            {projectsQuery.isLoading ? "项目加载中" : `当前筛选 ${filteredReports.length} 条`}
          </p>
        </div>

        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-[#f8faf9] hover:bg-[#f8faf9] dark:bg-muted/30 dark:hover:bg-muted/30">
              <TableHead className="w-[220px] px-5 text-slate-500 dark:text-muted-foreground">姓名</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">考勤机</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">下发时间</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">下发状态</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">动作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredReports.length > 0 ? (
              filteredReports.map((report) => (
                <TableRow key={report.id} className="hover:bg-[#f8faf9]/70 dark:hover:bg-muted/30">
                  <TableCell className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9 border border-slate-200 dark:border-border">
                        {report.avatar_url ? <AvatarImage src={report.avatar_url} alt={report.worker_name} /> : null}
                        <AvatarFallback className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          {report.worker_name.slice(0, 1) || <UserRound className="size-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{report.worker_name}</div>
                        <div className="mt-1 truncate text-xs text-slate-500 dark:text-muted-foreground">
                          {projectNameById.get(report.project_id) || report.project_name}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-700 dark:text-muted-foreground">{report.device_name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-700 dark:text-muted-foreground">{report.issued_at}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={report.status} />
                  </TableCell>
                  <TableCell>
                    <ActionBadge action={report.action} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center text-sm text-slate-500 dark:text-muted-foreground">
                  暂无符合条件的下发记录
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
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

function StatusBadge({ status }: { status: IssueStatus }) {
  const className = {
    成功: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    下发中: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
    失败: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  }[status];

  return (
    <Badge variant="outline" className={`rounded-md ${className}`}>
      {status}
    </Badge>
  );
}

function ActionBadge({ action }: { action: IssueAction }) {
  const className = {
    新增: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
    修改: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
    删除: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
  }[action];

  return (
    <Badge variant="outline" className={`rounded-md ${className}`}>
      {action}
    </Badge>
  );
}
