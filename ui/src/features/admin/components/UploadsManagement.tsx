import { useMemo, useState } from "react";
import { ExternalLink, FileText, ImageIcon, RefreshCw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUploadsList } from "@/features/admin/hooks/use-uploads";
import type { AdminUploadFile } from "@/features/admin/types/admin-types";

const bizTypeLabel: Record<string, string> = {
  project: "项目",
  unit: "单位",
  team: "班组",
  worker: "工人",
  attendance: "考勤",
  common: "公共",
};

export function UploadsManagement() {
  const { data: uploads = [], isLoading, isError, refetch, isFetching } = useUploadsList();
  const [keyword, setKeyword] = useState("");

  const filteredUploads = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    if (!term) return uploads;

    return uploads.filter((file) => {
      return [
        file.original_filename,
        file.object_key,
        file.biz_type,
        file.biz_id,
        file.field_key,
        file.storage_driver,
        file.bucket,
        file.uploaded_by_name,
        file.uploaded_by_email,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [keyword, uploads]);

  const imageCount = uploads.filter((file) => file.content_type?.startsWith("image/")).length;
  const fileCount = uploads.length - imageCount;
  const storageDrivers = new Set(uploads.map((file) => file.storage_driver).filter(Boolean)).size;

  if (isError) {
    return (
      <div className="rounded-md border bg-background p-6">
        <h1 className="text-2xl font-semibold">文件管理</h1>
        <p className="mt-2 text-sm text-muted-foreground">上传记录加载失败，请稍后重试。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">文件管理</h1>
          <p className="text-muted-foreground">查看项目、单位、班组、工人和考勤上传记录</p>
        </div>
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCell label="上传总数" value={`${uploads.length}`} helper="全部有效记录" />
        <SummaryCell label="图片" value={`${imageCount}`} helper="image/* 文件" />
        <SummaryCell label="普通文件" value={`${fileCount}`} helper="非图片文件" />
        <SummaryCell label="存储类型" value={`${storageDrivers}`} helper="local / OSS" />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">上传记录列表</CardTitle>
          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索文件名、业务类型、字段、上传人、存储路径"
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>文件</TableHead>
                  <TableHead>业务</TableHead>
                  <TableHead>存储</TableHead>
                  <TableHead>大小</TableHead>
                  <TableHead>上传人</TableHead>
                  <TableHead>上传时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      正在加载上传记录...
                    </TableCell>
                  </TableRow>
                ) : filteredUploads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      暂无上传记录
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUploads.map((file) => <UploadRow key={file.id} file={file} />)
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            当前显示 {filteredUploads.length} 条，共 {uploads.length} 条上传记录。
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCell({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-md border bg-background p-4 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[#0f6b5d]">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

function UploadRow({ file }: { file: AdminUploadFile }) {
  const isImage = file.content_type?.startsWith("image/");
  const fileName = file.original_filename || file.object_key.split("/").pop() || file.object_key;
  const uploadedBy = file.uploaded_by_name || file.uploaded_by_email || "系统/未知";

  return (
    <TableRow>
      <TableCell className="min-w-[260px]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-[#0f6b5d]/10 text-[#0f6b5d]">
            {isImage ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{fileName}</div>
            <div className="mt-1 max-w-[360px] truncate text-xs text-muted-foreground">
              {file.object_key}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span>{file.biz_type ? bizTypeLabel[file.biz_type] ?? file.biz_type : "未绑定"}</span>
          <span className="text-xs text-muted-foreground">{file.field_key || "未标记字段"}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Badge variant="outline">{file.storage_driver}</Badge>
          <span className="max-w-[240px] truncate text-xs text-muted-foreground">
            {file.bucket || file.public_base_url}
          </span>
        </div>
      </TableCell>
      <TableCell>{formatFileSize(file.size_bytes)}</TableCell>
      <TableCell>
        <div className="max-w-[160px] truncate">{uploadedBy}</div>
      </TableCell>
      <TableCell>{formatDateTime(file.created_at)}</TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" asChild className="text-[#0f6b5d]">
          <a href={file.public_url} target="_blank" rel="noreferrer">
            打开
            <ExternalLink className="ml-1 size-3.5" />
          </a>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
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
