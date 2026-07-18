// Centralized environment variables.
// Production can use the current browser origin so one image works for IP and domain access.

const viteEnv = import.meta.env ?? {};
const isDev = Boolean(viteEnv.DEV);

function getRequiredEnv(name: string): string {
  const value = viteEnv[name];
  
  // Only validate in development (production validated at build time)
  if (isDev && (!value || value.trim() === "")) {
    throw new Error(
      `Missing required environment variable: ${name}\n\n` +
      `Please add it to your .env file:\n` +
      `${name}=your_value_here`
    );
  }
  
  return value || "";
}

export function resolveApiUrl(
  configuredUrl = "",
  browserOrigin = typeof window !== "undefined" ? window.location.origin : "",
  fallbackUrl = "http://localhost:8080"
): string {
  const trimmedUrl = configuredUrl.trim();
  if (trimmedUrl) return alignLoopbackApiHost(trimmedUrl, browserOrigin);

  const trimmedOrigin = browserOrigin.trim();
  if (trimmedOrigin) return trimmedOrigin;

  return fallbackUrl;
}

function alignLoopbackApiHost(configuredUrl: string, browserOrigin: string): string {
  try {
    const apiUrl = new URL(configuredUrl);
    const pageUrl = new URL(browserOrigin);
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

    if (
      loopbackHosts.has(apiUrl.hostname) &&
      loopbackHosts.has(pageUrl.hostname) &&
      apiUrl.hostname !== pageUrl.hostname
    ) {
      apiUrl.hostname = pageUrl.hostname;
      const normalized = apiUrl.toString();
      return !configuredUrl.endsWith("/") && normalized.endsWith("/")
        ? normalized.slice(0, -1)
        : normalized;
    }
  } catch {
    // Keep the configured value so the existing URL validation reports malformed input.
  }

  return configuredUrl;
}

// ============================================
// REQUIRED
// ============================================

export const API_URL = resolveApiUrl(getRequiredEnv("VITE_API_URL"));

// ============================================
// OPTIONAL (add more as needed)
// ============================================

// export const SUI_NETWORK = getOptionalEnv("VITE_SUI_NETWORK", "testnet");
// export const CONTRACT_ADDRESS = getOptionalEnv("VITE_CONTRACT_ADDRESS");
