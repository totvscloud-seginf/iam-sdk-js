import type { IamClientConfig, LogLevel } from "./types";

export const DEFAULT_AUTHN_ENDPOINT = "http://localhost:9000/api";
export const DEFAULT_AUTHZ_BATCH_EVALUATE_ENDPOINT = "http://localhost:443/frontend/authorizations/evaluate";
export const DEFAULT_CP_ENDPOINT = "http://localhost:443/v1";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_CACHE_TTL_SECONDS = 300;
export const DEFAULT_CACHE_STORAGE = "memory";
export const DEFAULT_CACHE_STORAGE_KEY = "@totvs-cloud/iam-sdk:authz-cache:v1";

export interface NormalizedConfig {
  endpointAuthn: string;
  endpointAuthzBatchEvaluate: string;
  endpointCp: string;
  endpointAuthzBatchEvaluateFallbacks: string[];
  timeoutMs: number;
  cacheTtlSeconds: number;
  cacheEnabled: boolean;
  cacheStorage: "memory" | "localStorage";
  cacheStorageKey: string;
  logLevel: LogLevel;
  apiAccessKey: string | undefined;
  apiSecretKey: string | undefined;
}

export function parseEndpointList(value?: string[] | string): string[] {
  if (!value) return [];
  const items = Array.isArray(value) ? value : value.split(",");
  const endpoints: string[] = [];
  for (const item of items) {
    const endpoint = String(item).trim().replace(/\/+$/, "");
    if (endpoint && !endpoints.includes(endpoint)) {
      endpoints.push(endpoint);
    }
  }
  return endpoints;
}

export function normalizeConfig(config: IamClientConfig = {}): NormalizedConfig {
  const endpointAuthzBatchEvaluate = (
    config.endpointAuthzBatchEvaluate ??
    process.env.IAM_AUTHZ_BATCH_EVALUATE_ENDPOINT ??
    DEFAULT_AUTHZ_BATCH_EVALUATE_ENDPOINT
  ).replace(/\/+$/, "");

  return {
    endpointAuthn: (config.endpointAuthn ?? process.env.IAM_AUTHN_ENDPOINT ?? DEFAULT_AUTHN_ENDPOINT).replace(
      /\/+$/,
      "",
    ),
    endpointAuthzBatchEvaluate,
    endpointCp: (config.endpointCp ?? process.env.IAM_CP_ENDPOINT ?? DEFAULT_CP_ENDPOINT).replace(/\/+$/, ""),
    endpointAuthzBatchEvaluateFallbacks: parseEndpointList(
      config.endpointAuthzBatchEvaluateFallbacks ?? process.env.IAM_AUTHZ_BATCH_EVALUATE_FALLBACK_ENDPOINTS,
    ).filter((endpoint) => endpoint !== endpointAuthzBatchEvaluate),
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    cacheTtlSeconds: config.cache?.ttl ?? DEFAULT_CACHE_TTL_SECONDS,
    cacheEnabled: config.cache?.enabled ?? true,
    cacheStorage: config.cache?.storage ?? DEFAULT_CACHE_STORAGE,
    cacheStorageKey: config.cache?.storageKey ?? DEFAULT_CACHE_STORAGE_KEY,
    logLevel: config.logLevel ?? "INFO",
    apiAccessKey: config.apiAccessKey,
    apiSecretKey: config.apiSecretKey,
  };
}

export function authzBatchEvaluateEndpoints(config: NormalizedConfig): string[] {
  return [config.endpointAuthzBatchEvaluate, ...config.endpointAuthzBatchEvaluateFallbacks].filter(
    (endpoint, index, all) => endpoint && all.indexOf(endpoint) === index,
  );
}
