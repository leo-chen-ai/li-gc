import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { referencePhotoSrc, type AttendanceReference } from "./references";

function OriginalPhoto({ photo, label }: { photo?: string | null; label: string }) {
  const src = useMemo(() => referencePhotoSrc(photo), [photo]);
  const [failed, setFailed] = useState(false);
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {src && !failed ? (
        <Dialog>
          <DialogTrigger asChild>
            <button type="button" className="group relative flex h-36 w-full items-center justify-center overflow-hidden rounded-md border bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`放大${label}`}>
              <img src={src} alt={label} loading="lazy" className="size-full object-contain" onError={() => setFailed(true)} />
              <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">点击放大</span>
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-3xl">
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>抽取的完整参考原图，供生成结果对照调试。</DialogDescription>
            <img src={src} alt={label} className="max-h-[75vh] w-full object-contain" />
          </DialogContent>
        </Dialog>
      ) : (
        <div className="flex h-36 items-center justify-center rounded-md border bg-muted/30 px-2 text-center text-xs text-muted-foreground">
          {failed ? "原图加载失败" : "该参考原图暂不可预览"}
        </div>
      )}
    </div>
  );
}

export function ReferencePhotos({ reference, title, description }: {
  reference: AttendanceReference;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-muted/10 p-3">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
      <div className="grid grid-cols-2 gap-3">
        <OriginalPhoto key={reference.record_id} photo={reference.in_photo} label="进场参考原图" />
        <OriginalPhoto key={reference.out_record_id} photo={reference.out_photo} label="出场参考原图" />
      </div>
    </div>
  );
}
