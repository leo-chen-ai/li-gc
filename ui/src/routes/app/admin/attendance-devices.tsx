import { createFileRoute } from "@tanstack/react-router";

import { AttendanceDeviceBindingsPage } from "@/features/attendance-devices/components/AttendanceDeviceBindingsPage";

export const Route = createFileRoute("/app/admin/attendance-devices")({
  component: AttendanceDeviceBindingsPage,
});
