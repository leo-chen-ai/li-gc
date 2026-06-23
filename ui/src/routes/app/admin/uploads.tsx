import { createFileRoute } from "@tanstack/react-router";

import { UploadsManagement } from "@/features/admin/components/UploadsManagement";

export const Route = createFileRoute("/app/admin/uploads")({
  component: UploadsManagement,
});
