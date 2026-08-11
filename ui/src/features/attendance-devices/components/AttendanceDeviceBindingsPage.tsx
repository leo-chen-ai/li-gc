import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  FileClock,
  Loader2,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  UserX,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateAttendanceDeviceMutation,
  useDeleteAttendanceDeviceMutation,
  useIssueAttendanceDeviceWorkersMutation,
  useProjectAttendanceDevicesQuery,
  useProjectOptionsQuery,
  useUpdateAttendanceDeviceMutation,
} from "@/features/projects/hooks/use-construction-projects";
import { ProjectSearchSelect } from "@/features/projects/components/ProjectSearchSelect";
import type {
  ConstructionAttendanceDevice,
  ConstructionAttendanceDeviceIssueWorkersSummary,
  ConstructionAttendanceDevicePayload,
} from "@/features/projects/types/construction-types";

const DEVICE_PAGE_SIZE = 10;

const directionOptions = [
  { label: "进场", value: "0" },
  { label: "出场", value: "1" },
  { label: "通用", value: "2" },
] as const;

const deviceTypeOptions = [
  { label: "海厂家", value: "海厂家" },
  { label: "弹厂家", value: "弹厂家" },
  { label: "芊熠厂家", value: "芊熠厂家" },
] as const;
const HEARTBEAT_ONLINE_WINDOW_MS = 3 * 60 * 1000;
const B_VENDOR_ONLINE_WINDOW_MS = 15 * 60 * 1000;
const B_VENDOR_DEVICE_TYPE = "弹厂家";

type DeviceFormState = {
  project_id: string;
  device_type: string;
  serial_number: string;
  device_name: string;
  direction: "0" | "1" | "2";
  remark: string;
};

const defaultFormState: DeviceFormState = {
  project_id: "",
  device_type: "海厂家",
  serial_number: "",
  device_name: "",
  direction: "0",
  remark: "",
};

