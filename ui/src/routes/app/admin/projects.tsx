import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { ProjectsPage } from "@/features/projects/components/ProjectsPage";

export const Route = createFileRoute("/app/admin/projects")({
  component: ProjectsRoute,
});

function ProjectsRoute() {
  const location = useLocation();

  if (location.pathname !== "/app/admin/projects") {
    return <Outlet />;
  }

  return <ProjectsPage />;
}
