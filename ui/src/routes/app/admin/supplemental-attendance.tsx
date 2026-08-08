import { createFileRoute } from "@tanstack/react-router";

import { AttendanceHostingPage } from "@/features/attendance-hosting/components/AttendanceHostingPage";

export const Route = createFileRoute("/app/admin/supplemental-attendance")({
  component: AttendanceHostingPage,
});
