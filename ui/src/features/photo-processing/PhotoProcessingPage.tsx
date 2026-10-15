import { useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { constructionProjectService } from "@/features/projects/services/construction-project-service";
import { imageZip, saveBlob } from "./download";
import { generatePhotoPair, PhotoJobError } from "./generation";

type ImageSlot = "person" | "foreground" | "background";
type Uploaded = { id: string; url: string };
type Payload = {
  model: string;
  person_id: string;
  foreground_id?: string;
  background_id?: string;
  season: string;
  count: number;
  change_clothes: boolean;
  change_pose: boolean;
};
type Result = {
  index: number;
  status: "running" | "success" | "failed";
  in_image?: string;
  out_image?: string;
  error?: string;
};
const slots: { key: ImageSlot; label: string; hint: string }[] = [
  { key: "person", label: "人像照片", hint: "必填 · 上传清晰的人像照片" },
  { key: "foreground", label: "前景图", hint: "选填 · 放在人物前方的物体" },
  { key: "background", label: "背景图", hint: "选填 · 人物身后的环境" },
];

function errorMessage(error: unknown, fallback: string): string {
  return error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : fallback;
}

export function PhotoProcessingPage() {
  const [images, setImages] = useState<Partial<Record<ImageSlot, Uploaded>>>(
    {},
  );
  const [uploading, setUploading] = useState<
    Partial<Record<ImageSlot, boolean>>
  >({});
  const [count, setCount] = useState(6);
  const [season, setSeason] = useState("spring");
  const [model, setModel] = useState("gemini-3.1-flash-lite-image");
  const [changeClothes, setChangeClothes] = useState(true);
  const [changePose, setChangePose] = useState(true);
  const [results, setResults] = useState<Result[]>([]);
  const inputs = useRef<Partial<Record<ImageSlot, HTMLInputElement | null>>>(
    {},
  );
  const batch = useRef<Payload | null>(null);
  const inFlight = useRef(false);
  const pendingJobs = useRef(new Map<number, string>());
  const busy = results.some((item) => item.status === "running");
  const hasUpload = Object.values(uploading).some(Boolean);
  const successful = results.filter((item) => item.status === "success");
  const generated = results.flatMap((item) =>
    (
      [
        ["in_image", "进场"],
        ["out_image", "出场"],
      ] as const
    ).flatMap(([key, label]) =>
      item[key]
        ? [
            {
              name: `第${String(item.index + 1).padStart(2, "0")}套-${label}.jpg`,
              image: item[key]!,
            },
          ]
        : [],
    ),
  );

  const upload = async (key: ImageSlot, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("图片不能超过15MB");
      return;
    }
    setUploading((current) => ({ ...current, [key]: true }));
    try {
      const record = await constructionProjectService.uploadFile(file, {
        bizType: "photo_processing",
        fieldKey: key,
      });
      setImages((current) => ({
        ...current,
        [key]: { id: record.id, url: record.public_url },
      }));
    } catch (error) {
      toast.error(errorMessage(error, "上传失败"));
    } finally {
      setUploading((current) => ({ ...current, [key]: false }));
    }
  };

  const generate = async (
    index: number,
    payload: Payload,
    entryImage?: string,
  ) => {
    try {
      const requestId = pendingJobs.current.get(index) ?? crypto.randomUUID();
      pendingJobs.current.set(index, requestId);
      const pair = await generatePhotoPair({ ...payload, variant: index, entry_image: entryImage }, requestId);
      pendingJobs.current.delete(index);
      if (!pair?.in_image) throw new Error("未返回进场图片");
      setResults((current) =>
        current.map((item) =>
          item.index === index
            ? {
                index,
                status: pair.out_image ? "success" : "failed",
                in_image: pair.in_image,
                out_image: pair.out_image,
                error:
                  pair.out_error ||
                  (pair.out_image ? undefined : "出场图片生成失败"),
              }
            : item,
        ),
      );
    } catch (error) {
      if (!(error instanceof PhotoJobError) || !error.resumable) pendingJobs.current.delete(index);
      setResults((current) =>
        current.map((item) =>
          item.index === index
            ? {
                ...item,
                status: "failed",
                error: errorMessage(error, "生成失败"),
              }
            : item,
        ),
      );
    }
  };

  const start = async () => {
    if (!images.person || hasUpload || inFlight.current) return;
    const payload: Payload = {
      model,
      person_id: images.person.id,
      foreground_id: images.foreground?.id,
      background_id: images.background?.id,
      season,
      count,
      change_clothes: changeClothes,
      change_pose: changePose,
    };
    batch.current = payload;
    inFlight.current = true;
    setResults(
      Array.from({ length: count }, (_, index) => ({
        index,
        status: "running",
      })),
    );
    try {
      pendingJobs.current.clear();
      await Promise.allSettled(
        Array.from({ length: count }, (_, index) => generate(index, payload)),
      );
    } finally {
      inFlight.current = false;
    }
  };

  const retry = async (index: number) => {
    if (!batch.current || inFlight.current) return;
    const entryImage = results.find((item) => item.index === index)?.in_image;
    inFlight.current = true;
    setResults((current) =>
      current.map((item) =>
        item.index === index
          ? { ...item, status: "running", error: undefined }
          : item,
      ),
    );
    try {
      await generate(index, batch.current, entryImage);
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-foreground">
      <div>
        <h1 className="text-xl font-semibold">AI 照片合成</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          每套包含进场和出场两张，同一套衣服保持一致。
        </p>
      </div>
      <section className="space-y-6 rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          {slots.map(({ key, label, hint }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={`upload-${key}`}
                  className="text-sm font-medium"
                >
                  {label}
                  {key === "person" && (
                    <span className="ml-1 text-red-500">*</span>
                  )}
                </label>
                {images[key] && (
                  <Button
                    aria-label={`移除${label}`}
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    disabled={busy || uploading[key]}
                    onClick={() =>
                      setImages((current) => ({ ...current, [key]: undefined }))
                    }
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
              <input
                id={`upload-${key}`}
                ref={(el) => {
                  inputs.current[key] = el;
                }}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busy || uploading[key]}
                onChange={(event) => {
                  void upload(key, event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy || uploading[key]}
                onClick={() => inputs.current[key]?.click()}
                className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/30 transition hover:border-emerald-600 disabled:opacity-60"
                aria-label={`上传${label}`}
              >
                {uploading[key] ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : images[key] ? (
                  <img
                    src={images[key].url}
                    alt={label}
                    className="size-full object-contain"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                    <ImagePlus className="size-7" />
                    点击上传
                  </span>
                )}
              </button>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          前景和背景都不上传时，直接根据人像原图变换。支持图片，单张不超过
          15MB。
        </p>
        <div className="space-y-4 border-t pt-5">
          <div className="space-y-2">
            <label htmlFor="photo-model" className="block text-sm font-medium">
              图片模型
            </label>
            <select
              id="photo-model"
              value={model}
              disabled={busy}
              onChange={(event) => setModel(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-md"
            >
              <option value="gpt-image-2-dev" disabled>
                GPT Image 2 Dev（上游异常，暂停）
              </option>
              <option value="gemini-3.1-flash-lite-image">
                推荐 · Nano Banana Lite（默认）
              </option>
              <option value="gpt-image-2">原模型 · GPT Image 2</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Nano Banana Lite 按用量计费，实际扣费以 ephone 账号线路为准。
              Dev 上游近期大量失败，暂不开放，避免重复提交。
            </p>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-emerald-700"
                checked={changeClothes}
                disabled={busy}
                onChange={(event) => setChangeClothes(event.target.checked)}
              />
              换不同衣服
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-emerald-700"
                checked={changePose}
                disabled={busy}
                onChange={(event) => setChangePose(event.target.checked)}
              />
              换不同动作
            </label>
          </div>
          {changeClothes && (
            <fieldset
              disabled={busy}
              className="flex flex-wrap items-center gap-2"
            >
              <legend className="mb-2 text-sm font-medium">服装季节</legend>
              {[
                ["spring", "春"],
                ["summer", "夏"],
                ["autumn", "秋"],
                ["winter", "冬"],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-md border px-5 py-2 text-sm focus-within:ring-2 focus-within:ring-emerald-700 ${season === value ? "border-emerald-700 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : ""}`}
                >
                  <input
                    type="radio"
                    name="season"
                    className="sr-only"
                    value={value}
                    checked={season === value}
                    onChange={() => setSeason(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <label
                htmlFor="generation-count"
                className="block text-sm font-medium"
              >
                生成套数
              </label>
              <div className="flex items-center gap-3">
                <Input
                  id="generation-count"
                  type="number"
                  min={1}
                  max={30}
                  value={count}
                  disabled={busy}
                  className="w-24"
                  onChange={(event) =>
                    setCount(
                      Math.max(
                        1,
                        Math.min(
                          30,
                          Math.floor(Number(event.target.value) || 1),
                        ),
                      ),
                    )
                  }
                />
                <span className="text-xs text-muted-foreground">
                  最多 30 套（60 张），套与套并发生成
                </span>
              </div>
            </div>
            <Button
              disabled={!images.person || hasUpload || busy}
              className="gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
              onClick={() => void start()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {busy ? "正在生成" : `开始生成 ${count} 套（${count * 2} 张）`}
            </Button>
          </div>
        </div>
      </section>
      {results.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">生成结果</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                完成 {successful.length} / {results.length} 套 · 已生成{" "}
                {generated.length} 张
                {busy
                  ? " · 各套并发，套内先生成进场，再由进场图生成出场"
                  : " · 结果仅在本页保留，请及时下载"}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={!generated.length}
              className="gap-2"
              onClick={() => {
                saveBlob(imageZip(generated), "AI照片.zip");
              }}
            >
              <Download className="size-4" />
              一键下载{busy ? "已生成照片" : "全部照片"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            每张 480×480 JPEG，不超过 20KB；下载按套保留进场、出场配对。
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {results.map((item) => (
              <div
                key={item.index}
                className="overflow-hidden rounded-xl border bg-card"
              >
                <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
                  <span className="font-medium">第 {item.index + 1} 套</span>
                  <span className="text-xs text-muted-foreground">
                    {item.status === "success"
                      ? "两张已完成"
                      : item.status === "running"
                        ? "生成中"
                        : item.in_image
                          ? "出场待重试"
                          : "生成失败"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-px bg-border">
                  {(
                    [
                      ["in_image", "进场"],
                      ["out_image", "出场"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="bg-card">
                      <div className="flex aspect-square items-center justify-center bg-muted/30">
                        {item[key] ? (
                          <img
                            src={item[key]}
                            alt={`第 ${item.index + 1} 套${label}照片`}
                            className="size-full object-contain"
                          />
                        ) : item.status === "running" ? (
                          <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="size-5 animate-spin" />
                            {label}生成中
                          </div>
                        ) : (
                          <p className="px-2 text-center text-xs text-muted-foreground">
                            {label}未生成
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-xs">
                        <span>{label}</span>
                        {item[key] && (
                          <a
                            href={item[key]}
                            download={`第${String(item.index + 1).padStart(2, "0")}套-${label}.jpg`}
                            className="text-emerald-700"
                          >
                            下载
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {item.status === "failed" && (
                  <div className="space-y-2 border-t p-3">
                    <p className="break-words text-xs text-red-600">
                      {item.error}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void retry(item.index)}
                    >
                      {pendingJobs.current.has(item.index) ? "继续获取结果" : item.in_image ? "重试出场" : "重新生成这套"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
