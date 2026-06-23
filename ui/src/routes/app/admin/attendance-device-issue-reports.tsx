import { createFileRoute } from "@tanstack/react-router";

import { AttendanceDeviceIssueReportsPage } from "@/features/attendance-devices/components/AttendanceDeviceIssueReportsPage";

export const Route = createFileRoute("/app/admin/attendance-device-issue-reports")({
  component: AttendanceDeviceIssueReportsPage,
});
