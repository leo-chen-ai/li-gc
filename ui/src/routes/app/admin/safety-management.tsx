import { createFileRoute } from "@tanstack/react-router";
import { AdminPlaceholderPage } from "@/features/admin/components/AdminPlaceholderPage";

export const Route = createFileRoute("/app/admin/safety-management")({
  component: () => <AdminPlaceholderPage group="施工管理 / 安全管理" title="安全管理" />,
});
