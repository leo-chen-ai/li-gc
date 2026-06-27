import { createFileRoute, useLocation } from "@tanstack/react-router";

import { EnterpriseCustomerDetailPage } from "@/features/enterprise-projects/components/EnterpriseCustomerDetailPage";
import { EnterpriseCustomersPage } from "@/features/enterprise-projects/components/EnterpriseCustomersPage";
import { extractEnterpriseCustomerIdFromPath } from "@/features/enterprise-projects/lib";

export const Route = createFileRoute("/app/admin/enterprise-customers")({
  component: EnterpriseCustomersRoute,
});

function EnterpriseCustomersRoute() {
  const location = useLocation();
  const customerId = extractEnterpriseCustomerIdFromPath(location.pathname);
  if (customerId) {
    return <EnterpriseCustomerDetailPage customerId={customerId} />;
  }
  return <EnterpriseCustomersPage />;
}
