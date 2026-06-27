import { createFileRoute } from "@tanstack/react-router";

import { EnterpriseRecordModulePage } from "@/features/enterprise-projects/components/EnterpriseRecordModulePage";

export const Route = createFileRoute("/app/admin/enterprise-collections")({
  component: EnterpriseCollectionsRoute,
});

function EnterpriseCollectionsRoute() {
  return <EnterpriseRecordModulePage module="collections" />;
}
