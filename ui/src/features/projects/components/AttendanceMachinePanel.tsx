import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiClient, API_ENDPOINTS } from "@/lib/api";
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
import { cn } from "@/lib/utils";

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

interface AttendancePoint {
  id: string;
  project_id: string;
  name: string;
  location?: string | null;
  machine_mode_enabled: boolean;
  remark?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface AttendancePointList {
  items: AttendancePoint[];
  total: number;
}

interface FaceSummary {
  enabled: boolean;
  total: number;
  synced: number | null;
  queued: number;
  processing: number;
  failed: number;
  failures: { worker_id: string; name: string; reason: string }[];
  service_error: string | null;
  cleanup_pending: boolean;
}

interface PointFormState {
  name: string;
  location: string;
  machine_mode_enabled: boolean;
  remark: string;
}

const emptyForm: PointFormState = {
  name: "",
  location: "",
  machine_mode_enabled: false,
  remark: "",
};

function unwrap<T>(response: ApiResponse<T>, fallback: string): T {
  if (response && response.success !== false && response.data !== undefined) {
    return response.data;
  }
  throw new Error(response?.message || fallback);
}

export function AttendanceMachinePanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<AttendancePoint | null>(null);
  const [form, setForm] = useState<PointFormState>(emptyForm);
  const faceQuery = useQuery({
    queryKey: ["construction-face-summary", projectId],
    queryFn: async () => {
      const url = API_ENDPOINTS.MANAGEMENT.PROJECT_ATTENDANCE_POINTS(projectId).replace(/attendance-points$/, "attendance-face-summary");
      const response = await apiClient.get<ApiResponse<FaceSummary>>(url);
      return unwrap(response.data, "获取人脸同步进度失败");
    },
    refetchInterval: 5000,
  });

