import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ProjectSearchSelect } from "@/features/projects/components/ProjectSearchSelect";
import { useProjectWorkersQuery } from "@/features/projects/hooks/use-construction-projects";

import { useAttendancePhotosQuery } from "../hooks";
import { photoDedupeKey } from "../lib";
import type { AttendancePhotoItem, PhotoDirection } from "../types";

type AttendancePhotoPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 组内已有的照片，用于跳过重复项 */
  existingKeys: string[];
  onConfirm: (photos: AttendancePhotoItem[]) => void;
};

/** 默认看最近 30 天，绝大多数工地考勤照片都在这个范围内。 */
function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: to.toISOString().slice(0, 10),
  };
}

/**
 * 「拉取照片」弹窗：按项目/人员/时间段/方向拉出真实考勤照片，勾选后加入组。
 *
 * 项目列表必须走 `ProjectSearchSelect`（底层是 MANAGEMENT.PROJECT_OPTIONS），
 * 它按 `user_managed_projects` 过滤；不要换成 ADMIN 的接口。
 */
export function AttendancePhotoPickerDialog({
  open,
  onOpenChange,
  existingKeys,
  onConfirm,
}: AttendancePhotoPickerDialogProps) {
  const initialRange = useMemo(() => defaultDateRange(), []);
  const [projectId, setProjectId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [direction, setDirection] = useState<PhotoDirection | "">("");
  const [dateFrom, setDateFrom] = useState(initialRange.date_from);
  const [dateTo, setDateTo] = useState(initialRange.date_to);
  const [workerKeyword, setWorkerKeyword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const workersQuery = useProjectWorkersQuery(projectId, {
    page: 1,
    page_size: 100,
    work_status: 1,
    keyword: workerKeyword.trim() || undefined,
  } as Parameters<typeof useProjectWorkersQuery>[1]);
  const workers = workersQuery.data?.items ?? [];
  const selectedWorker = workers.find((worker) => worker.id === workerId);

  const filters = useMemo(
    () =>
      projectId && workerId
        ? {
            project_id: projectId,
            worker_id: workerId,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            direction,
          }
        : null,
    [dateFrom, dateTo, direction, projectId, workerId]
  );
  const photosQuery = useAttendancePhotosQuery(open ? filters : null);
  const photos = useMemo(() => photosQuery.data?.items ?? [], [photosQuery.data]);

  const existing = useMemo(() => new Set(existingKeys), [existingKeys]);
  const newPhotos = useMemo(
    () =>
      photos.filter(
        (photo) =>
          !existing.has(
            photoDedupeKey({
              attendance_record_id: photo.attendance_record_id,
              project_id: photo.project_id,
              worker_id: photo.worker_id,
              attendance_date: photo.attendance_date,
              direction: photo.direction,
            })
          )
      ),
    [existing, photos]
  );
  const duplicatedCount = photos.length - newPhotos.length;

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const handleConfirm = () => {
    const picked = photos.filter((photo) => selected.has(photoKey(photo)));
    if (!picked.length) {
      toast.info("请先勾选要加入的照片");
      return;
    }
    onConfirm(picked);
    setSelected(new Set());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // 关闭时清掉勾选，下次打开是一份干净的待选列表。
        if (!nextOpen) setSelected(new Set());
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[92svh] w-[96vw] max-w-5xl flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>拉取考勤照片</DialogTitle>
          <DialogDescription>
            选择项目和人员后拉出该时间段的真实考勤照片，勾选加入当前处理组。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-lg border bg-slate-50 p-3 dark:bg-muted/30 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>项目</Label>
            <ProjectSearchSelect
              value={projectId}
              onValueChange={(value) => {
                setProjectId(value);
                setWorkerId("");
                setSelected(new Set());
              }}
              placeholder="搜索项目"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="photo-picker-worker">人员</Label>
            <Input
              id="photo-picker-worker"
              placeholder={projectId ? "搜索姓名" : "先选项目"}
              disabled={!projectId}
              value={selectedWorker?.name ?? workerKeyword}
              onChange={(event) => {
                setWorkerKeyword(event.target.value);
                setWorkerId("");
              }}
            />
            {projectId && workers.length ? (
              <div className="max-h-24 overflow-y-auto rounded-md border bg-background text-xs">
                {workers.map((worker) => (
                  <button
                    key={worker.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-muted",
                      workerId === worker.id && "bg-sky-50 dark:bg-sky-950/30"
                    )}
                    onClick={() => setWorkerId(worker.id)}
                  >
                    <span>{worker.name || "未命名人员"}</span>
                    <span className="text-muted-foreground">
                      {worker.phone ?? ""}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {projectId && !workers.length && !workersQuery.isPending ? (
              <p className="text-[11px] text-muted-foreground">
                该项目下没有在职人员
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="photo-picker-from">开始日期</Label>
            <Input
              id="photo-picker-from"
              type="date"
              max={dateTo || undefined}
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="photo-picker-to">结束日期</Label>
            <Input
              id="photo-picker-to"
              type="date"
              min={dateFrom || undefined}
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-4">
            <Label>方向</Label>
            <div className="flex gap-2">
              {(
                [
                  ["", "全部"],
                  [0, "只看进场"],
                  [1, "只看出场"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={String(value)}
                  type="button"
                  size="sm"
                  variant={direction === value ? "default" : "outline"}
                  onClick={() => setDirection(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {photosQuery.isFetching ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Search className="size-3.5" />
          )}
          <span>
            共 {photosQuery.data?.total ?? 0} 张可拉取
            {duplicatedCount ? ` · 已有 ${duplicatedCount} 张在组内` : ""}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!projectId || !workerId ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              请先选择项目和人员
            </div>
          ) : photosQuery.isError ? (
            <div className="py-12 text-center text-sm text-red-600">
              {photosQuery.error instanceof Error
                ? photosQuery.error.message
                : "拉取考勤照片失败"}
            </div>
          ) : photosQuery.isPending ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在拉取考勤照片
            </div>
          ) : !newPhotos.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              该条件下没有可加入的考勤照片
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {newPhotos.map((photo) => {
                const key = photoKey(photo);
                const checked = selected.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className={cn(
                      "rounded-lg border p-2 text-left transition",
                      checked
                        ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-950/20"
                        : "hover:border-slate-400"
                    )}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-slate-100 dark:bg-muted">
                      {photo.preview_photo ? (
                        <img
                          src={photo.preview_photo}
                          alt={`${photo.attendance_date}${photo.direction === 0 ? "进场" : "出场"}照片`}
                          className="size-full object-contain"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-[11px] text-muted-foreground">
                          预览不可用
                        </div>
                      )}
                      <span className="pointer-events-none absolute left-1 top-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-white">
                        {photo.direction === 0 ? "进场" : "出场"}
                      </span>
                      <span
                        className={cn(
                          "pointer-events-none absolute right-1 top-1 rounded px-1.5 py-0.5 text-[10px]",
                          checked
                            ? "bg-sky-600 text-white"
                            : "bg-slate-100 text-slate-700"
                        )}
                      >
                        {checked ? "已选择" : "选择"}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">
                      {photo.attendance_date} ·{" "}
                      {new Date(photo.trigger_time).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <span className="mr-auto text-xs text-muted-foreground">
            已选 {selected.size} 张
          </span>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
            disabled={!selected.size}
            onClick={handleConfirm}
          >
            加入处理组
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 同一天同一方向可能有多条打卡，用记录 ID 兜底区分。 */
function photoKey(photo: AttendancePhotoItem): string {
  return photoDedupeKey({
    attendance_record_id: photo.attendance_record_id,
    project_id: photo.project_id,
    worker_id: photo.worker_id,
    attendance_date: photo.attendance_date,
    direction: photo.direction,
  });
}
