import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ImageUploadModal } from "./ImageUploadModal";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useProfile, settingsKeys } from "@/features/settings/hooks/use-profile";
import { useUpdateProfile } from "@/features/settings/hooks/use-update-profile";
import { useAuthStore } from "@/stores/use-auth-store";
import { getAvatarUrl } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export function ProfileSettings() {
    const queryClient = useQueryClient();
    const { data: user, isLoading } = useProfile();
    const { isPending: isUpdating, mutateAsync: updateUser } = useUpdateProfile();

    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
    const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);

    // Form fields
    const [name, setName] = useState(user?.name || "");
    const [username, setUsername] = useState(user?.username || "");
    const [email, setEmail] = useState(user?.email || "");

    // Sync state once when user data is first fully loaded, preventing continuous overrides
    if (!name && user?.name) setName(user.name);
    if (!username && user?.username) setUsername(user.username);
    if (!email && user?.email) setEmail(user.email);

    if (isLoading || !user) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
        );
    }

    const avatarUrl = user?.avatar_url;

    const handleAvatarUpload = async (file: File) => {
        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const response = await apiClient.post('/users/avatar', formData, {
                headers: { 'Content-Type': undefined },
            });
            const newAvatarUrl = response.data?.data?.avatar_url;
            if (newAvatarUrl && user) {
                if (typeof window !== "undefined") {
                    localStorage.setItem("avatar_update_ts", Date.now().toString());
                }
                // Pre-update cache to avoid flicker
                const updatedUser = { ...user, avatar_url: newAvatarUrl };
                queryClient.setQueryData(settingsKeys.profile(), updatedUser);
                useAuthStore.getState().actions.setUser(updatedUser);
            }
            toast.success("头像已更新");
        } catch {
            toast.error("头像上传失败");
        }
    };

    const handleAvatarRemove = async () => {
        setIsRemovingAvatar(true);
        try {
            await apiClient.delete('/users/avatar');
            if (user) {
                if (typeof window !== "undefined") {
                    localStorage.setItem("avatar_update_ts", Date.now().toString());
                }
                // Pre-update cache explicitly setting avatar to undefined
                const updatedUser = { ...user, avatar_url: undefined };
                queryClient.setQueryData(settingsKeys.profile(), updatedUser);
                useAuthStore.getState().actions.setUser(updatedUser);
            }
            toast.success("头像已移除");
            setIsRemoveModalOpen(false);
        } catch {
            toast.error("头像移除失败");
        } finally {
            setIsRemovingAvatar(false);
        }
    };

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const updates: { name?: string; username?: string; email?: string } = {};

        if (name !== user.name) updates.name = name;
        if (username !== user.username) updates.username = username;
        if (email !== user.email) updates.email = email;

        if (Object.keys(updates).length > 0) {
            try {
                await updateUser(updates);
                if (user) {
                    useAuthStore.getState().actions.setUser({ ...user, ...updates });
                }
                queryClient.invalidateQueries({ queryKey: settingsKeys.profile() });
                toast.success("个人资料已更新");
            } catch {
                toast.error("个人资料更新失败");
            }
        }
    };

    const isProfileChanged =
        name !== user.name ||
        username !== (user.username || "") ||
        email !== user.email;

    return (
        <div className="space-y-10 animate-fade-in pb-10">
            <ImageUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onUpload={handleAvatarUpload}
                title="上传头像"
                description="请选择头像图片，建议使用至少 200x200 像素的方形图片。"
                maxSizeMB={2}
                isAvatar={true}
            />

            <AlertDialog open={isRemoveModalOpen} onOpenChange={setIsRemoveModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>移除头像？</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要移除当前头像吗？该操作不可撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRemovingAvatar}>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleAvatarRemove();
                            }}
                            disabled={isRemovingAvatar}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isRemovingAvatar ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    正在移除...
                                </>
                            ) : (
                                "移除"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div>
                <h2 className="text-2xl font-bold tracking-tight mb-2">个人资料</h2>
                <p className="text-[15px] text-muted-foreground">
                    这里的信息会用于后台账号展示和系统通知。
                </p>
            </div>

            <Separator className="bg-border/40" />

            <form onSubmit={handleProfileSubmit} className="space-y-8 max-w-2xl">
                {/* Avatar Section */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 p-6 rounded-xl bg-muted/20 border border-border/30">
                    <Avatar className="h-24 w-24 sm:h-28 sm:w-28 border-4 border-background shadow-md">
                        <AvatarImage src={getAvatarUrl(avatarUrl)} />
                        <AvatarFallback className="bg-muted text-muted-foreground text-3xl sm:text-4xl font-medium">
                            {user?.name?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                    </Avatar>
                    <div className="space-y-3">
                        <h4 className="text-[15px] font-bold">头像</h4>
                        <div className="flex items-center gap-3">
                            <Button
                                type="button"
                                size="sm"
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                                onClick={() => setIsUploadModalOpen(true)}
                            >
                                <Camera className="mr-2 h-4 w-4" /> 更换头像
                            </Button>
                            {avatarUrl && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10"
                                    onClick={() => setIsRemoveModalOpen(true)}
                                    disabled={isRemovingAvatar}
                                >
                                    {isRemovingAvatar ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        "移除"
                                    )}
                                </Button>
                            )}
                        </div>
                        <p className="text-[13px] text-muted-foreground">
                            支持 JPG、PNG 或 GIF，最大 2MB。
                        </p>
                    </div>
                </div>

                {/* Form Fields */}
                <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            显示名称
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="请输入显示名称"
                            className="h-11 bg-muted/40 border-transparent transition-colors focus-visible:ring-1 focus-visible:ring-primary/50 hover:bg-muted/60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="username" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            用户名
                        </Label>
                        <Input
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="请输入用户名"
                            className="h-11 bg-muted/40 border-transparent transition-colors focus-visible:ring-1 focus-visible:ring-primary/50 hover:bg-muted/60"
                        />
                        <p className="text-[13px] text-muted-foreground mt-1">
                            用户名每 30 天只能修改一次。
                        </p>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            邮箱地址
                            <span className="text-destructive ml-1">*</span>
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            className="h-11 bg-muted/40 border-transparent transition-colors focus-visible:ring-1 focus-visible:ring-primary/50 hover:bg-muted/60"
                        />
                        <p className="text-[13px] text-muted-foreground mt-1">
                            邮箱用于登录认证和系统通知。
                        </p>
                    </div>
                </div>

                <div className="pt-6">
                    <Button
                        type="submit"
                        disabled={isUpdating || !isProfileChanged}
                        className="h-10 px-8 font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md"
                    >
                        {isUpdating ? "保存中..." : "保存修改"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
