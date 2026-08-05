import { createFileRoute } from "@tanstack/react-router";

import { SupplementalAttendancePage } from "@/features/supplemental-attendance/components/SupplementalAttendancePage";

export const Route = createFileRoute("/app/admin/supplemental-attendance")({
  component: SupplementalAttendancePage,
});
