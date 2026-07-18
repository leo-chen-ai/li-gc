import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarClock,
  ImagePlus,
  Loader2,
  Moon,
  Plus,
  Search,
  Sparkles,
  Sun,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProjectSearchSelect } from "@/features/projects/components/ProjectSearchSelect";
import {
  useProjectOptionsQuery,
  useProjectWorkersQuery,
} from "@/features/projects/hooks/use-construction-projects";
import {
  useCreateManagedAttendanceConfigMutation,
  useCreateManagedAttendancePhotoGroupMutation,
  useGenerateManagedAttendanceMutation,
  useManagedAttendanceConfigsQuery,
  useManagedAttendancePhotoGroupsQuery,
  useManagedAttendanceRecordsQuery,
} from "../hooks";
import {
  isManagedPhotoGroupReady,
  managedAttendanceShiftLabel,
  managedAttendanceStatusLabel,
  summarizeManagedAttendanceConfig,
} from "../lib";
import type {
  ManagedAttendanceConfig,
  ManagedAttendanceConfigPayload,
  ManagedAttendancePhotoGroupPayload,
  ManagedAttendanceShift,
} from "../types";

const PAGE_SIZE = 10;

type PhotoGroupForm = {
  name: string;
  inPhotos: string;
  outPhotos: string;
  remark: string;
};

type ConfigForm = {
  workerId: string;
  photoGroupId: string;
  monthlyAttendanceDays: string;
  shift: ManagedAttendanceShift;
  checkInTime: string;
  checkOutTime: string;
  remark: string;
};

const defaultPhotoGroupForm: PhotoGroupForm = {
  name: "",
  inPhotos: "",
  outPhotos: "",
  remark: "",
};

const defaultConfigForm: ConfigForm = {
  workerId: "",
  photoGroupId: "",
  monthlyAttendanceDays: "22",
  shift: "day",
  checkInTime: "08:00",
  checkOutTime: "18:00",
  remark: "",
};

