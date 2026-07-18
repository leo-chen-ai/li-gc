import type {
  ConstructionAttendanceAlertCategory,
  ConstructionAttendanceAlertRunSummary,
} from "@/features/projects/types/construction-types";

export const attendanceAlertTabs = [
  { key: "configs", label: "预警配置" },
  { key: "logs", label: "记录日志" },
] as const;

export type AttendanceAlertTabKey = (typeof attendanceAlertTabs)[number]["key"];

export function attendanceAlertCategoryLabel(
  category: ConstructionAttendanceAlertCategory | string
) {
  switch (category) {
    case "manager":
      return "管理人员";
    case "worker":
      return "民工";
    case "supervisor":
      return "监理";
    default:
      return category;
  }
}

export function attendanceAlertStatusLabel(status: string) {
  switch (status) {
    case "logged":
      return "已记录";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

export function formatAttendanceAlertRunSummary(
  summary: ConstructionAttendanceAlertRunSummary
) {
  return `${summary.alert_date} 已检查 ${summary.scanned_configs} 个项目配置，记录 ${summary.written_logs} 条预警日志`;
}
