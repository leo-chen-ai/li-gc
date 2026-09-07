// 百度地图 JS API 3.0 加载器
// AK 优先读 VITE_BAIDU_MAP_AK；协同环境里 ui/.env / .env.deploy 可能被覆盖，
// 因此保留浏览器端 AK 硬编码兜底（与 ui/src/lib/amap.ts 同策略），保证本地与线上构建都能加载大屏底图。

declare global {
  interface Window {
    BMap?: any;
  }
}

// 浏览器端 AK 会暴露在前端包内，属于公开配置；勿改成服务端 AK
const DEFAULT_BAIDU_MAP_AK = "xMpAL2lUFuRNDvkLYi4lsNtBnGwfMEee";

let baiduPromise: Promise<void> | null = null;

export function getBaiduMapAk(): string {
  return import.meta.env.VITE_BAIDU_MAP_AK || DEFAULT_BAIDU_MAP_AK;
}

export function loadBaiduMap(): Promise<void> {
  if (baiduPromise) return baiduPromise;
  if (window.BMap) {
    baiduPromise = Promise.resolve();
    return baiduPromise;
  }

  const ak = getBaiduMapAk();
  baiduPromise = new Promise<void>((resolve, reject) => {
    const callbackName = `__baiduMapInit_${Date.now()}`;
    (window as any)[callbackName] = () => {
      delete (window as any)[callbackName];
      resolve();
    };
    const script = document.createElement("script");
    script.src = `https://api.map.baidu.com/api?v=3.0&ak=${encodeURIComponent(ak)}&callback=${callbackName}`;
    script.onerror = () => {
      baiduPromise = null;
      reject(new Error("Failed to load Baidu Map"));
    };
    document.head.appendChild(script);
  });

  return baiduPromise;
}
