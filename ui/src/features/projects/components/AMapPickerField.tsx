import { Loader2, MapPin, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadAMap, type AMapConstructor, type AMapMap, type AMapMarker, type AMapPoi } from "@/lib/amap";
import type { ConstructionFormState } from "../data/construction-form-fields";

export type PickedLocation = {
  longitude: string;
  latitude: string;
  poiName: string;
  address: string;
};

// 地图定位字段：点击选择位置，结果写入表单 state 的
// longitude / latitude / map_poi_name / map_address（均为 hidden 字段随表单提交）
export function AMapPickerField({
  state,
  onBulkChange,
}: {
  state: ConstructionFormState;
  onBulkChange?: (values: Record<string, string>) => void;
}) {
  const longitude = state.longitude ?? "";
  const latitude = state.latitude ?? "";
  const poiName = state.map_poi_name ?? "";
  const mapAddress = state.map_address ?? "";
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasLocation = Boolean(longitude && latitude);

  const applyLocation = (location: PickedLocation) => {
    onBulkChange?.({
      longitude: location.longitude,
      latitude: location.latitude,
      map_poi_name: location.poiName,
      map_address: location.address,
    });
  };

  const clearLocation = () => {
    onBulkChange?.({
      longitude: "",
      latitude: "",
      map_poi_name: "",
      map_address: "",
    });
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-border dark:bg-background">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-2 border-slate-200 bg-white dark:border-border dark:bg-background"
          onClick={() => setPickerOpen(true)}
        >
          <MapPin className="size-4" />
          {hasLocation ? "重新选择位置" : "选择地图位置"}
        </Button>
        {hasLocation ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-slate-500 hover:bg-red-50 hover:text-red-600"
            onClick={clearLocation}
          >
            清除定位
          </Button>
        ) : null}
        <span className="text-xs text-slate-400 dark:text-muted-foreground">
          用于数据大屏在地图上定位项目位置
        </span>
      </div>
      {hasLocation ? (
        <div className="mt-2 min-h-4 break-all text-xs text-slate-500 dark:text-muted-foreground">
          {[poiName || mapAddress, `${Number(longitude).toFixed(6)}, ${Number(latitude).toFixed(6)}`]
            .filter(Boolean)
            .join(" · ")}
        </div>
      ) : (
        <div className="mt-2 min-h-4 text-xs text-slate-400 dark:text-muted-foreground">未选择位置</div>
      )}
      {pickerOpen ? (
        <AMapLocationPickerOverlay
          initialLongitude={longitude}
          initialLatitude={latitude}
          initialPoiName={poiName}
          initialAddress={mapAddress}
          onClose={() => setPickerOpen(false)}
          onConfirm={(location) => {
            applyLocation(location);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

// 唯一 ID 计数器，防止 StrictMode 双挂载时两个地图实例抢同一个 DOM
let mapIdSeq = 0;

// 地图选点弹层：搜索地点 / 点击地图 / 拖拽 marker 微调
// 注意：弹层渲染在外层 <label> 内部，必须用自绘 fixed 遮罩（不能 Portal），
// 且遮罩 onClick 需 preventDefault，避免 label 把点击转发给表单控件（同 SignaturePadDialog）
function AMapLocationPickerOverlay({
  initialLongitude,
  initialLatitude,
  initialPoiName,
  initialAddress,
  onClose,
  onConfirm,
}: {
  initialLongitude: string;
  initialLatitude: string;
  initialPoiName: string;
  initialAddress: string;
  onClose: () => void;
  onConfirm: (location: PickedLocation) => void;
}) {
  // 每次 overlay 挂载拿一个唯一 ID，保证 StrictMode 双挂载不会冲突
  const [mapId] = useState(() => `amap-picker-${++mapIdSeq}`);
  const amapRef = useRef<AMapConstructor | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const markerRef = useRef<AMapMarker | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<AMapPoi[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PickedLocation | null>(
    initialLongitude && initialLatitude
      ? {
          longitude: initialLongitude,
          latitude: initialLatitude,
          poiName: initialPoiName,
          address: initialAddress,
        }
      : null
  );

  // 逆地理编码取地名：高德服务偶发超时/限流导致失败，
  // 自动重试，最终失败给出提示和手动重试入口，避免地名静默丢失。
  // seq 用于丢弃过期请求（用户快速连续点图时只采纳最后一次）。
  const geocodeSeqRef = useRef(0);
  const [nameStatus, setNameStatus] = useState<"idle" | "loading" | "failed">("idle");

  const fillLocationName = useCallback((lng: number, lat: number) => {
    const seq = ++geocodeSeqRef.current;
    setNameStatus("loading");

    const attempt = (retriesLeft: number) => {
      const AMap = amapRef.current;
      if (!AMap) return;
      if (typeof AMap.Geocoder !== "function") {
        // 2.0 下插件可能延迟就绪，按需补加载后重试一次
        if (AMap.plugin && retriesLeft > 0) {
          AMap.plugin(["AMap.Geocoder"], () => {
            if (seq === geocodeSeqRef.current) attempt(retriesLeft - 1);
          });
          return;
        }
        setNameStatus("failed");
        return;
      }
      const geocoder = new AMap.Geocoder();
      geocoder.getAddress([lng, lat], (status, result) => {
        if (seq !== geocodeSeqRef.current) return;
        if (status === "complete" && result.regeocode) {
          const formattedAddress = result.regeocode.formattedAddress ?? "";
          const nearestPoiName = result.regeocode.pois?.[0]?.name ?? "";
          setNameStatus("idle");
          setSelected((current) =>
            current
              ? { ...current, address: formattedAddress || current.address, poiName: nearestPoiName || current.poiName }
              : current
          );
          return;
        }
        if (retriesLeft > 0) {
          window.setTimeout(() => {
            if (seq === geocodeSeqRef.current) attempt(retriesLeft - 1);
          }, 600);
          return;
        }
        setNameStatus("failed");
      });
    };

    attempt(2);
  }, []);

  const placeMarker = useCallback((AMap: AMapConstructor, map: AMapMap, lng: number, lat: number) => {
    if (markerRef.current) {
      markerRef.current.setPosition([lng, lat]);
      return;
    }
    const marker = new AMap.Marker({ position: [lng, lat], draggable: true });
    marker.on("dragend", () => {
      const position = marker.getPosition();
      if (!position) return;
      const nextLng = position.getLng();
      const nextLat = position.getLat();
      setSelected({
        longitude: nextLng.toFixed(6),
        latitude: nextLat.toFixed(6),
        poiName: "",
        address: "",
      });
      fillLocationName(nextLng, nextLat);
    });
    map.add(marker);
    markerRef.current = marker;
  }, [fillLocationName]);

  useEffect(() => {
    let disposed = false;
    const id = mapId;

    loadAMap()
      .then((AMap) => {
        if (disposed) return;
        const container = document.getElementById(id);
        if (!container) return;
        // 防 double init：如果已有地图实例且容器内有 canvas，跳过
        if (mapRef.current && container.querySelector("canvas")) return;
        // 清理上一个可能残留的实例
        if (mapRef.current) {
          mapRef.current.destroy();
          mapRef.current = null;
          markerRef.current = null;
        }
        amapRef.current = AMap;
        const center: [number, number] | undefined =
          initialLongitude && initialLatitude
            ? [Number(initialLongitude), Number(initialLatitude)]
            : undefined;
        const map = new AMap.Map(container, {
          zoom: center ? 15 : 4,
          center,
          viewMode: "2D",
        });
        mapRef.current = map;

        if (center) {
          placeMarker(AMap, map, center[0], center[1]);
        }

        map.on("click", (event) => {
          const lng = event.lnglat.getLng();
          const lat = event.lnglat.getLat();
          placeMarker(AMap, map, lng, lat);
          setSelected({ longitude: lng.toFixed(6), latitude: lat.toFixed(6), poiName: "", address: "" });
          fillLocationName(lng, lat);
        });

        setLoading(false);
      })
      .catch((loadError) => {
        if (disposed) return;
        setError(loadError instanceof Error ? loadError.message : "高德地图加载失败");
        setLoading(false);
      });

    return () => {
      disposed = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    const keyword = searchKeyword.trim();
    const AMap = amapRef.current;
    if (!keyword || !AMap) return;
    if (typeof AMap.PlaceSearch !== "function") {
      setSearchError("搜索插件未加载，请刷新重试");
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const placeSearch = new AMap.PlaceSearch({ pageSize: 8, pageIndex: 1 });
      placeSearch.search(keyword, (status, result) => {
        // AMap 1.x: result.pois 直接是数组
        // AMap 2.x: result.poiList 是 { pois: [], count, pageIndex, pageSize }
        // 兼容两种格式
        let pois: AMapPoi[] | undefined = result?.pois;
        if (!pois && result?.poiList) {
          pois = Array.isArray(result.poiList) ? result.poiList : result.poiList.pois;
        }
        pois = pois ?? [];
        setSearching(false);
        if (status === "complete" && pois.length > 0) {
          setSearchResults(pois);
        } else {
          setSearchResults([]);
          setSearchError(status === "no_data" || pois.length === 0 ? "未搜索到相关地点，请换个关键词试试" : `搜索失败：${status}`);
        }
      });
    } catch (err) {
      setSearching(false);
      setSearchError(`搜索异常：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const choosePoi = (poi: AMapPoi) => {
    // AMap 1.x location 是 LngLat 对象（有 getLng/getLat），2.x 可能是 [lng, lat] 数组
    const lng = typeof poi.location.getLng === "function" ? poi.location.getLng() : (poi.location as unknown as number[])[0];
    const lat = typeof poi.location.getLat === "function" ? poi.location.getLat() : (poi.location as unknown as number[])[1];
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (map && AMap) {
      map.setZoom(16);
      map.panTo([lng, lat]);
      placeMarker(AMap, map, lng, lat);
    }
    const regionAddress = [poi.pname, poi.cityname, poi.adname].filter(Boolean).join("");
    setNameStatus("idle");
    setSelected({
      longitude: lng.toFixed(6),
      latitude: lat.toFixed(6),
      poiName: poi.name,
      address: poi.address || regionAddress,
    });
    setSearchResults([]);
    setSearchKeyword(poi.name);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
      onClick={(event) => event.preventDefault()}
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl dark:bg-card">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-border">
          <div>
            <h3 className="text-base font-semibold text-slate-950 dark:text-foreground">选择项目位置</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">
              搜索地点或点击地图选点，拖拽标记可微调位置。
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
            <X className="size-5" />
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="relative flex gap-2">
            <Input
              value={searchKeyword}
              placeholder="输入地点名称搜索（大厦、小区、道路等）"
              onChange={(event) => setSearchKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSearch();
              }}
              className="h-9"
            />
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-2 border-slate-200 bg-white dark:border-border dark:bg-background"
              onClick={handleSearch}
              disabled={searching || loading}
            >
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              搜索
            </Button>
            {searchResults.length > 0 ? (
              <div className="absolute left-0 right-0 top-11 z-10 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-border dark:bg-card">
                {searchResults.map((poi) => (
                  <button
                    key={poi.id ?? `${poi.name}-${poi.address}`}
                    type="button"
                    className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50 dark:border-border/50 dark:hover:bg-muted/50"
                    onClick={() => choosePoi(poi)}
                  >
                    <div className="font-medium text-slate-900 dark:text-foreground">{poi.name}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-muted-foreground">
                      {[poi.pname, poi.cityname, poi.adname, poi.address].filter(Boolean).join("")}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {searchError ? <div className="text-xs text-amber-600">{searchError}</div> : null}

          <div className="relative h-[420px] w-full overflow-hidden rounded-md border border-slate-200 dark:border-border">
            {/* 容器用唯一 ID + 显式尺寸，AMap 直接初始化在此元素上。
                不用 absolute inset-0 包裹，因为 AMap 初始化会改写容器 position 为 relative，
                导致 absolute 子元素定位上下文丢失、高度坍塌为 0（白屏） */}
            <div id={mapId} className="h-full w-full" />
            {loading ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-50/80 text-sm text-slate-500 dark:bg-background/80 dark:text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                地图加载中...
              </div>
            ) : null}
            {error ? (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50 p-6 text-center text-sm text-red-600 dark:bg-background">
                {error}
              </div>
            ) : null}
          </div>

          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-muted/40 dark:text-muted-foreground">
            {selected ? (
              <>
                <div className="font-medium text-slate-800 dark:text-foreground">
                  {selected.poiName
                    || selected.address
                    || (nameStatus === "loading" ? "正在获取地名…" : "已选择坐标")}
                </div>
                {selected.address && selected.poiName ? (
                  <div className="mt-0.5">{selected.address}</div>
                ) : null}
                {!selected.poiName && !selected.address && nameStatus === "failed" ? (
                  <div className="mt-1 flex items-center gap-2 text-red-600 dark:text-red-400">
                    <span>地名获取失败（网络波动或高德服务繁忙），坐标已选上</span>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => fillLocationName(Number(selected.longitude), Number(selected.latitude))}
                    >
                      重试获取地名
                    </button>
                  </div>
                ) : null}
                <div className="mt-0.5">
                  经纬度：{selected.longitude}, {selected.latitude}（高德 GCJ-02）
                </div>
              </>
            ) : (
              "尚未选择位置，点击地图或搜索地点选择"
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-border">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            className="bg-[#0f6b5d] text-white hover:bg-[#0b5148]"
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
          >
            确认定位
          </Button>
        </div>
      </div>
    </div>
  );
}
