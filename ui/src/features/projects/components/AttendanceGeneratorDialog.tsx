import { useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarClock, ChevronLeft, Database, Download, Eye, Loader2, Sparkles, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { StructuredWorkerSelect } from "@/components/StructuredWorkerSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Worker } from "../data/mock-projects";
import { constructionProjectService } from "../services/construction-project-service";
import type { AttendanceGeneratorPreviewRequest, AttendanceGeneratorPreviewResponse, GeneratedAttendancePreviewRecord } from "../types/construction-types";

const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const DEFAULT_FORM: Omit<AttendanceGeneratorPreviewRequest, "worker_ids"> = {
  month: currentMonth(),
  attendance_days: 0,
  include_weekends: false,
  prioritize_weekends: false,
  morning_start: "07:00",
  morning_end: "08:00",
  evening_start: "17:00",
  evening_end: "18:00",
  include_midday: false,
  lunch_out_start: "11:30",
  lunch_out_end: "12:00",
  lunch_in_start: "13:00",
  lunch_in_end: "13:30",
};

type Props = {
  open: boolean;
  projectId: string;
  projectName?: string;
  workers: Worker[];
  onOpenChange: (open: boolean) => void;
  onCommitted: () => void;
};

export function AttendanceGeneratorDialog({ open, projectId, projectName, workers, onOpenChange, onCommitted }: Props) {
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [preview, setPreview] = useState<AttendanceGeneratorPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeWorkers = useMemo(() => workers.filter((worker) => worker.status === "在场"), [workers]);
  const workerOptions = useMemo(() => activeWorkers.map((worker) => ({
    id: worker.id,
    name: worker.name,
    unitName: worker.unit,
    teamName: worker.team,
    description: [worker.workType, worker.workerType].filter(Boolean).join(" · "),
  })), [activeWorkers]);
  const workerByIdCard = useMemo(() => {
    const map = new Map<string, Worker>();
    for (const worker of workers) {
      if (worker.idCard) map.set(worker.idCard, worker);
    }
    return map;
  }, [workers]);

  const patchForm = (patch: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setPreview(null);
  };
  const changeWorkers = (ids: string[]) => {
    setWorkerIds(ids);
    setPreview(null);
  };

  const createPreview = async () => {
    if (workerIds.length === 0) return toast.info("请先选择需要生成考勤的人员");
    if (!form.month) return toast.info("请选择生成月份");
    setLoading(true);
    try {
      const result = await constructionProjectService.previewGeneratedAttendance(projectId, { ...form, worker_ids: workerIds });
      setPreview(result);
      toast.success(`已生成 ${result.record_count} 条预览记录`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成预览失败");
    } finally {
      setLoading(false);
    }
  };

  const commit = async () => {
    if (!preview?.records.length) return;
    setCommitting(true);
    try {
      const result = await constructionProjectService.commitGeneratedAttendance(projectId, preview.records);
      toast.success(`已写入 ${result.inserted_count} 条考勤记录`);
      onCommitted();
      onOpenChange(false);
      setPreview(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "写入考勤记录失败");
    } finally {
      setCommitting(false);
    }
  };

  const exportPreview = () => {
    if (!preview?.records.length) return toast.info("当前没有可导出的预览数据");
    const workerById = new Map(workers.map((w) => [w.id, w]));
    const header = ["项目基本信息", "工人名字", "工人身份证", "考勤时间（yyyy-mm-dd hh:mm:ss）", "进出方向（“进”或“出”）"];
    const rows = preview.records.map((record) => {
      const worker = workerById.get(record.worker_id);
      return [
        projectName ?? projectId,
        record.worker_name ?? "",
        worker?.idCard ?? "",
        formatExportDateTime(record.trigger_time),
        record.direction === 0 ? "进" : "出",
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 22 }, { wch: 30 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet2");
    const fileName = `考勤预览_${projectName ?? projectId}_${formatDateForFile(new Date())}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`已导出 ${preview.records.length} 条预览数据`);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("Excel 文件中没有工作表");
      const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
      if (data.length < 2) throw new Error("Excel 文件没有数据行");
      const records: GeneratedAttendancePreviewRecord[] = [];
      let skipped = 0;
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const workerName = String(row[1] ?? "").trim();
        const idCard = String(row[2] ?? "").trim();
        const timeStr = String(row[3] ?? "").trim();
        const dirStr = String(row[4] ?? "").trim();
        if (!workerName && !idCard && !timeStr) { skipped++; continue; }
        const worker = workerByIdCard.get(idCard) ?? workers.find((w) => w.name === workerName && w.idCard === idCard);
        if (!worker) { skipped++; continue; }
        const direction: 0 | 1 = dirStr === "进" ? 0 : dirStr === "出" ? 1 : (() => { throw new Error(`第 ${i + 1} 行进出方向必须是"进"或"出"`); })();
        records.push({
          worker_id: worker.id,
          worker_name: worker.name,
          team_name: worker.team,
          direction,
          trigger_time: parseImportDateTime(timeStr),
        });
      }
      if (records.length === 0) throw new Error("没有可导入的有效记录，请检查身份证号是否与工人信息匹配");
      const uniqueWorkerIds = new Set(records.map((r) => r.worker_id));
      setPreview({
        record_count: records.length,
        worker_count: uniqueWorkerIds.size,
        records,
      });
      toast.success(`已导入 ${records.length} 条记录${skipped > 0 ? `（跳过 ${skipped} 条无效行）` : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入文件失败");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const changeOpen = (next: boolean) => {
    if (committing) return;
    if (!next) setPreview(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-5xl">
        <div className="border-b bg-gradient-to-r from-emerald-50 via-white to-teal-50 px-6 py-5 dark:from-emerald-950/30 dark:via-background dark:to-teal-950/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl"><span className="flex size-9 items-center justify-center rounded-lg bg-[#0f6b5d] text-white"><Sparkles className="size-5" /></span>考勤生成工具</DialogTitle>
            <DialogDescription>结构化选择人员并随机生成打卡时间。预览确认后才会写入正式考勤记录。</DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(92vh-180px)] overflow-y-auto px-6 py-5">
          {!preview ? (
            <div className="space-y-5">
              <section className="rounded-xl border bg-slate-50/60 p-4 dark:bg-muted/20">
                <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">1. 选择人员</h3><p className="text-xs text-muted-foreground">按单位和班组展开，可搜索并多选在场人员</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{workerIds.length} 人</span></div>
                <StructuredWorkerSelect workers={workerOptions} value={workerIds} onChange={changeWorkers} />
              </section>

              <section className="rounded-xl border p-4">
                <div className="mb-4"><h3 className="font-semibold">2. 生成规则</h3><p className="text-xs text-muted-foreground">每个时间段内会随机到秒，指定天数时每个人独立随机日期</p></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="生成月份"><Input type="month" value={form.month} onChange={(event) => patchForm({ month: event.target.value })} /></Field>
                  <Field label="每人生成天数" hint="0 = 整月"><Input type="number" min={0} max={31} value={form.attendance_days} onChange={(event) => patchForm({ attendance_days: Math.max(0, Number(event.target.value) || 0) })} /></Field>
                  <TimeRange label="早上进场时间" start={form.morning_start} end={form.morning_end} onChange={(morning_start, morning_end) => patchForm({ morning_start, morning_end })} />
                  <TimeRange label="晚上出场时间" start={form.evening_start} end={form.evening_end} onChange={(evening_start, evening_end) => patchForm({ evening_start, evening_end })} />
                </div>
                <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3 dark:bg-muted/30">
                  <CheckOption label="包含周末" checked={form.include_weekends} onChange={(include_weekends) => patchForm({ include_weekends, prioritize_weekends: include_weekends ? form.prioritize_weekends : false })} />
                  <CheckOption label="优先生成周末" checked={form.prioritize_weekends} disabled={!form.include_weekends || form.attendance_days === 0} onChange={(prioritize_weekends) => patchForm({ prioritize_weekends })} />
                  <CheckOption label="增加午间进出场" checked={form.include_midday} onChange={(include_midday) => patchForm({ include_midday })} />
                </div>
                {form.include_midday ? <div className="mt-4 grid gap-4 md:grid-cols-2"><TimeRange label="午间出场时间" start={form.lunch_out_start!} end={form.lunch_out_end!} onChange={(lunch_out_start, lunch_out_end) => patchForm({ lunch_out_start, lunch_out_end })} /><TimeRange label="午间进场时间" start={form.lunch_in_start!} end={form.lunch_in_end!} onChange={(lunch_in_start, lunch_in_end) => patchForm({ lunch_in_start, lunch_in_end })} /></div> : null}
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3"><Summary icon={UsersIcon} label="生成人员" value={`${preview.worker_count} 人`} /><Summary icon={CalendarClock} label="打卡记录" value={`${preview.record_count} 条`} /><Summary icon={Database} label="数据标记" value="生成数据" /></div>
              <div className="flex items-center justify-between"><div><h3 className="font-semibold">生成结果预览</h3><p className="text-xs text-muted-foreground">请核对人员、班组、进出方向和时间；当前仅预览，尚未写入数据库。</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={exportPreview}><Download className="mr-1 size-4" />导出预览数据</Button><Button variant="outline" size="sm" onClick={() => setPreview(null)}><ChevronLeft className="mr-1 size-4" />返回修改</Button></div></div>
              {preview.records.length > 500 ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">记录较多，表格先展示前 500 条；确认写入时仍会写入全部 {preview.record_count} 条。</div> : null}
              <div className="max-h-[480px] overflow-auto rounded-lg border">
                <Table><TableHeader className="sticky top-0 bg-slate-50 dark:bg-muted"><TableRow><TableHead>人员</TableHead><TableHead>班组</TableHead><TableHead>方向</TableHead><TableHead>考勤时间</TableHead><TableHead>来源</TableHead></TableRow></TableHeader><TableBody>{preview.records.slice(0, 500).map((record, index) => <TableRow key={`${record.worker_id}-${record.trigger_time}-${index}`}><TableCell className="font-medium">{record.worker_name}</TableCell><TableCell>{record.team_name || "未分配班组"}</TableCell><TableCell><span className={cn("rounded-full px-2 py-1 text-xs font-semibold", record.direction === 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{record.direction === 0 ? "进场" : "出场"}</span></TableCell><TableCell>{formatDateTime(record.trigger_time)}</TableCell><TableCell><span className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs text-violet-700">生成工具</span></TableCell></TableRow>)}</TableBody></Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t bg-slate-50 px-6 py-4 dark:bg-muted/20">
          <Button variant="outline" disabled={loading || committing || importing} onClick={() => changeOpen(false)}>取消</Button>
          {!preview ? (
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void handleFileSelect(e)} />
              <Button variant="outline" disabled={loading || importing || workers.length === 0} onClick={() => fileInputRef.current?.click()}>{importing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}导入并生成预览</Button>
              <Button className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]" disabled={loading || workerIds.length === 0} onClick={() => void createPreview()}>{loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Eye className="mr-2 size-4" />}生成并预览</Button>
            </div>
          ) : <Button className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]" disabled={committing} onClick={() => void commit()}>{committing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Database className="mr-2 size-4" />}确认写入 {preview.record_count} 条</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="grid gap-2 text-sm font-medium"><span>{label}{hint ? <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span> : null}</span>{children}</label>; }
function TimeRange({ label, start, end, onChange }: { label: string; start: string; end: string; onChange: (start: string, end: string) => void }) { return <Field label={label}><div className="flex items-center gap-2"><Input type="time" value={start} onChange={(event) => onChange(event.target.value, end)} /><span className="text-muted-foreground">—</span><Input type="time" value={end} onChange={(event) => onChange(start, event.target.value)} /></div></Field>; }
function CheckOption({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) { return <label className={cn("flex items-center gap-2 text-sm", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}><Checkbox disabled={disabled} checked={checked} onCheckedChange={(value) => onChange(value === true)} />{label}</label>; }
function Summary({ icon: Icon, label, value }: { icon: typeof CalendarClock; label: string; value: string }) { return <div className="flex items-center gap-3 rounded-xl border bg-slate-50 p-4 dark:bg-muted/20"><span className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-[#0f6b5d] dark:bg-emerald-950"><Icon className="size-5" /></span><div><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div></div>; }
const UsersIcon = Users;
function formatDateTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)); }

function formatExportDateTime(rfc3339: string): string {
  const d = new Date(rfc3339);
  if (isNaN(d.getTime())) return rfc3339;
  const pad = (n: number) => String(n).padStart(2, "0");
  const beijing = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())} ${pad(beijing.getUTCHours())}:${pad(beijing.getUTCMinutes())}:${pad(beijing.getUTCSeconds())}`;
}

function parseImportDateTime(value: string): string {
  const trimmed = value.trim().replace(/[年月日]/g, (m) => m === "年" || m === "月" ? "-" : " ").replace(/\//g, "-");
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{2}):(\d{2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`;
  const m2 = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{2}):(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}T${m2[4]}:${m2[5]}:00+08:00`;
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString();
  throw new Error(`无法解析时间: ${value}`);
}

function formatDateForFile(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
