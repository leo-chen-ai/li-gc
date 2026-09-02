import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, Menu, Search } from "lucide-react";
import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AdminWindowTabs } from "@/components/layout/AdminWindowTabs";
import { useAuthUser } from "@/stores/use-auth-store";
import {
  canAccessSystemWarnings,
  getDefaultAdminPath,
  getMenuPermissionForPath,
  getMenuKeysForUserRole,
  isAdminWorkspacePath,
  resolveEffectiveRoleCode,
  shouldLoadRolePermissions,
} from "@/features/admin/data/rbac";
import { useCurrentRolePermissions } from "@/features/admin/hooks/use-roles";
import { HeaderUserMenu } from "@/components/layout/HeaderUserMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

// 通知中心尚未接入真实数据，暂时隐藏入口；接入后改为 true 即可恢复。
const SHOW_NOTIFICATIONS = false;

// Mock notifications
const notifications = [
  { id: 1, title: "考勤待补图", description: "淮安高铁商务区综合体项目有 1 条记录待补图", time: "2 分钟前", unread: true },
  { id: 2, title: "班组信息待完善", description: "安装综合班缺少班组长证件信息", time: "1 小时前", unread: true },
  { id: 3, title: "数据库备份完成", description: "本地开发库备份任务已完成", time: "3 小时前", unread: false },
];

export const Route = createFileRoute("/app/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return <AdminContent />;
}

function AdminContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthUser();
  const isRoleScopedUser = shouldLoadRolePermissions(user?.role);
  const {
    data: currentRolePermissions,
    isLoading: arePermissionsLoading,
    isError: isPermissionsError,
  } = useCurrentRolePermissions(user?.role, isRoleScopedUser);
  const effectiveRole = resolveEffectiveRoleCode(user?.role, currentRolePermissions?.code);
  const allowedMenus = new Set(
    isRoleScopedUser && !currentRolePermissions
      ? []
      : getMenuKeysForUserRole(
          effectiveRole,
          currentRolePermissions ? [currentRolePermissions] : []
        )
  );
  const canUseSystemWarnings = canAccessSystemWarnings(effectiveRole);
  if (canUseSystemWarnings) {
    allowedMenus.add("admin_overview");
    allowedMenus.add("system_warnings");
  }
  const unreadCount = notifications.filter((n) => n.unread).length;
  const currentScopedPage = getMenuPermissionForPath(location.pathname);
  const canUseScopedPage = Boolean(
    currentScopedPage && allowedMenus.has(currentScopedPage.key)
  );
  const isUniversalPage = canUseSystemWarnings && (
    location.pathname === "/app/admin" ||
    location.pathname === "/app/admin/" ||
    location.pathname === "/app/admin/warnings" ||
    location.pathname.startsWith("/app/admin/warnings/"));
  const defaultAdminPath = getDefaultAdminPath(allowedMenus);

  // Note: Authenticated guard is handled by app.tsx 

  // Redirect standard users to their workspace
  if (isRoleScopedUser && arePermissionsLoading && !isUniversalPage) {
    return null;
  }

  if (isRoleScopedUser && isPermissionsError && !isUniversalPage) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
        无法读取当前角色权限，请刷新页面后重试。
      </div>
    );
  }

  if (
    user?.role !== "admin" &&
    isAdminWorkspacePath(location.pathname) &&
    !canUseScopedPage
  ) {
    if (defaultAdminPath !== "/app/admin") {
      navigate({ to: defaultAdminPath });
      return null;
    }

    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
        当前角色尚未配置可访问的菜单，请联系管理员。
      </div>
    );
  }

  return (
    <SidebarProvider
      style={{
        "--sidebar-width": "11rem",
      } as CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-x-hidden">
        {/* Top Header */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-14">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1 md:hidden">
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
            <div>
              <div className="text-sm font-medium leading-none">山淮筑</div>
              <div className="mt-1 hidden text-xs text-muted-foreground sm:block">项目、班组、工人、考勤统一管理</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden w-[300px] lg:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 pl-9" placeholder="搜索项目、班组、工人" />
            </div>

            {/* 通知中心暂时隐藏，保留实现方便后续接入真实数据。 */}
            {SHOW_NOTIFICATIONS ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-background" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>通知提醒</span>
                    {unreadCount > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {unreadCount} 条
                      </Badge>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      暂无通知
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <DropdownMenuItem
                        key={notification.id}
                        className="flex flex-col items-start gap-1 p-3 cursor-pointer"
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="text-sm font-medium">{notification.title}</span>
                          {notification.unread && (
                            <span className="h-2 w-2 rounded-full bg-primary" />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {notification.description}
                        </span>
                        <span className="text-xs text-muted-foreground">{notification.time}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="justify-center text-sm text-muted-foreground cursor-pointer">
                    查看全部通知
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {/* User Profile & Theme Menu */}
            <HeaderUserMenu />
          </div>
        </header>
        <AdminWindowTabs fallbackPath={defaultAdminPath} />

        {/* Page Content */}
        <main className="admin-surface min-w-0 flex-1 overflow-x-hidden bg-muted/20 p-3 md:p-4">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
