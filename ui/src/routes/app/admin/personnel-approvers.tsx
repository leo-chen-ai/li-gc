import { createFileRoute } from "@tanstack/react-router";
import { AdminPlaceholderPage } from "@/features/admin/components/AdminPlaceholderPage";

export const Route = createFileRoute("/app/admin/personnel-approvers")({
  component: () => (
    <AdminPlaceholderPage
      group="人员管理 / 审批人员设置"
      title="审批人员设置"
      description="审批人员设置模块预留。"
    />
  ),
});
