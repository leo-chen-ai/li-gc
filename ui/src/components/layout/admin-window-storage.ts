export const ADMIN_WINDOW_STORAGE_KEY = "shanhuai_admin_windows";
export const ADMIN_WINDOW_FALLBACK_PATH = "/app/admin/projects";
export const ADMIN_WINDOW_STORAGE_EVENT = "shanhuai:admin-windows-changed";

export type AdminWindow = {
  path: string;
  title: string;
};

export type AdminWindowState = {
  windows: AdminWindow[];
  activePath: string | null;
};

export function normalizeAdminPath(pathname: string) {
  const hashIndex = pathname.indexOf("#");
  const hash = hashIndex >= 0 ? pathname.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? pathname.slice(0, hashIndex) : pathname;
  const queryIndex = withoutHash.indexOf("?");
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  if (path !== "/app/admin" && path.endsWith("/")) {
    return `${path.slice(0, -1)}${query}${hash}`;
  }
  return `${path}${query}${hash}`;
}

export function getAdminWindowPathname(pathname: string) {
  return normalizeAdminPath(pathname).split(/[?#]/)[0] || ADMIN_WINDOW_FALLBACK_PATH;
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

export function updateAdminWindowTitle(path: string, title: string) {
  if (typeof window === "undefined" || !title.trim()) return;

  const normalizedPath = normalizeAdminPath(path);
  const pathname = getAdminWindowPathname(normalizedPath);
  const state = readAdminWindowState();
  const currentWindow = { path: normalizedPath, title: title.trim() };
  const exists = state.windows.some(
    (item) => getAdminWindowPathname(item.path) === pathname
  );
  const windows = exists
    ? state.windows.map((item) =>
        getAdminWindowPathname(item.path) === pathname ? currentWindow : item
      )
    : [...state.windows, currentWindow];

  writeAdminWindowState({ windows, activePath: state.activePath });
  window.dispatchEvent(new Event(ADMIN_WINDOW_STORAGE_EVENT));
}

export function clearAdminWindowState() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ADMIN_WINDOW_STORAGE_KEY);
}

export function readStoredAdminActivePath() {
  const activePath = readAdminWindowState().activePath;
  return activePath?.startsWith("/app/admin") ? activePath : ADMIN_WINDOW_FALLBACK_PATH;
}
