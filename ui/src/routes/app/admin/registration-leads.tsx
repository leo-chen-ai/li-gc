import { createFileRoute } from "@tanstack/react-router";
import { RegistrationLeadsPage } from "@/features/admin/components/RegistrationLeadsPage";

export const Route = createFileRoute("/app/admin/registration-leads")({
  component: RegistrationLeadsPage,
});
