import { useMemo, useState } from "react";
import { Loader2, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import {
  useCancelCompositeTaskMutation,
  useCompositeTaskQuery,
  useStartCompositeMutation,
} from "../hooks";
import {
  compositeStatusLabel,
  directionLabel,
  isTaskActive,
  taskProgressPercent,
  taskStatusLabel,
} from "../lib";
import type { PhotoGroupDetail, PhotoGroupPhoto } from "../types";

type CompositePanelProps = {
  group: PhotoGroupDetail;
};

/** 「AI 合成」页：待合成统计、发起/取消、任务进度、结果网格。 */
export function CompositePanel({ group }: CompositePanelProps) {
  const [mode, setMode] = useState<"incremental" | "all">("incremental");
  const [prompt, setPrompt] = useState("");
  const startComposite = useStartCompositeMutation(group.id);
  const cancelCompositeTask = useCancelCompositeTaskMutation();
  const task = group.latest_task;
  const taskQuery = useCompositeTaskQuery(task?.id);
  // 轮询拿到的任务比详情里的 latest_task 更新，优先用它渲染。
  const liveTask = taskQuery.data ?? task;
  const active = isTaskActive(liveTask);
  const busy = startComposite.isPending || cancelCompositeTask.isPending;

  const photos = group.photos;
  const done = group.stats.success;
  const byDirection = useMemo(() => {
    const counts = new Map<number, number>();
    for (const photo of photos) {
      counts.set(photo.direction, (counts.get(photo.direction) ?? 0) + 1);
    }
    return counts;
  }, [photos]);

  const handleStart = async () => {
    try {
      const started = await startComposite.mutateAsync({
        mode,
        output_size: "1024x1536",
        prompt: prompt.trim() || undefined,
      });
      if (started.status === "completed") {
        toast.info(started.error_summary || "没有需要合成的照片");
        return;
      }
      toast.success(`已发起 ${started.total_count} 张照片合成`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发起合成失败");
    }
  };

  const handleCancel = async () => {
    if (!liveTask) return;
    try {
      await cancelCompositeTask.mutateAsync(liveTask.id);
      toast.success("已请求取消，正在处理当前批次");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消合成任务失败");
    }
  };

  const pendingPhotos = photos.filter(
    (photo) => photo.composite_status !== "success"
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-slate-50 p-4 dark:bg-muted/20 sm:grid-cols-4">
        <Stat label="组内照片" value={`${photos.length} 张`} />
        <Stat
          label="方向分布"
          value={[0, 1]
            .filter((direction) => byDirection.get(direction))
            .map((direction) => `${directionLabel(direction as 0 | 1)} ${byDirection.get(direction)}`)
            .join(" / ") || "—"}
        />
        <Stat label="待合成" value={`${pendingPhotos.length} 张`} />
        <Stat label="已合成" value={`${done} 张`} />
      </div>

      <div className="grid gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>合成范围</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "incremental" ? "default" : "outline"}
                disabled={active || busy}
                onClick={() => setMode("incremental")}
              >
                只跑待合成
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "all" ? "default" : "outline"}
                disabled={active || busy}
                onClick={() => setMode("all")}
              >
                全部重跑
              </Button>
            </div>
          </div>
          <div className="flex-1" />
          <Button
            type="button"
            className="gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
            disabled={active || busy || !pendingPhotos.length}
            onClick={handleStart}
          >
            {startComposite.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            发起合成
          </Button>
          {active ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2 text-red-600"
              disabled={busy}
              onClick={handleCancel}
            >
              <XCircle className="size-4" />
              取消
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          输出尺寸 1024×1536 竖版。单张约 10～20 秒，任务内并发执行；
          缺少对应方向背景图时该照片会被标记为「已跳过」。
        </p>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            高级：自定义提示词（留空使用内置的进场/出场默认提示词）
          </summary>
          <textarea
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            rows={4}
            placeholder="例如：保留第一张图人物的姿态、服装和安全帽不变，用第二张图的工地现场作为背景……"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </details>
      </div>

      {liveTask ? (
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              任务状态：{taskStatusLabel(liveTask.status)}
            </span>
            <span className="text-muted-foreground">
              成功 {liveTask.success_count} · 失败 {liveTask.failed_count} · 跳过{" "}
              {liveTask.skipped_count} / 共 {liveTask.total_count}
            </span>
          </div>
          <Progress value={taskProgressPercent(liveTask)} />
          {liveTask.error_summary ? (
            <p className="text-xs text-red-600">{liveTask.error_summary}</p>
          ) : null}
          {liveTask.status === "completed" && liveTask.failed_count > 0 ? (
            <p className="text-xs text-amber-600">
              有 {liveTask.failed_count} 张合成失败，可点「发起合成」只重试失败部分。
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>合成结果（原图 / 合成图对照）</Label>
        {!photos.length ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            组内还没有照片，先去「组内照片」页拉取
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => (
              <CompositePhotoCard key={photo.id} photo={photo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function CompositePhotoCard({ photo }: { photo: PhotoGroupPhoto }) {
  const [showComposite, setShowComposite] = useState(true);
  const hasComposite = Boolean(photo.composite_photo_url);
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="relative aspect-[2/3] bg-slate-100 dark:bg-muted">
        <img
          src={
            hasComposite && showComposite
              ? (photo.composite_photo_url as string)
              : photo.photo_url
          }
          alt={`${photo.attendance_date}${directionLabel(photo.direction)}照片`}
          className="size-full object-contain"
        />
        {hasComposite ? (
          <button
            type="button"
            onClick={() => setShowComposite((current) => !current)}
            className={cn(
              "absolute right-1 top-1 rounded px-1.5 py-0.5 text-[10px] text-white",
              showComposite ? "bg-sky-600" : "bg-slate-950/70"
            )}
          >
            {showComposite ? "看原图" : "看合成"}
          </button>
        ) : null}
        <span className="pointer-events-none absolute left-1 top-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-white">
          {directionLabel(photo.direction)}
        </span>
      </div>
      <div className="space-y-1 p-2 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="truncate font-medium">{photo.worker_name}</span>
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5",
              photo.composite_status === "success"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                : photo.composite_status === "failed"
                  ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                  : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
            )}
          >
            {compositeStatusLabel(photo.composite_status)}
          </span>
        </div>
        <p className="truncate text-muted-foreground">
          {photo.attendance_date}
          {photo.project_name ? ` · ${photo.project_name}` : ""}
        </p>
        {photo.composite_error ? (
          <p className="line-clamp-2 text-red-600">{photo.composite_error}</p>
        ) : null}
      </div>
    </div>
  );
}
