import { AlertTriangle, Clock3, Router, UserRoundX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SystemWarning } from "./types";

export function SystemWarningTable({ rows, loading }: { rows: SystemWarning[]; loading: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80 dark:bg-muted/40">
            <TableHead className="w-[170px]">预警类型</TableHead>
            <TableHead>项目</TableHead>
            <TableHead>预警内容</TableHead>
            <TableHead className="w-[170px]">发生时间</TableHead>
            <TableHead className="w-[90px]">状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <EmptyRow text="预警加载中..." />
          ) : rows.length === 0 ? (
            <EmptyRow text="暂无预警记录" />
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex items-center gap-2 font-medium">
                    {row.warning_type === "device_offline" ? (
                      <Router className="size-4 text-red-600" />
                    ) : (
                      <UserRoundX className="size-4 text-amber-600" />
                    )}
                    {warningTypeLabel(row.warning_type)}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{row.project_name || "未命名项目"}</TableCell>
                <TableCell>
                  <div>{row.message}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.warning_type === "device_offline"
                      ? [row.device_name, row.serial_number].filter(Boolean).join(" · ") || "未命名考勤机"
                      : [row.worker_name, row.team_name].filter(Boolean).join(" · ")}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock3 className="size-3.5" />{formatDateTime(row.occurred_at)}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={row.resolved_at ? "text-slate-600" : "border-red-200 bg-red-50 text-red-700"}>
                    {row.warning_type === "management_team_no_attendance"
                      ? "已记录"
                      : row.resolved_at ? "已恢复" : "预警中"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <TableRow><TableCell colSpan={5} className="h-36 text-center text-muted-foreground"><AlertTriangle className="mx-auto mb-2 size-5" />{text}</TableCell></TableRow>;
}

function warningTypeLabel(type: SystemWarning["warning_type"]) {
  return type === "device_offline" ? "考勤机离线" : "管理班组未考勤";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}
