export const DEFAULT_PROJECT_DETAIL_TAB = "项目基本信息" as const;

export const PROJECT_DETAIL_TABS = [
  "项目基本信息",
  "建设单位",
  "班组信息",
  "项目工人",
  "考勤记录",
  "移动人脸机",
  "电子围栏配置",
  "工资统计",
] as const;

export function getProjectDetailTabs(
  isSystemAdmin: boolean,
  showAttendanceGeofence = false,
) {
  return PROJECT_DETAIL_TABS.filter((tab) => {
    if (tab === "移动人脸机") return isSystemAdmin;
    if (tab === "电子围栏配置") return isSystemAdmin && showAttendanceGeofence;
    return true;
  });
}

export function getProjectInfoCellClassName(index: number, itemCount: number) {
  const isLastOddItem = itemCount % 2 === 1 && index === itemCount - 1;

  return isLastOddItem ? "sm:col-span-2" : "";
}
