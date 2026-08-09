import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarDays,
  Eye,
  ImagePlus,
  Loader2,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StructuredWorkerSingleSelect, type StructuredWorkerOption } from "@/components/StructuredWorkerSelect";
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
import { constructionProjectService } from "@/features/projects/services/construction-project-service";
import {
  useProjectAllTeamsQuery,
  useProjectAllUnitsQuery,
  useProjectWorkersQuery,
} from "@/features/projects/hooks/use-construction-projects";
import { cn } from "@/lib/utils";
import {
  useCreateManagedAttendanceConfigMutation,
  useCreateManagedAttendancePhotoGroupMutation,
  useDeleteManagedAttendanceConfigMutation,
  useGenerateManagedAttendanceMutation,
  useManagedAttendanceConfigsQuery,
  useManagedAttendanceRecordsQuery,
  useResendManagedAttendanceDayMutation,
  useUpdateManagedAttendanceConfigMutation,
  useUpdateManagedAttendancePhotoGroupMutation,
} from "../hooks";
import {
  isManagedPhotoGroupReady,
  summarizeManagedAttendanceConfig,
} from "../lib";
import { managedAttendanceService } from "../services";
import type {
  ManagedAttendanceConfig,
  ManagedAttendanceConfigPayload,
  ManagedAttendanceRecord,
} from "../types";

type PageTab = "people" | "calendar";
type PhotoGroupForm = {
  name: string;
  inPhotos: string;
  outPhotos: string;
  remark: string;
};
type ConfigForm = {
  workerId: string;
  monthlyAttendanceDays: string;
  checkInTime: string;
  checkInEndTime: string;
  checkOutTime: string;
  checkOutEndTime: string;
  remark: string;
  photoPairs: PhotoPair[];
};
type PhotoPair = { inPhoto: string; outPhoto: string };

const defaultConfigForm: ConfigForm = {
  workerId: "",
  monthlyAttendanceDays: "22",
  checkInTime: "08:00",
  checkInEndTime: "08:30",
  checkOutTime: "17:30",
  checkOutEndTime: "18:00",
  remark: "",
  photoPairs: [{ inPhoto: "", outPhoto: "" }],
};

