import { createFileRoute } from "@tanstack/react-router";

import { AttendanceDeviceIssueReportsPage } from "@/features/attendance-devices/components/AttendanceDeviceIssueReportsPage";

type IssueReportsSearch = {
  project_id?: string;
  attendance_device_id?: string;
  device_name?: string;
  serial_number?: string;
  include_delete_actions?: string;
};

export const Route = createFileRoute("/app/admin/attendance-device-issue-reports")({
  validateSearch: (search: Record<string, unknown>): IssueReportsSearch => ({
    project_id: typeof search.project_id === "string" ? search.project_id : undefined,
    attendance_device_id:
      typeof search.attendance_device_id === "string" ? search.attendance_device_id : undefined,
    device_name: typeof search.device_name === "string" ? search.device_name : undefined,
    serial_number: typeof search.serial_number === "string" ? search.serial_number : undefined,
    include_delete_actions:
      typeof search.include_delete_actions === "string" ? search.include_delete_actions : undefined,
  }),
  component: AttendanceDeviceIssueReportsPage,
});
