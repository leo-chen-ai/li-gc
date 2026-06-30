import { createFileRoute } from "@tanstack/react-router";
import { AdminPlaceholderPage } from "@/features/admin/components/AdminPlaceholderPage";

export const Route = createFileRoute("/app/admin/construction-site")({
  component: () => <AdminPlaceholderPage group="施工管理 / 施工现场" title="施工现场" />,
});
