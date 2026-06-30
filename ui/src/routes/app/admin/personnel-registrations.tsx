import { createFileRoute } from "@tanstack/react-router";
import { AdminPlaceholderPage } from "@/features/admin/components/AdminPlaceholderPage";

export const Route = createFileRoute("/app/admin/personnel-registrations")({
  component: () => (
    <AdminPlaceholderPage
      group="人员管理 / 人员注册信息"
      title="人员注册信息"
      description="人员注册信息模块预留。"
    />
  ),
});
