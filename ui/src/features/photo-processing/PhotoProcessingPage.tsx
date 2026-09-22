import { useMemo, useState } from "react";
import { FolderOpen, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { AttendancePhotoPickerDialog } from "./components/AttendancePhotoPickerDialog";
import { BackgroundUploader } from "./components/BackgroundUploader";
import { CompositePanel } from "./components/CompositePanel";
import {
  useAddPhotoGroupPhotosMutation,
  useCreatePhotoGroupMutation,
  useDeleteBackgroundMutation,
  useDeletePhotoGroupMutation,
  useDeletePhotoGroupPhotoMutation,
  usePhotoGroupDetailQuery,
  usePhotoGroupListQuery,
  useSetBackgroundMutation,
  useUpdatePhotoGroupMutation,
} from "./hooks";
import { compositeStatusLabel, directionLabel, photoDedupeKey } from "./lib";
import type {
  AttendancePhotoItem,
  PhotoGroupDetail,
  PhotoGroupPhotoPayload,
} from "./types";

type PageTab = "photos" | "backgrounds" | "composite";

export function PhotoProcessingPage() {
  const [keyword, setKeyword] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [tab, setTab] = useState<PageTab>("photos");
  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameRemark, setRenameRemark] = useState("");

  const groupsQuery = usePhotoGroupListQuery({
    page: 1,
    page_size: 50,
    keyword: keyword.trim() || undefined,
  });
  const groups = groupsQuery.data?.items ?? [];
  const groupDetailQuery = usePhotoGroupDetailQuery(selectedGroupId || undefined);
  const group = groupDetailQuery.data;
  const createGroup = useCreatePhotoGroupMutation();
  const deleteGroup = useDeletePhotoGroupMutation();
  const addPhotos = useAddPhotoGroupPhotosMutation(selectedGroupId);
  const deletePhoto = useDeletePhotoGroupPhotoMutation(selectedGroupId);
  const setBackground = useSetBackgroundMutation(selectedGroupId);
  const deleteBackground = useDeleteBackgroundMutation(selectedGroupId);

  const existingKeys = useMemo(
    () =>
      (group?.photos ?? []).map((photo) =>
        photoDedupeKey({
          attendance_record_id: photo.attendance_record_id,
          project_id: photo.project_id,
          worker_id: photo.worker_id,
          attendance_date: photo.attendance_date,
          direction: photo.direction,
        })
      ),
    [group?.photos]
  );

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) {
      toast.info("请先填写组名称");
      return;
    }
    try {
      const created = await createGroup.mutateAsync({ name });
      setNewGroupName("");
      setCreating(false);
      setSelectedGroupId(created.id);
      setTab("photos");
      toast.success("已创建照片处理组");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建照片处理组失败");
    }
  };

  const handleDeleteGroup = async (groupId: string, name: string) => {
    if (!window.confirm(`确认删除照片处理组「${name}」？组内照片会一起删除。`)) return;
    try {
      await deleteGroup.mutateAsync(groupId);
      if (groupId === selectedGroupId) setSelectedGroupId("");
      toast.success("已删除照片处理组");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除照片处理组失败");
    }
  };

  const handleConfirmPicker = async (photos: AttendancePhotoItem[]) => {
    const payload: PhotoGroupPhotoPayload[] = photos.map((photo) => ({
      attendance_record_id: photo.attendance_record_id,
      project_id: photo.project_id,
      worker_id: photo.worker_id,
      worker_name: photo.worker_name,
      attendance_date: photo.attendance_date,
      direction: photo.direction,
      photo_url: photo.photo_url,
    }));
    try {
      const result = await addPhotos.mutateAsync(payload);
      setPickerOpen(false);
      const parts = [`已加入 ${result.added} 张照片`];
      if (result.skipped > 0) parts.push(`${result.skipped} 张已在组内`);
      if (result.failed.length) {
        toast.warning(
          `${parts.join("，")}，${result.failed.length} 张失败：${result.failed[0]}`
        );
        return;
      }
      toast.success(result.skipped > 0 ? parts.join("，") : `已加入 ${result.added} 张照片`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加入照片处理组失败");
    }
  };

  return (
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="rounded-xl border bg-white p-3 shadow-sm dark:border-border dark:bg-card">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">照片处理组</h2>
              <Button
                size="sm"
                className="h-7 gap-1 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
                onClick={() => setCreating((current) => !current)}
              >
                <Plus className="size-3.5" />
                新建
              </Button>
            </div>
            {creating ? (
              <div className="mt-3 space-y-2">
                <Input
                  placeholder="组名称，例如：张三 9 月考勤"
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleCreateGroup();
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={createGroup.isPending}
                    onClick={handleCreateGroup}
                  >
                    {createGroup.isPending ? (
                      <Loader2 className="mr-1 size-3.5 animate-spin" />
                    ) : null}
                    创建
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCreating(false);
                      setNewGroupName("");
                    }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            ) : null}
            <Input
              className="mt-3"
              placeholder="搜索组名称"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <div className="mt-3 max-h-[60svh] space-y-1 overflow-y-auto">
              {groupsQuery.isPending ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  正在加载
                </div>
              ) : !groups.length ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  还没有照片处理组
                </p>
              ) : (
                groups.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition",
                      item.id === selectedGroupId
                        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20"
                        : "hover:border-slate-400"
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setSelectedGroupId(item.id)}
                    >
                      <span className="block truncate text-sm font-medium">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {item.photo_count} 张 · 已合成 {item.success_count} ·{" "}
                        {item.has_in_background && item.has_out_background
                          ? "进/出背景齐"
                          : "背景图缺失"}
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-red-600"
                      onClick={() => void handleDeleteGroup(item.id, item.name)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          {!selectedGroupId || !group ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-20 text-sm text-muted-foreground">
              <FolderOpen className="size-6" />
              {selectedGroupId ? "正在加载组详情" : "请从左侧选择一个照片处理组"}
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border bg-white p-4 shadow-sm dark:border-border dark:bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold">{group.name}</h2>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {group.remark || "暂无备注"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRenameName(group.name);
                      setRenameRemark(group.remark ?? "");
                      setRenameOpen(true);
                    }}
                  >
                    重命名
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
                    onClick={() => setPickerOpen(true)}
                  >
                    <ImagePlus className="size-4" />
                    拉取照片
                  </Button>
                </div>
              </div>

              <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-muted">
                {(
                  [
                    ["photos", `组内照片 (${group.photos.length})`],
                    ["backgrounds", "背景图"],
                    ["composite", "AI 合成"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTab(value)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition",
                      tab === value
                        ? "bg-white text-slate-950 shadow-sm dark:bg-card dark:text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "photos" ? (
                <PhotoList
                  photos={group.photos}
                  onRemove={(photoId) => void deletePhoto.mutateAsync(photoId)}
                />
              ) : null}

              {tab === "backgrounds" ? (
                <BackgroundUploader
                  groupId={group.id}
                  backgrounds={group.backgrounds}
                  onSave={(direction, payload) => {
                    setBackground.mutate(
                      { direction, payload },
                      {
                        onSuccess: () => toast.success(`已保存${directionLabel(direction)}背景图`),
                        onError: (error) =>
                          toast.error(
                            error instanceof Error ? error.message : "保存背景图失败"
                          ),
                      }
                    );
                  }}
                  onRemove={(direction) => {
                    deleteBackground.mutate(direction, {
                      onSuccess: () => toast.success(`已移除${directionLabel(direction)}背景图`),
                      onError: (error) =>
                        toast.error(
                          error instanceof Error ? error.message : "移除背景图失败"
                        ),
                    });
                  }}
                />
              ) : null}

              {tab === "composite" ? <CompositePanel group={group} /> : null}
            </div>
          )}
        </section>
      </div>

      <AttendancePhotoPickerDialog
        open={pickerOpen && Boolean(selectedGroupId)}
        onOpenChange={setPickerOpen}
        existingKeys={existingKeys}
        onConfirm={(photos) => void handleConfirmPicker(photos)}
      />

      {renameOpen && group ? (
        <RenameGroupDialog
          groupId={group.id}
          name={renameName}
          remark={renameRemark}
          onNameChange={setRenameName}
          onRemarkChange={setRenameRemark}
          onClose={() => setRenameOpen(false)}
        />
      ) : null}
    </div>
  );
}

