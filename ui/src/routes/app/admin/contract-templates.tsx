import { createFileRoute } from "@tanstack/react-router";

import { ContractTemplateManagementPage } from "@/features/projects/components/AdminOperationsPages";

export const Route = createFileRoute("/app/admin/contract-templates")({
  component: ContractTemplateManagementPage,
});
