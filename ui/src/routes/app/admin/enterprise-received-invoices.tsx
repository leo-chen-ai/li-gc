import { createFileRoute } from "@tanstack/react-router";

import { EnterpriseRecordModulePage } from "@/features/enterprise-projects/components/EnterpriseRecordModulePage";

export const Route = createFileRoute("/app/admin/enterprise-received-invoices")({
  component: EnterpriseReceivedInvoicesRoute,
});

function EnterpriseReceivedInvoicesRoute() {
  return <EnterpriseRecordModulePage module="received-invoices" />;
}
