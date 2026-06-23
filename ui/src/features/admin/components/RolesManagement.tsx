import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  menuPermissions,
  type MenuPermission,
  type MenuPermissionKey,
} from "@/features/admin/data/rbac";
import {
  useCreateRole,
  useDeleteRole,
  useRolesList,
  useUpdateRoleMenus,
} from "@/features/admin/hooks/use-roles";
import type { AdminRole } from "@/features/admin/types/admin-types";

const menuKeySet = new Set<string>(menuPermissions.map((menu) => menu.key));

export function RolesManagement() {
  const { data: roles = [], isLoading, isError } = useRolesList();
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();
  const updateRoleMenus = useUpdateRoleMenus();
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [rolePendingDelete, setRolePendingDelete] = useState<AdminRole | null>(null);
  const [newRoleForm, setNewRoleForm] = useState({
    name: "",
    code: "",
    description: "",
  });

  useEffect(() => {
    if (!selectedRoleId && roles.length > 0) {
      void Promise.resolve().then(() => setSelectedRoleId(roles[0].id));
    }
  }, [roles, selectedRoleId]);

  const selectedRole = roles.find((role) => role.id === selectedRoleId) || roles[0];
  const enabledMenuCount = selectedRole?.menu_keys.length || 0;
  const canDeleteSelectedRole = selectedRole && !selectedRole.is_system && selectedRole.user_count === 0;

  const groupedMenus = useMemo(() => {
    return menuPermissions.reduce<Record<MenuPermission["group"], MenuPermission[]>>(
      (groups, menu) => {
        groups[menu.group] = [...(groups[menu.group] || []), menu];
        return groups;
      },
      {} as Record<MenuPermission["group"], MenuPermission[]>
    );
  }, []);

  const toggleMenuPermission = (role: AdminRole, menuKey: MenuPermissionKey) => {
    const currentKeys = normalizeRoleMenuKeys(role.menu_keys);
    const nextKeys = currentKeys.includes(menuKey)
      ? currentKeys.filter((key) => key !== menuKey)
      : [...currentKeys, menuKey];

    updateRoleMenus.mutate(
      { roleId: role.id, menuKeys: nextKeys },
      {
        onSuccess: (updatedRole) => {
          toast.success(`已更新 ${updatedRole.name} 的菜单权限`);
        },
        onError: () => {
          toast.error("菜单权限更新失败");
        },
      }
    );
  };

  const handleCreateRole = () => {
    if (!newRoleForm.name.trim() || !newRoleForm.code.trim()) {
      toast.error("请填写角色名称和角色编码");
      return;
    }

    createRole.mutate(
      {
        name: newRoleForm.name.trim(),
        code: newRoleForm.code.trim(),
        description: newRoleForm.description.trim() || undefined,
      },
      {
        onSuccess: (role) => {
          setSelectedRoleId(role.id);
          setNewRoleForm({ name: "", code: "", description: "" });
          setIsCreateOpen(false);
          toast.success(`已新增角色 ${role.name}`);
        },
        onError: () => {
          toast.error("角色创建失败，请检查角色编码是否重复");
        },
      }
    );
  };

  const handleDeleteRole = () => {
    if (!rolePendingDelete) return;

    deleteRole.mutate(rolePendingDelete.id, {
      onSuccess: () => {
        toast.success(`已删除角色 ${rolePendingDelete.name}`);
        setRolePendingDelete(null);
        setSelectedRoleId("");
      },
      onError: () => {
        toast.error("角色删除失败，系统角色或已绑定用户的角色不能删除");
      },
    });
  };

  if (isLoading) {
    return <RolesManagementSkeleton />;
  }

  if (isError) {
    return (
      <div className="rounded-md border bg-background p-6">
        <h1 className="text-2xl font-semibold">角色管理</h1>
        <p className="mt-2 text-sm text-muted-foreground">角色数据加载失败，请稍后重试。</p>
      </div>
    );
  }

  if (!selectedRole) {
    return (
      <div className="rounded-md border bg-background p-6">
        <h1 className="text-2xl font-semibold">角色管理</h1>
        <Button className="mt-4 bg-[#0f6b5d] hover:bg-[#0b5a4f]" onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          新增角色
        </Button>
        <CreateRoleDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          form={newRoleForm}
          onFormChange={setNewRoleForm}
          onSubmit={handleCreateRole}
          isSubmitting={createRole.isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">角色管理</h1>
          <p className="text-muted-foreground">维护角色、菜单范围和绑定用户数量</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsCreateOpen(true)} className="bg-[#0f6b5d] hover:bg-[#0b5a4f]">
            <Plus className="mr-2 h-4 w-4" />
            新增角色
          </Button>
          <Button variant="outline" asChild>
            <Link to="/app/admin/projects">返回项目管理</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
              <span>角色列表</span>
              <Badge variant="secondary">{roles.length} 个角色</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedRoleId(role.id)}
                className={`w-full rounded-md border p-4 text-left transition ${
                  role.id === selectedRole.id
                    ? "border-[#0f6b5d] bg-[#0f6b5d]/10 shadow-sm"
                    : "border-border bg-background hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{role.name}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{role.code}</div>
                  </div>
                  <Badge variant={role.code === "admin" ? "destructive" : "outline"}>
                    {role.user_count} 人
                  </Badge>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{role.description}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-2">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-[#0f6b5d]" />
                  <span className="truncate">{selectedRole.name}</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canDeleteSelectedRole}
                  onClick={() => setRolePendingDelete(selectedRole)}
                  title={
                    selectedRole.is_system
                      ? "系统角色不能删除"
                      : selectedRole.user_count > 0
                        ? "已有用户绑定，不能删除"
                        : "删除角色"
                  }
                  className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:border-border disabled:text-muted-foreground disabled:hover:bg-background dark:border-red-900/50 dark:hover:bg-red-950/20"
                >
                  <Trash2 className="h-4 w-4" />
                  删除角色
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <SummaryCell label="角色编码" value={selectedRole.code} />
                <SummaryCell label="菜单权限" value={`${enabledMenuCount} / ${menuPermissions.length}`} />
                <SummaryCell label="绑定用户" value={`${selectedRole.user_count} 人`} />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{selectedRole.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">菜单权限</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {Object.entries(groupedMenus).map(([group, menus]) => (
                <div key={group} className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{group}</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                    {menus.map((menu) => {
                      const checked = selectedRole.menu_keys.includes(menu.key);
                      const isUpdating = updateRoleMenus.isPending;

                      return (
                        <button
                          key={menu.key}
                          type="button"
                          disabled={isUpdating}
                          onClick={() => toggleMenuPermission(selectedRole, menu.key)}
                          className={`flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            checked ? "border-[#0f6b5d] bg-[#0f6b5d]/10" : "bg-background hover:bg-muted/60"
                          }`}
                        >
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                              checked ? "bg-[#0f6b5d] ring-4 ring-[#0f6b5d]/15" : "bg-muted-foreground/35"
                            }`}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{menu.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{menu.path}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateRoleDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        form={newRoleForm}
        onFormChange={setNewRoleForm}
        onSubmit={handleCreateRole}
        isSubmitting={createRole.isPending}
      />
      <DeleteRoleDialog
        role={rolePendingDelete}
        onOpenChange={(open) => {
          if (!open) setRolePendingDelete(null);
        }}
        onSubmit={handleDeleteRole}
        isSubmitting={deleteRole.isPending}
      />
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 truncate font-semibold">{value}</div>
    </div>
  );
}

function CreateRoleDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: { name: string; code: string; description: string };
  onFormChange: (form: { name: string; code: string; description: string }) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增角色</DialogTitle>
          <DialogDescription>保存后可在角色详情中配置菜单权限。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="role-name">角色名称</Label>
            <Input
              id="role-name"
              placeholder="例如：项目安全员"
              value={form.name}
              onChange={(event) => onFormChange({ ...form, name: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role-code">角色编码</Label>
            <Input
              id="role-code"
              placeholder="例如：safety_officer"
              value={form.code}
              onChange={(event) => onFormChange({ ...form, code: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role-description">说明</Label>
            <Input
              id="role-description"
              placeholder="这个角色负责什么"
              value={form.description}
              onChange={(event) => onFormChange({ ...form, description: event.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting} className="bg-[#0f6b5d] hover:bg-[#0b5a4f]">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleDialog({
  role,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  role: AdminRole | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  return (
    <Dialog open={Boolean(role)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除角色</DialogTitle>
          <DialogDescription>
            删除后该角色的菜单权限配置会同步移除。请确认不再需要「{role?.name}」。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="destructive" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RolesManagementSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-5 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
      </div>
    </div>
  );
}

function normalizeRoleMenuKeys(menuKeys: string[]): MenuPermissionKey[] {
  return menuKeys.filter((key): key is MenuPermissionKey => menuKeySet.has(key));
}
