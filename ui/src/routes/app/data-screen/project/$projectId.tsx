import { createFileRoute } from "@tanstack/react-router";
import { ProjectBoard } from "@/features/data-screen/components/ProjectBoard";
import "@/features/data-screen/styles/dashboard.css";

export const Route = createFileRoute("/app/data-screen/project/$projectId")({
  component: ProjectBoardRoute,
});

function ProjectBoardRoute() {
  const { projectId } = Route.useParams();
  return <ProjectBoard projectId={projectId} />;
}