export function ManagedAttendancePage(_props: { embedded?: boolean }) {
  const [tab, setTab] = useState<PageTab>("people");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedConfig, setSelectedConfig] =
    useState<ManagedAttendanceConfig | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [keyword, setKeyword] = useState("");
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] =
    useState<ManagedAttendanceConfig | null>(null);
  const [configForm, setConfigForm] = useState<ConfigForm>(defaultConfigForm);

  const commonFilters = useMemo(
    () => ({
      project_id: selectedProjectId || undefined,
      keyword: keyword.trim() || undefined,
    }),
    [keyword, selectedProjectId],
  );
  const configsQuery = useManagedAttendanceConfigsQuery({
    ...commonFilters,
    page: 1,
    page_size: 100,
  });
  const recordsQuery = useManagedAttendanceRecordsQuery({
    project_id: selectedConfig?.project_id || selectedProjectId || undefined,
    config_id: selectedConfig?.id,
    month,
    page: 1,
    page_size: 100,
  });
  const workersQuery = useProjectWorkersQuery(selectedProjectId, {
    page: 1,
    page_size: 100,
    work_status: 1,
  });
  const unitsQuery = useProjectAllUnitsQuery(selectedProjectId);
  const teamsQuery = useProjectAllTeamsQuery(selectedProjectId);
  const createConfig = useCreateManagedAttendanceConfigMutation();
  const createPhotoGroup = useCreateManagedAttendancePhotoGroupMutation();
  const deleteConfig = useDeleteManagedAttendanceConfigMutation();
  const updateConfig = useUpdateManagedAttendanceConfigMutation();
  const updatePhotoGroup = useUpdateManagedAttendancePhotoGroupMutation();
  const generateRecords = useGenerateManagedAttendanceMutation();
  const resendDay = useResendManagedAttendanceDayMutation();

  const configs = configsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const workers = workersQuery.data?.items ?? [];
  const unitNames = useMemo(() => new Map((unitsQuery.data ?? []).map((unit) => [unit.id, unit.company_name || "未命名单位"])), [unitsQuery.data]);
  const teamNames = useMemo(() => new Map((teamsQuery.data ?? []).map((team) => [team.id, team.name || "未命名班组"])), [teamsQuery.data]);
  const workerOptions = useMemo<StructuredWorkerOption[]>(() => workers.map((worker) => ({
    id: worker.id,
    name: worker.name || "未命名人员",
    unitName: unitNames.get(worker.unit_id) || "未分配单位",
    teamName: teamNames.get(worker.team_id) || "未分配班组",
    description: [worker.phone, worker.id_card].filter(Boolean).join(" · ") || "暂无手机号和身份证信息",
  })), [teamNames, unitNames, workers]);
  const openConfigDialog = () => {
    if (!selectedProjectId)
      return toast.info("请先选择一个项目，再新增托管人员");
    setEditingConfig(null);
    setConfigForm({
      ...defaultConfigForm,
      workerId: workers[0]?.id ?? "",
    });
    setConfigDialogOpen(true);
  };

  const openEditConfigDialog = (config: ManagedAttendanceConfig) => {
    setSelectedProjectId(config.project_id);
    setSelectedConfig(null);
    setEditingConfig(config);
    setConfigForm({
      workerId: config.worker_id,
      monthlyAttendanceDays: String(config.monthly_attendance_days),
      checkInTime: config.check_in_time,
      checkInEndTime: config.check_in_end_time || config.check_in_time,
      checkOutTime: config.check_out_time,
      checkOutEndTime: config.check_out_end_time || config.check_out_time,
      remark: config.remark || "",
      photoPairs: Array.from(
        { length: Math.max(config.in_photos?.length || 0, config.out_photos?.length || 0, 1) },
        (_, index) => ({
          inPhoto: config.in_photos?.[index] || "",
          outPhoto: config.out_photos?.[index] || "",
        }),
      ),
    });
    setConfigDialogOpen(true);
  };

  const viewCalendar = (config: ManagedAttendanceConfig) => {
    setSelectedConfig(config);
    setMonth(config.last_generated_month || currentMonth());
    setTab("calendar");
  };

  const handleGenerate = async (config: ManagedAttendanceConfig) => {
    try {
      const result = await generateRecords.mutateAsync({
        configId: config.id,
        month,
      });
      toast.success(
        `已生成 ${result.attendance_days} 天、${result.generated_count} 条托管记录`,
      );
      setSelectedConfig(config);
      setTab("calendar");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成托管记录失败");
    }
  };

  const handleResendDay = async (config: ManagedAttendanceConfig, attendanceDate: string) => {
    const confirmed = window.confirm(`确认补发 ${attendanceDate} 已到计划时间的考勤？\n\n已到时间的记录会立即重新发送；尚未到时间的记录不会提前发送。`);
    if (!confirmed) return;
    try {
      const result = await resendDay.mutateAsync({ configId: config.id, attendanceDate });
      toast.success(`已立即补发 ${result.record_count} 条到期考勤记录，共 ${result.job_count} 个设备任务`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "手动补发失败");
    }
  };

  const toggleConfig = async (config: ManagedAttendanceConfig) => {
    try {
      await updateConfig.mutateAsync({
        configId: config.id,
        payload: {
          project_id: config.project_id,
          worker_id: config.worker_id,
          photo_group_id: config.photo_group_id || null,
          monthly_attendance_days: config.monthly_attendance_days,
          shift: config.shift === "night" ? "night" : "day",
          check_in_time: config.check_in_time,
          check_in_end_time: config.check_in_end_time,
          check_out_time: config.check_out_time,
          check_out_end_time: config.check_out_end_time,
          is_enabled: !config.is_enabled,
          remark: config.remark || null,
        },
      });
      toast.success(
        config.is_enabled
          ? "已暂停自动托管"
          : "已开启自动托管，将在每月最后一天自动生成下月记录",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新托管状态失败");
    }
  };

  const handleDeleteConfig = async (config: ManagedAttendanceConfig) => {
    const confirmed = window.confirm(
      `确认删除“${config.worker_name || "该人员"}”的托管配置？\n\n历史下发记录会保留，未完成的设备任务会停止。此操作不可撤销。`,
    );
    if (!confirmed) return;
    try {
      await deleteConfig.mutateAsync(config.id);
      if (selectedConfig?.id === config.id) setSelectedConfig(null);
      toast.success("托管配置已删除，历史下发记录已保留");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除托管配置失败");
    }
  };

  const handleConfigSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const days = Number(configForm.monthlyAttendanceDays);
    if (!selectedProjectId || !configForm.workerId)
      return toast.error("请选择项目和托管人员");
    if (!Number.isInteger(days) || days < 1 || days > 31)
      return toast.error("月考勤天数需为 1 到 31");
    if (configForm.checkInEndTime < configForm.checkInTime)
      return toast.error("进场结束时间不能早于开始时间");
    if (configForm.checkOutEndTime < configForm.checkOutTime)
      return toast.error("出场结束时间不能早于开始时间");
    if (!configForm.photoPairs.length || configForm.photoPairs.length > 30)
      return toast.error("照片组数量需为 1 到 30 组");
    if (configForm.photoPairs.some((pair) => !pair.inPhoto || !pair.outPhoto))
      return toast.error("每个照片组都需要上传 1 张进场和 1 张出场照片");
    let newlyCreatedPhotoGroupId: string | null = null;
    try {
      const workerName = workerOptions.find((worker) => worker.id === configForm.workerId)?.name || "托管人员";
      const photoPayload = {
        project_id: selectedProjectId,
        name: `${workerName}托管照片组`,
        generation_status: "ready",
        in_photos: configForm.photoPairs.map((pair) => pair.inPhoto),
        out_photos: configForm.photoPairs.map((pair) => pair.outPhoto),
        remark: configForm.remark.trim() || null,
      };
      const photoGroup = editingConfig?.photo_group_id
        ? await updatePhotoGroup.mutateAsync({ photoGroupId: editingConfig.photo_group_id, payload: photoPayload })
        : await createPhotoGroup.mutateAsync(photoPayload);
      if (!editingConfig?.photo_group_id) newlyCreatedPhotoGroupId = photoGroup.id;
      const payload: ManagedAttendanceConfigPayload = {
        project_id: selectedProjectId,
        worker_id: configForm.workerId,
        photo_group_id: photoGroup.id,
        monthly_attendance_days: days,
        shift: editingConfig?.shift === "night" ? "night" : "day",
        check_in_time: configForm.checkInTime,
        check_in_end_time: configForm.checkInEndTime,
        check_out_time: configForm.checkOutTime,
        check_out_end_time: configForm.checkOutEndTime,
        is_enabled: editingConfig?.is_enabled ?? true,
        remark: configForm.remark.trim() || null,
      };
      if (editingConfig) {
        await updateConfig.mutateAsync({ configId: editingConfig.id, payload });
        toast.success("托管配置已更新；如更换设备，请重新生成待下发记录");
      } else {
        await createConfig.mutateAsync(payload);
        toast.success("自动托管已开启");
      }
      setConfigDialogOpen(false);
      setEditingConfig(null);
      setConfigForm(defaultConfigForm);
    } catch (error) {
      if (newlyCreatedPhotoGroupId) {
        await managedAttendanceService.deletePhotoGroup(newlyCreatedPhotoGroupId).catch(() => undefined);
      }
      toast.error(error instanceof Error ? error.message : "开启托管失败");
    }
  };

  return (
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-muted">
            <TabButton
              active={tab === "people"}
              icon={<Users className="size-4" />}
              onClick={() => setTab("people")}
            >
              托管人员
            </TabButton>
            <TabButton
              active={tab === "calendar"}
              icon={<CalendarDays className="size-4" />}
              onClick={() => setTab("calendar")}
            >
              月度考勤日历
            </TabButton>
          </div>
          <div className="flex gap-2">
            <Button
              className="gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
              onClick={openConfigDialog}
            >
              <Plus className="size-4" />
              开启人员托管
            </Button>
          </div>
        </div>
        <div className="grid gap-3 border-t bg-slate-50/70 px-5 py-3 md:grid-cols-[minmax(280px,1fr)_minmax(240px,1fr)_170px] dark:bg-muted/20">
          <ProjectSearchSelect
            value={selectedProjectId}
            onValueChange={(value) => {
              setSelectedProjectId(value);
              setSelectedConfig(null);
            }}
            includeAllOption
            allOptionLabel="全部项目"
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                setSelectedConfig(null);
              }}
              placeholder="搜索项目、人员或班组"
              className="pl-9"
            />
          </div>
          <Input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value || currentMonth())}
          />
        </div>
      </section>

      {tab === "people" ? (
        <ManagedPeopleTab
          configs={configs}
          loading={configsQuery.isLoading}
          generating={generateRecords.isPending}
          updating={updateConfig.isPending}
          month={month}
          onGenerate={handleGenerate}
          onEdit={openEditConfigDialog}
          onToggle={toggleConfig}
          onView={viewCalendar}
          onDelete={handleDeleteConfig}
        />
      ) : null}
      {tab === "calendar" ? (
        <ManagedCalendarTab
          config={selectedConfig}
          configs={configs}
          month={month}
          records={records}
          loading={recordsQuery.isFetching}
          onConfigChange={(id) =>
            setSelectedConfig(
              configs.find((config) => config.id === id) || null,
            )
          }
          onGenerate={handleGenerate}
          onResendDay={handleResendDay}
          resendingDate={resendDay.isPending ? resendDay.variables?.attendanceDate || null : null}
          onMonthChange={setMonth}
        />
      ) : null}
      <ConfigDialog
        open={configDialogOpen}
        form={configForm}
        workers={workerOptions}
        saving={createConfig.isPending || updateConfig.isPending || createPhotoGroup.isPending || updatePhotoGroup.isPending}
        editing={Boolean(editingConfig)}
        onOpenChange={(open) => {
          setConfigDialogOpen(open);
          if (!open) setEditingConfig(null);
        }}
        onFormChange={setConfigForm}
        onSubmit={handleConfigSubmit}
      />
    </div>
  );
}

