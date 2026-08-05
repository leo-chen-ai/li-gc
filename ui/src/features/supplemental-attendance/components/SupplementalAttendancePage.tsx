import { Link } from "@tanstack/react-router";
import {
  Activity,
  CalendarCog,
  CheckCircle2,
  Clock3,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ServerCog,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ProjectSearchSelect } from "@/features/projects/components/ProjectSearchSelect";
import { cn } from "@/lib/utils";
import { useSupplementalAttendanceRecordsQuery } from "../hooks";
import {
  supplementalDeviceStatusLabel,
  supplementalSendStatusLabel,
} from "../status";
import type {
  SupplementalAttendanceDeviceStatus,
  SupplementalAttendanceRecord,
  SupplementalAttendanceSendStatus,
  SupplementalAttendanceSummary,
} from "../types";

const PAGE_SIZE = 20;
const emptySummary: SupplementalAttendanceSummary = {
  total: 0,
  unassigned: 0,
  pending_send: 0,
  sent: 0,
  device_success: 0,
  device_failed: 0,
};

export function SupplementalAttendancePage() {
  const [projectId, setProjectId] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [keyword, setKeyword] = useState("");
  const [sendStatus, setSendStatus] = useState<
    SupplementalAttendanceSendStatus | "all"
  >("all");
  const [deviceStatus, setDeviceStatus] = useState<
    SupplementalAttendanceDeviceStatus | "all"
  >("all");
  const [page, setPage] = useState(1);
  const deferredKeyword = useDeferredValue(keyword.trim());

  const filters = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      project_id: projectId || undefined,
      keyword: deferredKeyword || undefined,
      month: month || undefined,
      send_status: sendStatus === "all" ? undefined : sendStatus,
      device_status: deviceStatus === "all" ? undefined : deviceStatus,
    }),
    [deferredKeyword, deviceStatus, month, page, projectId, sendStatus],
  );
  const recordsQuery = useSupplementalAttendanceRecordsQuery(filters);
  const records = recordsQuery.data?.items ?? [];
  const total = recordsQuery.data?.total ?? 0;
  const summary = recordsQuery.data?.summary ?? emptySummary;
  const pageSize = recordsQuery.data?.page_size ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const resetFilters = () => {
    setProjectId("");
    setMonth(currentMonth());
    setKeyword("");
    setSendStatus("all");
    setDeviceStatus("all");
    setPage(1);
  };

  return (
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      <PageHeader
        updatedAt={recordsQuery.dataUpdatedAt}
        refreshing={recordsQuery.isFetching}
        onRefresh={() => void recordsQuery.refetch()}
      />
      <SummaryCards summary={summary} />
      <FilterPanel
        projectId={projectId}
        month={month}
        keyword={keyword}
        sendStatus={sendStatus}
        deviceStatus={deviceStatus}
        onProjectChange={(value) => {
          setProjectId(value);
          setPage(1);
        }}
        onMonthChange={(value) => {
          setMonth(value);
          setPage(1);
        }}
        onKeywordChange={(value) => {
          setKeyword(value);
          setPage(1);
        }}
        onSendStatusChange={(value) => {
          setSendStatus(value);
          setPage(1);
        }}
        onDeviceStatusChange={(value) => {
          setDeviceStatus(value);
          setPage(1);
        }}
        onReset={resetFilters}
      />

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-border dark:bg-card">
        {recordsQuery.isError ? (
          <QueryMessage tone="error">
            {recordsQuery.error instanceof Error
              ? recordsQuery.error.message
              : "补考勤记录加载失败"}
          </QueryMessage>
        ) : null}
        <DesktopRecords records={records} loading={recordsQuery.isLoading} />
        <MobileRecords records={records} loading={recordsQuery.isLoading} />
        <PaginationFooter
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          loading={recordsQuery.isFetching}
          onPageChange={setPage}
        />
      </section>
    </div>
  );
}

