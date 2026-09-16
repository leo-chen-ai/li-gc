import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  MapPinned,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
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
import { apiClient } from "@/lib/api";
import {
  loadAMap,
  type AMapConstructor,
  type AMapMap,
  type AMapMarker,
  type AMapPoi,
  type AMapPolygon,
} from "@/lib/amap";
import { cn } from "@/lib/utils";

type Vertex = { longitude: number; latitude: number };
type Settings = {
  worker_attendance_enabled: boolean;
  require_location: boolean;
  require_face: boolean;
};
type Area = {
  id: string;
  name: string;
  polygon: Vertex[];
  coordinate_system: string;
  is_enabled: boolean;
  remark: string | null;
};
type Config = { settings: Settings; areas: Area[] };
type ApiResponse<T> = { success?: boolean; data?: T; message?: string };

const defaultSettings: Settings = {
  worker_attendance_enabled: false,
  require_location: true,
  require_face: true,
};

function orderPolygonVertices(points: Vertex[]): Vertex[] {
  if (points.length < 3) return points;
  const center = points.reduce(
    (sum, point) => ({
      longitude: sum.longitude + point.longitude / points.length,
      latitude: sum.latitude + point.latitude / points.length,
    }),
    { longitude: 0, latitude: 0 },
  );
  return [...points].sort(
    (a, b) =>
      Math.atan2(b.latitude - center.latitude, b.longitude - center.longitude) -
      Math.atan2(a.latitude - center.latitude, a.longitude - center.longitude),
  );
}