function ManagedPeopleTab({
  configs,
  loading,
  generating,
  updating,
  month,
  onGenerate,
  onEdit,
  onToggle,
  onView,
  onDelete,
}: {
  configs: ManagedAttendanceConfig[];
  loading: boolean;
  generating: boolean;
  updating: boolean;
  month: string;
  onGenerate: (config: ManagedAttendanceConfig) => void;
  onEdit: (config: ManagedAttendanceConfig) => void;
  onToggle: (config: ManagedAttendanceConfig) => void;
  onView: (config: ManagedAttendanceConfig) => void;
  onDelete: (config: ManagedAttendanceConfig) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-border dark:bg-card">
      <SectionHeader
        icon={<Users className="size-4" />}
        title="托管人员与数据"
        description="集中查看各项目托管人员、随机月考勤规则和生成情况。"
        loading={loading}
      />
      <div className="overflow-x-auto">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow>
              <TableHead>项目 / 人员</TableHead>
              <TableHead>班组</TableHead>
              <TableHead>随机考勤规则</TableHead>
              <TableHead>数据状态</TableHead>
              <TableHead>托管状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.map((config) => (
              <TableRow key={config.id}>
                <TableCell>
                  <div className="font-semibold">
                    {config.worker_name || "未命名人员"}
                  </div>
                  <div className="mt-1 max-w-52 truncate text-xs text-muted-foreground">
                    {config.project_name || "未匹配项目"}
                  </div>
                </TableCell>
                <TableCell>{config.team_name || "未分配班组"}</TableCell>
                <TableCell>
                  <div className="font-medium">
                    每月随机 {config.monthly_attendance_days} 天
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {summarizeManagedAttendanceConfig(config)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    累计 {config.managed_record_count || 0} 条
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    最近月份：{config.last_generated_month || "尚未生成"}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <MiniStatus
                      label="待下发"
                      value={config.pending_count}
                      tone="amber"
                    />
                    <MiniStatus
                      label="成功"
                      value={config.success_count}
                      tone="green"
                    />
                    <MiniStatus
                      label="失败"
                      value={config.failed_count}
                      tone="red"
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    disabled={updating}
                    onClick={() => onToggle(config)}
                    className={cn(
                      "relative h-7 w-12 rounded-full transition-colors",
                      config.is_enabled ? "bg-emerald-600" : "bg-slate-300",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 size-5 rounded-full bg-white shadow transition-all",
                        config.is_enabled ? "left-6" : "left-1",
                      )}
                    />
                  </button>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {config.is_enabled ? "每月末自动生成" : "已暂停"}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => onEdit(config)}
                    >
                      <Pencil className="size-3.5" />
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => onView(config)}
                    >
                      <Eye className="size-3.5" />
                      查看
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={updating}
                      onClick={() => onDelete(config)}
                    >
                      <Trash2 className="size-3.5" />
                      删除
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 bg-[#0f6b5d] text-white"
                      disabled={!config.is_enabled || generating}
                      onClick={() => onGenerate(config)}
                    >
                      {generating ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      生成 {month}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!configs.length ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-32 text-center text-muted-foreground"
                >
                  {loading
                    ? "托管数据加载中"
                    : "暂无托管人员，请先选择项目并开启人员托管"}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function ManagedCalendarTab({
  config,
  configs,
  month,
  records,
  loading,
  onConfigChange,
  onGenerate,
  onResendDay,
  resendingDate,
  onMonthChange,
}: {
  config: ManagedAttendanceConfig | null;
  configs: ManagedAttendanceConfig[];
  month: string;
  records: ManagedAttendanceRecord[];
  loading: boolean;
  onConfigChange: (id: string) => void;
  onGenerate: (config: ManagedAttendanceConfig) => void;
  onResendDay: (config: ManagedAttendanceConfig, attendanceDate: string) => void;
  resendingDate: string | null;
  onMonthChange: (month: string) => void;
}) {
  const days = buildCalendarDays(month, records);
  const attendanceDays = new Set(
    records.map((record) => record.attendance_date),
  ).size;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-4 shadow-sm dark:border-border dark:bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">人员月度托管考勤</h2>
            <p className="text-xs text-muted-foreground">
              每天展示进出场时间以及设备下发状态。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={config?.id || ""} onValueChange={onConfigChange}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="请选择托管人员" />
              </SelectTrigger>
              <SelectContent>
                {configs.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.worker_name} · {item.project_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="month"
              className="w-40"
              value={month}
              onChange={(event) => onMonthChange(event.target.value)}
            />
            {config ? (
              <Button
                className="bg-[#0f6b5d] text-white"
                onClick={() => onGenerate(config)}
              >
                <Sparkles className="mr-2 size-4" />
                重新生成
              </Button>
            ) : null}
          </div>
        </div>
        {config ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <InfoCard
              label="人员"
              value={config.worker_name || "-"}
              helper={config.project_name || "-"}
            />
            <InfoCard
              label="随机出勤"
              value={`${attendanceDays || config.monthly_attendance_days} 天`}
              helper={`配置 ${config.monthly_attendance_days} 天/月`}
            />
            <InfoCard
              label="考勤时间"
              value={`${config.check_in_time}～${config.check_in_end_time}`}
              helper={`出场 ${config.check_out_time}～${config.check_out_end_time}`}
            />
            <InfoCard
              label="服务状态"
              value={`${records.filter((r) => r.dispatch_status === "success").length}/${records.length} 成功`}
              helper={`${records.filter((r) => r.dispatch_status === "pending").length} 条待下发`}
            />
          </div>
        ) : null}
      </section>
      {!config ? (
        <div className="rounded-xl border border-dashed bg-white py-24 text-center text-muted-foreground">
          <CalendarDays className="mx-auto mb-3 size-10 opacity-40" />
          请从托管人员点击“查看”，或在上方选择人员
        </div>
      ) : (
        <CalendarGrid
          days={days}
          loading={loading}
          resendingDate={resendingDate}
          onResendDay={(attendanceDate) => onResendDay(config, attendanceDate)}
        />
      )}
    </div>
  );
}

function CalendarGrid({
  days,
  loading,
  resendingDate,
  onResendDay,
}: {
  days: CalendarDay[];
  loading: boolean;
  resendingDate: string | null;
  onResendDay: (attendanceDate: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-border dark:bg-card">
      <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-xs font-medium text-muted-foreground dark:bg-muted/30">
        {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => (
          <div key={day} className="py-2">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, index) => (
          <div
            key={`${day.date || "empty"}-${index}`}
            className={cn(
              "min-h-44 border-b border-r p-2",
              !day.date && "bg-slate-50/60 dark:bg-muted/10",
              day.isWeekend &&
                day.date &&
                "bg-amber-50/30 dark:bg-amber-950/10",
            )}
          >
            {day.date ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{day.day}</span>
                  {day.records.length ? (
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className="h-5 border-emerald-200 bg-emerald-50 px-1.5 text-[10px] text-emerald-700"
                      >
                        出勤
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 gap-1 px-1.5 text-[10px]"
                        disabled={resendingDate === day.date}
                        onClick={() => onResendDay(day.date!)}
                      >
                        <RefreshCw className={cn("size-3", resendingDate === day.date && "animate-spin")} />
                        补发
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      休息
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {day.records.map((record) => (
                    <CalendarPunch key={record.id} record={record} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
      {loading ? (
        <div className="flex items-center justify-center border-t py-3 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          日历更新中
        </div>
      ) : null}
    </section>
  );
}

function CalendarPunch({ record }: { record: ManagedAttendanceRecord }) {
  const isIn = record.direction === 0;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        isIn ? "border-emerald-200" : "border-amber-200",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-2">
        {record.photo_url ? (
          <a href={record.photo_url} target="_blank" rel="noreferrer" title="查看考勤照片">
            <img
              src={record.photo_url}
              alt={isIn ? "进场照片" : "出场照片"}
              className="size-8 shrink-0 rounded-full border bg-slate-100 object-cover"
            />
          </a>
        ) : (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-slate-100 text-[9px] text-muted-foreground">无图</div>
        )}
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold text-white", isIn ? "bg-emerald-600" : "bg-amber-600")}>
          {isIn ? "进场" : "出场"}
        </span>
        <span className="text-xs font-semibold">
          {formatTime(record.planned_at)}
        </span>
        <DispatchBadge status={record.dispatch_status} />
      </div>
      {record.dispatch_message ? (
        <div
          className="truncate border-t px-2 py-1 text-[10px] text-muted-foreground"
          title={record.dispatch_message}
        >
          {record.dispatch_message}
        </div>
      ) : null}
    </div>
  );
}

export function PhotoLibraryTab({
  groups,
  loading,
  deleting,
  onDelete,
}: {
  groups: Array<{
    id: string;
    name: string;
    project_name?: string | null;
    in_photos?: string[] | null;
    out_photos?: string[] | null;
    generation_status: string;
    remark?: string | null;
  }>;
  loading: boolean;
  deleting: boolean;
  onDelete: (group: { id: string; name: string }) => void;
}) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm dark:border-border dark:bg-card">
      <SectionHeader
        icon={<ImagePlus className="size-4" />}
        title="进出场照片资料库"
        description="照片按项目和人员场景分组，生成每日考勤时会从对应方向照片中随机选择。"
        loading={loading}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <div key={group.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{group.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {group.project_name || "未匹配项目"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    isManagedPhotoGroupReady(group)
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }
                >
                  {isManagedPhotoGroupReady(group) ? "资料完整" : "待补照片"}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={deleting}
                  onClick={() => onDelete(group)}
                  aria-label={`删除照片组 ${group.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <PhotoPanel
                title="进场照片"
                photos={group.in_photos}
                tone="green"
              />
              <PhotoPanel
                title="出场照片"
                photos={group.out_photos}
                tone="amber"
              />
            </div>
            {group.remark ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {group.remark}
              </p>
            ) : null}
          </div>
        ))}
        {!groups.length ? (
          <div className="col-span-full py-20 text-center text-muted-foreground">
            暂无照片资料
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PhotoDialog({
  open,
  form,
  saving,
  onOpenChange,
  onFormChange,
  onSubmit,
}: {
  open: boolean;
  form: PhotoGroupForm;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: PhotoGroupForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>新增进出场照片组</DialogTitle>
            <DialogDescription>
              分别维护进场和出场照片，一行一个 URL。生成时每天随机选图。
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <Field label="照片组名称">
              <Input
                value={form.name}
                onChange={(event) =>
                  onFormChange({ ...form, name: event.target.value })
                }
                placeholder="例如：张三日常考勤照片"
              />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <TextAreaField
                label="进场照片 URL"
                value={form.inPhotos}
                onChange={(inPhotos) => onFormChange({ ...form, inPhotos })}
              />
              <TextAreaField
                label="出场照片 URL"
                value={form.outPhotos}
                onChange={(outPhotos) => onFormChange({ ...form, outPhotos })}
              />
            </div>
            <Field label="备注">
              <Input
                value={form.remark}
                onChange={(event) =>
                  onFormChange({ ...form, remark: event.target.value })
                }
              />
            </Field>
          </div>
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              className="bg-[#0f6b5d] text-white"
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              保存照片组
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfigDialog({
  open,
  form,
  workers,
  saving,
  editing,
  onOpenChange,
  onFormChange,
  onSubmit,
}: {
  open: boolean;
  form: ConfigForm;
  workers: StructuredWorkerOption[];
  saving: boolean;
  editing: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: ConfigForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92svh] w-[96vw] max-w-[1440px] flex-col overflow-hidden p-0 sm:max-w-[1440px]">
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b px-6 pb-4 pt-6">
            <DialogHeader>
              <DialogTitle>
                {editing ? "编辑自动托管" : "开启人员自动托管"}
              </DialogTitle>
              <DialogDescription>
                开启后，每月最后一天自动随机生成该人员下个月的全部托管考勤。
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="grid gap-4 lg:grid-cols-3">
            <Field label="托管人员">
              <StructuredWorkerSingleSelect
                workers={workers}
                value={form.workerId}
                onChange={(workerId) =>
                  onFormChange({ ...form, workerId })
                }
                placeholder="搜索姓名、单位或班组选择人员"
              />
            </Field>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs leading-5 text-emerald-800 lg:col-span-2">
              系统按项目自动匹配考勤机：进场记录优先发进场机，出场记录优先发出场机；没有专用方向设备时使用自动/通用设备。同方向有多台时全部下发。
            </div>
            <Field label="每月随机考勤天数">
              <Input
                type="number"
                min={1}
                max={31}
                value={form.monthlyAttendanceDays}
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    monthlyAttendanceDays: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="进场随机时间区间">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <Input type="time" aria-label="进场开始时间" value={form.checkInTime} max={form.checkInEndTime} onChange={(event) => onFormChange({ ...form, checkInTime: event.target.value })} />
                <span className="text-muted-foreground">～</span>
                <Input type="time" aria-label="进场结束时间" value={form.checkInEndTime} min={form.checkInTime} onChange={(event) => onFormChange({ ...form, checkInEndTime: event.target.value })} />
              </div>
            </Field>
            <Field label="出场随机时间区间">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <Input type="time" aria-label="出场开始时间" value={form.checkOutTime} max={form.checkOutEndTime} onChange={(event) => onFormChange({ ...form, checkOutTime: event.target.value })} />
                <span className="text-muted-foreground">～</span>
                <Input type="time" aria-label="出场结束时间" value={form.checkOutEndTime} min={form.checkOutTime} onChange={(event) => onFormChange({ ...form, checkOutEndTime: event.target.value })} />
              </div>
            </Field>
            <div className="space-y-3 lg:col-span-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>进出场照片组</Label>
                  <p className="mt-1 text-xs text-muted-foreground">每组各 1 张进场、出场照片；每天随机使用一组，全部轮完后才会重复（最多 30 组）。</p>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={form.photoPairs.length >= 30 || saving} onClick={() => onFormChange({ ...form, photoPairs: [...form.photoPairs, { inPhoto: "", outPhoto: "" }] })}>
                  <Plus className="mr-1 size-4" />添加一组
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {form.photoPairs.map((pair, index) => (
                  <PhotoPairRow
                    key={index}
                    index={index}
                    pair={pair}
                    disabled={saving}
                    removable={form.photoPairs.length > 1}
                    onChange={(nextPair) => onFormChange({ ...form, photoPairs: form.photoPairs.map((item, itemIndex) => itemIndex === index ? nextPair : item) })}
                    onRemove={() => onFormChange({ ...form, photoPairs: form.photoPairs.filter((_, itemIndex) => itemIndex !== index) })}
                  />
                ))}
              </div>
            </div>
            <div className="lg:col-span-3">
              <Field label="备注">
                <Input
                  value={form.remark}
                  onChange={(event) =>
                    onFormChange({ ...form, remark: event.target.value })
                  }
                />
              </Field>
            </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              className="bg-[#0f6b5d] text-white"
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editing ? "保存托管配置" : "确认开启托管"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PhotoPairRow({ index, pair, disabled, removable, onChange, onRemove }: {
  index: number;
  pair: PhotoPair;
  disabled: boolean;
  removable: boolean;
  onChange: (pair: PhotoPair) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState<"in" | "out" | null>(null);
  const upload = async (direction: "in" | "out", file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("请选择图片文件");
    setUploading(direction);
    try {
      const record = await constructionProjectService.uploadFile(file, { bizType: "managed_attendance", fieldKey: direction === "in" ? "in_photo" : "out_photo" });
      onChange(direction === "in" ? { ...pair, inPhoto: record.public_url } : { ...pair, outPhoto: record.public_url });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "照片上传失败");
    } finally {
      setUploading(null);
    }
  };
  return (
    <div className="rounded-lg border bg-slate-50/50 p-2 dark:bg-muted/20">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium">照片组 {index + 1}</span>
        {removable ? <Button type="button" variant="ghost" size="icon" className="size-6 text-red-600" disabled={disabled || Boolean(uploading)} onClick={onRemove}><X className="size-3.5" /></Button> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["in", "out"] as const).map((direction) => {
          const url = direction === "in" ? pair.inPhoto : pair.outPhoto;
          return (
            <label key={direction} className="relative flex aspect-[4/3] min-h-20 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-dashed bg-slate-100 text-[11px] dark:bg-muted">
              {url ? <img src={url} alt={`${direction === "in" ? "进场" : "出场"}照片`} className="absolute inset-0 size-full object-contain" /> : null}
              <span className="absolute left-1 top-1 z-10 rounded bg-slate-950/65 px-1.5 py-0.5 text-white">
                {direction === "in" ? "进" : "出"}
              </span>
              <span className={cn("relative z-10 rounded bg-white/90 px-1.5 py-1 shadow-sm", url && "mb-1.5 mt-auto")}>
                {uploading === direction ? <Loader2 className="mr-1 inline size-3 animate-spin" /> : <Upload className="mr-1 inline size-3" />}
                {url ? "更换" : "上传"}
              </span>
              <input type="file" accept="image/*" className="hidden" disabled={disabled || Boolean(uploading)} onChange={(event) => void upload(direction, event.target.files?.[0])} />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function TabButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
        active
          ? "bg-white text-[#0f6b5d] shadow-sm dark:bg-background"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
function SectionHeader({
  icon,
  title,
  description,
  loading,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  loading?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 font-semibold text-[#0f6b5d]">
          {icon}
          <span className="text-foreground">{title}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
    </div>
  );
}
export function PhotoStrip({
  photos,
  label,
}: {
  photos?: string[] | null;
  label: string;
}) {
  const list = photos || [];
  return (
    <div className="flex items-center">
      <div className="flex -space-x-3">
        {list.slice(0, 3).map((photo, index) => (
          <img
            key={`${photo}-${index}`}
            src={photo}
            alt={`${label}${index + 1}`}
            className="size-10 rounded-lg border-2 border-white object-cover shadow-sm"
          />
        ))}
        {!list.length ? (
          <div className="flex size-10 items-center justify-center rounded-lg border border-dashed text-[10px] text-muted-foreground">
            无图
          </div>
        ) : null}
      </div>
      {list.length > 3 ? (
        <span className="ml-2 text-xs text-muted-foreground">
          +{list.length - 3}
        </span>
      ) : null}
    </div>
  );
}
function MiniStatus({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number;
  tone: "amber" | "green" | "red";
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px]",
        tone === "amber" && "bg-amber-50 text-amber-700",
        tone === "green" && "bg-emerald-50 text-emerald-700",
        tone === "red" && "bg-red-50 text-red-700",
      )}
    >
      {label}
      {value || 0}
    </span>
  );
}
function InfoCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-lg border bg-slate-50/60 px-3 py-2 dark:bg-muted/20">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">
        {helper}
      </div>
    </div>
  );
}
function DispatchBadge({
  status,
}: {
  status: ManagedAttendanceRecord["dispatch_status"];
}) {
  const map = {
    pending: ["待下发", "bg-amber-50 text-amber-700"],
    processing: ["下发中", "bg-blue-50 text-blue-700"],
    success: ["成功", "bg-emerald-50 text-emerald-700"],
    failed: ["失败", "bg-red-50 text-red-700"],
    skipped: ["跳过", "bg-slate-100 text-slate-600"],
  } as const;
  const item = map[status] || map.pending;
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px]", item[1])}>
      {item[0]}
    </span>
  );
}
function PhotoPanel({
  title,
  photos,
  tone,
}: {
  title: string;
  photos?: string[] | null;
  tone: "green" | "amber";
}) {
  const list = photos || [];
  return (
    <div>
      <div
        className={cn(
          "mb-2 flex items-center gap-1.5 text-sm font-medium",
          tone === "green" ? "text-emerald-700" : "text-amber-700",
        )}
      >
        {tone === "green" ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
        {title} · {list.length} 张
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {list.slice(0, 6).map((photo, index) => (
          <img
            key={`${photo}-${index}`}
            src={photo}
            alt={title}
            className="aspect-square w-full rounded-md border object-cover"
            loading="lazy"
          />
        ))}
        {!list.length ? (
          <div className="col-span-3 flex h-20 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            暂无照片
          </div>
        ) : null}
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-28 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-[#0f6b5d]"
      />
    </Field>
  );
}

type CalendarDay = {
  date: string | null;
  day: number | null;
  isWeekend: boolean;
  records: ManagedAttendanceRecord[];
};
function buildCalendarDays(
  month: string,
  records: ManagedAttendanceRecord[],
): CalendarDay[] {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return [];
  const count = new Date(year, monthNumber, 0).getDate();
  const firstWeekday = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const byDate = new Map<string, ManagedAttendanceRecord[]>();
  records.forEach((record) =>
    byDate.set(
      record.attendance_date,
      [...(byDate.get(record.attendance_date) || []), record].sort(
        (a, b) => a.direction - b.direction,
      ),
    ),
  );
  const days: CalendarDay[] = Array.from({ length: firstWeekday }, () => ({
    date: null,
    day: null,
    isWeekend: false,
    records: [],
  }));
  for (let day = 1; day <= count; day += 1) {
    const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(year, monthNumber - 1, day).getDay();
    days.push({
      date,
      day,
      isWeekend: weekday === 0 || weekday === 6,
      records: byDate.get(date) || [],
    });
  }
  while (days.length % 7)
    days.push({ date: null, day: null, isWeekend: false, records: [] });
  return days;
}
export function parsePhotoLines(value: string) {
  return value
    .split(/[\n,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
}
