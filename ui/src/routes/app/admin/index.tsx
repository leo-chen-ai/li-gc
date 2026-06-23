import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/admin/")({
  component: () => <Navigate to="/app/admin/projects" replace />,
});
