import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Database, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiClient } from "@/lib/api";

type ProjectLibrary = {
  id: string;
  name: string;
  mobile_face_enabled: boolean;
  geofence_face_enabled: boolean;
  enabled: boolean;
  total: number;
  synced: number;
  queued: number;
  processing: number;
  failed: number;
  last_error: string | null;
};
type Result = {
  summary: {
    total: number;
    enabled_count: number;
    failed_count: number;
    syncing_count: number;
    items: ProjectLibrary[];
  };
  service: { available: boolean; message: string };
};

export function FaceLibrarySyncPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("enabled");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["face-library-sync", keyword, status, page],
    queryFn: async () => (await apiClient.get<{ data: Result }>("/management/face-library-sync", { params: { q: keyword, status, page, page_size: 20 } })).data.data,
    refetchInterval: 5000,
  });
  const retry = useMutation({
    mutationFn: async (project: ProjectLibrary) => (await apiClient.post<{ data: { queued: number } }>(`/management/face-library-sync/${project.id}/retry`)).data.data,
    onSuccess: ({ queued }) => {
      toast.success(queued > 0 ? `已安排 ${queued} 人重新同步` : "当前人员均已在同步队列中");
      void queryClient.invalidateQueries({ queryKey: ["face-library-sync"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "提交重试失败"),
  });
  const data = query.data?.summary;
  const cards = [
    ["启用项目", data?.enabled_count ?? 0, Database],
    ["同步处理中", data?.syncing_count ?? 0, RefreshCw],
    ["存在失败", data?.failed_count ?? 0, AlertTriangle],
  ] as const;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">人脸库同步</h1><p className="mt-1 text-sm text-muted-foreground">统一维护移动人脸机和电子围栏使用的项目人脸库，每 5 秒自动刷新。</p></div>
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${query.data?.service.available ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
        {query.data?.service.available ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
        {query.data?.service.message ?? "正在检查人脸服务..."}
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">{cards.map(([label, value, Icon]) => <div key={label} className="rounded-lg border bg-card p-4"><Icon className="size-5 text-[#0f6b5d]" /><div className="mt-3 text-2xl font-semibold">{value}</div><div className="text-sm text-muted-foreground">{label}</div></div>)}</div>
    <form className="flex flex-wrap gap-2 rounded-lg border bg-card p-3" onSubmit={(event) => { event.preventDefault(); setKeyword(draft); setPage(1); }}>
      <div className="relative min-w-60 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="搜索项目名称" /></div>
      <select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
        <option value="enabled">已启用</option><option value="syncing">同步中</option><option value="failed">同步失败</option><option value="disabled">未启用</option><option value="">全部项目</option>
      </select>
      <Button type="submit">查询</Button><Button type="button" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 size-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button>
    </form>
    <div className="overflow-x-auto rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead>项目</TableHead><TableHead>启用来源</TableHead><TableHead>人脸库状态</TableHead><TableHead>同步进度</TableHead><TableHead>失败原因</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>
      {query.isPending && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">正在加载项目人脸库...</TableCell></TableRow>}
      {query.isError && <TableRow><TableCell colSpan={6} className="py-10 text-center text-red-600">加载失败，请检查菜单权限或服务状态</TableCell></TableRow>}
      {data?.items.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">暂无符合条件的项目</TableCell></TableRow>}
      {data?.items.map((item) => <TableRow key={item.id}>
        <TableCell><Link to="/app/admin/projects/$projectId" params={{ projectId: item.id }} className="font-medium text-[#0f6b5d] hover:underline">{item.name}</Link></TableCell>
        <TableCell><div className="flex flex-wrap gap-1">{item.mobile_face_enabled && <Badge variant="outline">移动人脸机</Badge>}{item.geofence_face_enabled && <Badge variant="outline">电子围栏</Badge>}{!item.enabled && <span className="text-sm text-muted-foreground">无</span>}</div></TableCell>
        <TableCell><Badge variant="outline" className={item.enabled ? "border-emerald-300 text-emerald-700" : "text-muted-foreground"}>{item.enabled ? "已启用" : "未启用"}</Badge></TableCell>
        <TableCell className="whitespace-nowrap"><div className="text-sm">已同步 {item.synced}/{item.total}</div><div className="text-xs text-muted-foreground">排队 {item.queued} · 同步中 {item.processing} · 失败 {item.failed}</div></TableCell>
        <TableCell className="max-w-80 text-xs text-red-600">{item.last_error || "—"}</TableCell>
        <TableCell className="text-right"><Button size="sm" variant="outline" disabled={!item.enabled || retry.isPending} onClick={() => retry.mutate(item)}><RefreshCw className="mr-2 size-4" />一键重试</Button></TableCell>
      </TableRow>)}
    </TableBody></Table><div className="flex items-center justify-between border-t p-3 text-sm"><span>共 {data?.total ?? 0} 个项目 · 第 {page} 页</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button><Button size="sm" variant="outline" disabled={page * 20 >= (data?.total ?? 0)} onClick={() => setPage((value) => value + 1)}>下一页</Button></div></div></div>
  </div>;
}
