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
  if (trimmedUrl) return trimmedUrl;

  const trimmedOrigin = browserOrigin.trim();
  if (trimmedOrigin) return trimmedOrigin;

  return fallbackUrl;
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
