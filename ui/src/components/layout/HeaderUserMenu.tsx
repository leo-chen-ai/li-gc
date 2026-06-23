import { useAuthUser } from "@/stores/use-auth-store";
import { useLogout } from "@/features/auth/hooks/use-logout";
import { useTheme } from "next-themes";
import { useNavigate } from "@tanstack/react-router";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuPortal,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getAvatarUrl } from "@/lib/utils";
import {
    User,
    Shield,
    MonitorSmartphone,
    Monitor,
    Moon,
    Sun,
    Palette,
    LogOut
} from "lucide-react";

export function HeaderUserMenu() {
    const user = useAuthUser();
    const logout = useLogout();
    const navigate = useNavigate();
    const { theme, setTheme } = useTheme();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full ml-1">
                    <Avatar className="h-8 w-8 object-cover">
                        <AvatarImage src={getAvatarUrl(user?.avatar_url)} className="object-cover" />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {user?.name?.charAt(0).toUpperCase() || "管"}
                        </AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56" sideOffset={8}>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user?.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => navigate({ to: "/app/settings/profile" })}>
                        <User className="mr-2 h-4 w-4" />
                        <span>个人资料</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate({ to: "/app/settings/security" })}>
                        <Shield className="mr-2 h-4 w-4" />
                        <span>安全设置</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate({ to: "/app/settings/sessions" })}>
                        <MonitorSmartphone className="mr-2 h-4 w-4" />
                        <span>登录设备</span>
                    </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                            <Palette className="mr-2 h-4 w-4" />
                            <span>主题</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                                <DropdownMenuItem onClick={() => setTheme("light")}>
                                    <Sun className="mr-2 h-4 w-4" />
                                    <span>白天</span>
                                    {theme === "light" && <span className="ml-auto text-xs">✓</span>}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTheme("dark")}>
                                    <Moon className="mr-2 h-4 w-4" />
                                    <span>夜间</span>
                                    {theme === "dark" && <span className="ml-auto text-xs">✓</span>}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTheme("system")}>
                                    <Monitor className="mr-2 h-4 w-4" />
                                    <span>跟随系统</span>
                                    {theme === "system" && <span className="ml-auto text-xs">✓</span>}
                                </DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                    </DropdownMenuSub>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout.mutate()} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>退出登录</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