export function AttendanceDeviceBindingsPage() {
  const projectsQuery = useProjectOptionsQuery();
  const projects = projectsQuery.data ?? [];
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<ConstructionAttendanceDevice | null>(null);
  const [devicePendingDelete, setDevicePendingDelete] = useState<ConstructionAttendanceDevice | null>(null);
  const [devicePendingClear, setDevicePendingClear] = useState<ConstructionAttendanceDevice | null>(null);
  const [issuingDeviceId, setIssuingDeviceId] = useState<string | null>(null);
  const [clearingDeviceId, setClearingDeviceId] = useState<string | null>(null);
  const [form, setForm] = useState<DeviceFormState>(defaultFormState);

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      const firstProjectId = projects[0]?.id ?? "";
      setSelectedProjectId(firstProjectId);
      setForm((current) => ({ ...current, project_id: firstProjectId }));
    }
  }, [projects, selectedProjectId]);

  const currentProject = projects.find((project) => project.id === selectedProjectId);
  useEffect(() => {
    setPage(1);
  }, [keyword, selectedProjectId]);

  const deviceFilters = useMemo(
    () => ({
      page,
      page_size: DEVICE_PAGE_SIZE,
      keyword: keyword.trim() || undefined,
    }),
    [keyword, page]
  );
  const devicesQuery = useProjectAttendanceDevicesQuery(selectedProjectId, deviceFilters);
  const createDevice = useCreateAttendanceDeviceMutation(form.project_id);
  const updateDevice = useUpdateAttendanceDeviceMutation(editingDevice?.project_id ?? form.project_id);
  const deleteDevice = useDeleteAttendanceDeviceMutation(devicePendingDelete?.project_id ?? selectedProjectId);
  const issueWorkers = useIssueAttendanceDeviceWorkersMutation();
  const devices = devicesQuery.data?.items ?? [];
  const total = devicesQuery.data?.total ?? 0;
  const pageSize = devicesQuery.data?.page_size ?? DEVICE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);
  const inboundCount = devices.filter((device) => device.direction === 0).length;
  const outboundCount = devices.filter((device) => device.direction === 1).length;
  const genericCount = devices.filter((device) => device.direction === 2).length;
  const onlineCount = devices.filter(isDeviceOnline).length;
  const isSaving = createDevice.isPending || updateDevice.isPending;

  const openCreateDialog = () => {
    const projectId = selectedProjectId || projects[0]?.id || "";
    setEditingDevice(null);
    setForm({ ...defaultFormState, project_id: projectId });
    setFormOpen(true);
  };

  const openEditDialog = (device: ConstructionAttendanceDevice) => {
    setEditingDevice(device);
    setForm({
      project_id: device.project_id,
      device_type: device.device_type || "海厂家",
      serial_number: device.serial_number ?? "",
      device_name: device.device_name ?? "",
      direction: device.direction === 2 ? "2" : device.direction === 1 ? "1" : "0",
      remark: device.remark ?? "",
    });
    setFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.project_id) {
      toast.error("请选择项目");
      return;
    }
    if (!form.serial_number.trim()) {
      toast.error("请填写序列号");
      return;
    }
    if (!form.device_name.trim()) {
      toast.error("请填写设备名字");
      return;
    }

    const payload: ConstructionAttendanceDevicePayload = {
      device_type: form.device_type.trim() || "海厂家",
      serial_number: form.serial_number.trim(),
      device_name: form.device_name.trim(),
      direction: Number(form.direction),
      remark: form.remark.trim() || null,
    };

    try {
      if (editingDevice) {
        await updateDevice.mutateAsync({ deviceId: editingDevice.id, payload });
        toast.success("考勤机绑定已修改");
      } else {
        const createdDevice = await createDevice.mutateAsync(payload);
        setSelectedProjectId(form.project_id);
        if (isBVendorDevice(createdDevice)) {
          toast.success("考勤机绑定已新增，设备将通过 /workers 主动拉取人员");
        } else if (isDeviceOnline(createdDevice)) {
          setIssuingDeviceId(createdDevice.id);
          try {
            const summary = await issueWorkers.mutateAsync({
              projectId: createdDevice.project_id,
              deviceId: createdDevice.id,
              action: "create",
              remark: "新增考勤机后自动下发",
            });
            toast.success(formatIssueSummary("考勤机绑定已新增，已自动下发", summary));
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "自动下发人员失败");
          } finally {
            setIssuingDeviceId(null);
          }
        } else {
          toast.success("考勤机绑定已新增，设备在线后会自动下发一轮人员");
        }
      }
      setFormOpen(false);
      setEditingDevice(null);
      setForm(defaultFormState);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : editingDevice ? "修改考勤机绑定失败" : "新增考勤机绑定失败");
    }
  };

  const handleDelete = async () => {
    if (!devicePendingDelete) return;

    try {
      await deleteDevice.mutateAsync(devicePendingDelete.id);
      toast.success("考勤机绑定已删除");
      setDevicePendingDelete(null);
    } catch {
      toast.error("删除考勤机绑定失败");
    }
  };

  const handleIssueDevice = async (device: ConstructionAttendanceDevice) => {
    setIssuingDeviceId(device.id);
    try {
      const summary = await issueWorkers.mutateAsync({
        projectId: device.project_id,
        deviceId: device.id,
        action: "update",
        remark: "手动重新下发",
      });
      toast.success(formatIssueSummary("已重新下发", summary));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重新下发人员失败");
    } finally {
      setIssuingDeviceId(null);
    }
  };

  const handleClearDeviceWorkers = async () => {
    if (!devicePendingClear) return;

    setClearingDeviceId(devicePendingClear.id);
    try {
      const summary = await issueWorkers.mutateAsync({
        projectId: devicePendingClear.project_id,
        deviceId: devicePendingClear.id,
        action: "delete",
        remark: "手动清空考勤机人员",
      });
      toast.success(formatIssueSummary("已发送清空人员指令", summary));
      setDevicePendingClear(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清空考勤机人员失败");
    } finally {
      setClearingDeviceId(null);
    }
  };

  return (
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="grid gap-4 border-b border-slate-100 px-5 py-3 dark:border-border lg:grid-cols-[minmax(420px,1fr)_auto] lg:items-center">
          <div className="grid gap-2 sm:grid-cols-5">
            <CompactStat label="绑定设备" value={total} helper={currentProject?.name || "请选择项目"} />
            <CompactStat label="本页在线" value={onlineCount} helper="最近有心跳或通信" accent="teal" />
            <CompactStat label="本页进场" value={inboundCount} helper="方向为进场" accent="teal" />
            <CompactStat label="本页出场" value={outboundCount} helper="方向为出场" accent="amber" />
            <CompactStat label="本页通用" value={genericCount} helper="方向为通用" accent="blue" />
          </div>

          <Button
            className="h-9 gap-2 justify-self-start bg-[#0f6b5d] text-white hover:bg-[#0b5148] lg:justify-self-end"
            onClick={openCreateDialog}
            disabled={projects.length === 0}
          >
            <Plus className="size-4" />
            新增绑定
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-[#f8faf9] px-5 py-3 dark:bg-muted/30">
          <label className="min-w-[280px] flex-1 space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">选择项目</span>
            <ProjectSearchSelect
              value={selectedProjectId}
              onValueChange={(projectId) => {
                setSelectedProjectId(projectId);
                setForm((current) => ({ ...current, project_id: projectId }));
              }}
              disabled={projectsQuery.isLoading}
              allOptionLabel={
                projectsQuery.isError
                  ? "项目加载失败，请重试"
                  : projects.length === 0
                    ? "搜索项目"
                    : "请选择项目"
              }
            />
          </label>

          <label className="min-w-[280px] flex-1 space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">搜索</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索厂家、序列号、设备名字、备注"
                className="h-10 rounded-lg border-slate-200 bg-white pl-9 focus-visible:border-[#0f6b5d] focus-visible:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
              />
            </div>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-border">
          <div>
            <h2 className="text-base font-semibold tracking-normal">绑定列表</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
              {devicesQuery.isLoading
                ? "考勤机绑定加载中"
                : devicesQuery.isError
                  ? "考勤机绑定加载失败，请检查登录状态或后端服务"
                  : `显示 ${rangeStart}-${rangeEnd} 条，共 ${total} 条`}
            </p>
          </div>
          {devicesQuery.isError && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="size-3.5" />
              数据加载异常
            </div>
          )}
        </div>

        <Table className="min-w-[1360px]">
          <TableHeader>
            <TableRow className="bg-[#f8faf9] hover:bg-[#f8faf9] dark:bg-muted/30 dark:hover:bg-muted/30">
              <TableHead className="w-[230px] px-5 text-slate-500 dark:text-muted-foreground">设备名字</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">选择项目</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">考勤机类型</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">序列号</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">在线状态</TableHead>
              <TableHead>进出方向</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">备注信息</TableHead>
              <TableHead className="w-[330px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.length > 0 ? (
              devices.map((device) => (
                <TableRow key={device.id} className="hover:bg-[#f8faf9]/70 dark:hover:bg-muted/30">
                  <TableCell className="px-5 py-4">
                    <div className="font-medium text-slate-950 dark:text-foreground">
                      {device.device_name || "未命名设备"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                      {formatDateTime(device.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[220px] truncate text-sm">
                      {currentProject?.name || device.project_id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-md border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                      {device.device_type || "海厂家"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm text-slate-700 dark:text-muted-foreground">
                      {device.serial_number || "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DeviceStatusBadge device={device} />
                  </TableCell>
                  <TableCell>
                    <DirectionBadge value={device.direction} />
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[260px] truncate text-sm text-slate-600 dark:text-muted-foreground">
                      {device.remark || "-"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {!isBVendorDevice(device) ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title={isDeviceOnline(device) ? "重新下发本项目人员" : "设备在线后可下发"}
                            disabled={!isDeviceOnline(device) || issuingDeviceId === device.id || clearingDeviceId === device.id}
                            className="gap-1 text-[#0f6b5d] hover:bg-emerald-50 hover:text-[#0b5148] disabled:text-slate-400 dark:text-primary dark:hover:bg-emerald-950/30"
                            onClick={() => handleIssueDevice(device)}
                          >
                            {issuingDeviceId === device.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Send className="size-4" />
                            )}
                            下发
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title={isDeviceOnline(device) ? "清空该考勤机上的人员" : "设备在线后可清空人员"}
                            disabled={!isDeviceOnline(device) || issuingDeviceId === device.id || clearingDeviceId === device.id}
                            className="gap-1 text-amber-700 hover:bg-amber-50 hover:text-amber-800 disabled:text-slate-400 dark:text-amber-300 dark:hover:bg-amber-950/30"
                            onClick={() => setDevicePendingClear(device)}
                          >
                            {clearingDeviceId === device.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <UserX className="size-4" />
                            )}
                            清空人员
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            asChild
                            className="gap-1 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30"
                          >
                            <Link
                              to="/app/admin/attendance-device-issue-reports"
                              search={{
                                project_id: device.project_id,
                                attendance_device_id: device.id,
                                device_name: device.device_name || undefined,
                                serial_number: device.serial_number || undefined,
                                include_delete_actions: "1",
                              }}
                            >
                              <FileClock className="size-4" />
                              下发报告
                            </Link>
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-slate-600 hover:bg-slate-50 dark:text-muted-foreground dark:hover:bg-muted/40"
                        onClick={() => openEditDialog(device)}
                      >
                        <Pencil className="size-4" />
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                        onClick={() => setDevicePendingDelete(device)}
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
                  {devicesQuery.isLoading
                    ? "正在加载考勤机绑定"
                    : devicesQuery.isError
                      ? "考勤机绑定加载失败，请重新登录或检查后端服务"
                      : selectedProjectId
                        ? "暂无符合条件的考勤机绑定"
                        : "请选择项目后维护考勤机绑定"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-[#f8faf9] px-5 py-3 text-sm text-slate-500 dark:border-border dark:bg-muted/30 dark:text-muted-foreground">
          <span>显示 {rangeStart}-{rangeEnd} 条，共 {total} 条</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || devicesQuery.isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              上一页
            </Button>
            <span className="min-w-12 text-center text-slate-700 dark:text-foreground">
              {page}/{totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || devicesQuery.isLoading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingDevice ? "编辑考勤机绑定" : "新增考勤机绑定"}</DialogTitle>
            <DialogDescription>
              维护项目、厂家、序列号、设备名字、进出方向和备注信息。
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">选择项目</span>
                <ProjectSearchSelect
                  value={form.project_id}
                  onValueChange={(projectId) => setForm((current) => ({ ...current, project_id: projectId }))}
                  disabled={Boolean(editingDevice)}
                  className="h-9"
                  allOptionLabel="请选择项目"
                />
              </label>

              <Field label="考勤机类型">
                <select
                  value={form.device_type}
                  onChange={(event) => setForm((current) => ({ ...current, device_type: event.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
                >
                  {deviceTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="序列号" required>
                <Input
                  value={form.serial_number}
                  onChange={(event) => setForm((current) => ({ ...current, serial_number: event.target.value }))}
                  placeholder="请输入设备序列号"
                  className="h-9"
                  required
                />
              </Field>

              <Field label="设备名字" required>
                <Input
                  value={form.device_name}
                  onChange={(event) => setForm((current) => ({ ...current, device_name: event.target.value }))}
                  placeholder="例如：南门进场考勤机"
                  className="h-9"
                  required
                />
              </Field>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">进出方向</span>
                <select
                  value={form.direction}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      direction: directionOptions.some((option) => option.value === event.target.value)
                        ? (event.target.value as DeviceFormState["direction"])
                        : "0",
                    }))
                  }
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
                >
                  {directionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">备注信息</span>
                <textarea
                  value={form.remark}
                  onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
                  rows={3}
                  placeholder="补充安装位置、使用说明或其他备注"
                  className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
                />
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isSaving} className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]">
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    保存中...
                  </>
                ) : (
                  "保存"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(devicePendingDelete)} onOpenChange={(open) => !open && setDevicePendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除考勤机绑定</DialogTitle>
            <DialogDescription>
              删除后该设备不会继续出现在绑定列表中。确认删除
              {devicePendingDelete ? `「${devicePendingDelete.device_name || devicePendingDelete.serial_number}」` : ""}？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDevicePendingDelete(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteDevice.isPending}>
              {deleteDevice.isPending ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(devicePendingClear)} onOpenChange={(open) => !open && setDevicePendingClear(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清空考勤机人员</DialogTitle>
            <DialogDescription>
              将向考勤机
              {devicePendingClear ? `「${devicePendingClear.device_name || devicePendingClear.serial_number}」` : ""}
              发送人员删除指令，清空设备端已下发人员；系统里的工人数据不会删除。确认继续？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDevicePendingClear(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearDeviceWorkers}
              disabled={issueWorkers.isPending || !devicePendingClear || !isDeviceOnline(devicePendingClear)}
            >
              {devicePendingClear?.id === clearingDeviceId ? "清空中..." : "清空人员"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <Label className="space-y-1.5">
      <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {children}
    </Label>
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
  accent?: "slate" | "teal" | "amber" | "blue";
}) {
  const accentClass = {
    slate: "text-slate-950 dark:text-foreground",
    teal: "text-[#0f6b5d] dark:text-primary",
    amber: "text-amber-700 dark:text-amber-300",
    blue: "text-blue-700 dark:text-blue-300",
  }[accent];

  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-[#f8faf9] px-3 py-2 dark:border-border dark:bg-muted/30">
      <div className="truncate text-xs font-medium text-slate-500 dark:text-muted-foreground">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold leading-none ${accentClass}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500 dark:text-muted-foreground">{helper}</div>
    </div>
  );
}

function DirectionBadge({ value }: { value: number }) {
  if (value === 2) {
    return (
      <Badge
        variant="outline"
        className="rounded-md border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
      >
        通用
      </Badge>
    );
  }

  const isOutbound = value === 1;
  return (
    <Badge
      variant="outline"
      className={
        isOutbound
          ? "rounded-md border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
          : "rounded-md border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
      }
    >
      {isOutbound ? "出场" : "进场"}
    </Badge>
  );
}

function DeviceStatusBadge({ device }: { device: ConstructionAttendanceDevice }) {
  const online = isDeviceOnline(device);
  const isBVendor = device.device_type === B_VENDOR_DEVICE_TYPE;
  const activityAt = isBVendor ? device.last_seen_at : device.last_heartbeat_at;
  const activityText = activityAt
    ? `${isBVendor ? "通信" : "心跳"} ${formatDateTime(activityAt)}`
    : isBVendor
      ? "暂无通信"
      : "暂无心跳";
  const statusText = online
    ? "在线"
    : activityAt || device.online_status === "offline"
      ? "离线"
      : "未连接";

  return (
    <div className="space-y-1">
      <Badge
        variant="outline"
        className={
          online
            ? "rounded-md border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
            : "rounded-md border-slate-200 bg-slate-50 text-slate-600 dark:border-border dark:bg-muted/30 dark:text-muted-foreground"
        }
      >
        {statusText}
      </Badge>
      <div className="max-w-[180px] truncate text-xs text-slate-500 dark:text-muted-foreground">{activityText}</div>
    </div>
  );
}

function isDeviceOnline(device: ConstructionAttendanceDevice) {
  if (isBVendorDevice(device)) {
    if (!device.last_seen_at) return false;
    const lastSeenAt = new Date(device.last_seen_at).getTime();
    return !Number.isNaN(lastSeenAt) && Date.now() - lastSeenAt <= B_VENDOR_ONLINE_WINDOW_MS;
  }

  if (device.online_status === "offline") return false;
  if (!device.last_heartbeat_at) return device.online_status === "online";

  const heartbeatAt = new Date(device.last_heartbeat_at).getTime();
  if (Number.isNaN(heartbeatAt)) return device.online_status === "online";

  return Date.now() - heartbeatAt <= HEARTBEAT_ONLINE_WINDOW_MS;
}

function isBVendorDevice(device: ConstructionAttendanceDevice) {
  return device.device_type === B_VENDOR_DEVICE_TYPE;
}

function formatIssueSummary(prefix: string, summary: ConstructionAttendanceDeviceIssueWorkersSummary) {
  const parts = [`${prefix} ${summary.queued} 人`];
  if (summary.skipped_without_photo > 0) {
    parts.push(`跳过无照片 ${summary.skipped_without_photo} 人`);
  }
  if (summary.failed > 0) {
    parts.push(`失败 ${summary.failed} 人`);
  }
  return parts.join("，");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
