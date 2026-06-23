import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUsersList } from "@/features/admin/hooks/use-users-list";
import { useUpdateUserRole } from "@/features/admin/hooks/use-update-user-role";
import { toast } from "sonner";
import type { UserWithTimestamps } from "@/features/admin/types/admin-types";
import { UsersTable, type DialogType } from "./UsersTable";

const roleLabel = (role: "admin" | "user" | null) =>
  role === "admin" ? "系统管理员" : "普通用户";

const DEFAULT_NEW_USER_PASSWORD = "Shanhuai@123";

interface CreatedUserCredential {
  name: string;
  account: string;
  password: string;
}

export function UsersManagement() {
  const { data: users, isLoading } = useUsersList();
  const { mutate: updateRole } = useUpdateUserRole();

  const [createdUsers, setCreatedUsers] = useState<UserWithTimestamps[]>([]);
  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [selectedUser, setSelectedUser] = useState<UserWithTimestamps | null>(null);
  const [newRole, setNewRole] = useState<"admin" | "user" | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    email: "",
    username: "",
    role: "user" as "admin" | "user",
  });
  const [createdCredential, setCreatedCredential] = useState<CreatedUserCredential | null>(null);

  const displayedUsers = [...(users || []), ...createdUsers];

  const handleRoleChange = (user: UserWithTimestamps, role: "admin" | "user") => {
    setSelectedUser(user);
    setNewRole(role);
    setDialogType("role");
  };

  const handleResetPassword = (user: UserWithTimestamps) => {
    if (!user.email) {
      toast.error("该用户未填写邮箱，无法发送重置密码链接");
      return;
    }

    setSelectedUser(user);
    setDialogType("reset");
  };

  const handleBlockAccount = (user: UserWithTimestamps) => {
    setSelectedUser(user);
    setDialogType("block");
  };

  const handleDeleteAccount = (user: UserWithTimestamps) => {
    setSelectedUser(user);
    setDialogType("delete");
  };

  const handleConfirmRoleChange = () => {
    if (!selectedUser || !newRole) return;

    if (selectedUser.id.startsWith("local-")) {
      setCreatedUsers((current) =>
        current.map((user) =>
          user.id === selectedUser.id ? { ...user, role: newRole } : user
        )
      );
      toast.success(`已将 ${selectedUser.name} 调整为${roleLabel(newRole)}`);
      setDialogType(null);
      setSelectedUser(null);
      setNewRole(null);
      return;
    }

    updateRole(
      { userId: selectedUser.id, role: newRole },
      {
        onSuccess: () => {
          toast.success(`已将 ${selectedUser.name} 调整为${roleLabel(newRole)}`);
          setDialogType(null);
          setSelectedUser(null);
          setNewRole(null);
        },
        onError: () => {
          toast.error("角色更新失败");
        },
      }
    );
  };

  const handleConfirmResetPassword = () => {
    toast.success(`已向 ${selectedUser?.email} 发送重置密码链接`);
    setDialogType(null);
    setSelectedUser(null);
  };

  const handleConfirmBlockAccount = () => {
    toast.success(`已禁用 ${selectedUser?.name}`);
    setDialogType(null);
    setSelectedUser(null);
  };

  const handleConfirmDeleteAccount = () => {
    if (selectedUser?.id.startsWith("local-")) {
      setCreatedUsers((current) => current.filter((user) => user.id !== selectedUser.id));
    }
    toast.success(`已删除 ${selectedUser?.name}`);
    setDialogType(null);
    setSelectedUser(null);
  };

  const handleBulkBlock = (count: number) => {
    toast.success(`已禁用 ${count} 个用户`);
  };

  const handleBulkDelete = (count: number) => {
    toast.success(`已删除 ${count} 个用户`);
  };

  const handleCreateUser = () => {
    if (!newUserForm.name.trim()) {
      toast.error("请填写姓名");
      return;
    }

    const now = new Date().toISOString();
    const name = newUserForm.name.trim();
    const email = newUserForm.email.trim();
    const username = newUserForm.username.trim();
    const account = email || username || name;

    setCreatedUsers((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        name,
        email,
        username: username || undefined,
        role: newUserForm.role,
        created_at: now,
        updated_at: now,
      },
    ]);
    toast.success(`已新增用户 ${name}`);
    setCreatedCredential({
      name,
      account,
      password: DEFAULT_NEW_USER_PASSWORD,
    });
    setNewUserForm({ name: "", email: "", username: "", role: "user" });
    setIsCreateOpen(false);
  };

  const copyCreatedPassword = async () => {
    if (!createdCredential) return;

    try {
      await navigator.clipboard.writeText(createdCredential.password);
      toast.success("初始密码已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const getDialogContent = () => {
    switch (dialogType) {
      case "role":
        return {
          title: "确认调整角色",
          description: (
            <>
              确定将 <strong>{selectedUser?.name}</strong> 的角色调整为{" "}
              <Badge variant={newRole === "admin" ? "destructive" : "default"}>{roleLabel(newRole)}</Badge> 吗？
            </>
          ),
          action: handleConfirmRoleChange,
          actionText: "确认调整",
        };
      case "reset":
        return {
          title: "重置密码",
          description: `向 ${selectedUser?.email} 发送密码重置链接？`,
          action: handleConfirmResetPassword,
          actionText: "发送链接",
        };
      case "block":
        return {
          title: "禁用账号",
          description: `确定禁用 ${selectedUser?.name} 吗？禁用后该账号将无法登录。`,
          action: handleConfirmBlockAccount,
          actionText: "确认禁用",
          destructive: true,
        };
      case "delete":
        return {
          title: "删除账号",
          description: `确定永久删除 ${selectedUser?.name} 吗？该操作不可撤销。`,
          action: handleConfirmDeleteAccount,
          actionText: "确认删除",
          destructive: true,
        };
      default:
        return null;
    }
  };

  const dialogContent = getDialogContent();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">用户管理</h1>
          <p className="text-muted-foreground">维护后台账号、角色身份和登录权限</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsCreateOpen(true)} className="bg-[#0f6b5d] hover:bg-[#0b5a4f]">
            <Plus className="mr-2 h-4 w-4" />
            新增用户
          </Button>
          <Button variant="outline" asChild>
            <Link to="/app/admin/projects">返回项目管理</Link>
          </Button>
        </div>
      </div>

      <UsersTable
        users={displayedUsers}
        isLoading={isLoading}
        onRoleChange={handleRoleChange}
        onResetPassword={handleResetPassword}
        onBlockAccount={handleBlockAccount}
        onDeleteAccount={handleDeleteAccount}
        onBulkBlock={handleBulkBlock}
        onBulkDelete={handleBulkDelete}
      />

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增用户</DialogTitle>
            <DialogDescription>先创建页面草稿账号，后续确认后接入后端保存。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="user-name">姓名</Label>
              <Input
                id="user-name"
                placeholder="请输入姓名"
                value={newUserForm.name}
                onChange={(event) => setNewUserForm((form) => ({ ...form, name: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-email">邮箱（选填）</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="可选"
                value={newUserForm.email}
                onChange={(event) => setNewUserForm((form) => ({ ...form, email: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-username">用户名</Label>
              <Input
                id="user-username"
                placeholder="可选"
                value={newUserForm.username}
                onChange={(event) => setNewUserForm((form) => ({ ...form, username: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>角色</Label>
              <Select
                value={newUserForm.role}
                onValueChange={(value) =>
                  setNewUserForm((form) => ({ ...form, role: value as "admin" | "user" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">普通用户</SelectItem>
                  <SelectItem value="admin">系统管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateUser} className="bg-[#0f6b5d] hover:bg-[#0b5a4f]">
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(createdCredential)} onOpenChange={(open) => !open && setCreatedCredential(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>用户已新增</DialogTitle>
            <DialogDescription>
              请把初始密码告知用户，并提醒首次登录后修改密码。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 p-4 text-sm">
            <div className="grid gap-3">
              <CredentialRow label="姓名" value={createdCredential?.name || ""} />
              <CredentialRow label="账号" value={createdCredential?.account || ""} />
              <div className="grid gap-1">
                <div className="text-xs text-muted-foreground">初始密码</div>
                <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                  <span className="font-mono text-base font-semibold">{createdCredential?.password}</span>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={copyCreatedPassword}>
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedCredential(null)} className="bg-[#0f6b5d] hover:bg-[#0b5a4f]">
              我知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={dialogType !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialogType(null);
            setSelectedUser(null);
            setNewRole(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogContent?.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialogContent?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={dialogContent?.action}
              className={dialogContent?.destructive ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {dialogContent?.actionText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="rounded-md border bg-background px-3 py-2 font-medium">{value || "未填写"}</div>
    </div>
  );
}
