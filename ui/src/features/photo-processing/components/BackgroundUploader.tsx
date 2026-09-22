import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { constructionProjectService } from "@/features/projects/services/construction-project-service";

import { directionLabel, findBackground } from "../lib";
import type { PhotoDirection, PhotoGroupBackground } from "../types";

type BackgroundUploaderProps = {
  groupId: string;
  backgrounds: PhotoGroupBackground[];
  disabled?: boolean;
  /** 上传成功后由调用方写库（背景图表按 direction 各一行）。 */
  onSave: (
    direction: PhotoDirection,
    payload: { photo_url: string; object_key?: string; remark?: string }
  ) => void;
  onRemove: (direction: PhotoDirection) => void;
};

/** 进/出场各一个上传槽。OSS 的 delete 是空操作，删除只软删数据库。 */
export function BackgroundUploader({
  groupId,
  backgrounds,
  disabled = false,
  onSave,
  onRemove,
}: BackgroundUploaderProps) {
  const [uploading, setUploading] = useState<PhotoDirection | null>(null);
  const inputsRef = useRef<Record<number, HTMLInputElement | null>>({});

  const upload = async (direction: PhotoDirection, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    setUploading(direction);
    try {
      const record = await constructionProjectService.uploadFile(file, {
        bizType: "photo_processing",
        bizId: groupId,
        fieldKey: direction === 0 ? "in_background" : "out_background",
      });
      onSave(direction, {
        photo_url: record.public_url,
        object_key: record.object_key,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "背景图上传失败");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {([0, 1] as PhotoDirection[]).map((direction) => {
        const background = findBackground(backgrounds, direction);
        const busy = uploading === direction;
        return (
          <div
            key={direction}
            className="space-y-2 rounded-lg border bg-slate-50/50 p-3 dark:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <Label>{directionLabel(direction)}背景图</Label>
              {background ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600"
                  disabled={disabled || busy}
                  onClick={() => onRemove(direction)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-dashed bg-slate-100 dark:bg-muted">
              {background ? (
                <img
                  src={background.photo_url}
                  alt={`${directionLabel(direction)}背景图`}
                  className="size-full object-contain"
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                  <ImagePlus className="size-5" />
                  尚未上传
                </div>
              )}
              {busy ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-black/50">
                  <Loader2 className="size-5 animate-spin text-sky-600" />
                </div>
              ) : null}
            </div>
            <input
              ref={(element) => {
                inputsRef.current[direction] = element;
              }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void upload(direction, event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={disabled || busy}
              onClick={() => inputsRef.current[direction]?.click()}
            >
              {busy ? "上传中…" : background ? "替换背景图" : "上传背景图"}
            </Button>
            <p className="text-[11px] leading-5 text-muted-foreground">
              {background
                ? "替换后重新发起合成即可刷新该方向全部照片。"
                : `该方向没有人像照片时忽略此图；缺失时照片会被标记为「已跳过」。`}
            </p>
          </div>
        );
      })}
    </div>
  );
}