export function ManagedAttendancePage() {
  const projectsQuery = useProjectOptionsQuery();
  const projects = projectsQuery.data ?? [];
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [keyword, setKeyword] = useState("");
  const [recordPage, setRecordPage] = useState(1);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [photoForm, setPhotoForm] = useState<PhotoGroupForm>(defaultPhotoGroupForm);
  const [configForm, setConfigForm] = useState<ConfigForm>(defaultConfigForm);

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0]?.id ?? "");
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    setRecordPage(1);
  }, [selectedProjectId, month, keyword]);

  const commonFilters = useMemo(
    () => ({
      project_id: selectedProjectId || undefined,
      keyword: keyword.trim() || undefined,
    }),
    [keyword, selectedProjectId]
  );
  const photoGroupsQuery = useManagedAttendancePhotoGroupsQuery({
    ...commonFilters,
    page: 1,
    page_size: 100,
  });
  const configsQuery = useManagedAttendanceConfigsQuery({
    ...commonFilters,
    page: 1,
    page_size: 100,
  });
  const recordsQuery = useManagedAttendanceRecordsQuery({
    ...commonFilters,
    month,
    page: recordPage,
    page_size: PAGE_SIZE,
  });
  const workersQuery = useProjectWorkersQuery(selectedProjectId, {
    page: 1,
    page_size: 100,
    work_status: 1,
  });
  const createPhotoGroup = useCreateManagedAttendancePhotoGroupMutation();
  const createConfig = useCreateManagedAttendanceConfigMutation();
  const generateRecords = useGenerateManagedAttendanceMutation();

  const photoGroups = photoGroupsQuery.data?.items ?? [];
  const configs = configsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const workers = workersQuery.data?.items ?? [];
  const readyPhotoGroupCount = photoGroups.filter(isManagedPhotoGroupReady).length;
  const enabledConfigCount = configs.filter((config) => config.is_enabled).length;
  const totalRecords = recordsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const rangeStart = totalRecords === 0 ? 0 : (recordPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(totalRecords, recordPage * PAGE_SIZE);
  const currentProject = projects.find((project) => project.id === selectedProjectId);
  const isSavingPhoto = createPhotoGroup.isPending;
  const isSavingConfig = createConfig.isPending;

  const openConfigDialog = () => {
    setConfigForm({
      ...defaultConfigForm,
      workerId: workers[0]?.id ?? "",
      photoGroupId: photoGroups[0]?.id ?? "",
    });
    setConfigDialogOpen(true);
  };

  const handlePhotoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProjectId) {
      toast.error("请选择项目");
      return;
    }
    const inPhotos = parsePhotoLines(photoForm.inPhotos);
    const outPhotos = parsePhotoLines(photoForm.outPhotos);
    if (!photoForm.name.trim()) {
      toast.error("请填写照片组名称");
      return;
    }
    if (inPhotos.length === 0 || outPhotos.length === 0) {
      toast.error("请至少填写一张进场和一张出场照片 URL");
      return;
    }

    const payload: ManagedAttendancePhotoGroupPayload = {
      project_id: selectedProjectId,
      name: photoForm.name.trim(),
      generation_status: "ready",
      in_photos: inPhotos,
      out_photos: outPhotos,
      remark: photoForm.remark.trim() || null,
    };

    try {
      await createPhotoGroup.mutateAsync(payload);
      toast.success("托管照片组已新增");
      setPhotoDialogOpen(false);
      setPhotoForm(defaultPhotoGroupForm);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "新增托管照片组失败");
    }
  };

  const handleConfigSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProjectId) {
      toast.error("请选择项目");
      return;
    }
    if (!configForm.workerId) {
      toast.error("请选择托管人员");
      return;
    }
    const monthlyAttendanceDays = Number(configForm.monthlyAttendanceDays);
    if (!Number.isInteger(monthlyAttendanceDays) || monthlyAttendanceDays < 1 || monthlyAttendanceDays > 31) {
      toast.error("月出勤天数需为 1 到 31");
      return;
    }

    const payload: ManagedAttendanceConfigPayload = {
      project_id: selectedProjectId,
      worker_id: configForm.workerId,
      photo_group_id: configForm.photoGroupId || null,
      monthly_attendance_days: monthlyAttendanceDays,
      shift: configForm.shift,
      check_in_time: configForm.checkInTime,
      check_out_time: configForm.checkOutTime,
      is_enabled: true,
      remark: configForm.remark.trim() || null,
    };

    try {
      await createConfig.mutateAsync(payload);
      toast.success("托管配置已新增");
      setConfigDialogOpen(false);
      setConfigForm(defaultConfigForm);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "新增托管配置失败");
    }
  };

  const handleGenerate = async (config: ManagedAttendanceConfig) => {
    try {
      const result = await generateRecords.mutateAsync({ configId: config.id, month });
      toast.success(`已生成 ${result.generated_count} 条托管记录`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成托管记录失败");
    }
  };

  return (
    <div className="space-y-4 text-slate-950 dark:text-foreground">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="grid gap-4 border-b border-slate-100 px-5 py-4 dark:border-border lg:grid-cols-[minmax(260px,0.9fr)_minmax(440px,1.1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              <CalendarClock className="size-3.5" />
              考勤托管
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-normal">自动托管</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
              按项目维护人员托管规则、照片组和月度生成记录。
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <CompactStat label="托管配置" value={configs.length} helper={`${enabledConfigCount} 个启用`} />
            <CompactStat label="照片组" value={photoGroups.length} helper={`${readyPhotoGroupCount} 组可用`} accent="teal" />
            <CompactStat label="本月记录" value={totalRecords} helper={month} accent="amber" />
            <CompactStat label="当前项目" value={currentProject?.name ? "已选" : "待选"} helper={currentProject?.name || "请选择项目"} accent="blue" />
          </div>

          <div className="flex flex-wrap gap-2 justify-self-start lg:justify-self-end">
            <Button
              className="h-9 gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
              onClick={() => setPhotoDialogOpen(true)}
              disabled={!selectedProjectId}
            >
              <ImagePlus className="size-4" />
              新增照片组
            </Button>
            <Button
              className="h-9 gap-2 bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
              onClick={openConfigDialog}
              disabled={!selectedProjectId || workers.length === 0}
            >
              <Plus className="size-4" />
              新增配置
            </Button>
          </div>
        </div>

        <div className="grid gap-3 bg-[#f8faf9] px-5 py-3 dark:bg-muted/30 lg:grid-cols-[minmax(280px,1.3fr)_180px_minmax(240px,1fr)]">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">项目</span>
            <ProjectSearchSelect
              value={selectedProjectId}
              onValueChange={setSelectedProjectId}
              disabled={projectsQuery.isLoading}
              allOptionLabel={projectsQuery.isError ? "项目加载失败" : "请选择项目"}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">生成月份</span>
            <Input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value || currentMonth())}
              className="h-10 rounded-lg border-slate-200 bg-white focus-visible:border-[#0f6b5d] focus-visible:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">搜索</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索人员、照片组、项目"
                className="h-10 rounded-lg border-slate-200 bg-white pl-9 focus-visible:border-[#0f6b5d] focus-visible:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
              />
            </div>
          </label>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
          <SectionHeader
            icon={<CalendarClock className="size-4" />}
            title="托管配置"
            description="按人员配置月出勤天数、班次时间和照片组。"
            loading={configsQuery.isFetching}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>人员</TableHead>
                <TableHead>规则</TableHead>
                <TableHead>照片组</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell>
                    <div className="font-medium">{config.worker_name || "未命名人员"}</div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">{config.worker_id_card || "身份证未填"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{summarizeManagedAttendanceConfig(config)}</div>
                    {config.remark ? <div className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">{config.remark}</div> : null}
                  </TableCell>
                  <TableCell>{config.photo_group_name || "未选择"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={config.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" : "border-slate-200 bg-slate-50 text-slate-600"}>
                      {config.is_enabled ? "启用" : "停用"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-2"
                      onClick={() => handleGenerate(config)}
                      disabled={generateRecords.isPending || !config.is_enabled}
                    >
                      {generateRecords.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                      生成
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {configs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm text-slate-500 dark:text-muted-foreground">
                    {configsQuery.isLoading ? "托管配置加载中" : "暂无托管配置"}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
          <SectionHeader
            icon={<ImagePlus className="size-4" />}
            title="照片组"
            description="保存进场和出场照片 URL，后续可接 AI 生图。"
            loading={photoGroupsQuery.isFetching}
          />
          <div className="divide-y divide-slate-100 dark:divide-border">
            {photoGroups.map((group) => (
              <div key={group.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{group.name}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                      进场 {group.in_photos?.length ?? 0} 张 / 出场 {group.out_photos?.length ?? 0} 张
                    </div>
                  </div>
                  <Badge variant="outline" className={isManagedPhotoGroupReady(group) ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"}>
                    {isManagedPhotoGroupReady(group) ? "可用" : "待补图"}
                  </Badge>
                </div>
                {group.remark ? <div className="mt-2 text-xs text-slate-500 dark:text-muted-foreground">{group.remark}</div> : null}
              </div>
            ))}
            {photoGroups.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-muted-foreground">
                {photoGroupsQuery.isLoading ? "照片组加载中" : "暂无照片组"}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <SectionHeader
          icon={<Sparkles className="size-4" />}
          title="托管数据"
          description="展示已按配置生成的托管考勤记录。"
          loading={recordsQuery.isFetching}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>人员</TableHead>
              <TableHead>日期</TableHead>
              <TableHead>方向</TableHead>
              <TableHead>计划时间</TableHead>
              <TableHead>照片</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>
                  <div className="font-medium">{record.worker_name || "未命名人员"}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">{record.worker_id_card_mask || "身份证未填"}</div>
                </TableCell>
                <TableCell>{record.attendance_date}</TableCell>
                <TableCell>
                  <DirectionBadge direction={record.direction} shift={record.shift} />
                </TableCell>
                <TableCell>{formatDateTime(record.planned_at)}</TableCell>
                <TableCell>
                  {record.photo_url ? (
                    <a className="text-[#0f6b5d] hover:underline" href={record.photo_url} target="_blank" rel="noreferrer">
                      查看照片
                    </a>
                  ) : (
                    <span className="text-slate-400">未配置</span>
                  )}
                </TableCell>
                <TableCell>{managedAttendanceStatusLabel(record.status)}</TableCell>
              </TableRow>
            ))}
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-slate-500 dark:text-muted-foreground">
                  {recordsQuery.isLoading ? "托管数据加载中" : "暂无托管数据"}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-[#f8faf9] px-5 py-3 text-sm dark:border-border dark:bg-muted/30">
          <span className="text-slate-500 dark:text-muted-foreground">
            显示 {rangeStart}-{rangeEnd} 条，共 {totalRecords} 条
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={recordPage <= 1} onClick={() => setRecordPage((value) => Math.max(1, value - 1))}>
              上一页
            </Button>
            <span className="text-xs text-slate-500 dark:text-muted-foreground">
              {recordPage} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={recordPage >= totalPages} onClick={() => setRecordPage((value) => Math.min(totalPages, value + 1))}>
              下一页
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={handlePhotoSubmit}>
            <DialogHeader>
              <DialogTitle>新增托管照片组</DialogTitle>
              <DialogDescription>按行或逗号粘贴进场、出场照片 URL。</DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-4">
              <label className="space-y-1">
                <Label>照片组名称</Label>
                <Input value={photoForm.name} onChange={(event) => setPhotoForm((current) => ({ ...current, name: event.target.value }))} placeholder="例如：张三夜班照片组" />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <Label>进场照片 URL</Label>
                  <textarea
                    value={photoForm.inPhotos}
                    onChange={(event) => setPhotoForm((current) => ({ ...current, inPhotos: event.target.value }))}
                    className="min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
                  />
                </label>
                <label className="space-y-1">
                  <Label>出场照片 URL</Label>
                  <textarea
                    value={photoForm.outPhotos}
                    onChange={(event) => setPhotoForm((current) => ({ ...current, outPhotos: event.target.value }))}
                    className="min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
                  />
                </label>
              </div>
              <label className="space-y-1">
                <Label>备注</Label>
                <Input value={photoForm.remark} onChange={(event) => setPhotoForm((current) => ({ ...current, remark: event.target.value }))} placeholder="可填写生成批次、服装或使用场景" />
              </label>
            </div>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setPhotoDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]" disabled={isSavingPhoto}>
                {isSavingPhoto ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                保存照片组
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={handleConfigSubmit}>
            <DialogHeader>
              <DialogTitle>新增托管配置</DialogTitle>
              <DialogDescription>为项目人员配置月度托管生成规则。</DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <Label>托管人员</Label>
                <Select value={configForm.workerId} onValueChange={(workerId) => setConfigForm((current) => ({ ...current, workerId }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={workersQuery.isLoading ? "人员加载中" : "请选择人员"} />
                  </SelectTrigger>
                  <SelectContent>
                    {workers.map((worker) => (
                      <SelectItem key={worker.id} value={worker.id}>
                        {worker.name || worker.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1">
                <Label>照片组</Label>
                <Select value={configForm.photoGroupId || "__none__"} onValueChange={(photoGroupId) => setConfigForm((current) => ({ ...current, photoGroupId: photoGroupId === "__none__" ? "" : photoGroupId }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择照片组" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">暂不选择</SelectItem>
                    {photoGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1">
                <Label>月出勤天数</Label>
                <Input type="number" min={1} max={31} value={configForm.monthlyAttendanceDays} onChange={(event) => setConfigForm((current) => ({ ...current, monthlyAttendanceDays: event.target.value }))} />
              </label>
              <label className="space-y-1">
                <Label>班次</Label>
                <Select value={configForm.shift} onValueChange={(shift) => setConfigForm((current) => ({ ...current, shift: shift as ManagedAttendanceShift }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">白班</SelectItem>
                    <SelectItem value="night">夜班</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1">
                <Label>进场时间</Label>
                <Input type="time" value={configForm.checkInTime} onChange={(event) => setConfigForm((current) => ({ ...current, checkInTime: event.target.value }))} />
              </label>
              <label className="space-y-1">
                <Label>出场时间</Label>
                <Input type="time" value={configForm.checkOutTime} onChange={(event) => setConfigForm((current) => ({ ...current, checkOutTime: event.target.value }))} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <Label>备注</Label>
                <Input value={configForm.remark} onChange={(event) => setConfigForm((current) => ({ ...current, remark: event.target.value }))} placeholder="例如：张三夜班托管" />
              </label>
            </div>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setConfigDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]" disabled={isSavingConfig}>
                {isSavingConfig ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                保存配置
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompactStat({
  label,
  value,
  helper,
  accent = "slate",
}: {
  label: string;
  value: string | number;
  helper: string;
  accent?: "slate" | "teal" | "amber" | "blue";
}) {
  const accentClass =
    accent === "teal"
      ? "text-[#0f6b5d]"
      : accent === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : accent === "blue"
          ? "text-sky-700 dark:text-sky-300"
          : "text-slate-900 dark:text-foreground";

  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-border dark:bg-background">
      <div className="text-xs text-slate-500 dark:text-muted-foreground">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold ${accentClass}`}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-muted-foreground" title={helper}>{helper}</div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  description,
  loading,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  loading?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-border">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-[#0f6b5d]">{icon}</span>
          {title}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">{description}</p>
      </div>
      {loading ? <Loader2 className="mt-0.5 size-4 animate-spin text-slate-400" /> : null}
    </div>
  );
}

function DirectionBadge({
  direction,
  shift,
}: {
  direction: 0 | 1;
  shift: ManagedAttendanceShift;
}) {
  const isIn = direction === 0;
  return (
    <Badge variant="outline" className={isIn ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"}>
      {shift === "night" ? <Moon className="mr-1 size-3" /> : <Sun className="mr-1 size-3" />}
      {managedAttendanceShiftLabel(shift)} · {isIn ? "进场" : "出场"}
    </Badge>
  );
}

function parsePhotoLines(value: string) {
  return value
    .split(/[\n,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function currentMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
