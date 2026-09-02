// 高德 JS API 2.0 加载器
// Key 与安全密钥来自环境变量 VITE_AMAP_KEY / VITE_AMAP_SECURITY_CODE（高德控制台「Web端(JS API)」类型）
// 脚本按需动态加载并全局缓存，避免每个使用地图的组件重复注入

export type AMapLngLat = {
  lng: number;
  lat: number;
  getLng(): number;
  getLat(): number;
};

export type AMapPoi = {
  id?: string;
  name: string;
  address: string;
  location: AMapLngLat;
  pname?: string;
  cityname?: string;
  adname?: string;
};

export type AMapMarker = {
  setPosition(position: [number, number]): void;
  getPosition(): AMapLngLat | null;
  on(event: string, handler: () => void): void;
};

export type AMapMap = {
  on(event: string, handler: (event: { lnglat: AMapLngLat }) => void): void;
  add(...overlays: AMapMarker[]): void;
  setZoom(zoom: number): void;
  setCenter(center: [number, number]): void;
  panTo(center: [number, number]): void;
  destroy(): void;
};

type AMapGeocoder = {
  getAddress(
    lnglat: [number, number],
    callback: (
      status: string,
      result: {
        regeocode?: {
          formattedAddress?: string;
          pois?: Array<{ name?: string }>;
        };
      }
    ) => void
  ): void;
};

type AMapPlaceSearchResult = {
  info?: string;
  pois?: AMapPoi[];
  poiList?: { pois: AMapPoi[]; count: number; pageIndex: number; pageSize: number } | AMapPoi[];
};

type AMapPlaceSearch = {
  search(keyword: string, callback: (status: string, result: AMapPlaceSearchResult) => void): void;
};

export type AMapConstructor = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  Geocoder: new (options?: Record<string, unknown>) => AMapGeocoder;
  PlaceSearch: new (options?: Record<string, unknown>) => AMapPlaceSearch;
  // 2.0 下插件可能延迟就绪，缺失时用它按需补加载
  plugin?: (names: string[], callback: () => void) => void;
};

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string };
    AMap?: AMapConstructor;
  }
}

let amapPromise: Promise<AMapConstructor> | null = null;

// 浏览器端 Key 属于公开信息（嵌入 HTML script 标签），此处硬编码兜底
// 防止协作者发版时未传 VITE_AMAP_KEY build-arg 导致地图功能不可用
const DEFAULT_AMAP_KEY = "142205c95a53b57e404de95f31be67d8";
const DEFAULT_AMAP_SECURITY_CODE = "1b7e6b992e0dcfafd2b80252a32ddaa8";

export function loadAMap(): Promise<AMapConstructor> {
  if (amapPromise) return amapPromise;

  const key = import.meta.env.VITE_AMAP_KEY || DEFAULT_AMAP_KEY;
  if (!key) {
    return Promise.reject(
      new Error("未配置高德地图 Key（VITE_AMAP_KEY），请在 ui/.env 中配置后重启前端")
    );
  }

  const securityCode = import.meta.env.VITE_AMAP_SECURITY_CODE || DEFAULT_AMAP_SECURITY_CODE;
  if (securityCode) {
    window._AMapSecurityConfig = { securityJsCode: securityCode };
  }

  amapPromise = new Promise((resolve, reject) => {
    if (window.AMap) {
      resolve(window.AMap);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.Geocoder,AMap.PlaceSearch`;
    script.async = true;
    script.onload = () => {
      if (window.AMap) {
        resolve(window.AMap);
      } else {
        amapPromise = null;
        reject(new Error("高德地图脚本已加载但初始化失败，请检查 Key 类型是否为「Web端(JS API)」"));
      }
    };
    script.onerror = () => {
      amapPromise = null;
      reject(new Error("高德地图脚本加载失败，请检查网络连接"));
    };
    document.head.appendChild(script);
  });

  return amapPromise;
}
