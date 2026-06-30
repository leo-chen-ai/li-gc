import { createFileRoute } from "@tanstack/react-router";
import { PersonnelWorkersPage } from "@/features/admin/components/PersonnelWorkersPage";

export const Route = createFileRoute("/app/admin/personnel-workers")({
  component: PersonnelWorkersPage,
});
