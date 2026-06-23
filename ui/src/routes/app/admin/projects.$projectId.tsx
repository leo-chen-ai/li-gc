import { createFileRoute } from "@tanstack/react-router";
import { ProjectDetailPage } from "@/features/projects/components/ProjectDetailPage";

export const Route = createFileRoute("/app/admin/projects/$projectId")({
  component: ProjectDetailRoute,
});

function ProjectDetailRoute() {
  const { projectId } = Route.useParams();

  return <ProjectDetailPage projectId={projectId} />;
}
