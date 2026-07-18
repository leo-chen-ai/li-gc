import { createFileRoute } from "@tanstack/react-router";

import { ManagedAttendancePage } from "@/features/managed-attendance/components/ManagedAttendancePage";

export const Route = createFileRoute("/app/admin/managed-attendance")({
  component: ManagedAttendancePage,
});
