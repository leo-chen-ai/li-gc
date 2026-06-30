import { createFileRoute } from "@tanstack/react-router";
import { AdminPlaceholderPage } from "@/features/admin/components/AdminPlaceholderPage";

export const Route = createFileRoute("/app/admin/emergency-management")({
  component: () => <AdminPlaceholderPage group="施工管理 / 应急管理" title="应急管理" />,
});
