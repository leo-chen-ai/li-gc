import { Link, useLocation } from "@tanstack/react-router";
import {
  PanelLeft,
  Users,
  ShieldCheck,
  Building2,
  Fingerprint,
  Files,
  FileClock,
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
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  getMenuKeysForUserRole,
  type MenuPermissionKey,
} from "@/features/admin/data/rbac";
import { useRolesList } from "@/features/admin/hooks/use-roles";
import { useAuthUser } from "@/stores/use-auth-store";

export function AppSidebar() {
  const user = useAuthUser();
  const isAdmin = user?.role === "admin";
  const location = useLocation();
  const { data: roles = [] } = useRolesList(isAdmin);
  const allowedMenus = new Set(getMenuKeysForUserRole(user?.role, roles));

  const workspaceItems: Array<{
    key: MenuPermissionKey;
    title: string;
    href: "/app/admin/projects";
    icon: LucideIcon;
    enabled: boolean;
  }> = [
    {
      key: "projects",
      title: "项目管理",
      href: "/app/admin/projects",
      icon: Building2,
      enabled: isAdmin,
    },
  ];

  const attendanceDeviceItems: Array<{
    key: MenuPermissionKey;
    title: string;
    href: "/app/admin/attendance-devices" | "/app/admin/attendance-device-issue-reports";
    icon: LucideIcon;
    enabled: boolean;
  }> = [
    {
      key: "attendance_devices",
      title: "考勤机绑定",
      href: "/app/admin/attendance-devices",
      icon: Fingerprint,
      enabled: isAdmin,
    },
    {
      key: "attendance_device_issue_reports",
      title: "考勤机人员下发报告",
      href: "/app/admin/attendance-device-issue-reports",
      icon: FileClock,
      enabled: isAdmin,
    },
  ];

  const systemItems: Array<{
    key: MenuPermissionKey;
    title: string;
    href: "/app/admin/users" | "/app/admin/roles" | "/app/admin/uploads";
    icon: LucideIcon;
  }> = [
    { key: "users", title: "用户管理", href: "/app/admin/users", icon: Users },
    { key: "roles", title: "角色管理", href: "/app/admin/roles", icon: ShieldCheck },
    { key: "uploads", title: "文件管理", href: "/app/admin/uploads", icon: Files },
  ];

  const isActive = (href: string) => {
    return location.pathname.startsWith(href);
  };

  return (
    <Sidebar collapsible="icon" className="border-r bg-sidebar/95">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between">
              <SidebarMenuButton size="lg" asChild>
                <Link to={isAdmin ? "/app/admin/projects" : "/app"}>
                  <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-[#0f6b5d] text-sm font-semibold text-white">
                    山
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">山淮建设管理平台</span>
                    <span className="truncate text-xs text-muted-foreground">{isAdmin ? "管理后台" : "工作台"}</span>
                  </div>
                </Link>
              </SidebarMenuButton>
              <SidebarTrigger className="ml-1 h-8 w-8 hidden md:flex">
                <PanelLeft className="h-4 w-4" />
              </SidebarTrigger>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>工作台</SidebarGroupLabel>
          <SidebarMenu>
            {workspaceItems
              .filter((item) => item.enabled && allowedMenus.has(item.key))
              .map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                    <Link to={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </SidebarGroup>

        {attendanceDeviceItems.some((item) => item.enabled && allowedMenus.has(item.key)) && (
          <SidebarGroup>
            <SidebarGroupLabel>考勤机管理</SidebarGroupLabel>
            <SidebarMenu>
              {attendanceDeviceItems
                .filter((item) => item.enabled && allowedMenus.has(item.key))
                .map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                      <Link to={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>系统</SidebarGroupLabel>
            <SidebarMenu>
              {systemItems
                .filter((item) => allowedMenus.has(item.key))
                .map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                      <Link to={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