function unwrap<T>(response: ApiResponse<T>, fallback: string): T {
  if (response?.success !== false && response?.data !== undefined)
    return response.data;
  throw new Error(response?.message || fallback);
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        checked ? "bg-[#0f6b5d]" : "bg-slate-300",
      )}
    >
      <span
        className={cn(
          "size-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

export function AttendanceGeofencePanel({
  projectId,
  longitude,
  latitude,
}: {
  projectId: string;
  longitude?: string | null;
  latitude?: string | null;
}) {
  const queryClient = useQueryClient();
  const base = `/management/projects/${projectId}`;
  const [settingsOverride, setSettingsOverride] = useState<Settings | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Area | null>(null);
  const [name, setName] = useState("");
  const [remark, setRemark] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [vertices, setVertices] = useState<Vertex[]>([]);

  const configQuery = useQuery({
    queryKey: ["attendance-geofence-config", projectId],
    queryFn: async () =>
      unwrap(
        (
          await apiClient.get<ApiResponse<Config>>(
            `${base}/attendance-geofence-config`,
          )
        ).data,
        "获取电子围栏配置失败",
      ),
  });
  const settings =
    settingsOverride ?? configQuery.data?.settings ?? defaultSettings;
  const updateSettings = (update: (current: Settings) => Settings) =>
    setSettingsOverride(update(settings));

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["attendance-geofence-config", projectId],
    });
  const settingsMutation = useMutation({
    mutationFn: async (next: Settings) =>
      unwrap(
        (
          await apiClient.put<ApiResponse<Settings>>(
            `${base}/attendance-geofence-config`,
            next,
          )
        ).data,
        "保存打卡规则失败",
      ),
    onSuccess: () => {
      setSettingsOverride(null);
      toast.success("工人打卡规则已保存");
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "保存打卡规则失败"),
  });
  const areaMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        remark: remark.trim(),
        is_enabled: enabled,
        polygon: orderPolygonVertices(vertices),
      };
      const response = editing
        ? await apiClient.patch<ApiResponse<Area>>(
            `${base}/attendance-geofences/${editing.id}`,
            payload,
          )
        : await apiClient.post<ApiResponse<Area>>(
            `${base}/attendance-geofences`,
            payload,
          );
      return unwrap(response.data, "保存考勤区域失败");
    },
    onSuccess: () => {
      toast.success(editing ? "考勤区域已更新" : "考勤区域已新增");
      setDialogOpen(false);
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "保存考勤区域失败"),
  });
  const deleteMutation = useMutation({
    mutationFn: (area: Area) =>
      apiClient.delete(`${base}/attendance-geofences/${area.id}`),
    onSuccess: () => {
      toast.success("考勤区域已删除");
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "删除考勤区域失败"),
  });
  const toggleAreaMutation = useMutation({
    mutationFn: async (area: Area) =>
      unwrap(
        (
          await apiClient.patch<ApiResponse<Area>>(
            `${base}/attendance-geofences/${area.id}`,
            {
              name: area.name,
              remark: area.remark ?? "",
              polygon: area.polygon,
              is_enabled: !area.is_enabled,
            },
          )
        ).data,
        "切换考勤区域状态失败",
      ),
    onSuccess: (area) => {
      toast.success(area.is_enabled ? "考勤区域已启用" : "考勤区域已停用");
      void invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "切换考勤区域状态失败",
      ),
  });

  const openArea = (area?: Area) => {
    setEditing(area ?? null);
    setName(area?.name ?? "");
    setRemark(area?.remark ?? "");
    setEnabled(area?.is_enabled ?? true);
    setVertices(orderPolygonVertices(area?.polygon ?? []));
    setDialogOpen(true);
  };
  const saveSettings = () => settingsMutation.mutate(settings);
  const areas = configQuery.data?.areas ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 px-4 py-3 dark:border-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-semibold">工人打卡服务</h3>
            <p className="text-xs text-slate-500">
              控制工人小程序是否允许打卡及每次打卡的校验要求。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {settings.worker_attendance_enabled ? "已开启" : "已关闭"}
            </span>
            <Toggle
              checked={settings.worker_attendance_enabled}
              label="工人打卡服务"
              onChange={() =>
                updateSettings((value) => ({
                  ...value,
                  worker_attendance_enabled: !value.worker_attendance_enabled,
                }))
              }
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md bg-slate-50 px-3 py-2 dark:bg-muted/30">
          <div className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[#0f6b5d]"
                checked={settings.require_location}
                onChange={(event) =>
                  updateSettings((value) => ({
                    ...value,
                    require_location: event.target.checked,
                  }))
                }
              />
              定位校验（必须位于任一启用电子围栏内）
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[#0f6b5d]"
                checked={settings.require_face}
                onChange={(event) =>
                  updateSettings((value) => ({
                    ...value,
                    require_face: event.target.checked,
                  }))
                }
              />
              人脸校验
            </label>
          </div>
          <Button
            size="sm"
            disabled={settingsMutation.isPending}
            onClick={saveSettings}
            className="h-8 bg-[#0f6b5d] hover:bg-[#0b5148]"
          >
            保存规则
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 dark:border-border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="font-semibold">考勤区域</h3>
            <p className="mt-1 text-xs text-slate-500">
              每个区域由至少 3 个地图顶点围成，多区域之间满足任意一个即可。
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => openArea()}
            className="gap-2 bg-[#0f6b5d] hover:bg-[#0b5148]"
          >
            <Plus className="size-4" />
            新增区域
          </Button>
        </div>
        {configQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">
            配置加载中...
          </div>
        ) : areas.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            <MapPinned className="mx-auto mb-2 size-8" />
            暂无考勤区域
          </div>
        ) : (
          <div className="divide-y">
            {areas.map((area) => (
              <div
                key={area.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <MapPinned className="size-5 text-[#0f6b5d]" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{area.name}</div>
                  <div className="text-xs text-slate-500">
                    {area.polygon.length} 个顶点 · GCJ-02
                    {area.remark ? ` · ${area.remark}` : ""}
                  </div>
                </div>
                <Toggle
                  checked={area.is_enabled}
                  label={`${area.name}启用状态`}
                  onChange={() => toggleAreaMutation.mutate(area)}
                />
                <Badge
                  variant="outline"
                  className={
                    area.is_enabled
                      ? "border-emerald-300 text-emerald-700"
                      : "text-slate-400"
                  }
                >
                  {area.is_enabled ? "已启用" : "已停用"}
                </Badge>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => openArea(area)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`确认删除考勤区域「${area.name}」？`))
                      deleteMutation.mutate(area);
                  }}
                >
                  <Trash2 className="size-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "编辑考勤区域" : "新增考勤区域"}
            </DialogTitle>
            <DialogDescription>
              在地图上依次点击至少 3 个点，系统会按顺序连接并自动闭合成多边形。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>区域名称</Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="如：施工现场范围"
              />
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Input
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                placeholder="选填"
              />
            </div>
          </div>
          <PolygonEditor
            vertices={vertices}
            onChange={setVertices}
            longitude={longitude}
            latitude={latitude}
          />
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <div className="text-sm font-medium">启用区域</div>
              <div className="text-xs text-slate-500">
                停用后不参与工人定位判断
              </div>
            </div>
            <Toggle
              checked={enabled}
              label="启用考勤区域"
              onChange={() => setEnabled((value) => !value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-[#0f6b5d] hover:bg-[#0b5148]"
              disabled={
                !name.trim() || vertices.length < 3 || areaMutation.isPending
              }
              onClick={() => areaMutation.mutate()}
            >
              {areaMutation.isPending ? "保存中..." : "保存区域"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PolygonEditor({
  vertices,
  onChange,
  longitude,
  latitude,
}: {
  vertices: Vertex[];
  onChange: (value: Vertex[]) => void;
  longitude?: string | null;
  latitude?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const amapRef = useRef<AMapConstructor | null>(null);
  const overlaysRef = useRef<Array<AMapMarker | AMapPolygon>>([]);
  const latestVertices = useRef(vertices);
  const [mapReady, setMapReady] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<AMapPoi[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
    latestVertices.current = vertices;
  }, [onChange, vertices]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    loadAMap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;
        amapRef.current = AMap;
        const lng = Number(longitude) || 118.8;
        const lat = Number(latitude) || 32.06;
        const map = new AMap.Map(containerRef.current, {
          zoom: 16,
          center: [lng, lat],
        });
        mapRef.current = map;
        setMapReady(true);
        map.on("click", (event) => {
          const point = event.lnglat;
          if (point) {
            onChangeRef.current(
              orderPolygonVertices([
                ...latestVertices.current,
                { longitude: point.getLng(), latitude: point.getLat() },
              ]),
            );
          }
        });
      })
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "地图加载失败"),
      );
    return () => {
      cancelled = true;
      setMapReady(false);
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!map || !AMap) return;
    if (overlaysRef.current.length) map.remove(overlaysRef.current);
    const path = vertices.map(
      (point) => [point.longitude, point.latitude] as [number, number],
    );
    const polygon =
      vertices.length >= 2
        ? new AMap.Polygon({
            path,
            strokeColor: "#0f6b5d",
            strokeWeight: 3,
            fillColor: "#10b981",
            fillOpacity: 0.2,
          })
        : null;
    const markers = vertices.map((point, index) => {
      const marker = new AMap.Marker({
        position: [point.longitude, point.latitude],
        draggable: true,
        label: { content: `${index + 1}`, direction: "top" },
      });
      marker.on("dragend", () => {
        const position = marker.getPosition();
        if (!position) return;
        onChangeRef.current(
          orderPolygonVertices(
            latestVertices.current.map((item, itemIndex) =>
              itemIndex === index
                ? { longitude: position.getLng(), latitude: position.getLat() }
                : item,
            ),
          ),
        );
      });
      return marker;
    });
    overlaysRef.current = polygon ? [polygon, ...markers] : markers;
    if (overlaysRef.current.length) {
      map.add(...overlaysRef.current);
      map.setFitView(overlaysRef.current);
    }
  }, [mapReady, vertices]);

  const searchLocation = () => {
    const keyword = searchKeyword.trim();
    const AMap = amapRef.current;
    if (!keyword || !AMap || searching) return;
    if (typeof AMap.PlaceSearch !== "function") {
      setSearchError("搜索插件未加载，请刷新重试");
      return;
    }
    setSearching(true);
    setSearchError("");
    const placeSearch = new AMap.PlaceSearch({ pageSize: 8, pageIndex: 1 });
    placeSearch.search(keyword, (status, result) => {
      let pois = result?.pois;
      if (!pois && result?.poiList)
        pois = Array.isArray(result.poiList)
          ? result.poiList
          : result.poiList.pois;
      const nextResults = pois ?? [];
      setSearching(false);
      setSearchResults(nextResults);
      if (status !== "complete" || nextResults.length === 0)
        setSearchError("未搜索到相关位置，请换个关键词");
    });
  };

  const chooseLocation = (poi: AMapPoi) => {
    const lng =
      typeof poi.location.getLng === "function"
        ? poi.location.getLng()
        : (poi.location as unknown as number[])[0];
    const lat =
      typeof poi.location.getLat === "function"
        ? poi.location.getLat()
        : (poi.location as unknown as number[])[1];
    mapRef.current?.setZoom(17);
    mapRef.current?.panTo([lng, lat]);
    setSearchKeyword(poi.name);
    setSearchResults([]);
    setSearchError("");
  };

  return (
    <div className="space-y-2">
      <div className="relative h-[430px] overflow-hidden rounded-lg border">
        <div ref={containerRef} className="h-full w-full" />
        <div
          className="absolute left-3 top-3 z-10 w-[min(420px,calc(100%-24px))]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex rounded-md bg-white shadow">
            <Input
              value={searchKeyword}
              onChange={(event) => {
                setSearchKeyword(event.target.value);
                setSearchResults([]);
                setSearchError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  searchLocation();
                }
              }}
              placeholder="搜索项目、道路或地址"
              className="h-9 rounded-r-none border-0 bg-white focus-visible:ring-0"
            />
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-l-none bg-[#0f6b5d] px-3 hover:bg-[#0b5148]"
              disabled={!searchKeyword.trim() || searching}
              onClick={searchLocation}
            >
              {searching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              <span className="ml-1">搜索</span>
            </Button>
          </div>
          {searchResults.length > 0 ? (
            <div className="mt-1 max-h-60 overflow-y-auto rounded-md bg-white py-1 shadow-lg">
              {searchResults.map((poi, index) => (
                <button
                  key={poi.id || `${poi.name}-${index}`}
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                  onClick={() => chooseLocation(poi)}
                >
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {poi.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {[poi.pname, poi.cityname, poi.adname, poi.address]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {searchError ? (
            <div className="mt-1 rounded bg-white px-3 py-2 text-xs text-red-500 shadow">
              {searchError}
            </div>
          ) : null}
        </div>
        <div className="absolute bottom-3 left-3 rounded bg-white/95 px-3 py-2 text-xs shadow">
          点击地图添加顶点，拖动编号点微调
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          已选择 {vertices.length} 个顶点
          {vertices.length < 3 ? "，还需至少 3 个" : "，区域已闭合"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!vertices.length}
          onClick={() => onChange(vertices.slice(0, -1))}
        >
          <X className="mr-1 size-3" />
          撤销一点
        </Button>
      </div>
    </div>
  );
}
