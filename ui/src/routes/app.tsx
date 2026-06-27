import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { AuthProvider } from "@/providers/AuthProvider";
import { useIsAuthenticated, useAuthUser } from "@/stores/use-auth-store";
import { readStoredAdminActivePath } from "@/components/layout/admin-window-storage";
import { useEffect } from "react";

export const Route = createFileRoute("/app")({
    component: AppLayout,
});

function AppLayout() {
    return (
        <AuthProvider>
            <RequireAuth>
                <Outlet />
            </RequireAuth>
        </AuthProvider>
    );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
    const isAuth = useIsAuthenticated();
    const user = useAuthUser();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const isPublicRoute = location.pathname.startsWith("/app/login") || location.pathname.startsWith("/app/register");

        // 1. Unauthenticated users should be redirected to login
        if (!isAuth && !isPublicRoute) {
            navigate({ to: "/app/login", replace: true });
            return;
        }

        // 2. Authenticated users should not access login/register again
        if (isAuth && isPublicRoute) {
            if (user?.role === "admin") {
                navigate({ to: readStoredAdminActivePath(), replace: true });
            } else {
                navigate({ to: "/app", replace: true });
            }
            return;
        }

    }, [isAuth, location.pathname, navigate, user?.role]);

    return <>{children}</>;
}
