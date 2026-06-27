import { useEffect, useMemo, useReducer, useRef, useState, type MouseEvent, type WheelEvent } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ADMIN_WINDOW_FALLBACK_PATH,
  normalizeAdminPath,
  readAdminWindowState,
  type AdminWindow,
  writeAdminWindowState,
} from "@/components/layout/admin-window-storage";
import { cn } from "@/lib/utils";

const staticTitles: Record<string, string> = {
  "/app/admin": "首页总览",
  "/app/admin/projects": "项目管理",
  "/app/admin/contract-templates": "合同模板管理",
  "/app/admin/work-hour-configs": "工时配置",
  "/app/admin/platform-integrations": "平台对接管理",
  "/app/admin/enterprise-customers": "往来单位管理",
  "/app/admin/enterprise-own-entities": "我方主体管理",
  "/app/admin/enterprise-projects": "往来单位关联项目",
  "/app/admin/enterprise-issued-invoices": "开票管理",
  "/app/admin/enterprise-received-invoices": "收票管理",
  "/app/admin/enterprise-collections": "回款管理",
  "/app/admin/enterprise-payments": "付款管理",
  "/app/admin/attendance-devices": "考勤机绑定",
  "/app/admin/attendance-device-issue-reports": "考勤机下发报告",
  "/app/admin/users": "用户管理",
  "/app/admin/roles": "角色管理",
  "/app/admin/uploads": "文件管理",
};

function getWindowTitle(path: string) {
  const normalized = normalizeAdminPath(path);
  if (staticTitles[normalized]) return staticTitles[normalized];

  const projectMatch = normalized.match(/^\/app\/admin\/projects\/([^/]+)$/);
  if (projectMatch?.[1]) {
    return `项目详情 ${decodeURIComponent(projectMatch[1])}`;
  }

  const customerMatch = normalized.match(/^\/app\/admin\/enterprise-customers\/([^/]+)$/);
  if (customerMatch?.[1]) {
    return `往来单位详情 ${decodeURIComponent(customerMatch[1])}`;
  }

  const enterpriseProjectMatch = normalized.match(/^\/app\/admin\/enterprise-projects\/([^/]+)$/);
  if (enterpriseProjectMatch?.[1]) {
    return `关联项目详情 ${decodeURIComponent(enterpriseProjectMatch[1])}`;
  }

  return "管理页面";
}

function readStoredWindowsSnapshot(path: string, version: number) {
  void path;
  void version;
  return readAdminWindowState().windows.map((item) => ({
    path: normalizeAdminPath(item.path),
    title: item.title || getWindowTitle(item.path),
  }));
}

function mergeCurrentWindow(windows: AdminWindow[], currentPath: string) {
  if (!currentPath.startsWith("/app/admin")) return windows;

  const nextWindow = { path: currentPath, title: getWindowTitle(currentPath) };
  const exists = windows.some((item) => item.path === currentPath);
  return exists
    ? windows.map((item) => (item.path === currentPath ? nextWindow : item))
    : [...windows, nextWindow];
}

