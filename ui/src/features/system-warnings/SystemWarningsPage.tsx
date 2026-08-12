import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BellRing, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SystemWarningTable } from "./SystemWarningTable";
import { listSystemWarnings } from "./service";
import type { SystemWarningFilters, SystemWarningType } from "./types";

export function HomeWarningsPage() {
  const query = useQuery({
    queryKey: ["system-warnings", "home"],
    queryFn: () => listSystemWarnings({ page: 1, page_size: 10 }),
    refetchInterval: 60_000,
  });
  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm dark:bg-card">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold"><BellRing className="size-5 text-[#0f6b5d]" />预警</h1>
          <p className="mt-1 text-xs text-muted-foreground">展示您有权限项目的最新 10 条预警</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-2 size-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新
          </Button>
          <Button size="sm" asChild><Link to="/app/admin/warnings">查看全部</Link></Button>
        </div>
      </section>
      {query.isError ? <ErrorNotice /> : null}
      <SystemWarningTable rows={query.data?.items ?? []} loading={query.isLoading} />
    </div>
  );
}

export function SystemWarningsPage() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<"all" | SystemWarningType>("all");
  const [status, setStatus] = useState<"all" | "active" | "resolved">("all");
  const [keyword, setKeyword] = useState("");
  const filters: SystemWarningFilters = {
    page, page_size: 20,
    ...(type === "all" ? {} : { warning_type: type }),
    ...(status === "all" ? {} : { status }),
    ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
  };
  const query = useQuery({ queryKey: ["system-warnings", filters], queryFn: () => listSystemWarnings(filters) });
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 20));
  return (
    <div className="space-y-3">
      <section className="rounded-xl border bg-white p-4 shadow-sm dark:bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-lg font-semibold">预警管理</h1><p className="mt-1 text-xs text-muted-foreground">查看考勤机离线和管理班组人员未考勤的完整明细</p></div>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}><RefreshCw className={`mr-2 size-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Input className="w-64" placeholder="搜索项目、设备或人员" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={type} onChange={(event) => { setType(event.target.value as typeof type); setPage(1); }}>
            <option value="all">全部类型</option><option value="device_offline">考勤机离线</option><option value="management_team_no_attendance">管理班组未考勤</option>
          </select>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }}>
            <option value="all">全部状态</option><option value="active">预警中</option><option value="resolved">已恢复</option>
          </select>
        </div>
      </section>
      {query.isError ? <ErrorNotice /> : null}
      <SystemWarningTable rows={query.data?.items ?? []} loading={query.isLoading} />
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {query.data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button><span>{page} / {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</Button></div>
      </div>
    </div>
  );
}

function ErrorNotice() {
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">预警数据加载失败，请检查登录状态或后端服务。</div>;
}
