/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** 高德开放平台 Web端(JS API) 类型 Key */
  readonly VITE_AMAP_KEY?: string;
  /** 高德 JS API 安全密钥（2021-12 后申请的 Key 必配） */
  readonly VITE_AMAP_SECURITY_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
