import {
  Activity,
  CheckCircle2,
  Clock3,
  Copy,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ServerCog,
  Trash2,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { supplementalAttendanceService } from "../services";
import {
  useDeleteSupplementalAttendanceRecordsMutation,
  useSupplementalAttendanceRecordsQuery,
} from "../hooks";
import {
  supplementalDeviceStatusLabel,
  supplementalSendStatusLabel,
} from "../status";
import type {
  SupplementalAttendanceDeviceStatus,
  SupplementalAttendanceDispatchLog,
  SupplementalAttendanceRecord,
  SupplementalAttendanceSendStatus,
  SupplementalAttendanceSummary,
} from "../types";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const emptySummary: SupplementalAttendanceSummary = {
  total: 0,
  unassigned: 0,
  pending_send: 0,
  sent: 0,
  device_success: 0,
  device_failed: 0,
};

export function SupplementalAttendancePage({ embedded = false }: { embedded?: boolean }) {
  const [projectId, setProjectId] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sendStatus, setSendStatus] = useState<
    SupplementalAttendanceSendStatus | "all"
  >("all");
  const [deviceStatus, setDeviceStatus] = useState<
    SupplementalAttendanceDeviceStatus | "all"
  >("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [dispatchLog, setDispatchLog] = useState<SupplementalAttendanceDispatchLog | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const deferredKeyword = useDeferredValue(keyword.trim());

  const filters = useMemo(
    () => ({
      page,
      page_size: pageSize,
      project_id: projectId || undefined,
      keyword: deferredKeyword || undefined,
      month: month || undefined,
      start_time: startTime ? new Date(startTime).toISOString() : undefined,
      end_time: endTime ? new Date(endTime).toISOString() : undefined,
      send_status: sendStatus === "all" ? undefined : sendStatus,
      device_status: deviceStatus === "all" ? undefined : deviceStatus,
    }),
    [deferredKeyword, deviceStatus, endTime, month, page, pageSize, projectId, sendStatus, startTime],
  );
  const recordsQuery = useSupplementalAttendanceRecordsQuery(filters);
  const deleteRecords = useDeleteSupplementalAttendanceRecordsMutation();
  const records = recordsQuery.data?.items ?? [];
  const total = recordsQuery.data?.total ?? 0;
  const summary = recordsQuery.data?.summary ?? emptySummary;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPageRecordIds = [...new Set(records.map((record) => record.id))];
  const allCurrentPageSelected = currentPageRecordIds.length > 0
    && currentPageRecordIds.every((id) => selectedRecordIds.has(id));

  const toggleRecord = (recordId: string, checked: boolean) => {
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      if (checked) next.add(recordId);
      else next.delete(recordId);
      return next;
    });
  };
  const toggleCurrentPage = (checked: boolean) => {
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      currentPageRecordIds.forEach((id) => checked ? next.add(id) : next.delete(id));
      return next;
    });
  };
  const handleBatchDelete = async () => {
    const ids = [...selectedRecordIds];
    if (!ids.length) return;
    if (!window.confirm(`确认删除选中的 ${ids.length} 条下发记录？\n\n相关未完成任务会停止，删除后不可恢复。`)) return;
    try {
      const result = await deleteRecords.mutateAsync(ids);
      setSelectedRecordIds(new Set());
      toast.success(`已删除 ${result.deleted_count} 条下发记录`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量删除下发记录失败");
    }
  };
  const handleViewLog = async (jobId: string) => {
    setLogOpen(true);
    setLogLoading(true);
    setDispatchLog(null);
    try {
      setDispatchLog(await supplementalAttendanceService.getDispatchLog(jobId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取详细发送日志失败");
      setLogOpen(false);
    } finally {
      setLogLoading(false);
    }
  };

  const resetFilters = () => {
    setProjectId("");
    setMonth(currentMonth());
    setStartTime("");
    setEndTime("");
    setKeyword("");
    setSendStatus("all");
    setDeviceStatus("all");
    setPage(1);
  };

  return (
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      {!embedded ? (
        <PageHeader
          updatedAt={recordsQuery.dataUpdatedAt}
          refreshing={recordsQuery.isFetching}
          onRefresh={() => void recordsQuery.refetch()}
        />
      ) : (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => void recordsQuery.refetch()} disabled={recordsQuery.isFetching}>
            <RefreshCw className={cn("mr-2 size-4", recordsQuery.isFetching && "animate-spin")} />
            刷新下发状态
          </Button>
        </div>
      )}
      <SummaryCards summary={summary} />
      <FilterPanel
        projectId={projectId}
        month={month}
        startTime={startTime}
        endTime={endTime}
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
        onStartTimeChange={(value) => {
          setStartTime(value);
          setPage(1);
        }}
        onEndTimeChange={(value) => {
          setEndTime(value);
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
        <div className="flex min-h-12 items-center justify-between gap-3 border-b px-4 py-2">
          <span className="text-sm text-muted-foreground">
            {selectedRecordIds.size ? `已选择 ${selectedRecordIds.size} 条记录` : "可勾选记录后批量删除"}
          </span>
          <Button
            variant="destructive"
            size="sm"
            disabled={!selectedRecordIds.size || deleteRecords.isPending}
            onClick={() => void handleBatchDelete()}
          >
            <Trash2 className="mr-2 size-4" />
            {deleteRecords.isPending ? "删除中" : "批量删除"}
          </Button>
        </div>
        {recordsQuery.isError ? (
          <QueryMessage tone="error">
            {recordsQuery.error instanceof Error
              ? recordsQuery.error.message
              : "补考勤记录加载失败"}
          </QueryMessage>
        ) : null}
        <DesktopRecords
          records={records}
          loading={recordsQuery.isLoading}
          selectedRecordIds={selectedRecordIds}
          allCurrentPageSelected={allCurrentPageSelected}
          onToggleRecord={toggleRecord}
          onToggleCurrentPage={toggleCurrentPage}
          onViewLog={handleViewLog}
        />
        <MobileRecords records={records} loading={recordsQuery.isLoading} selectedRecordIds={selectedRecordIds} onToggleRecord={toggleRecord} onViewLog={handleViewLog} />
        <PaginationFooter
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          loading={recordsQuery.isFetching}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s as (typeof PAGE_SIZE_OPTIONS)[number]); setPage(1); }}
        />
      </section>
      <DispatchLogDialog open={logOpen} loading={logLoading} log={dispatchLog} onOpenChange={setLogOpen} />
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
    <section className="flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-white px-4 py-2 shadow-sm">
          <span className="text-xs text-muted-foreground">
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
  startTime: string;
  endTime: string;
  keyword: string;
  sendStatus: SupplementalAttendanceSendStatus | "all";
  deviceStatus: SupplementalAttendanceDeviceStatus | "all";
  onProjectChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
        <label className="relative">
          <span className="pointer-events-none absolute left-3 top-1 z-10 text-[10px] text-muted-foreground">开始时间</span>
          <Input
            className="pt-4"
            type="datetime-local"
            aria-label="开始时间"
            value={props.startTime}
            max={props.endTime || undefined}
            onChange={(event) => props.onStartTimeChange(event.target.value)}
          />
        </label>
        <label className="relative">
          <span className="pointer-events-none absolute left-3 top-1 z-10 text-[10px] text-muted-foreground">结束时间</span>
          <Input
            className="pt-4"
            type="datetime-local"
            aria-label="结束时间"
            value={props.endTime}
            min={props.startTime || undefined}
            onChange={(event) => props.onEndTimeChange(event.target.value)}
          />
        </label>
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
  selectedRecordIds,
  allCurrentPageSelected,
  onToggleRecord,
  onToggleCurrentPage,
  onViewLog,
}: {
  records: SupplementalAttendanceRecord[];
  loading: boolean;
  selectedRecordIds: Set<string>;
  allCurrentPageSelected: boolean;
  onToggleRecord: (recordId: string, checked: boolean) => void;
  onToggleCurrentPage: (checked: boolean) => void;
  onViewLog: (jobId: string) => void;
}) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <Table className="min-w-[1540px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox aria-label="全选当前页" checked={allCurrentPageSelected} onCheckedChange={(checked) => onToggleCurrentPage(checked === true)} />
            </TableHead>
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
            <TableRow key={`${record.id}-${record.device_job_id || "unassigned"}`} className="align-top">
              <TableCell>
                <Checkbox aria-label={`选择${record.worker_name || "该人员"}的下发记录`} checked={selectedRecordIds.has(record.id)} onCheckedChange={(checked) => onToggleRecord(record.id, checked === true)} />
              </TableCell>
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
                {record.device_job_id ? (
                  <Button type="button" variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => onViewLog(record.device_job_id!)}>
                    详细日志
                  </Button>
                ) : null}
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
                colSpan={9}
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
  selectedRecordIds,
  onToggleRecord,
  onViewLog,
}: {
  records: SupplementalAttendanceRecord[];
  loading: boolean;
  selectedRecordIds: Set<string>;
  onToggleRecord: (recordId: string, checked: boolean) => void;
  onViewLog: (jobId: string) => void;
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
        <article key={`${record.id}-${record.device_job_id || "unassigned"}`} className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Checkbox className="mt-1" aria-label={`选择${record.worker_name || "该人员"}的下发记录`} checked={selectedRecordIds.has(record.id)} onCheckedChange={(checked) => onToggleRecord(record.id, checked === true)} />
              <WorkerProject record={record} />
            </div>
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
              {record.device_job_id ? (
                <Button type="button" variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => onViewLog(record.device_job_id!)}>
                  详细日志
                </Button>
              ) : null}
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

