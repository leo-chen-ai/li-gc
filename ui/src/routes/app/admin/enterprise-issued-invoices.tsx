import { createFileRoute } from "@tanstack/react-router";

import { EnterpriseRecordModulePage } from "@/features/enterprise-projects/components/EnterpriseRecordModulePage";

export const Route = createFileRoute("/app/admin/enterprise-issued-invoices")({
  component: EnterpriseIssuedInvoicesRoute,
});

function EnterpriseIssuedInvoicesRoute() {
  return <EnterpriseRecordModulePage module="issued-invoices" />;
}
