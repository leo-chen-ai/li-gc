import { createFileRoute } from "@tanstack/react-router";

import { WorkHourConfigPage } from "@/features/projects/components/AdminOperationsPages";

export const Route = createFileRoute("/app/admin/work-hour-configs")({
  component: WorkHourConfigPage,
});
