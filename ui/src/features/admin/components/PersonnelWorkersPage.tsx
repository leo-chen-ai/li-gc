import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { constructionProjectService } from "@/features/projects/services/construction-project-service";
import type { ConstructionProject, ConstructionWorker } from "@/features/projects/types/construction-types";

type WorkerRow = ConstructionWorker & {
  project_name: string;
};

async function loadWorkers() {
  const projects = await constructionProjectService.listProjects();
  const workersByProject = await Promise.all(
    projects.map(async (project: ConstructionProject) => {
      const workers = await constructionProjectService.listAllWorkers(project.id);
      return workers.map((worker) => ({ ...worker, project_name: project.name || "未命名项目" }));
    })
  );
  return workersByProject.flat();
}

export function PersonnelWorkersPage() {
  const workers = useQuery({
    queryKey: ["admin", "personnel-workers"],
    queryFn: loadWorkers,
    staleTime: 30 * 1000,
  });
  const rows: WorkerRow[] = workers.data ?? [];

  return (
    <div className="space-y-3">
      <section className="rounded-xl border bg-white px-4 py-3 shadow-sm dark:bg-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-medium text-[#0f6b5d]">人员管理 / 人员信息列表</div>
            <h1 className="mt-1 text-xl font-semibold tracking-normal">人员信息列表</h1>
            <p className="mt-1 text-sm text-muted-foreground">汇总现有所有项目的人员数据。</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void workers.refetch()} disabled={workers.isFetching}>
            <RefreshCw className={`mr-2 size-4 ${workers.isFetching ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </section>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm dark:bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f8faf9]">
              <TableHead>姓名</TableHead>
              <TableHead>手机号</TableHead>
              <TableHead>身份证号</TableHead>
              <TableHead>所属项目</TableHead>
              <TableHead>进场时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workers.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">人员数据加载中</TableCell>
              </TableRow>
            ) : workers.isError ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-red-600">人员数据加载失败，请检查登录状态或后端服务</TableCell>
              </TableRow>
            ) : rows.length ? (
              rows.map((worker) => (
                <TableRow key={worker.id}>
                  <TableCell className="font-medium">{worker.name || "未填写"}</TableCell>
                  <TableCell>{worker.phone || "-"}</TableCell>
                  <TableCell>{worker.id_card || "-"}</TableCell>
                  <TableCell>{worker.project_name}</TableCell>
                  <TableCell>{worker.entry_time || "-"}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无人员数据</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
