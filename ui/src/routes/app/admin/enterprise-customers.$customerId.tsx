import { createFileRoute } from "@tanstack/react-router";

import { EnterpriseCustomerDetailPage } from "@/features/enterprise-projects/components/EnterpriseCustomerDetailPage";

export const Route = createFileRoute("/app/admin/enterprise-customers/$customerId")({
  component: EnterpriseCustomerDetailRoute,
});

function EnterpriseCustomerDetailRoute() {
  const { customerId } = Route.useParams();
  return <EnterpriseCustomerDetailPage customerId={customerId} />;
}
