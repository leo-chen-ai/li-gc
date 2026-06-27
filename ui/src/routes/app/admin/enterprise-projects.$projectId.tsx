import { createFileRoute } from "@tanstack/react-router";

import { EnterpriseProjectDetailPage } from "@/features/enterprise-projects/components/EnterpriseProjectDetailPage";

export const Route = createFileRoute("/app/admin/enterprise-projects/$projectId")({
  component: EnterpriseProjectDetailRoute,
});

function EnterpriseProjectDetailRoute() {
  const { projectId } = Route.useParams();

  return <EnterpriseProjectDetailPage projectId={projectId} />;
}
