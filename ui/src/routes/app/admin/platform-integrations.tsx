import { createFileRoute } from "@tanstack/react-router";

import { PlatformIntegrationPage } from "@/features/projects/components/AdminOperationsPages";

export const Route = createFileRoute("/app/admin/platform-integrations")({
  component: PlatformIntegrationPage,
});
