import type {
  ManagedAttendanceConfigLike,
  ManagedAttendancePhotoGroupLike,
} from "./types";

export function summarizeManagedAttendanceConfig(config: ManagedAttendanceConfigLike) {
  const days = Number(config.monthly_attendance_days) || 0;
  const shift = config.shift === "night" ? "夜班" : "白班";
  const plannedRecords = Math.max(days, 0) * 2;
  const inTime = config.check_in_time || "--:--";
  const outTime = config.check_out_time || "--:--";

  return `${shift} · 每月 ${days} 天 · 预计 ${plannedRecords} 条 · ${inTime}/${outTime}`;
}

export function isManagedPhotoGroupReady(photoGroup: ManagedAttendancePhotoGroupLike) {
  return (
    photoGroup.generation_status === "ready" &&
    (photoGroup.in_photos?.filter(Boolean).length ?? 0) > 0 &&
    (photoGroup.out_photos?.filter(Boolean).length ?? 0) > 0
  );
}

export function managedAttendanceShiftLabel(shift: string) {
  return shift === "night" ? "夜班" : "白班";
}

export function managedAttendanceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    generated: "已生成",
    pending: "待生成",
    failed: "失败",
  };
  return labels[status] ?? status;
}
