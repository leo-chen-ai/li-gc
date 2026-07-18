import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { readStoredAdminActivePath } from "@/components/layout/admin-window-storage";
import { useAuthUser } from "@/stores/use-auth-store";

export const Route = createFileRoute("/app/")({
    component: UserDashboard,
});

function UserDashboard() {
    const user = useAuthUser();
    const navigate = useNavigate();

    useEffect(() => {
        if (!user) return;
        navigate({
            to: user.role === "admin" ? readStoredAdminActivePath() : "/app/admin/projects",
            replace: true,
        });
    }, [navigate, user]);

    return null;
}
