import { createFileRoute } from "@tanstack/react-router";
import { AdminPlaceholderPage } from "@/features/admin/components/AdminPlaceholderPage";

export const Route = createFileRoute("/app/admin/personnel-qualifications")({
  component: () => (
    <AdminPlaceholderPage
      group="人员管理 / 人员资格信息"
      title="人员资格信息"
      description="人员资格信息模块预留。"
    />
  ),
});
