/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useEffect, useRef, useState } from "react";
import { loadBaiduMap } from "@/lib/baidu-map";
import baiduMapStyle from "../map/baidu-map-style.json";

/**
 * 示例大屏（姜太公）企业驾驶舱用的是百度地图 + setMapStyleV2：
 * - 陆地 #091220（近黑）
 * - 水域 #00364B
 * 高德 darkblue 无法单独把海洋调成该色，故对齐示例改用百度自定义样式。
 * AK 见 ui/src/lib/baidu-map.ts（含协同 env 被覆盖时的硬编码兜底）。
 */

export interface MapProjectPoint {
  id: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  mapPoiName?: string | null;
  mapAddress?: string | null;
}

interface MapProps {
  projects: MapProjectPoint[];
  onProjectClick?: (project: MapProjectPoint) => void;
  selectedProject?: MapProjectPoint | null;
  onCloseTooltip?: () => void;
  onMapReady?: () => void;
}

/** DOM marker overlay — neon dot + ripple */
function createDotOverlay(BMap: any, point: any, onClick: () => void) {
  function DotOverlay(this: any) {
    this._point = point;
  }
  DotOverlay.prototype = new BMap.Overlay();
  DotOverlay.prototype.initialize = function (map: any) {
    this._map = map;
    const el = document.createElement("div");
    el.className = "db-bmap-dot";
    el.style.cssText = `
      width: 10px; height: 10px; border-radius: 50%;
      background: radial-gradient(circle, #ffffff 0%, #00e5ff 40%, #0088ff 100%);
      box-shadow: 0 0 8px 2px rgba(0,229,255,0.7), 0 0 20px 6px rgba(0,136,255,0.35);
      cursor: pointer; position: absolute; z-index: 10;
    `;
    [1, 2].forEach((i) => {
      const ring = document.createElement("div");
      ring.style.cssText = `
        position: absolute; top: -10px; left: -10px;
        width: 30px; height: 30px; border-radius: 50%;
        border: 1.5px solid rgba(0,229,255,${0.5 - i * 0.15});
        animation: amapRipple 2.4s ease-out infinite;
        animation-delay: ${i * 0.6}s;
        pointer-events: none;
      `;
      el.appendChild(ring);
    });
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    map.getPanes().markerPane.appendChild(el);
    this._el = el;
    return el;
  };
  DotOverlay.prototype.draw = function () {
    const pixel = this._map.pointToOverlayPixel(this._point);
    if (!this._el) return;
    this._el.style.left = `${pixel.x - 5}px`;
    this._el.style.top = `${pixel.y - 5}px`;
  };
  DotOverlay.prototype.getPosition = function () {
    return this._point;
  };
  return new (DotOverlay as any)();
}

