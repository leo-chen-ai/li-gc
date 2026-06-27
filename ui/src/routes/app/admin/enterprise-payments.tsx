import { createFileRoute } from "@tanstack/react-router";

import { EnterpriseRecordModulePage } from "@/features/enterprise-projects/components/EnterpriseRecordModulePage";

export const Route = createFileRoute("/app/admin/enterprise-payments")({
  component: EnterprisePaymentsRoute,
});

function EnterprisePaymentsRoute() {
  return <EnterpriseRecordModulePage module="payments" />;
}
