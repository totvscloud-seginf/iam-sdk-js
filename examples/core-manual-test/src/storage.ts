import type { AppConfig } from "./types";

const CONFIG_KEY = "iam-sdk-manual-test-config";
const TOKEN_KEY = "iam-sdk-manual-test-token";
const CHECKS_KEY = "iam-sdk-manual-test-evaluate-checks";

export const DEFAULT_AUTHZ_CACHE_STORAGE_KEY = "iam-sdk-manual-test-authz-cache";

export const defaultConfig: AppConfig = {
  mode: "mock",
  endpointAuthn: "http://localhost:9000/api",
  endpointAuthzBatchEvaluate: "http://localhost:443/frontend/authorizations/evaluate",
  endpointAuthzBatchEvaluateFallbacks: "",
  timeoutMs: 30_000,
  cacheEnabled: true,
  cacheTtlSeconds: 300,
  cacheStorage: "memory",
  cacheStorageKey: DEFAULT_AUTHZ_CACHE_STORAGE_KEY,
  persistToken: false,
};

export function loadConfig(): AppConfig {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return defaultConfig;
  try {
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return { ...defaultConfig, ...parsed };
  } catch {
    return defaultConfig;
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function loadToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function saveToken(token: string): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function loadChecksJson(fallback: string): string {
  return localStorage.getItem(CHECKS_KEY) ?? fallback;
}

export function saveChecksJson(value: string): void {
  localStorage.setItem(CHECKS_KEY, value);
}