function PageHeader({
  updatedAt,
  refreshing,
  onRefresh,
}: {
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-[#103c36] text-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-5 px-5 py-5 md:px-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-white/10 px-3 py-1 text-xs text-emerald-100">
            <Activity className="size-3.5" />
            15 秒自动刷新
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            补考勤全链路
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-emerald-50/75">
            从平台任务发送到考勤机最终回执分段展示，便于定位未分配、发送失败和设备处理失败。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-emerald-50/70">
            最近刷新：{updatedAt ? formatDateTime(updatedAt) : "尚未刷新"}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn("mr-2 size-4", refreshing && "animate-spin")}
            />
            立即刷新
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <Link to="/app/admin/managed-attendance">
              <CalendarCog className="mr-2 size-4" />
              托管配置
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function SummaryCards({ summary }: { summary: SupplementalAttendanceSummary }) {
  const cards = [
    { label: "记录总数", value: summary.total, icon: Activity, tone: "slate" },
    {
      label: "未分配设备",
      value: summary.unassigned,
      icon: Unplug,
      tone: "amber",
    },
    {
      label: "待平台发送",
      value: summary.pending_send,
      icon: Clock3,
      tone: "blue",
    },
    { label: "平台已发送", value: summary.sent, icon: Send, tone: "teal" },
    {
      label: "设备成功",
      value: summary.device_success,
      icon: CheckCircle2,
      tone: "green",
    },
    {
      label: "设备失败",
      value: summary.device_failed,
      icon: TriangleAlert,
      tone: "red",
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border bg-white p-3 shadow-sm dark:bg-card"
        >
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{card.label}</span>
            <card.icon className={cn("size-4", summaryIconClass(card.tone))} />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}

type FilterPanelProps = {
  projectId: string;
  month: string;
  keyword: string;
  sendStatus: SupplementalAttendanceSendStatus | "all";
  deviceStatus: SupplementalAttendanceDeviceStatus | "all";
  onProjectChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onSendStatusChange: (value: SupplementalAttendanceSendStatus | "all") => void;
  onDeviceStatusChange: (
    value: SupplementalAttendanceDeviceStatus | "all",
  ) => void;
  onReset: () => void;
};

function FilterPanel(props: FilterPanelProps) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm dark:bg-card">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.3fr)_170px_minmax(210px,1fr)_190px_190px_auto]">
        <ProjectSearchSelect
          value={props.projectId}
          onValueChange={props.onProjectChange}
          includeAllOption
          allOptionLabel="全部项目"
        />
        <Input
          type="month"
          aria-label="考勤月份"
          value={props.month}
          onChange={(event) => props.onMonthChange(event.target.value)}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={props.keyword}
            onChange={(event) => props.onKeywordChange(event.target.value)}
            placeholder="搜索人员、身份证、设备"
          />
        </div>
        <StatusSelect
          value={props.sendStatus}
          placeholder="平台发送状态"
          options={[
            ["all", "全部发送状态"],
            ["unassigned", "未分配设备"],
            ["pending", "待发送"],
            ["processing", "发送中"],
            ["delivered", "平台已送达"],
            ["failed", "发送失败"],
            ["skipped", "已跳过"],
          ]}
          onChange={(value) =>
            props.onSendStatusChange(
              value as SupplementalAttendanceSendStatus | "all",
            )
          }
        />
        <StatusSelect
          value={props.deviceStatus}
          placeholder="考勤机返回状态"
          options={[
            ["all", "全部设备状态"],
            ["pending", "等待返回"],
            ["accepted", "已受理"],
            ["success", "处理成功"],
            ["failed", "处理失败"],
          ]}
          onChange={(value) =>
            props.onDeviceStatusChange(
              value as SupplementalAttendanceDeviceStatus | "all",
            )
          }
        />
        <Button variant="outline" onClick={props.onReset}>
          <RotateCcw className="mr-2 size-4" />
          重置
        </Button>
      </div>
    </section>
  );
}

function StatusSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(([optionValue, label]) => (
          <SelectItem key={optionValue} value={optionValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DesktopRecords({
  records,
  loading,
}: {
  records: SupplementalAttendanceRecord[];
  loading: boolean;
}) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <Table className="min-w-[1540px]">
        <TableHeader>
          <TableRow>
            <TableHead>人员 / 项目</TableHead>
            <TableHead>考勤日期 / 方向</TableHead>
            <TableHead>计划时间 / 照片</TableHead>
            <TableHead>目标设备 / 厂家</TableHead>
            <TableHead>平台发送状态</TableHead>
            <TableHead>发送详情</TableHead>
            <TableHead>考勤机返回状态</TableHead>
            <TableHead>设备返回详情</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id} className="align-top">
              <TableCell>
                <WorkerProject record={record} />
              </TableCell>
              <TableCell>
                <div className="font-medium">{record.attendance_date}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {directionLabel(record.direction)} ·{" "}
                  {shiftLabel(record.shift)}
                </div>
              </TableCell>
              <TableCell>
                <div>{formatDateTime(record.planned_at)}</div>
                {record.photo_url ? (
                  <a
                    href={record.photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-2 text-xs text-[#0f6b5d] hover:underline"
                  >
                    <img
                      className="size-8 rounded object-cover"
                      src={record.photo_url}
                      alt="补考勤照片"
                      loading="lazy"
                    />
                    查看照片
                  </a>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">
                    无照片
                  </div>
                )}
              </TableCell>
              <TableCell>
                <DeviceIdentity record={record} />
              </TableCell>
              <TableCell>
                <SendStatusBadge status={record.send_status} />
              </TableCell>
              <TableCell>
                <StatusDetails
                  timestampLabel="发送时间"
                  timestamp={record.sent_at}
                  message={record.send_message}
                  meta={`尝试 ${record.send_attempt_count} 次${record.device_job_id ? ` · 任务 ${record.device_job_id}` : ""}`}
                />
              </TableCell>
              <TableCell>
                <DeviceStatusBadge status={record.device_result_status} />
              </TableCell>
              <TableCell>
                <StatusDetails
                  timestampLabel="返回时间"
                  timestamp={record.device_reported_at}
                  message={record.device_result_message}
                  meta={
                    record.device_result_code
                      ? `返回码 ${record.device_result_code}`
                      : undefined
                  }
                />
              </TableCell>
            </TableRow>
          ))}
          {!records.length ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="h-32 text-center text-muted-foreground"
              >
                {loading ? "补考勤链路加载中" : "当前筛选条件下暂无补考勤记录"}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

function MobileRecords({
  records,
  loading,
}: {
  records: SupplementalAttendanceRecord[];
  loading: boolean;
}) {
  if (!records.length) {
    return (
      <div className="px-4 py-16 text-center text-sm text-muted-foreground md:hidden">
        {loading ? "补考勤链路加载中" : "当前筛选条件下暂无补考勤记录"}
      </div>
    );
  }

  return (
    <div className="divide-y md:hidden">
      {records.map((record) => (
        <article key={record.id} className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <WorkerProject record={record} />
            <Badge variant="outline">{directionLabel(record.direction)}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-muted/30">
            <Detail label="考勤日期" value={record.attendance_date} />
            <Detail
              label="计划时间"
              value={formatDateTime(record.planned_at)}
            />
            <div className="col-span-2">
              <DeviceIdentity record={record} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <MobileStatusPanel
              title="平台发送状态"
              icon={<Send className="size-4" />}
              badge={<SendStatusBadge status={record.send_status} />}
            >
              <StatusDetails
                timestampLabel="发送时间"
                timestamp={record.sent_at}
                message={record.send_message}
                meta={`尝试 ${record.send_attempt_count} 次`}
              />
            </MobileStatusPanel>
            <MobileStatusPanel
              title="考勤机返回状态"
              icon={<ServerCog className="size-4" />}
              badge={<DeviceStatusBadge status={record.device_result_status} />}
            >
              <StatusDetails
                timestampLabel="返回时间"
                timestamp={record.device_reported_at}
                message={record.device_result_message}
                meta={
                  record.device_result_code
                    ? `返回码 ${record.device_result_code}`
                    : undefined
                }
              />
            </MobileStatusPanel>
          </div>
        </article>
      ))}
    </div>
  );
}

function WorkerProject({ record }: { record: SupplementalAttendanceRecord }) {
  return (
    <div className="min-w-0">
      <div className="font-semibold">{record.worker_name || "未命名人员"}</div>
      <div
        className="mt-1 max-w-60 truncate text-xs text-muted-foreground"
        title={record.project_name || undefined}
      >
        {record.project_name || "未匹配项目"}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {record.worker_id_card_mask || "身份证未提供"}
      </div>
    </div>
  );
}

function DeviceIdentity({ record }: { record: SupplementalAttendanceRecord }) {
  if (!record.device_id) {
    return <span className="text-xs text-amber-700">尚未分配目标设备</span>;
  }
  return (
    <div>
      <div className="font-medium">{record.device_name || "未命名设备"}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {[record.device_type, record.device_sn].filter(Boolean).join(" / ") ||
          "厂家及序列号未提供"}
      </div>
      {record.device_adapter ? (
        <div className="mt-0.5 text-xs text-muted-foreground">
          适配器：{record.device_adapter}
        </div>
      ) : null}
    </div>
  );
}

function StatusDetails({
  timestampLabel,
  timestamp,
  message,
  meta,
}: {
  timestampLabel: string;
  timestamp: string | null;
  message: string | null;
  meta?: string;
}) {
  return (
    <div className="max-w-72 space-y-1 text-xs">
      <div className="text-muted-foreground">
        {timestampLabel}：{timestamp ? formatDateTime(timestamp) : "-"}
      </div>
      {meta ? <div className="text-muted-foreground">{meta}</div> : null}
      <div
        className={cn(
          "break-words",
          message ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {message || "暂无说明"}
      </div>
    </div>
  );
}

function SendStatusBadge({
  status,
}: {
  status: SupplementalAttendanceSendStatus;
}) {
  return (
    <Badge className={sendBadgeClass(status)}>
      {supplementalSendStatusLabel(status)}
    </Badge>
  );
}

function DeviceStatusBadge({
  status,
}: {
  status: SupplementalAttendanceDeviceStatus | null;
}) {
  return (
    <Badge className={deviceBadgeClass(status)}>
      {supplementalDeviceStatusLabel(status)}
    </Badge>
  );
}

function MobileStatusPanel({
  title,
  icon,
  badge,
  children,
}: {
  title: string;
  icon: ReactNode;
  badge: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="mt-2">{badge}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

function QueryMessage({
  tone,
  children,
}: {
  tone: "error";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-b px-4 py-3 text-sm",
        tone === "error" &&
          "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300",
      )}
    >
      {children}
    </div>
  );
}

function PaginationFooter({
  page,
  pageSize,
  total,
  totalPages,
  loading,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50/70 px-4 py-3 text-sm dark:bg-muted/20">
      <span className="text-muted-foreground">
        显示 {start}-{end} 条，共 {total} 条，每页 {pageSize} 条
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </Button>
        <span className="min-w-14 text-center text-xs text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages || loading}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

function sendBadgeClass(status: SupplementalAttendanceSendStatus) {
  return cn(
    "border font-medium shadow-none",
    status === "delivered" &&
      "border-emerald-200 bg-emerald-50 text-emerald-700",
    status === "failed" && "border-red-200 bg-red-50 text-red-700",
    status === "processing" && "border-blue-200 bg-blue-50 text-blue-700",
    status === "pending" && "border-amber-200 bg-amber-50 text-amber-700",
    (status === "unassigned" || status === "skipped") &&
      "border-slate-200 bg-slate-100 text-slate-600",
  );
}

function deviceBadgeClass(status: SupplementalAttendanceDeviceStatus | null) {
  return cn(
    "border font-medium shadow-none",
    status === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    status === "failed" && "border-red-200 bg-red-50 text-red-700",
    status === "accepted" && "border-blue-200 bg-blue-50 text-blue-700",
    status === "pending" && "border-amber-200 bg-amber-50 text-amber-700",
    !status && "border-slate-200 bg-slate-100 text-slate-600",
  );
}

function summaryIconClass(
  tone: "slate" | "amber" | "blue" | "teal" | "green" | "red",
) {
  return {
    slate: "text-slate-500",
    amber: "text-amber-600",
    blue: "text-blue-600",
    teal: "text-teal-600",
    green: "text-emerald-600",
    red: "text-red-600",
  }[tone];
}

function directionLabel(direction: 0 | 1) {
  return direction === 0 ? "进场" : "出场";
}

function shiftLabel(shift: string) {
  if (shift === "day") return "白班";
  if (shift === "night") return "夜班";
  return shift || "未配置班次";
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
