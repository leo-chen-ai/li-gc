import { createFileRoute } from "@tanstack/react-router";
import { AdminPlaceholderPage } from "@/features/admin/components/AdminPlaceholderPage";

export const Route = createFileRoute("/app/admin/quality-safety")({
  component: () => <AdminPlaceholderPage group="施工管理 / 质安管理" title="质安管理" />,
});
