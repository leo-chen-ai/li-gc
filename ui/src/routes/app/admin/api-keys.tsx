import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/admin/api-keys")({
  component: () => <Navigate to="/app/admin/projects" replace />,
});
