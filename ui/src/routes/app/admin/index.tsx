import { createFileRoute } from "@tanstack/react-router";

import { AdminOverviewPage } from "@/features/projects/components/AdminOperationsPages";

export const Route = createFileRoute("/app/admin/")({
  component: AdminOverviewPage,
});