function DispatchLogDialog({
  open,
  loading,
  log,
  onOpenChange,
}: {
  open: boolean;
  loading: boolean;
  log: SupplementalAttendanceDispatchLog | null;
  onOpenChange: (open: boolean) => void;
}) {
  const requestText = log?.request_payload
    ? JSON.stringify(log.request_payload, null, 2)
    : "该次历史发送未保存完整请求参数，请重新补发后查看。";
  const responseText = log?.response_payload
    ? JSON.stringify(log.response_payload, null, 2)
    : log?.last_error || "暂无对方响应数据";
  const curl = typeof log?.request_payload?.curl === "string" ? log.request_payload.curl : "";
  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label}已复制`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] w-[94vw] max-w-5xl overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>详细发送日志</DialogTitle>
          <DialogDescription>
            {log ? `任务 ${log.job_id} · 尝试 ${log.attempt_count} 次 · ${log.logged_at ? formatDateTime(log.logged_at) : "暂无日志时间"}` : "正在读取最近一次发送详情"}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">详细日志加载中...</div>
        ) : log ? (
          <div className="space-y-4">
            <LogBlock title="完整 cURL" value={curl || "该次历史发送未保存 cURL，请重新补发后查看。"} onCopy={curl ? () => void copy(curl, "cURL") : undefined} />
            <LogBlock title="实际请求参数" value={requestText} onCopy={log.request_payload ? () => void copy(requestText, "请求参数") : undefined} />
            <LogBlock title="对方原始响应" value={responseText} onCopy={() => void copy(responseText, "响应内容")} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LogBlock({ title, value, onCopy }: { title: string; value: string; onCopy?: () => void }) {
  return (
    <section className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2 dark:bg-muted/30">
        <h3 className="text-sm font-medium">{title}</h3>
        {onCopy ? <Button type="button" variant="ghost" size="sm" onClick={onCopy}><Copy className="mr-1 size-4" />复制</Button> : null}
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all p-3 text-xs leading-5">{value}</pre>
    </section>
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
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50/70 px-4 py-3 text-sm dark:bg-muted/20">
      <span className="text-muted-foreground">
        显示 {start}-{end} 条，共 {total} 条
      </span>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <>
            <span className="text-xs">每页</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background dark:text-foreground"
              aria-label="选择每页条数"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (<option key={option} value={option}>{option} 条</option>))}
            </select>
          </>
        )}
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
