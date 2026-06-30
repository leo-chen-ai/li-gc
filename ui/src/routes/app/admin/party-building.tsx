import { createFileRoute } from "@tanstack/react-router";
import { AdminPlaceholderPage } from "@/features/admin/components/AdminPlaceholderPage";

export const Route = createFileRoute("/app/admin/party-building")({
  component: () => <AdminPlaceholderPage group="施工管理 / 智慧党建" title="智慧党建" />,
});
