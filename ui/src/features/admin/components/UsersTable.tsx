/* use no memo */
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Shield,
  User,
  MoreHorizontal,
  ArrowUpDown,
  Ban,
  Key,
  Trash2,
  X,
  Settings2,
  ChevronDown,
  FolderKanban,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthUser } from "@/stores/use-auth-store";
import type { UserWithTimestamps } from "@/features/admin/types/admin-types";

export type DialogType = "role" | "block" | "reset" | "delete" | null;

const roleLabel = (role: string) => (role === "admin" ? "系统管理员" : "普通用户");

const columnLabels: Record<string, string> = {
  name: "用户",
  email: "邮箱",
  role: "角色",
  managed_projects: "可管理项目",
  created_at: "创建时间",
};

interface UsersTableProps {
  users: UserWithTimestamps[] | undefined;
  isLoading: boolean;
  onRoleChange: (user: UserWithTimestamps, newRole: "admin" | "user") => void;
  onResetPassword: (user: UserWithTimestamps) => void;
  onBlockAccount: (user: UserWithTimestamps) => void;
  onDeleteAccount: (user: UserWithTimestamps) => void;
  onManageProjects: (user: UserWithTimestamps) => void;
  onBulkBlock: (count: number) => void;
  onBulkDelete: (count: number) => void;
}

export function UsersTable({
  users,
  isLoading,
  onRoleChange,
  onResetPassword,
  onBlockAccount,
  onDeleteAccount,
  onManageProjects,
  onBulkBlock,
  onBulkDelete,
}: UsersTableProps) {
  const currentUser = useAuthUser();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns: ColumnDef<UserWithTimestamps>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="全选"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="选择行"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "no",
      header: "序号",
      cell: ({ row, table }) => {
        const pageIndex = table.getState().pagination.pageIndex;
        const pageSize = table.getState().pagination.pageSize;
        const rowIndex = row.index;
        return <span className="text-muted-foreground text-sm">{pageIndex * pageSize + rowIndex + 1}</span>;
      },
      enableSorting: false,
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          用户
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{user.name}</div>
              {user.username && (
                <div className="text-xs text-muted-foreground">@{user.username}</div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "email",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          邮箱
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const email = row.getValue("email") as string;
        return email ? (
          <span>{email}</span>
        ) : (
          <span className="text-muted-foreground">未填写</span>
        );
      },
    },
    {
      accessorKey: "role",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          角色
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const role = row.getValue("role") as string;
        return (
          <Badge variant={role === "admin" ? "destructive" : "default"} className="gap-1">
            {role === "admin" ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {roleLabel(role)}
          </Badge>
        );
      },
    },
    {
      accessorKey: "managed_projects",
      header: "可管理项目",
      cell: ({ row }) => {
        const projects = row.original.managed_projects ?? [];
        if (projects.length === 0) {
          return <span className="text-sm text-muted-foreground">未分配</span>;
        }

        return (
          <div className="flex max-w-[260px] flex-wrap gap-1">
            {projects.slice(0, 2).map((project) => (
              <Badge key={project.id} variant="outline" className="max-w-[120px] truncate">
                {project.name}
              </Badge>
            ))}
            {projects.length > 2 ? (
              <Badge variant="secondary">+{projects.length - 2}</Badge>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          创建时间
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = row.getValue("created_at") as string;
        return date ? new Date(date).toLocaleDateString("zh-CN") : "未记录";
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const user = row.original;
        const isSelf = user.id === currentUser?.id;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {user.role !== "admin" ? (
                <DropdownMenuItem
                  onClick={() => onRoleChange(user, "admin")}
                >
                  <Shield className="mr-2 h-4 w-4" />
                  设为系统管理员
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => onRoleChange(user, "user")}
                  disabled={isSelf}
                >
                  <User className="mr-2 h-4 w-4" />
                  {isSelf ? "不能调整自己" : "设为普通用户"}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onManageProjects(user)}>
                <FolderKanban className="mr-2 h-4 w-4" />
                管理项目
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onResetPassword(user)}
                disabled={isSelf || !user.email}
              >
                <Key className="mr-2 h-4 w-4" />
                {!user.email ? "未填写邮箱" : "重置密码"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onBlockAccount(user)}
                disabled={isSelf}
                className="text-amber-600"
              >
                <Ban className="mr-2 h-4 w-4" />
                禁用账号
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDeleteAccount(user)}
                disabled={isSelf}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除账号
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: users || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      globalFilter,
      rowSelection,
      columnVisibility,
    },
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;

  const handleBulkBlock = () => {
    onBulkBlock(selectedCount);
    table.toggleAllPageRowsSelected(false);
  };

  const handleBulkDelete = () => {
    onBulkDelete(selectedCount);
    table.toggleAllPageRowsSelected(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>全部用户（{users?.length || 0}）</CardTitle>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Settings2 className="mr-2 h-3.5 w-3.5" />
                  显示列
                  <ChevronDown className="ml-2 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[150px]">
                {table
                  .getAllColumns()
                  .filter(
                    (column) =>
                      typeof column.accessorFn !== "undefined" && column.getCanHide()
                  )
                  .map((column) => {
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) =>
                          column.toggleVisibility(!!value)
                        }
                      >
                        {columnLabels[column.id] || column.id}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索用户..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="h-8 pl-8"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center">
                        暂无用户数据。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {selectedCount > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-md border bg-muted/50 p-2 px-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    已选择 {selectedCount} 个用户
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => table.toggleAllPageRowsSelected(false)}
                  >
                    <X className="mr-1 h-3 w-3" />
                    清除
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-amber-500 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                    onClick={handleBulkBlock}
                  >
                    <Ban className="mr-1 h-3 w-3" />
                    禁用
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-destructive text-destructive hover:bg-destructive/10"
                    onClick={handleBulkDelete}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    删除
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                第 {table.getState().pagination.pageIndex + 1} 页，共 {table.getPageCount()} 页
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
