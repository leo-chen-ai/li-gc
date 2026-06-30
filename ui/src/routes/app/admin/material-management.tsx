import { createFileRoute } from "@tanstack/react-router";
import { AdminPlaceholderPage } from "@/features/admin/components/AdminPlaceholderPage";

export const Route = createFileRoute("/app/admin/material-management")({
  component: () => <AdminPlaceholderPage group="施工管理 / 材料管理" title="材料管理" />,
});
