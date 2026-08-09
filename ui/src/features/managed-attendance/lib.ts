import type {
  ManagedAttendanceConfigLike,
  ManagedAttendancePhotoGroupLike,
} from "./types";

export function summarizeManagedAttendanceConfig(config: ManagedAttendanceConfigLike) {
  const days = Number(config.monthly_attendance_days) || 0;
  const plannedRecords = Math.max(days, 0) * 2;
  const inTime = config.check_in_time || "--:--";
  const inEndTime = config.check_in_end_time || inTime;
  const outTime = config.check_out_time || "--:--";
  const outEndTime = config.check_out_end_time || outTime;

  return `每月 ${days} 天 · 预计 ${plannedRecords} 条 · ${inTime}～${inEndTime}/${outTime}～${outEndTime}`;
}

export function isManagedPhotoGroupReady(photoGroup: ManagedAttendancePhotoGroupLike) {
  return (
    photoGroup.generation_status === "ready" &&
    (photoGroup.in_photos?.filter(Boolean).length ?? 0) > 0 &&
    (photoGroup.out_photos?.filter(Boolean).length ?? 0) > 0
  );
}

export function managedAttendanceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    generated: "已生成",
    pending: "待生成",
    failed: "失败",
  };
  return labels[status] ?? status;
}
