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
  getDefaultAdminPath,
  getMenuKeysForUserRole,
  type MenuPermissionKey,
} from "@/features/admin/data/rbac";
import { useCurrentRolePermissions } from "@/features/admin/hooks/use-roles";
import { useAuthUser } from "@/stores/use-auth-store";

type SidebarItem = {
  key: MenuPermissionKey;
  title: string;
  href: string;
  icon: LucideIcon;
  enabled?: boolean;
};

type SidebarSection = {
  title: string;
  items: SidebarItem[];
};

export function AppSidebar() {
  const user = useAuthUser();
  const isAdmin = user?.role === "admin";
  const shouldLoadCustomRole = Boolean(user?.role && user.role !== "admin" && user.role !== "user");
  const location = useLocation();
  const { data: currentRolePermissions } = useCurrentRolePermissions(
    user?.role,
    shouldLoadCustomRole
  );
  const roleConfigs = currentRolePermissions ? [currentRolePermissions] : [];
  const allowedMenus = new Set(
    shouldLoadCustomRole && !currentRolePermissions
      ? []
      : getMenuKeysForUserRole(user?.role, roleConfigs)
  );

  const sections: SidebarSection[] = [
    {
      title: "工作台",
      items: [
        { key: "admin_overview", title: "首页总览", href: "/app/admin", icon: BarChart3, enabled: isAdmin },
      ],
    },
    {
      title: "数据报送",
      items: [
        { key: "data_reporting", title: "数据报送中心", href: "/app/admin/data-reporting", icon: Send, enabled: true },
      ],
    },
    {
      title: "劳务管理",
      items: [
        { key: "projects", title: "项目列表", href: "/app/admin/projects", icon: Building2, enabled: true },
        { key: "contract_templates", title: "劳务分包合同模板", href: "/app/admin/contract-templates", icon: FileText, enabled: isAdmin },
        { key: "work_hour_configs", title: "工时配置", href: "/app/admin/work-hour-configs", icon: Clock3, enabled: isAdmin },
        { key: "platform_integrations", title: "平台对接管理", href: "/app/admin/platform-integrations", icon: Link2, enabled: isAdmin },
        { key: "attendance_devices", title: "考勤机绑定", href: "/app/admin/attendance-devices", icon: Fingerprint, enabled: true },
        { key: "attendance_device_issue_reports", title: "考勤机人员下发报告", href: "/app/admin/attendance-device-issue-reports", icon: FileClock, enabled: true },
        { key: "attendance_alerts", title: "考勤预警", href: "/app/admin/attendance-alerts", icon: ShieldAlert, enabled: isAdmin },
        { key: "supplemental_attendance", title: "考勤托管", href: "/app/admin/supplemental-attendance", icon: CalendarClock, enabled: true },
        { key: "environment_monitoring", title: "环境检测", href: "/app/admin/environment-monitoring", icon: Leaf, enabled: isAdmin },
        { key: "video_monitoring", title: "视频监控", href: "/app/admin/video-monitoring", icon: Camera, enabled: isAdmin },
      ],
    },
    {
      title: "施工管理",
      items: [
        { key: "quality_safety", title: "质安管理", href: "/app/admin/quality-safety", icon: ClipboardCheck, enabled: isAdmin },
        { key: "safety_management", title: "安全管理", href: "/app/admin/safety-management", icon: ShieldAlert, enabled: isAdmin },
        { key: "material_management", title: "材料管理", href: "/app/admin/material-management", icon: Package, enabled: isAdmin },
        { key: "construction_site", title: "施工现场", href: "/app/admin/construction-site", icon: HardHat, enabled: isAdmin },
        { key: "party_building", title: "智慧党建", href: "/app/admin/party-building", icon: Landmark, enabled: isAdmin },
        { key: "emergency_management", title: "应急管理", href: "/app/admin/emergency-management", icon: Siren, enabled: isAdmin },
      ],
    },
    {
      title: "人员管理",
      items: [
        { key: "personnel_workers", title: "人员信息列表", href: "/app/admin/personnel-workers", icon: Users, enabled: true },
        { key: "personnel_contracts", title: "人员合同信息", href: "/app/admin/personnel-contracts", icon: FileText, enabled: isAdmin },
        { key: "personnel_qualifications", title: "人员资格信息", href: "/app/admin/personnel-qualifications", icon: ShieldCheck, enabled: isAdmin },
        { key: "personnel_registrations", title: "人员注册信息", href: "/app/admin/personnel-registrations", icon: ClipboardCheck, enabled: isAdmin },
        { key: "personnel_bad_records", title: "人员不良信息", href: "/app/admin/personnel-bad-records", icon: AlertCircle, enabled: isAdmin },
        { key: "personnel_approvers", title: "审批人员设置", href: "/app/admin/personnel-approvers", icon: UserCog, enabled: isAdmin },
      ],
    },
    {
      title: "企业经营管理",
      items: [
        { key: "enterprise_customers", title: "往来单位管理", href: "/app/admin/enterprise-customers", icon: Users, enabled: isAdmin },
        { key: "enterprise_own_entities", title: "我方主体管理", href: "/app/admin/enterprise-own-entities", icon: Building2, enabled: isAdmin },
        { key: "enterprise_projects", title: "往来单位关联项目管理", href: "/app/admin/enterprise-projects", icon: BriefcaseBusiness, enabled: isAdmin },
        { key: "enterprise_issued_invoices", title: "开票管理", href: "/app/admin/enterprise-issued-invoices", icon: ReceiptText, enabled: isAdmin },
        { key: "enterprise_received_invoices", title: "收票管理", href: "/app/admin/enterprise-received-invoices", icon: FileInput, enabled: isAdmin },
        { key: "enterprise_collections", title: "回款管理", href: "/app/admin/enterprise-collections", icon: WalletMinimal, enabled: isAdmin },
        { key: "enterprise_payments", title: "付款管理", href: "/app/admin/enterprise-payments", icon: WalletCards, enabled: isAdmin },
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
      items: section.items.filter((item) => (item.enabled ?? isAdmin) && allowedMenus.has(item.key)),
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
