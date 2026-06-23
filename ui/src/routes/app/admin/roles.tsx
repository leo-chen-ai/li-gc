import { createFileRoute } from "@tanstack/react-router";
import { RolesManagement } from "@/features/admin/components/RolesManagement";

export const Route = createFileRoute("/app/admin/roles")({
  component: RolesManagement,
});
