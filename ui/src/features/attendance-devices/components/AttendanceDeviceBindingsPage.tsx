import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Fingerprint,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
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
  useProjectAttendanceDevicesQuery,
  useProjectOptionsQuery,
  useUpdateAttendanceDeviceMutation,
} from "@/features/projects/hooks/use-construction-projects";
import { ProjectSearchSelect } from "@/features/projects/components/ProjectSearchSelect";
import type {
  ConstructionAttendanceDevice,
  ConstructionAttendanceDevicePayload,
} from "@/features/projects/types/construction-types";

const DEVICE_PAGE_SIZE = 10;

const directionOptions = [
  { label: "进场", value: "0" },
  { label: "出场", value: "1" },
  { label: "通用", value: "2" },
] as const;

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
  device_type: "A厂家",
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
  const devices = devicesQuery.data?.items ?? [];
  const total = devicesQuery.data?.total ?? 0;
  const pageSize = devicesQuery.data?.page_size ?? DEVICE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);
  const inboundCount = devices.filter((device) => device.direction === 0).length;
  const outboundCount = devices.filter((device) => device.direction === 1).length;
  const genericCount = devices.filter((device) => device.direction === 2).length;
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
      device_type: device.device_type || "A厂家",
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
      device_type: form.device_type.trim() || "A厂家",
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
        await createDevice.mutateAsync(payload);
        setSelectedProjectId(form.project_id);
        toast.success("考勤机绑定已新增");
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

  return (
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="grid gap-4 border-b border-slate-100 px-5 py-4 dark:border-border lg:grid-cols-[minmax(260px,0.9fr)_minmax(420px,1.1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              <Fingerprint className="size-3.5" />
              考勤机管理
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-normal">考勤机绑定</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
              按项目维护考勤机厂家、序列号、设备名字和进出方向。
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <CompactStat label="绑定设备" value={total} helper={currentProject?.name || "请选择项目"} />
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

        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="bg-[#f8faf9] hover:bg-[#f8faf9] dark:bg-muted/30 dark:hover:bg-muted/30">
              <TableHead className="w-[230px] px-5 text-slate-500 dark:text-muted-foreground">设备名字</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">选择项目</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">考勤机类型</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">序列号</TableHead>
              <TableHead>进出方向</TableHead>
              <TableHead className="text-slate-500 dark:text-muted-foreground">备注信息</TableHead>
              <TableHead className="text-right">操作</TableHead>
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
                      {device.device_type || "A厂家"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm text-slate-700 dark:text-muted-foreground">
                      {device.serial_number || "-"}
                    </span>
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
                    <div className="flex justify-end gap-1">
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
                <TableCell colSpan={7} className="h-28 text-center text-sm text-slate-500 dark:text-muted-foreground">
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
                <Input
                  value={form.device_type}
                  onChange={(event) => setForm((current) => ({ ...current, device_type: event.target.value }))}
                  placeholder="默认 A厂家"
                  className="h-9"
                />
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