export function AdminWindowTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = useMemo(() => normalizeAdminPath(location.pathname), [location.pathname]);
  const [storageVersion, refreshStorage] = useReducer((value: number) => value + 1, 0);
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const storedWindows = useMemo(
    () => readStoredWindowsSnapshot(currentPath, storageVersion),
    [currentPath, storageVersion]
  );
  const visibleWindows = useMemo(
    () => mergeCurrentWindow(storedWindows, currentPath),
    [currentPath, storedWindows]
  );

  useEffect(() => {
    writeAdminWindowState({ windows: visibleWindows, activePath: currentPath });
  }, [currentPath, visibleWindows]);

  useEffect(() => {
    tabRefs.current[currentPath]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentPath, visibleWindows]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  const openWindow = (path: string) => {
    if (path === currentPath) return;
    writeAdminWindowState({ windows: visibleWindows, activePath: path });
    void navigate({ to: path });
  };

  const closeWindow = (path: string) => {
    setContextMenu(null);
    const currentIndex = visibleWindows.findIndex((item) => item.path === path);
    const next = visibleWindows.filter((item) => item.path !== path);

    if (path === currentPath) {
      const target = next[currentIndex - 1] ?? next[currentIndex] ?? { path: ADMIN_WINDOW_FALLBACK_PATH };
      writeAdminWindowState({ windows: next, activePath: target.path });
      void navigate({ to: target.path });
      return;
    }

    writeAdminWindowState({ windows: next, activePath: currentPath });
    refreshStorage();
  };

  const closeOtherWindows = (path: string) => {
    setContextMenu(null);
    const target = visibleWindows.find((item) => item.path === path);
    const next = target ? [target] : [];
    writeAdminWindowState({ windows: next, activePath: path });

    if (path !== currentPath) {
      void navigate({ to: path });
      return;
    }

    refreshStorage();
  };

  const closeAllWindows = () => {
    setContextMenu(null);
    writeAdminWindowState({ windows: [], activePath: ADMIN_WINDOW_FALLBACK_PATH });

    if (currentPath !== ADMIN_WINDOW_FALLBACK_PATH) {
      void navigate({ to: ADMIN_WINDOW_FALLBACK_PATH });
      return;
    }

    refreshStorage();
  };

  const scrollTabs = (event: WheelEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollWidth <= target.clientWidth) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;

    const maxScrollLeft = target.scrollWidth - target.clientWidth;
    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, target.scrollLeft + delta));
    if (nextScrollLeft === target.scrollLeft) return;

    event.preventDefault();
    target.scrollLeft = nextScrollLeft;
  };

  const openContextMenu = (event: MouseEvent, path: string) => {
    event.preventDefault();
    setContextMenu({
      path,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 168)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 132)),
    });
  };

  const contextWindow = contextMenu
    ? visibleWindows.find((item) => item.path === contextMenu.path)
    : null;

  return (
    <div className="flex min-h-10 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b bg-[#f8faf9] px-3 dark:bg-muted/30 md:px-4">
      <div
        className="admin-window-tabs-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1.5"
        onWheel={scrollTabs}
      >
        {visibleWindows.map((item) => {
          const active = item.path === currentPath;

          return (
            <div
              key={item.path}
              ref={(node) => {
                tabRefs.current[item.path] = node;
              }}
              onContextMenu={(event) => openContextMenu(event, item.path)}
              className={cn(
                "group flex h-7 max-w-48 shrink-0 items-center overflow-hidden rounded-md border text-xs shadow-sm transition-colors",
                active
                  ? "border-[#0f6b5d] bg-white text-[#0f6b5d] dark:border-primary dark:bg-background dark:text-primary"
                  : "border-slate-200 bg-white/70 text-slate-600 hover:bg-white hover:text-[#0f6b5d] dark:border-border dark:bg-background/50 dark:text-muted-foreground dark:hover:bg-background dark:hover:text-primary"
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-2 text-left"
                onClick={() => openWindow(item.path)}
                title={item.title}
              >
                {item.title}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={cn(
                  "mr-0.5 size-5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-muted",
                  active && "text-[#0f6b5d] dark:text-primary"
                )}
                onClick={() => closeWindow(item.path)}
                aria-label={`关闭${item.title}`}
              >
                <X className="size-3" />
              </Button>
            </div>
          );
        })}
      </div>
      {contextMenu && contextWindow ? (
        <div
          role="menu"
          className="fixed z-50 w-40 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => closeWindow(contextWindow.path)}
          >
            关闭当前
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left outline-none hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={visibleWindows.length <= 1}
            onClick={() => closeOtherWindows(contextWindow.path)}
          >
            关闭其他
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-destructive outline-none hover:bg-destructive/10"
            onClick={closeAllWindows}
          >
            关闭全部
          </button>
        </div>
      ) : null}
    </div>
  );
}
