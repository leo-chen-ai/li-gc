import { useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";
import { constructionProjectService } from "@/features/projects/services/construction-project-service";
import { imageZip, saveBlob } from "./download";

type ImageSlot = "person" | "foreground" | "background";
type Uploaded = { id: string; url: string };
type Payload = {
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
  image?: string;
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
  const [changeClothes, setChangeClothes] = useState(true);
  const [changePose, setChangePose] = useState(true);
  const [results, setResults] = useState<Result[]>([]);
  const inputs = useRef<Partial<Record<ImageSlot, HTMLInputElement | null>>>(
    {},
  );
  const batch = useRef<Payload | null>(null);
  const inFlight = useRef(false);
  const busy = results.some((item) => item.status === "running");
  const hasUpload = Object.values(uploading).some(Boolean);
  const successful = results.filter((item) => item.status === "success");

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

  const generate = async (index: number, payload: Payload) => {
    try {
      const response = await apiClient.post<ApiResponse<{ image: string }>>(
        "/admin/photo-processing/generate",
        { ...payload, variant: index },
      );
      const image = response.data.data?.image;
      if (!image) throw new Error("未返回生成图片");
      setResults((current) =>
        current.map((item) =>
          item.index === index ? { index, status: "success", image } : item,
        ),
      );
    } catch (error) {
      setResults((current) =>
        current.map((item) =>
          item.index === index
            ? {
                index,
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
      await Promise.allSettled(
        Array.from({ length: count }, (_, index) => generate(index, payload)),
      );
    } finally {
      inFlight.current = false;
    }
  };

  const retry = async (index: number) => {
    if (!batch.current || inFlight.current) return;
    inFlight.current = true;
    setResults((current) =>
      current.map((item) =>
        item.index === index ? { index, status: "running" } : item,
      ),
    );
    try {
      await generate(index, batch.current);
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-foreground">
      <div>
        <h1 className="text-xl font-semibold">AI 照片合成</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          上传照片，选择变化，一次生成多套照片。
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
                {changeClothes ? "生成几套衣服" : "生成照片数量"}
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
                  最多 30 套，全部并发生成
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
              {busy
                ? "正在生成"
                : `开始生成 ${count} ${changeClothes ? "套" : "张"}`}
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
                成功 {successful.length} / {results.length}
                {busy
                  ? " · 生成中的照片会逐张显示"
                  : " · 结果仅在本页保留，请及时下载"}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={!successful.length}
              className="gap-2"
              onClick={() => {
                saveBlob(
                  imageZip(
                    successful.map((item) => ({
                      name: `photo-${String(item.index + 1).padStart(2, "0")}.png`,
                      image: item.image!,
                    })),
                  ),
                  "AI照片.zip",
                );
              }}
            >
              <Download className="size-4" />
              一键下载{busy ? "已完成照片" : "全部照片"}
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {results.map((item) => (
              <div
                key={item.index}
                className="overflow-hidden rounded-xl border bg-card"
              >
                <div className="flex aspect-[2/3] items-center justify-center bg-muted/30">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={`第 ${item.index + 1} 套合成照片`}
                      className="size-full object-contain"
                    />
                  ) : item.status === "running" ? (
                    <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                      <Loader2 className="size-6 animate-spin" />
                      正在生成第 {item.index + 1} 套
                    </div>
                  ) : (
                    <div className="space-y-3 px-4 text-center">
                      <p className="break-words text-sm text-red-600">
                        {item.error}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void retry(item.index)}
                      >
                        重新生成
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    第 {item.index + 1}{" "}
                    {batch.current?.change_clothes ? "套" : "张"}
                  </span>
                  {item.image && (
                    <a
                      href={item.image}
                      download={`photo-${item.index + 1}.png`}
                      className="text-emerald-700"
                    >
                      下载
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
