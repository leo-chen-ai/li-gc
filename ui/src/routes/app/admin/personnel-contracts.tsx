import { createFileRoute } from "@tanstack/react-router";
import { AdminPlaceholderPage } from "@/features/admin/components/AdminPlaceholderPage";

export const Route = createFileRoute("/app/admin/personnel-contracts")({
  component: () => (
    <AdminPlaceholderPage
      group="人员管理 / 人员合同信息"
      title="人员合同信息"
      description="人员合同信息模块预留。"
    />
  ),
});