function PhotoList({
  photos,
  onRemove,
}: {
  photos: PhotoGroupDetail["photos"];
  onRemove: (photoId: string) => void;
}) {
  if (!photos.length) {
    return (
      <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        组内还没有照片，点右上角「拉取照片」从考勤记录里挑
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo) => (
        <div key={photo.id} className="overflow-hidden rounded-lg border">
          <div className="relative aspect-[2/3] bg-slate-100 dark:bg-muted">
            <img
              src={photo.composite_photo_url ?? photo.photo_url}
              alt={`${photo.worker_name} ${photo.attendance_date} 照片`}
              className="size-full object-contain"
            />
            <span className="pointer-events-none absolute left-1 top-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-white">
              {directionLabel(photo.direction)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 size-7 bg-white/80 text-red-600 hover:bg-white"
              onClick={() => onRemove(photo.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <div className="space-y-1 p-2 text-[11px]">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate font-medium">{photo.worker_name}</span>
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-muted dark:text-muted-foreground">
                {compositeStatusLabel(photo.composite_status)}
              </span>
            </div>
            <p className="truncate text-muted-foreground">
              {photo.attendance_date}
              {photo.project_name ? ` · ${photo.project_name}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RenameGroupDialog({
  groupId,
  name,
  remark,
  onNameChange,
  onRemarkChange,
  onClose,
}: {
  groupId: string;
  name: string;
  remark: string;
  onNameChange: (value: string) => void;
  onRemarkChange: (value: string) => void;
  onClose: () => void;
}) {
  const updateGroup = useUpdatePhotoGroupMutation();
  const save = async () => {
    if (!name.trim()) {
      toast.info("组名称不能为空");
      return;
    }
    try {
      await updateGroup.mutateAsync({
        groupId,
        payload: { name: name.trim(), remark: remark.trim() || "" },
      });
      toast.success("已保存");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>重命名照片处理组</DialogTitle>
          <DialogDescription>组名称会显示在左侧列表和考勤托管同步弹窗里。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="photo-group-name">组名称</Label>
            <Input
              id="photo-group-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="photo-group-remark">备注</Label>
            <textarea
              id="photo-group-remark"
              rows={3}
              value={remark}
              onChange={(event) => onRemarkChange(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
            disabled={updateGroup.isPending || !name.trim()}
            onClick={() => void save()}
          >
            {updateGroup.isPending ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
