export type MenuPermissionKey =
  | "projects"
  | "attendance_devices"
  | "attendance_device_issue_reports"
  | "users"
  | "roles"
  | "uploads";

export interface MenuPermission {
  key: MenuPermissionKey;
  name: string;
  group: "工作台" | "考勤机管理" | "系统";
  path: string;
  description: string;
}

export interface RoleMenuConfig {
  code: string;
  menu_keys: string[];
}

export const menuPermissions: MenuPermission[] = [
  {
    key: "projects",
    name: "项目管理",
    group: "工作台",
    path: "/app/admin/projects",
    description: "查看项目台账、单位、班组、人员和考勤",
  },
  {
    key: "attendance_devices",
    name: "考勤机绑定",
    group: "考勤机管理",
    path: "/app/admin/attendance-devices",
    description: "维护项目考勤机绑定、进出方向和设备备注",
  },
  {
    key: "attendance_device_issue_reports",
    name: "考勤机人员下发报告",
    group: "考勤机管理",
    path: "/app/admin/attendance-device-issue-reports",
    description: "查看人员下发到考勤机的动作、时间和状态",
  },
  {
    key: "users",
    name: "用户管理",
    group: "系统",
    path: "/app/admin/users",
    description: "维护后台账号和登录身份",
  },
  {
    key: "roles",
    name: "角色管理",
    group: "系统",
    path: "/app/admin/roles",
    description: "配置角色对应的菜单权限",
  },
  {
    key: "uploads",
    name: "文件管理",
    group: "系统",
    path: "/app/admin/uploads",
    description: "查看项目、单位、班组、人员和考勤上传文件",
  },
];

export function getMenuKeysForUserRole(
  role?: string,
  roleConfigs: RoleMenuConfig[] = []
): MenuPermissionKey[] {
  const configuredRole = roleConfigs.find((item) => item.code === role);
  if (configuredRole) {
    return configuredRole.menu_keys.filter(isMenuPermissionKey);
  }

  if (role === "admin") {
    return ["projects", "attendance_devices", "attendance_device_issue_reports", "users", "roles", "uploads"];
  }

  return ["projects"];
}

function isMenuPermissionKey(key: string): key is MenuPermissionKey {
  return menuPermissions.some((menu) => menu.key === key);
}
