import { createFileRoute } from "@tanstack/react-router";
import { AttendanceAlertsPage } from "@/features/attendance-alerts/components/AttendanceAlertsPage";

export const Route = createFileRoute("/app/admin/attendance-alerts")({
  component: AttendanceAlertsPage,
});