export const WorldMap = memo(function WorldMap({
  projects,
  onProjectClick,
  selectedProject,
  onCloseTooltip,
  onMapReady,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const clickRef = useRef(onProjectClick);
  const mapReadyRef = useRef(onMapReady);
  const closeRef = useRef(onCloseTooltip);
  const projectsRef = useRef(projects);

  useEffect(() => {
    clickRef.current = onProjectClick;
  }, [onProjectClick]);
  useEffect(() => {
    mapReadyRef.current = onMapReady;
  }, [onMapReady]);
  useEffect(() => {
    closeRef.current = onCloseTooltip;
  }, [onCloseTooltip]);
  useEffect(() => {
    projectsRef.current = projects;
  });

  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  function updateTooltipPos(lng: number, lat: number) {
    const map = mapRef.current;
    const BMap = (window as any).BMap;
    if (!map || !BMap) return;
    const pixel = map.pointToOverlayPixel(new BMap.Point(lng, lat));
    const size = map.getSize();
    setTooltipPos({
      x: Math.max(150, Math.min(size.width - 150, pixel.x)),
      y: Math.max(0, pixel.y - 20),
    });
  }

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !selectedProject ||
      !selectedProject.longitude ||
      !selectedProject.latitude
    ) {
      setTooltipPos(null);
      return;
    }
    updateTooltipPos(
      Number(selectedProject.longitude),
      Number(selectedProject.latitude),
    );
  }, [selectedProject]);

  function renderMarkers(map: any, pts: MapProjectPoint[]) {
    const BMap = (window as any).BMap;
    if (!BMap) return;

    markersRef.current.forEach((m: any) => map.removeOverlay(m));
    markersRef.current = [];

    pts
      .filter((p) => p.latitude != null && p.longitude != null)
      .forEach((p) => {
        const lng = Number(p.longitude);
        const lat = Number(p.latitude);
        const point = new BMap.Point(lng, lat);
        const overlay = createDotOverlay(BMap, point, () => {
          clickRef.current?.(p);
          updateTooltipPos(lng, lat);
        });
        map.addOverlay(overlay);
        markersRef.current.push(overlay);
      });
  }

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let onWheel: ((e: WheelEvent) => void) | null = null;

    loadBaiduMap()
      .then(() => {
        if (disposed || !containerRef.current) return;
        const BMap = (window as any).BMap;
        if (!BMap) return;
        const container = containerRef.current;

        const map = new BMap.Map(container, {
          enableMapClick: true,
        });
        map.centerAndZoom(new BMap.Point(121.2, 29.6), 8);
        map.enableDragging();
        map.enableInertialDragging();
        // ScreenStage 有 CSS scale，百度自带滚轮会按未缩放坐标算错，
        // 导致放大中心不是鼠标位置；改用手写滚轮缩放。
        map.disableScrollWheelZoom();
        // 陆地近黑 + 水域 #00364B（对齐示例）
        map.setMapStyleV2({ styleJson: baiduMapStyle as any[] });

        mapRef.current = map;
        renderMarkers(map, projectsRef.current);
        mapReadyRef.current?.();

        map.addEventListener("click", () => {
          closeRef.current?.();
        });

        onWheel = (e: WheelEvent) => {
          const hit = document.elementFromPoint(e.clientX, e.clientY);
          // 仅鼠标下方实际落在百度地图 DOM 上时才缩放（左右栏/搜索/底部图表面板不触发）
          if (!hit || !container.contains(hit)) return;

          e.preventDefault();
          e.stopPropagation();
          const m = mapRef.current;
          if (!m) return;

          const rect = container.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;

          // 视口坐标 → 设计画布（未缩放）坐标，抵消 ScreenStage 的 CSS scale
          const scaleX = rect.width / container.clientWidth;
          const scaleY = rect.height / container.clientHeight;
          const x = (e.clientX - rect.left) / scaleX;
          const y = (e.clientY - rect.top) / scaleY;

          const point = m.pixelToPoint(new BMap.Pixel(x, y));
          const cur = m.getZoom();
          const next = Math.max(3, Math.min(19, cur + (e.deltaY < 0 ? 1 : -1)));
          if (next === cur) return;

          let applied = false;
          const keepCursor = () => {
            if (applied) return;
            applied = true;
            m.removeEventListener("zoomend", keepCursor);
            const after = m.pointToPixel(point);
            const dx = Math.round(x - after.x);
            const dy = Math.round(y - after.y);
            if (dx || dy) m.panBy(dx, dy);
          };
          m.addEventListener("zoomend", keepCursor);
          m.setZoom(next);
          requestAnimationFrame(keepCursor);
        };
        // 挂到 window 捕获阶段：上层 UI 是 pointer-events:none，
        // 但滚轮仍可能被中间层接住；按鼠标下是否可透传到地图来决定
        window.addEventListener("wheel", onWheel, { passive: false, capture: true });
      })
      .catch((err) => {
        console.error(err);
        // 仍通知外层结束 loading，避免一直卡在启动页
        mapReadyRef.current?.();
      });

    return () => {
      disposed = true;
      if (onWheel) {
        window.removeEventListener("wheel", onWheel, true);
      }
      if (mapRef.current) {
        mapRef.current.clearOverlays?.();
        mapRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    renderMarkers(map, projects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  return (
    <>
      <style>{`
        @keyframes amapRipple {
          0%   { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .db-bmap .anchorBL,
        .db-bmap .BMap_cpyCtrl {
          display: none !important;
        }
      `}</style>
      <div
        ref={containerRef}
        className="db-bmap"
        style={{
          width: "100%",
          height: "100%",
          minHeight: 200,
          background: "#091220",
        }}
      />
      {selectedProject && tooltipPos && (
        <div
          className="db-tooltip"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: "translate(-50%, -100%)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="db-tooltip-close"
            onClick={() => closeRef.current?.()}
          >
            ✕
          </button>
          <div className="db-tooltip-name">{selectedProject.name}</div>
          <div className="db-tooltip-rows">
            {[
              {
                l: "总包单位",
                v: (selectedProject as any).generalContractor,
              },
              {
                l: "项目经理",
                v: (selectedProject as any).projectManager,
              },
              {
                l: "联系电话",
                v: (selectedProject as any).projectManagerPhone,
              },
              { l: "项目地点", v: selectedProject.mapPoiName },
            ].map((row, i) => (
              <div key={i} className="db-tooltip-row">
                <span className="db-tooltip-row-label">{row.l}</span>
                <span className="db-tooltip-row-value">
                  {row.v || "—"}
                </span>
              </div>
            ))}
          </div>
          <div className="db-tooltip-btns">
            <button className="db-tooltip-btn">项目详情</button>
            <button
              className="db-tooltip-btn db-tooltip-btn-primary"
              onClick={() => {
                window.open(
                  `/app/data-screen/project/${selectedProject.id}`,
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
            >
              项目看板
            </button>
            <button className="db-tooltip-btn">项目工人</button>
          </div>
        </div>
      )}
    </>
  );
});
