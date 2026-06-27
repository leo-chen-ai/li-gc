import { createFileRoute } from "@tanstack/react-router";

import { EnterpriseOwnEntitiesPage } from "@/features/enterprise-projects/components/EnterpriseOwnEntitiesPage";

export const Route = createFileRoute("/app/admin/enterprise-own-entities")({
  component: EnterpriseOwnEntitiesPage,
});
