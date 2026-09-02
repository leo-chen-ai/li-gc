import { Link, useLocation } from "@tanstack/react-router";
import {
  AlertCircle,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  Camera,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileClock,
  FileInput,
  Files,
  FileText,
  Fingerprint,
  HardHat,
  Landmark,
  Leaf,
  Link2,
  Package,
  ReceiptText,
  Send,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserCog,
  Users,
  WalletCards,
  WalletMinimal,
  type LucideIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  canAccessSystemWarnings,
  getDefaultAdminPath,
  getMenuKeysForUserRole,
  shouldLoadRolePermissions,
  type MenuPermissionKey,
} from "@/features/admin/data/rbac";
import { useCurrentRolePermissions } from "@/features/admin/hooks/use-roles";
import { useAuthUser } from "@/stores/use-auth-store";

type SidebarItem = {
  key: MenuPermissionKey;
  title: string;
  href: string;
  icon: LucideIcon;
};

type SidebarSection = {
  title: string;
  items: SidebarItem[];
};

export function AppSidebar() {
  const user = useAuthUser();
  const shouldLoadAssignedRole = shouldLoadRolePermissions(user?.role);
  const location = useLocation();
  const { data: currentRolePermissions } = useCurrentRolePermissions(
    user?.role,
    shouldLoadAssignedRole
  );
  const roleConfigs = currentRolePermissions ? [currentRolePermissions] : [];
  const allowedMenus = new Set(
    shouldLoadAssignedRole && !currentRolePermissions
      ? []
      : getMenuKeysForUserRole(user?.role, roleConfigs)
  );
  if (canAccessSystemWarnings(user?.role)) {
    allowedMenus.add("admin_overview");
    allowedMenus.add("system_warnings");
  }

  const sections: SidebarSection[] = [
    {
      title: "工作台",
      items: [
        { key: "admin_overview", title: "首页", href: "/app/admin", icon: BarChart3 },
      ],
    },
    {
      title: "数据报送",
      items: [
        { key: "data_reporting", title: "数据报送中心", href: "/app/admin/data-reporting", icon: Send },
      ],
    },
    {
      title: "劳务管理",
      items: [
        { key: "system_warnings", title: "预警管理", href: "/app/admin/warnings", icon: ShieldAlert },
        { key: "projects", title: "项目列表", href: "/app/admin/projects", icon: Building2 },
        { key: "contract_templates", title: "劳务分包合同模板", href: "/app/admin/contract-templates", icon: FileText },
        { key: "work_hour_configs", title: "工时配置", href: "/app/admin/work-hour-configs", icon: Clock3 },
        { key: "platform_integrations", title: "平台对接管理", href: "/app/admin/platform-integrations", icon: Link2 },
        { key: "attendance_devices", title: "考勤机绑定", href: "/app/admin/attendance-devices", icon: Fingerprint },
        { key: "attendance_device_issue_reports", title: "考勤机人员下发报告", href: "/app/admin/attendance-device-issue-reports", icon: FileClock },
        { key: "attendance_alerts", title: "考勤预警", href: "/app/admin/attendance-alerts", icon: AlertCircle },
        { key: "managed_attendance", title: "考勤托管（配置）", href: "/app/admin/managed-attendance", icon: CalendarClock },
        { key: "supplemental_attendance", title: "考勤托管", href: "/app/admin/supplemental-attendance", icon: CalendarClock },
        { key: "environment_monitoring", title: "环境检测", href: "/app/admin/environment-monitoring", icon: Leaf },
        { key: "video_monitoring", title: "视频监控", href: "/app/admin/video-monitoring", icon: Camera },
      ],
    },
    {
      title: "施工管理",
      items: [
        { key: "quality_safety", title: "质安管理", href: "/app/admin/quality-safety", icon: ClipboardCheck },
        { key: "safety_management", title: "安全管理", href: "/app/admin/safety-management", icon: ShieldAlert },
        { key: "material_management", title: "材料管理", href: "/app/admin/material-management", icon: Package },
        { key: "construction_site", title: "施工现场", href: "/app/admin/construction-site", icon: HardHat },
        { key: "party_building", title: "智慧党建", href: "/app/admin/party-building", icon: Landmark },
        { key: "emergency_management", title: "应急管理", href: "/app/admin/emergency-management", icon: Siren },
      ],
    },
    {
      title: "人员管理",
      items: [
        { key: "personnel_workers", title: "人员信息列表", href: "/app/admin/personnel-workers", icon: Users },
        { key: "personnel_contracts", title: "人员合同信息", href: "/app/admin/personnel-contracts", icon: FileText },
        { key: "personnel_qualifications", title: "人员资格信息", href: "/app/admin/personnel-qualifications", icon: ShieldCheck },
        { key: "personnel_registrations", title: "人员注册信息", href: "/app/admin/personnel-registrations", icon: ClipboardCheck },
        { key: "personnel_bad_records", title: "人员不良信息", href: "/app/admin/personnel-bad-records", icon: AlertCircle },
        { key: "personnel_approvers", title: "审批人员设置", href: "/app/admin/personnel-approvers", icon: UserCog },
      ],
    },
    {
      title: "企业经营管理",
      items: [
        { key: "enterprise_customers", title: "往来单位管理", href: "/app/admin/enterprise-customers", icon: Users },
        { key: "enterprise_own_entities", title: "我方主体管理", href: "/app/admin/enterprise-own-entities", icon: Building2 },
        { key: "enterprise_projects", title: "往来单位关联项目管理", href: "/app/admin/enterprise-projects", icon: BriefcaseBusiness },
        { key: "enterprise_issued_invoices", title: "开票管理", href: "/app/admin/enterprise-issued-invoices", icon: ReceiptText },
        { key: "enterprise_received_invoices", title: "收票管理", href: "/app/admin/enterprise-received-invoices", icon: FileInput },
        { key: "enterprise_collections", title: "回款管理", href: "/app/admin/enterprise-collections", icon: WalletMinimal },
        { key: "enterprise_payments", title: "付款管理", href: "/app/admin/enterprise-payments", icon: WalletCards },
      ],
    },
    {
      title: "系统",
      items: [
        { key: "registration_leads", title: "注册列表", href: "/app/admin/registration-leads", icon: ClipboardCheck },
        { key: "users", title: "用户管理", href: "/app/admin/users", icon: Users },
        { key: "roles", title: "角色管理", href: "/app/admin/roles", icon: ShieldCheck },
        { key: "uploads", title: "文件管理", href: "/app/admin/uploads", icon: Files },
      ],
    },
  ];

  const isActive = (href: string) => {
    if (href === "/app/admin") {
      return location.pathname === "/app/admin" || location.pathname === "/app/admin/";
    }
    return location.pathname.startsWith(href);
  };

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => allowedMenus.has(item.key)),
    }))
    .filter((section) => section.items.length > 0);
  const homePath = getDefaultAdminPath(allowedMenus);

  return (
    <Sidebar collapsible="none" className="border-r bg-sidebar/95">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between">
              <SidebarMenuButton size="lg" asChild>
                <Link to={homePath}>
                  <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-[#0f6b5d] text-sm font-semibold text-white">
                    山
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">山淮筑</span>
                    <span className="truncate text-xs text-muted-foreground">工作台</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="max-h-[calc(100svh-4.25rem)] gap-1 overflow-y-auto overscroll-contain pr-1">
        {visibleSections.map((section) => (
          <Collapsible key={section.title}>
            <SidebarGroup className="px-1 py-1.5">
              <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md pr-1 hover:bg-emerald-50 dark:hover:bg-sidebar-accent">
                <SidebarGroupLabel className="h-7 px-2">{section.title}</SidebarGroupLabel>
                <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90 group-data-[collapsible=icon]:hidden" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenu className="gap-1">
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title} className="h-7 px-2 text-xs">
                        <Link to={item.href}>
                          <item.icon className="size-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
