import type { AppConfig } from "./types";

const CONFIG_KEY = "iam-sdk-manual-test-config";
const TOKEN_KEY = "iam-sdk-manual-test-token";

export const defaultConfig: AppConfig = {
  mode: "mock",
  endpointAuthn: "http://localhost:9000/api",
  endpointAuthzBatchEvaluate: "http://localhost:443/frontend/authorizations/evaluate",
  endpointAuthzBatchEvaluateFallbacks: "",
  timeoutMs: 30_000,
  cacheEnabled: true,
  cacheTtlSeconds: 300,
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