  const pointsQuery = useQuery({
    queryKey: ["construction-attendance-points", projectId],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<AttendancePointList>>(
        API_ENDPOINTS.MANAGEMENT.PROJECT_ATTENDANCE_POINTS(projectId),
        { params: { page: 1, page_size: 200 } }
      );
      return unwrap(response.data, "获取考勤点列表失败");
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["construction-face-summary", projectId] });
    return queryClient.invalidateQueries({ queryKey: ["construction-attendance-points", projectId] });
  };

  const retryMutation = useMutation({
    mutationFn: async () => {
      const url = API_ENDPOINTS.MANAGEMENT.PROJECT_ATTENDANCE_POINTS(projectId).replace(/attendance-points$/, "attendance-face-retry");
      const response = await apiClient.post<ApiResponse<{ queued: number }>>(url);
      return unwrap(response.data, "提交人脸重试失败");
    },
    onSuccess: ({ queued }) => {
      toast.success(queued > 0 ? `已安排 ${queued} 人异步同步` : "暂无新增任务，有头像的人员已在队列中或正在同步");
      void invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "提交人脸重试失败"),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: PointFormState) => {
      if (editingPoint) {
        const response = await apiClient.patch<ApiResponse<AttendancePoint>>(
          API_ENDPOINTS.MANAGEMENT.PROJECT_ATTENDANCE_POINT(projectId, editingPoint.id),
          payload
        );
        return unwrap(response.data, "修改考勤点失败");
      }
      const response = await apiClient.post<ApiResponse<AttendancePoint>>(
        API_ENDPOINTS.MANAGEMENT.PROJECT_ATTENDANCE_POINTS(projectId),
        payload
      );
      return unwrap(response.data, "新增考勤点失败");
    },
    onSuccess: () => {
      toast.success(editingPoint ? "考勤点已更新" : "考勤点已新增");
      setDialogOpen(false);
      setEditingPoint(null);
      setForm(emptyForm);
      void invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "保存考勤点失败");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (point: AttendancePoint) => {
      const response = await apiClient.patch<ApiResponse<AttendancePoint>>(
        API_ENDPOINTS.MANAGEMENT.PROJECT_ATTENDANCE_POINT(projectId, point.id),
        { machine_mode_enabled: !point.machine_mode_enabled }
      );
      return unwrap(response.data, "切换移动人脸机失败");
    },
    onSuccess: (point) => {
      toast.success(point.machine_mode_enabled ? "已开启移动人脸机" : "已关闭移动人脸机");
      void invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "切换移动人脸机失败");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (point: AttendancePoint) => {
      await apiClient.delete(
        API_ENDPOINTS.MANAGEMENT.PROJECT_ATTENDANCE_POINT(projectId, point.id)
      );
    },
    onSuccess: () => {
      toast.success("考勤点已删除");
      void invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "删除考勤点失败");
    },
  });

  const openCreate = () => {
    setEditingPoint(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (point: AttendancePoint) => {
    setEditingPoint(point);
    setForm({
      name: point.name ?? "",
      location: point.location ?? "",
      machine_mode_enabled: point.machine_mode_enabled,
      remark: point.remark ?? "",
    });
    setDialogOpen(true);
  };

  const handleDelete = (point: AttendancePoint) => {
    if (window.confirm(`确认删除考勤点「${point.name}」？删除后该点位无法继续刷脸打卡。`)) {
      deleteMutation.mutate(point);
    }
  };

  const points = pointsQuery.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-muted-foreground">
          移动人脸机：在考勤点开启后，小程序可通过摄像头人脸识别打卡，打卡记录类型为「考勤点考勤」。
          开启时会自动将项目内已录入头像的工人异步同步到人脸库。
        </div>
        <Button
          size="sm"
          className="h-8 gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
          onClick={openCreate}
        >
          <Plus className="size-4" />
          添加考勤点
        </Button>
      </div>

      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-muted/30" aria-live="polite">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-medium">项目人脸库</span>
        {faceQuery.isError ? <span className="text-red-600">进度获取失败，请稍后重试</span> : !faceQuery.data ? <span>正在获取同步进度…</span> : <>
            <span>已入库 <strong>{faceQuery.data.synced ?? "—"}/{faceQuery.data.total}</strong></span>
            <span>排队中 {faceQuery.data.queued}</span>
            <span>同步中 {faceQuery.data.processing}</span>
            <span className={faceQuery.data.failed ? "text-red-600" : ""}>失败 {faceQuery.data.failed}</span>
        </>}
        <Button
          size="sm" variant="ghost" className="ml-auto h-6 gap-1 px-2 text-xs"
          disabled={!faceQuery.data?.enabled || retryMutation.isPending}
          onClick={() => retryMutation.mutate()}
          title="按最新头像重新同步项目内有头像的人员，补回失败或缺失人脸；正在排队或同步的任务不会重复添加"
        >
          <RotateCw className={cn("h-3 w-3", retryMutation.isPending && "animate-spin")} />
          {retryMutation.isPending ? "提交中…" : "一键重试"}
        </Button>
        <details>
          <summary className="cursor-pointer text-slate-500">说明</summary>
          <p className="mt-2 max-w-xl leading-relaxed">所有启用点位共享人脸库，关闭或删除最后一个启用点位后自动清理特征及照片。统计当前项目未删除且有头像的工人，每 5 秒刷新；更新中的旧人脸仍可能计入已入库。一键重试按最新头像重新同步有头像的人员，不清空已有可用人脸；无人脸或照片损坏需更换头像，保存后自动异步同步。</p>
        </details>
        </div>
        {faceQuery.data && <>
          {faceQuery.data.service_error && <p className="mt-2 text-amber-700">{faceQuery.data.service_error}</p>}
          {!faceQuery.data.enabled && <p className="mt-2 text-amber-700">{faceQuery.data.cleanup_pending ? "等待清理人脸库" : "移动人脸机未开启"}</p>}
          {faceQuery.data.failures.length > 0 && <details className="mt-1">
            <summary className="cursor-pointer text-red-600">失败原因</summary>
            <ul className="mt-2 max-h-60 space-y-2 overflow-auto">
              {faceQuery.data.failures.map((failure) => <li key={failure.worker_id}><strong>{failure.name || "未命名工人"}</strong>：{failure.reason}</li>)}
            </ul>
          </details>}
        </>}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>考勤点名称</TableHead>
              <TableHead>位置</TableHead>
              <TableHead>移动人脸机</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="w-32 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pointsQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-slate-400">
                  考勤点加载中...
                </TableCell>
              </TableRow>
            ) : points.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-slate-400">
                  暂无考勤点，点击右上角「添加考勤点」创建
                </TableCell>
              </TableRow>
            ) : (
              points.map((point) => (
                <TableRow key={point.id}>
                  <TableCell className="font-medium">{point.name}</TableCell>
                  <TableCell>{point.location || "-"}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      disabled={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate(point)}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        point.machine_mode_enabled ? "bg-[#0f6b5d]" : "bg-slate-300 dark:bg-muted"
                      )}
                      title={point.machine_mode_enabled ? "点击关闭移动人脸机" : "点击开启移动人脸机"}
                    >
                      <span
                        className={cn(
                          "inline-block size-4 transform rounded-full bg-white transition-transform",
                          point.machine_mode_enabled ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                    <Badge
                      variant="outline"
                      className={cn(
                        "ml-2",
                        point.machine_mode_enabled
                          ? "border-emerald-300 text-emerald-700"
                          : "text-slate-400"
                      )}
                    >
                      {point.machine_mode_enabled ? "已开启" : "未开启"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{point.remark || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(point)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(point)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="size-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPoint ? "编辑考勤点" : "添加考勤点"}</DialogTitle>
            <DialogDescription>
              开启移动人脸机后，系统会将项目工人的头像人脸异步同步到人脸识别服务。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="attendance-point-name">考勤点名称</Label>
              <Input
                id="attendance-point-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="如：东门闸机"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="attendance-point-location">位置</Label>
              <Input
                id="attendance-point-location"
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                placeholder="如：工地东门入口处"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-border">
              <div>
                <div className="text-sm font-medium">开启移动人脸机</div>
                <div className="text-xs text-slate-400">开启后小程序可在该考勤点刷脸打卡</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((current) => ({ ...current, machine_mode_enabled: !current.machine_mode_enabled }))
                }
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  form.machine_mode_enabled ? "bg-[#0f6b5d]" : "bg-slate-300 dark:bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block size-4 transform rounded-full bg-white transition-transform",
                    form.machine_mode_enabled ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="attendance-point-remark">备注</Label>
              <Input
                id="attendance-point-remark"
                value={form.remark}
                onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
                placeholder="选填"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
              disabled={saveMutation.isPending || !form.name.trim()}
              onClick={() =>
                saveMutation.mutate({
                  ...form,
                  name: form.name.trim(),
                  location: form.location.trim(),
                  remark: form.remark.trim(),
                })
              }
            >
              {saveMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
