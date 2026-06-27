export const ADMIN_WINDOW_STORAGE_KEY = "shanhuai_admin_windows";
export const ADMIN_WINDOW_FALLBACK_PATH = "/app/admin/projects";

export type AdminWindow = {
  path: string;
  title: string;
};

export type AdminWindowState = {
  windows: AdminWindow[];
  activePath: string | null;
};

export function normalizeAdminPath(pathname: string) {
  if (pathname !== "/app/admin" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function readAdminWindowState(): AdminWindowState {
  if (typeof window === "undefined") return { windows: [], activePath: null };

  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_WINDOW_STORAGE_KEY) || "[]");
    const rawWindows = Array.isArray(parsed) ? parsed : parsed?.windows;
    const activePath =
      typeof parsed?.activePath === "string" && parsed.activePath.startsWith("/app/admin")
        ? normalizeAdminPath(parsed.activePath)
        : null;

    if (!Array.isArray(rawWindows)) return { windows: [], activePath };

    const windows = rawWindows
      .filter((item): item is AdminWindow => (
        typeof item?.path === "string" &&
        item.path.startsWith("/app/admin") &&
        typeof item?.title === "string"
      ))
      .map((item) => ({
        path: normalizeAdminPath(item.path),
        title: item.title,
      }));

    return { windows, activePath };
  } catch {
    return { windows: [], activePath: null };
  }
}

export function writeAdminWindowState(state: AdminWindowState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ADMIN_WINDOW_STORAGE_KEY, JSON.stringify(state));
}

export function readStoredAdminActivePath() {
  const activePath = readAdminWindowState().activePath;
  return activePath?.startsWith("/app/admin") ? activePath : ADMIN_WINDOW_FALLBACK_PATH;
}
