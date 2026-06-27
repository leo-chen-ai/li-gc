import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { EnterpriseProjectsPage } from "@/features/enterprise-projects/components/EnterpriseProjectsPage";

export const Route = createFileRoute("/app/admin/enterprise-projects")({
  component: EnterpriseProjectsRoute,
});

function EnterpriseProjectsRoute() {
  const location = useLocation();

  if (location.pathname !== "/app/admin/enterprise-projects") {
    return <Outlet />;
  }

  return <EnterpriseProjectsPage />;
}
