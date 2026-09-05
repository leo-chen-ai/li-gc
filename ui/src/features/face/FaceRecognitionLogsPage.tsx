import { useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Image as ImageIcon } from "lucide-react";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Log = {
  id: string; project_id: string; project_name: string; point_name: string | null;
  status: string; reason: string; elapsed_ms: number | null; created_at: string;
  has_photo: boolean; has_crop: boolean;
  details: {
    stage?: string; photo_error?: string; crop_photo_error?: string; camera_position?: string; camera_zoom?: number;
    result?: { worker_name?: string };
    recognition?: { score?: number; threshold?: number; library_size?: number; elapsed_ms?: number;
      candidates?: { person_id: string; name: string; score: number }[] | null;
      diagnostics?: { face_count?: number; detection_score?: number; detection_peak_score?: number; detection_threshold?: number; image_width?: number; image_height?: number; model?: string } };
  };
};
const labels: Record<string, string> = { processing: "处理中", success: "打卡成功", not_matched: "未匹配", error: "异常", interrupted: "处理中断" };
const number = (value: number | null | undefined) => value == null ? "—" : value.toFixed(3);
const time = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });

export function FaceRecognitionLogsPage() {
  const search = useSearch({ strict: false }) as { project_id?: string };
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Log | null>(null);
  const logs = useQuery({
    queryKey: ["face-recognition-logs", search.project_id, status, keyword, page],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { items: Log[]; total: number } }>("/management/face-recognition-logs", { params: { project_id: search.project_id, status, q: keyword, page, page_size: 20 } });
      return res.data.data;
    },
    refetchInterval: 5000,
  });
  const photos = useQuery({
    queryKey: ["face-recognition-photos", selected?.id],
    enabled: !!selected && (selected.has_photo || selected.has_crop),
    gcTime: 0,
    queryFn: async () => {
      const res = await apiClient.get<{ data: { photo: string | null; crop: string | null } }>(`/management/face-recognition-logs/${selected!.id}/photos`);
      return res.data.data;
    },
  });
  const rec = selected?.details.recognition;
  const det = rec?.diagnostics;
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">人脸识别日志</h1><p className="mt-1 text-sm text-muted-foreground">记录本功能上线后的识别请求，每 5 秒刷新。照片保留 7 天，日志保留 30 天；仅 admin 可查看。</p></div>
      <Button variant="outline" onClick={() => void logs.refetch()} disabled={logs.isFetching}><RefreshCw className="mr-2 h-4 w-4" />刷新</Button>
    </div>
    <form className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3" onSubmit={(e) => { e.preventDefault(); setKeyword(draft); setPage(1); }}>
      <Input className="max-w-sm" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="搜索项目、成功识别人员或失败原因" aria-label="搜索识别日志" />
      <select className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="识别状态" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="">全部结果</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <Button type="submit">查询</Button>
      {search.project_id && <span className="text-xs text-muted-foreground">已限定项目</span>}
    </form>
    {logs.isError ? <div role="alert" className="rounded-lg border p-6 text-red-600">识别日志加载失败，请检查权限或稍后刷新。</div> : <div className="overflow-x-auto rounded-lg border bg-card">
      <Table><TableHeader><TableRow>
        {['识别时间', '项目 / 点位', '结果 / 人员', '原因', '检测分数 / 阈值', '匹配分数 / 阈值', '前三名候选 / 分数', '耗时', '照片 / 详情'].map((v) => <TableHead key={v}>{v}</TableHead>)}
      </TableRow></TableHeader><TableBody>
        {logs.isPending && <TableRow><TableCell colSpan={9} className="py-10 text-center">正在加载识别日志…</TableCell></TableRow>}
        {logs.data?.items.length === 0 && <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">暂无符合条件的识别日志</TableCell></TableRow>}
        {logs.data?.items.map((row) => {
          const recognition = row.details.recognition;
          const detection = recognition?.diagnostics;
          return <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap text-xs">{time(row.created_at)}</TableCell>
            <TableCell><div>{row.project_name}</div><div className="text-xs text-muted-foreground">{row.point_name || '点位已删除或不存在'}</div></TableCell>
            <TableCell><Badge variant="outline" className={row.status === 'success' ? 'text-emerald-700' : row.status === 'processing' ? '' : 'text-red-600'}>{labels[row.status] || row.status}</Badge><div className="mt-1 text-xs">{row.details.result?.worker_name || '—'}</div></TableCell>
            <TableCell className="max-w-xs whitespace-normal text-xs">{row.reason || '处理中，等待结果'}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">{number(detection?.detection_score ?? detection?.detection_peak_score)} / {number(detection?.detection_threshold)}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">{number(recognition?.score)} / {number(recognition?.threshold)}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">{recognition?.candidates?.length ? recognition.candidates.slice(0, 3).map((candidate, index) => <div key={candidate.person_id}>{index + 1}. {candidate.name || '未命名人员'} · {candidate.score.toFixed(4)}</div>) : '—'}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">{row.elapsed_ms == null ? '—' : `${row.elapsed_ms} ms`}</TableCell>
            <TableCell><Button variant="ghost" size="sm" onClick={() => setSelected(row)}><ImageIcon className="mr-1 h-4 w-4" />{row.has_photo ? '查看照片' : '查看详情'}</Button></TableCell>
          </TableRow>;
        })}
      </TableBody></Table>
      <div className="flex items-center justify-between border-t p-3 text-sm"><span>共 {logs.data?.total ?? 0} 条 · 第 {page} 页</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button><Button size="sm" variant="outline" disabled={page * 20 >= (logs.data?.total ?? 0)} onClick={() => setPage(page + 1)}>下一页</Button></div></div>
    </div>}
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>识别照片与诊断详情</DialogTitle><DialogDescription>{selected ? `${time(selected.created_at)} · ${selected.project_name} · ${selected.reason}` : ''}</DialogDescription></DialogHeader>
      {photos.isFetching && <p className="text-sm text-muted-foreground">正在读取受保护照片…</p>}
      {photos.isError && <p className="text-sm text-red-600">照片读取失败，可能已过期或无权访问。</p>}
      <div className="grid gap-4 sm:grid-cols-2">{[['上传画面（压缩留存）', photos.data?.photo], ['人脸留边裁剪', photos.data?.crop]].map(([label, src]) => <div key={label}><div className="mb-2 text-sm font-medium">{label}</div>{src ? <img src={src} alt={label!} className="h-64 w-full rounded-lg bg-muted object-contain" /> : <div className="flex h-64 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">{label === '人脸留边裁剪' && det?.face_count === 0 ? '未检测到人脸，无裁剪图' : '未保存或已过期'}</div>}</div>)}</div>
      <div className="grid grid-cols-2 gap-2 text-sm"><span>检测人脸数：{det?.face_count ?? '—'}</span><span>图像尺寸：{det?.image_width ?? '—'} × {det?.image_height ?? '—'}</span><span>模型：{det?.model ?? '—'}</span><span>人脸库人数：{rec?.library_size ?? '—'}</span><span>摄像头：{selected?.details.camera_position === 'front' ? '前置' : selected?.details.camera_position === 'back' ? '后置' : '未上报'}</span><span>相机倍率：{selected?.details.camera_zoom ?? '—'}×</span></div>
      <div className="rounded-lg border p-3"><h3 className="mb-2 text-sm font-medium">匹配分数前三名（候选，不代表确认身份）</h3>
        {rec?.candidates?.length ? <Table><TableHeader><TableRow><TableHead>排名</TableHead><TableHead>姓名</TableHead><TableHead>匹配分数</TableHead></TableRow></TableHeader><TableBody>{rec.candidates.slice(0, 3).map((candidate, index) => <TableRow key={candidate.person_id}><TableCell>{index + 1}</TableCell><TableCell>{candidate.name || '未命名人员'}</TableCell><TableCell>{candidate.score.toFixed(4)}</TableCell></TableRow>)}</TableBody></Table> : <p className="text-sm text-muted-foreground">{rec?.candidates == null ? '本次未记录候选分数（历史记录或服务未返回）' : '无候选分数：未提取到有效人脸特征或项目库为空'}</p>}
      </div>
      <p className="text-xs text-muted-foreground">检测分数用于判断是否有人脸；匹配分数为余弦相似度，不是身份正确概率。候选仅来自本项目人脸库，不足 3 人时按实际人数显示。照片仅用于授权排障。</p>
      <details><summary className="cursor-pointer text-sm">完整诊断字段</summary><pre className="mt-2 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(selected?.details, null, 2)}</pre></details>
    </DialogContent></Dialog>
  </div>;
}
