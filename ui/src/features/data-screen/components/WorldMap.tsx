/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useEffect, useRef, useState } from "react";

// ── Amap credentials ─────────────────────────────────────────────────────
const AMAP_KEY = "142205c95a53b57e404de95f31be67d8";
const AMAP_SECURITY_CODE = "1b7e6b992e0dcfafd2b80252a32ddaa8";

export interface MapProjectPoint {
  id: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  mapPoiName?: string | null;
  mapAddress?: string | null;
}

interface AmapProps {
  projects: MapProjectPoint[];
  onProjectClick?: (project: MapProjectPoint) => void;
  selectedProject?: MapProjectPoint | null;
  onCloseTooltip?: () => void;
  onMapReady?: () => void;
}

// Global load state
let loadPromise: Promise<void> | null = null;

function loadAmap(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    (window as any)._AMapSecurityConfig = {
      securityJsCode: AMAP_SECURITY_CODE,
    };

    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Amap"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

const DARK_STYLE = "amap://styles/darkblue";

export const WorldMap = memo(function WorldMap({ projects, onProjectClick, selectedProject, onCloseTooltip, onMapReady }: AmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const clickRef = useRef(onProjectClick);
  const mapReadyRef = useRef(onMapReady);
  const closeRef = useRef(onCloseTooltip);

  useEffect(() => {
    clickRef.current = onProjectClick;
  }, [onProjectClick]);

  useEffect(() => {
    mapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    closeRef.current = onCloseTooltip;
  }, [onCloseTooltip]);

  // Tooltip position state
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Update tooltip position when selectedProject or map changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedProject || !selectedProject.longitude || !selectedProject.latitude) {
      setTooltipPos(null);
      return;
    }
    const pos = map.lngLatToContainer(
      new (window as any).AMap.LngLat(Number(selectedProject.longitude), Number(selectedProject.latitude))
    );
    if (pos) {
      const size = map.getSize();
      setTooltipPos({
        x: Math.max(150, Math.min(size.width - 150, pos.x)),
        y: Math.max(0, pos.y - 20),
      });
    }
  }, [selectedProject]);

  // ── Init map once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    loadAmap().then(() => {
      if (disposed || !containerRef.current) return;
      const AMap = (window as any).AMap;
      if (!AMap) return;

      const map = new AMap.Map(containerRef.current, {
        zoom: 8,
        center: [121.2, 29.6],
        mapStyle: DARK_STYLE,
        viewMode: "2D",
        features: ["bg", "road", "building", "point"],
        pitchEnable: false,
        rotateEnable: false,
      });

      mapRef.current = map;
      mapReadyRef.current?.();

      // Click on empty map area to dismiss tooltip
      map.on("click", () => {
        closeRef.current?.();
      });
    });

    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  // ── Update markers when data changes ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const AMap = (window as any).AMap;
    if (!AMap) return;

    // Clear old markers
    markersRef.current.forEach((m: any) => map.remove(m));
    markersRef.current = [];

    const validProjects = projects.filter(
      (p) => p.latitude != null && p.longitude != null
    );

    validProjects.forEach((p) => {
      const lng = Number(p.longitude);
      const lat = Number(p.latitude);

      // Neon glowing dot
      const el = document.createElement("div");
      el.style.cssText = `
        width: 10px; height: 10px; border-radius: 50%;
        background: radial-gradient(circle, #ffffff 0%, #00e5ff 40%, #0088ff 100%);
        box-shadow: 0 0 8px 2px rgba(0,229,255,0.7), 0 0 20px 6px rgba(0,136,255,0.35), 0 0 35px 10px rgba(0,229,255,0.12);
        cursor: pointer; position: relative;
      `;

      // Radar ripple rings
      [1, 2].forEach((i) => {
        const ring = document.createElement("div");
        const delay = i * 0.6;
        ring.style.cssText = `
          position: absolute; top: -10px; left: -10px;
          width: 30px; height: 30px; border-radius: 50%;
          border: 1.5px solid rgba(0,229,255,${0.5 - i * 0.15});
          animation: amapRipple 2.4s ease-out infinite;
          animation-delay: ${delay}s;
          pointer-events: none;
        `;
        el.appendChild(ring);
      });

      const marker = new AMap.Marker({
        position: new AMap.LngLat(lng, lat),
        content: el,
        offset: new AMap.Pixel(-6, -6),
        extData: p,
      });

      marker.on("click", () => {
        clickRef.current?.(p);
        // Position tooltip above this marker
        const map = mapRef.current;
        if (map) {
          const pos = map.lngLatToContainer(new AMap.LngLat(lng, lat));
          if (pos) {
            const size = map.getSize();
            setTooltipPos({
              x: Math.max(150, Math.min(size.width - 150, pos.x)),
              y: Math.max(0, pos.y - 20),
            });
          }
        }
      });

      map.add(marker);
      markersRef.current.push(marker);
    });
  }, [projects]);

  return (
    <>
      <style>{`
        @keyframes amapRipple {
          0%   { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", minHeight: 200 }}
      />
      {/* Floating tooltip above selected marker */}
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
          <button className="db-tooltip-close" onClick={() => closeRef.current?.()}>✕</button>
          <div className="db-tooltip-name">{selectedProject.name}</div>
          <div className="db-tooltip-rows">
            {[
              { l: "总包单位", v: (selectedProject as any).generalContractor },
              { l: "项目经理", v: (selectedProject as any).projectManager },
              { l: "联系电话", v: (selectedProject as any).projectManagerPhone },
              { l: "项目地点", v: selectedProject.mapPoiName },
            ].map((row, i) => (
              <div key={i} className="db-tooltip-row">
                <span className="db-tooltip-row-label">{row.l}</span>
                <span className="db-tooltip-row-value">{row.v || "—"}</span>
              </div>
            ))}
          </div>
          <div className="db-tooltip-btns">
            <button className="db-tooltip-btn">项目详情</button>
            <button
              className="db-tooltip-btn db-tooltip-btn-primary"
              onClick={() => { window.location.href = `/app/data-screen/project/${selectedProject.id}`; }}
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
