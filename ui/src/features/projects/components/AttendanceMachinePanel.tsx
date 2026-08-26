import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
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

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["construction-attendance-points", projectId] });

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
      return unwrap(response.data, "切换考勤机模式失败");
    },
    onSuccess: (point) => {
      toast.success(point.machine_mode_enabled ? "已开启考勤机模式" : "已关闭考勤机模式");
      void invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "切换考勤机模式失败");
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
          考勤机模式：在考勤点开启后，小程序可通过摄像头人脸识别打卡，打卡记录类型为「考勤点考勤」。
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

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>考勤点名称</TableHead>
              <TableHead>位置</TableHead>
              <TableHead>考勤机模式</TableHead>
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
                      title={point.machine_mode_enabled ? "点击关闭考勤机模式" : "点击开启考勤机模式"}
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
              开启考勤机模式后，系统会将项目工人的头像人脸异步同步到人脸识别服务。
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
                <div className="text-sm font-medium">开启考勤机模式</div>
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
