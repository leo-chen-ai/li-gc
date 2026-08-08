import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Loader2, Plus, X } from "lucide-react";
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
import { useCreateUser } from "@/features/admin/hooks/use-create-user";
import { useUpdateUserRole } from "@/features/admin/hooks/use-update-user-role";
import { useUpdateUserProjects } from "@/features/admin/hooks/use-update-user-projects";
import { useDeleteUser, useResetUserPassword } from "@/features/admin/hooks/use-user-actions";
import { useRolesList } from "@/features/admin/hooks/use-roles";
import { useProjectOptionsQuery } from "@/features/projects/hooks/use-construction-projects";
import { toast } from "sonner";
import type { AdminRole, ManagedProject, UserWithTimestamps } from "@/features/admin/types/admin-types";
import { UsersTable, type DialogType } from "./UsersTable";

const roleLabel = (role: string | null, roles: AdminRole[]) => {
  if (!role) return "未选择角色";
  return roles.find((item) => item.code === role)?.name
    ?? (role === "admin" ? "系统管理员" : role === "user" ? "普通用户" : role);
};

const DEFAULT_NEW_USER_PASSWORD = "888888";

interface CreatedUserCredential {
  name: string;
  account: string;
  password: string;
}

export function UsersManagement() {
  const { data: users, isLoading } = useUsersList();
  const { data: roles = [], isLoading: areRolesLoading } = useRolesList();
  const { mutate: updateRole } = useUpdateUserRole();
  const createUser = useCreateUser();
  const updateProjects = useUpdateUserProjects();
  const resetPassword = useResetUserPassword();
  const deleteUser = useDeleteUser();

  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [selectedUser, setSelectedUser] = useState<UserWithTimestamps | null>(null);
  const [newRole, setNewRole] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    username: "",
    role: "user",
    projectIds: [] as string[],
  });
  const [createdCredential, setCreatedCredential] = useState<CreatedUserCredential | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState(DEFAULT_NEW_USER_PASSWORD);
  const [projectDialogUser, setProjectDialogUser] = useState<UserWithTimestamps | null>(null);
  const [projectSelection, setProjectSelection] = useState<string[]>([]);

  const displayedUsers = users || [];

  const handleRoleChange = (user: UserWithTimestamps, role: string) => {
    setSelectedUser(user);
    setNewRole(role);
    setDialogType("role");
  };

  const handleResetPassword = (user: UserWithTimestamps) => {
    setSelectedUser(user);
    setResetPasswordValue(DEFAULT_NEW_USER_PASSWORD);
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

    updateRole(
      { userId: selectedUser.id, role: newRole },
      {
        onSuccess: () => {
          toast.success(`已将 ${selectedUser.name} 调整为${roleLabel(newRole, roles)}`);
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
    if (!selectedUser) return;
    if (resetPasswordValue.length < 6) {
      toast.error("新密码至少 6 位");
      return;
    }

    resetPassword.mutate(
      { userId: selectedUser.id, newPassword: resetPasswordValue },
      {
        onSuccess: () => {
          toast.success(`已为 ${selectedUser.name} 设置新密码`);
          setDialogType(null);
          setSelectedUser(null);
        },
        onError: () => toast.error("密码设置失败"),
      }
    );
  };

  const handleConfirmBlockAccount = () => {
    toast.success(`已禁用 ${selectedUser?.name}`);
    setDialogType(null);
    setSelectedUser(null);
  };

  const handleConfirmDeleteAccount = () => {
    if (!selectedUser) return;
    deleteUser.mutate(selectedUser.id, {
      onSuccess: () => {
        toast.success(`已删除 ${selectedUser.name}`);
        setDialogType(null);
        setSelectedUser(null);
      },
      onError: () => toast.error("用户删除失败"),
    });
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

    const name = newUserForm.name.trim();
    const username = newUserForm.username.trim();
    const account = username;

    if (!username) {
      toast.error("请填写用户名，作为登录账号");
      return;
    }

    createUser.mutate(
      {
        name,
        username: username || undefined,
        role: newUserForm.role,
        password: DEFAULT_NEW_USER_PASSWORD,
        project_ids: newUserForm.projectIds,
      },
      {
        onSuccess: () => {
          toast.success(`已新增用户 ${name}`);
          setCreatedCredential({
            name,
            account,
            password: DEFAULT_NEW_USER_PASSWORD,
          });
          setNewUserForm({ name: "", username: "", role: "user", projectIds: [] });
          setIsCreateOpen(false);
        },
        onError: () => {
          toast.error("新增用户失败，请检查账号是否重复");
        },
      }
    );
  };

  const handleManageProjects = (user: UserWithTimestamps) => {
    setProjectDialogUser(user);
    setProjectSelection((user.managed_projects ?? []).map((project) => project.id));
  };

  const handleSaveProjectPermissions = () => {
    if (!projectDialogUser) return;

    updateProjects.mutate(
      { userId: projectDialogUser.id, projectIds: projectSelection },
      {
        onSuccess: () => {
          toast.success(`已更新 ${projectDialogUser.name} 的项目权限`);
          setProjectDialogUser(null);
          setProjectSelection([]);
        },
        onError: () => {
          toast.error("项目权限更新失败");
        },
      }
    );
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
              <Badge variant={newRole === "admin" ? "destructive" : "default"}>{roleLabel(newRole, roles)}</Badge> 吗？
            </>
          ),
          action: handleConfirmRoleChange,
          actionText: "确认调整",
        };
      case "reset":
        return {
          title: "设置新密码",
          description: (
            <div className="grid gap-2 pt-2">
              <span>直接为 {selectedUser?.name} 设置新密码：</span>
              <Input
                value={resetPasswordValue}
                onChange={(event) => setResetPasswordValue(event.target.value)}
                placeholder="至少 6 位"
              />
            </div>
          ),
          action: handleConfirmResetPassword,
          actionText: resetPassword.isPending ? "设置中..." : "确认设置",
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
      <div className="flex items-center justify-end rounded-xl border bg-white px-4 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsCreateOpen(true)} className="bg-[#0f6b5d] hover:bg-[#0b5a4f]">
            <Plus className="mr-2 h-4 w-4" />
            新增用户
          </Button>
          <Button variant="outline" asChild>
            <Link to="/app/admin/projects">返回项目列表</Link>
          </Button>
        </div>
      </div>

      <UsersTable
        users={displayedUsers}
        roles={roles}
        isLoading={isLoading}
        onRoleChange={handleRoleChange}
        onResetPassword={handleResetPassword}
        onBlockAccount={handleBlockAccount}
        onDeleteAccount={handleDeleteAccount}
        onManageProjects={handleManageProjects}
        onBulkBlock={handleBulkBlock}
        onBulkDelete={handleBulkDelete}
      />

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新增用户</DialogTitle>
            <DialogDescription>创建后使用用户名登录 PC 或小程序，默认密码为 888888。</DialogDescription>
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
              <Label htmlFor="user-username">用户名（小程序登录账号）</Label>
              <Input
                id="user-username"
                placeholder="请输入登录用户名"
                value={newUserForm.username}
                onChange={(event) => setNewUserForm((form) => ({ ...form, username: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>角色</Label>
              <Select
                value={newUserForm.role}
                onValueChange={(value) =>
                  setNewUserForm((form) => ({ ...form, role: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.code}>
                      {role.name}
                    </SelectItem>
                  ))}
                  {areRolesLoading ? (
                    <SelectItem value="__loading" disabled>角色加载中...</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>可管理项目</Label>
              <ProjectPermissionSelect
                selectedProjectIds={newUserForm.projectIds}
                selectedProjects={[]}
                onChange={(projectIds) =>
                  setNewUserForm((form) => ({ ...form, projectIds }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={createUser.isPending}
              className="bg-[#0f6b5d] hover:bg-[#0b5a4f]"
            >
              {createUser.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(projectDialogUser)}
        onOpenChange={(open) => {
          if (!open) {
            setProjectDialogUser(null);
            setProjectSelection([]);
          }
        }}
      >
        <DialogContent className="overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>管理项目权限</DialogTitle>
            <DialogDescription>
              设置 {projectDialogUser?.name} 登录小程序后可管理的项目范围。
            </DialogDescription>
          </DialogHeader>
          <ProjectPermissionSelect
            selectedProjectIds={projectSelection}
            selectedProjects={projectDialogUser?.managed_projects ?? []}
            onChange={setProjectSelection}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialogUser(null)}>
              取消
            </Button>
            <Button
              onClick={handleSaveProjectPermissions}
              disabled={updateProjects.isPending}
              className="bg-[#0f6b5d] hover:bg-[#0b5a4f]"
            >
              {updateProjects.isPending ? "保存中..." : "保存"}
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

function ProjectPermissionSelect({
  selectedProjectIds,
  selectedProjects,
  onChange,
}: {
  selectedProjectIds: string[];
  selectedProjects: ManagedProject[];
  onChange: (projectIds: string[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const optionsQuery = useProjectOptionsQuery(keyword);
  const options = optionsQuery.data ?? [];

  const selected = selectedProjectIds.map((id) => {
    const option = options.find((project) => project.id === id);
    const current = selectedProjects.find((project) => project.id === id);
    return {
      id,
      name: option?.name || current?.name || id,
    };
  });

  const toggleProject = (projectId: string) => {
    if (selectedProjectIds.includes(projectId)) {
      onChange(selectedProjectIds.filter((id) => id !== projectId));
      return;
    }

    onChange([...selectedProjectIds, projectId]);
  };

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border">
      <div className="border-b p-3">
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索项目名称、施工许可证、单位"
        />
        {selected.length > 0 ? (
          <div className="mt-3 flex max-w-full flex-wrap gap-2">
            {selected.map((project) => (
              <Badge key={project.id} variant="secondary" className="max-w-full gap-1">
                <span className="max-w-[180px] truncate">{project.name}</span>
                <button
                  type="button"
                  className="rounded-full hover:bg-black/10"
                  onClick={() => toggleProject(project.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className="max-h-64 min-w-0 overflow-y-auto overflow-x-hidden p-2">
        {optionsQuery.isFetching ? (
          <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            项目搜索中...
          </div>
        ) : optionsQuery.isError ? (
          <div className="px-2 py-6 text-sm text-destructive">项目加载失败，请重新搜索</div>
        ) : options.length === 0 ? (
          <div className="px-2 py-6 text-sm text-muted-foreground">暂无匹配项目</div>
        ) : (
          <div className="grid min-w-0 gap-1">
            {options.map((project) => {
              const checked = selectedProjectIds.includes(project.id);
              const meta = [project.work_permit, project.build_unit || project.contractor]
                .filter(Boolean)
                .join(" / ");

              return (
                <button
                  key={project.id}
                  type="button"
                  className="flex w-full min-w-0 items-start gap-2 overflow-hidden rounded-md px-2 py-2 text-left hover:bg-muted"
                  onClick={() => toggleProject(project.id)}
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border">
                    {checked ? <Check className="h-3 w-3 text-[#0f6b5d]" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="block max-w-full break-words text-sm font-medium leading-5">
                      {project.name || project.id}
                    </span>
                    {meta ? (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {meta}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
