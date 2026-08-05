import type {
  SupplementalAttendanceDeviceStatus,
  SupplementalAttendanceSendStatus,
} from "./types.ts";

const sendStatusLabels: Record<SupplementalAttendanceSendStatus, string> = {
  unassigned: "未分配设备",
  pending: "待发送",
  processing: "发送中",
  delivered: "平台已送达",
  failed: "发送失败",
  skipped: "已跳过",
};

const deviceStatusLabels: Record<SupplementalAttendanceDeviceStatus, string> = {
  pending: "等待考勤机返回",
  accepted: "考勤机已受理",
  success: "考勤机处理成功",
  failed: "考勤机处理失败",
};

export function supplementalSendStatusLabel(
  status: SupplementalAttendanceSendStatus,
) {
  return sendStatusLabels[status] ?? status;
}

export function supplementalDeviceStatusLabel(
  status: SupplementalAttendanceDeviceStatus | null,
) {
  return status ? (deviceStatusLabels[status] ?? status) : "尚无考勤机返回";
}
