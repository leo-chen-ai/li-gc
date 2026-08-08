export type MenuPermissionKey =
  | "admin_overview"
  | "projects"
  | "data_reporting"
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
  | "attendance_alerts"
  | "managed_attendance"
  | "supplemental_attendance"
  | "environment_monitoring"
  | "video_monitoring"
  | "quality_safety"
  | "safety_management"
  | "material_management"
  | "construction_site"
  | "party_building"
  | "emergency_management"
  | "personnel_workers"
  | "personnel_contracts"
  | "personnel_qualifications"
  | "personnel_registrations"
  | "personnel_bad_records"
  | "personnel_approvers"
  | "registration_leads"
  | "users"
  | "roles"
  | "uploads";

export interface MenuPermission {
  key: MenuPermissionKey;
  name: string;
  group: "工作台" | "数据报送" | "劳务管理" | "施工管理" | "人员管理" | "企业经营管理" | "系统";
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
    name: "项目列表",
    group: "劳务管理",
    path: "/app/admin/projects",
    description: "查看项目台账、单位、班组、人员和考勤",
  },
  {
    key: "data_reporting",
    name: "数据报送中心",
    group: "数据报送",
    path: "/app/admin/data-reporting",
    description: "配置新中源下载、转换和浙江政务网上报任务，查看测试与运行数据",
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
    name: "劳务分包合同模板",
    group: "劳务管理",
    path: "/app/admin/contract-templates",
    description: "维护工人合同模板和项目默认模板",
  },
  {
    key: "work_hour_configs",
    name: "工时配置",
    group: "劳务管理",
    path: "/app/admin/work-hour-configs",
    description: "配置项目标准工时、加班和考勤容差规则",
  },
  {
    key: "platform_integrations",
    name: "平台对接管理",
    group: "劳务管理",
    path: "/app/admin/platform-integrations",
    description: "维护平台配置和平台推送日志",
  },
  {
    key: "attendance_devices",
    name: "考勤机绑定",
    group: "劳务管理",
    path: "/app/admin/attendance-devices",
    description: "维护项目考勤机绑定、进出方向和设备备注",
  },
  {
    key: "attendance_device_issue_reports",
    name: "考勤机人员下发报告",
    group: "劳务管理",
    path: "/app/admin/attendance-device-issue-reports",
    description: "查看人员下发到考勤机的动作、时间和状态",
  },
  {
    key: "attendance_alerts",
    name: "考勤预警",
    group: "劳务管理",
    path: "/app/admin/attendance-alerts",
    description: "配置项目管理人员、民工和监理未考勤提醒并查看日志",
  },
  {
    key: "managed_attendance",
    name: "考勤托管（配置）",
    group: "劳务管理",
    path: "/app/admin/managed-attendance",
    description: "维护托管配置、照片组和月度托管数据",
  },
  {
    key: "supplemental_attendance",
    name: "考勤托管",
    group: "劳务管理",
    path: "/app/admin/supplemental-attendance",
    description: "查看托管考勤从生成、发送到考勤机回执的全链路状态",
  },
  {
    key: "environment_monitoring",
    name: "环境检测",
    group: "劳务管理",
    path: "/app/admin/environment-monitoring",
    description: "查看温湿度、风向、风速、PM 等环境检测数据",
  },
  {
    key: "video_monitoring",
    name: "视频监控",
    group: "劳务管理",
    path: "/app/admin/video-monitoring",
    description: "查看施工现场视频监控点位",
  },
  {
    key: "quality_safety",
    name: "质安管理",
    group: "施工管理",
    path: "/app/admin/quality-safety",
    description: "质安巡检和整改闭环",
  },
  {
    key: "safety_management",
    name: "安全管理",
    group: "施工管理",
    path: "/app/admin/safety-management",
    description: "安全教育、隐患和风险管理",
  },
  {
    key: "material_management",
    name: "材料管理",
    group: "施工管理",
    path: "/app/admin/material-management",
    description: "材料进退场和库存管理",
  },
  {
    key: "construction_site",
    name: "施工现场",
    group: "施工管理",
    path: "/app/admin/construction-site",
    description: "施工现场形象进度和现场事件",
  },
  {
    key: "party_building",
    name: "智慧党建",
    group: "施工管理",
    path: "/app/admin/party-building",
    description: "党建活动和党员信息",
  },
  {
    key: "emergency_management",
    name: "应急管理",
    group: "施工管理",
    path: "/app/admin/emergency-management",
    description: "应急预案、演练和事件处置",
  },
  {
    key: "personnel_workers",
    name: "人员信息列表",
    group: "人员管理",
    path: "/app/admin/personnel-workers",
    description: "汇总现有项目人员数据",
  },
  {
    key: "personnel_contracts",
    name: "人员合同信息",
    group: "人员管理",
    path: "/app/admin/personnel-contracts",
    description: "查看人员合同信息",
  },
  {
    key: "personnel_qualifications",
    name: "人员资格信息",
    group: "人员管理",
    path: "/app/admin/personnel-qualifications",
    description: "查看人员资格证书信息",
  },
  {
    key: "personnel_registrations",
    name: "人员注册信息",
    group: "人员管理",
    path: "/app/admin/personnel-registrations",
    description: "查看人员注册信息",
  },
  {
    key: "personnel_bad_records",
    name: "人员不良信息",
    group: "人员管理",
    path: "/app/admin/personnel-bad-records",
    description: "查看人员不良信息",
  },
  {
    key: "personnel_approvers",
    name: "审批人员设置",
    group: "人员管理",
    path: "/app/admin/personnel-approvers",
    description: "维护审批人员配置",
  },
  {
    key: "registration_leads",
    name: "注册列表",
    group: "系统",
    path: "/app/admin/registration-leads",
    description: "查看登录页提交的注册姓名和手机号",
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
    "data_reporting",
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
    "attendance_alerts",
    "managed_attendance",
    "supplemental_attendance",
    "environment_monitoring",
    "video_monitoring",
    "quality_safety",
    "safety_management",
    "material_management",
    "construction_site",
    "party_building",
    "emergency_management",
    "personnel_workers",
    "personnel_contracts",
    "personnel_qualifications",
    "personnel_registrations",
    "personnel_bad_records",
    "personnel_approvers",
    "registration_leads",
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

  return [
    "projects",
    "attendance_devices",
    "attendance_device_issue_reports",
    "personnel_workers",
  ];
}

export function getDefaultAdminPath(menuKeys: Iterable<MenuPermissionKey>): string {
  const allowedMenus = new Set(menuKeys);
  return (
    menuPermissions.find((menu) => allowedMenus.has(menu.key))?.path ?? "/app/admin"
  );
}

function isMenuPermissionKey(key: string): key is MenuPermissionKey {
  return menuPermissions.some((menu) => menu.key === key);
}
