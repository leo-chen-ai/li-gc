import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRegistrationLeads } from "@/features/admin/hooks/use-users-list";

export function RegistrationLeadsPage() {
  const leads = useRegistrationLeads();

  return (
    <div className="space-y-3">
      <section className="rounded-xl border bg-white px-4 py-3 shadow-sm dark:bg-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-medium text-[#0f6b5d]">系统 / 注册列表</div>
            <h1 className="mt-1 text-xl font-semibold tracking-normal">注册列表</h1>
            <p className="mt-1 text-sm text-muted-foreground">查看登录页提交的注册姓名和手机号。</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void leads.refetch()} disabled={leads.isFetching}>
            <RefreshCw className={`mr-2 size-4 ${leads.isFetching ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </section>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">注册记录</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#f8faf9]">
                  <TableHead>姓名</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>提交时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      注册记录加载中
                    </TableCell>
                  </TableRow>
                ) : leads.isError ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-red-600">
                      注册记录加载失败，请检查登录状态或后端服务
                    </TableCell>
                  </TableRow>
                ) : leads.data?.length ? (
                  leads.data.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">{lead.name}</TableCell>
                      <TableCell>{lead.phone}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(lead.created_at).toLocaleString("zh-CN")}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      暂无注册记录
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
