import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { CommandMenu, CommandMenuTrigger } from "@/components/layout/CommandMenu";
import { useAuthUser } from "@/stores/use-auth-store";
import { HeaderUserMenu } from "@/components/layout/HeaderUserMenu";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/app/")({
    component: UserDashboard,
});

function UserDashboard() {
    const user = useAuthUser();
    const navigate = useNavigate();
    const [commandOpen, setCommandOpen] = useState(false);

    if (user?.role === "admin") {
        navigate({ to: "/app/admin/projects", replace: true });
        return null;
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Top Navbar */}
            <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <Link to="/app" className="flex items-center gap-2">
                        <img src="/favicon.svg" alt="山淮建设管理平台" className="aspect-square size-8" />
                        <span className="font-semibold hidden sm:inline-block">山淮建设管理平台</span>
                    </Link>
                </div>

                <div className="flex items-center gap-3">
                    <CommandMenuTrigger onClick={() => setCommandOpen(true)} />
                    <CommandMenu open={commandOpen} setOpen={setCommandOpen} />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="relative">
                                <Bell className="h-5 w-5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-80">
                            <DropdownMenuLabel>
                                <span>通知</span>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <div className="py-4 text-center text-sm text-muted-foreground">
                                暂无新通知
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <HeaderUserMenu />
                </div>
            </header>

            {/* Page Content */}
            <main className="flex-1 p-6 sm:p-10 max-w-7xl mx-auto w-full space-y-8">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">工作台</h2>
                    <p className="text-muted-foreground mt-2 text-lg">
                        欢迎回来，{user?.name || user?.username || "用户"}。
                    </p>
                </div>

                <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center shadow-sm flex flex-col items-center justify-center min-h-[400px]">
                    <h3 className="text-xl font-semibold tracking-tight text-foreground/80">功能正在完善中</h3>
                    <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                        后续会逐步补齐普通用户工作台能力。
                    </p>
                </div>
            </main>
        </div>
    );
}
