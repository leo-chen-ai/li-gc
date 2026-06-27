export type MenuPermissionKey =
  | "admin_overview"
  | "projects"
  | "enterprise_customers"
  | "enterprise_own_entities"
  | "enterprise_projects"
  | "enterprise_issued_invoices"
  | "enterprise_received_invoices"
  | "enterprise_collections"
  | "enterprise_payments"
  | "contract_templates"
  | "work_hour_configs"
  | "platform_integrations"
  | "attendance_devices"
  | "attendance_device_issue_reports"
  | "users"
  | "roles"
  | "uploads";

export interface MenuPermission {
  key: MenuPermissionKey;
  name: string;
  group: "工作台" | "项目管理" | "企业经营管理" | "考勤机管理" | "系统";
  path: string;
  description: string;
}

export interface RoleMenuConfig {
  code: string;
  menu_keys: string[];
}

export const menuPermissions: MenuPermission[] = [
  {
    key: "admin_overview",
    name: "首页总览",
    group: "工作台",
    path: "/app/admin",
    description: "查看项目、人员、考勤、工资和平台对接总览",
  },
  {
    key: "projects",
    name: "项目管理",
    group: "项目管理",
    path: "/app/admin/projects",
    description: "查看项目台账、单位、班组、人员和考勤",
  },
  {
    key: "enterprise_customers",
    name: "往来单位管理",
    group: "企业经营管理",
    path: "/app/admin/enterprise-customers",
    description: "维护往来单位并汇总项目、开票、收票、回款、付款和利润",
  },
  {
    key: "enterprise_own_entities",
    name: "我方主体管理",
    group: "企业经营管理",
    path: "/app/admin/enterprise-own-entities",
    description: "维护开票、收款和付款使用的我方公司主体",
  },
  {
    key: "enterprise_projects",
    name: "往来单位关联项目管理",
    group: "企业经营管理",
    path: "/app/admin/enterprise-projects",
    description: "维护往来单位关联项目并汇总开票、收票、回款和付款利润",
  },
  {
    key: "enterprise_issued_invoices",
    name: "开票管理",
    group: "企业经营管理",
    path: "/app/admin/enterprise-issued-invoices",
    description: "维护往来单位关联项目开票记录",
  },
  {
    key: "enterprise_received_invoices",
    name: "收票管理",
    group: "企业经营管理",
    path: "/app/admin/enterprise-received-invoices",
    description: "维护往来单位关联项目成本收票记录",
  },
  {
    key: "enterprise_collections",
    name: "回款管理",
    group: "企业经营管理",
    path: "/app/admin/enterprise-collections",
    description: "维护往来单位关联项目回款记录",
  },
  {
    key: "enterprise_payments",
    name: "付款管理",
    group: "企业经营管理",
    path: "/app/admin/enterprise-payments",
    description: "维护往来单位关联项目付款记录",
  },
  {
    key: "contract_templates",
    name: "合同模板管理",
    group: "项目管理",
    path: "/app/admin/contract-templates",
    description: "维护工人合同模板和项目默认模板",
  },
  {
    key: "work_hour_configs",
    name: "工时配置",
    group: "项目管理",
    path: "/app/admin/work-hour-configs",
    description: "配置项目标准工时、加班和考勤容差规则",
  },
  {
    key: "platform_integrations",
    name: "平台对接管理",
    group: "项目管理",
    path: "/app/admin/platform-integrations",
    description: "维护平台配置和平台推送日志",
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
  const adminDefaults: MenuPermissionKey[] = [
    "admin_overview",
    "projects",
    "enterprise_customers",
    "enterprise_own_entities",
    "enterprise_projects",
    "enterprise_issued_invoices",
    "enterprise_received_invoices",
    "enterprise_collections",
    "enterprise_payments",
    "contract_templates",
    "work_hour_configs",
    "platform_integrations",
    "attendance_devices",
    "attendance_device_issue_reports",
    "users",
    "roles",
    "uploads",
  ];
  const configuredRole = roleConfigs.find((item) => item.code === role);
  if (configuredRole) {
    const configuredKeys = configuredRole.menu_keys.filter(isMenuPermissionKey);
    if (role === "admin") {
      return Array.from(new Set([...adminDefaults, ...configuredKeys]));
    }
    return configuredKeys;
  }

  if (role === "admin") {
    return adminDefaults;
  }

  return ["projects"];
}

function isMenuPermissionKey(key: string): key is MenuPermissionKey {
  return menuPermissions.some((menu) => menu.key === key);
}
