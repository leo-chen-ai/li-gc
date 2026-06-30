import { createFileRoute } from "@tanstack/react-router";
import { AdminPlaceholderPage } from "@/features/admin/components/AdminPlaceholderPage";

export const Route = createFileRoute("/app/admin/personnel-bad-records")({
  component: () => (
    <AdminPlaceholderPage
      group="人员管理 / 人员不良信息"
      title="人员不良信息"
      description="人员不良信息模块预留。"
    />
  ),
});
