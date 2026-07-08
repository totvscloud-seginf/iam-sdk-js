import type { IamClientConfig, LogLevel } from "./types";

export const DEFAULT_AUTHN_ENDPOINT = "http://localhost:9000/api";
export const DEFAULT_AUTHZ_FRONTEND_ENDPOINT = "http://localhost:443/frontend/authorizations";
export const DEFAULT_CP_ENDPOINT = "http://localhost:443/v1";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_CACHE_TTL_SECONDS = 300;

export interface NormalizedConfig {
  endpointAuthn: string;
  endpointAuthzFrontend: string;
  endpointCp: string;
  endpointAuthzFrontendFallbacks: string[];
  timeoutMs: number;
  cacheTtlSeconds: number;
  cacheEnabled: boolean;
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
  const endpointAuthzFrontend = (
    config.endpointAuthzFrontend ??
    process.env.IAM_AUTHZ_FRONTEND_ENDPOINT ??
    DEFAULT_AUTHZ_FRONTEND_ENDPOINT
  ).replace(/\/+$/, "");

  return {
    endpointAuthn: (config.endpointAuthn ?? process.env.IAM_AUTHN_ENDPOINT ?? DEFAULT_AUTHN_ENDPOINT).replace(
      /\/+$/,
      "",
    ),
    endpointAuthzFrontend,
    endpointCp: (config.endpointCp ?? process.env.IAM_CP_ENDPOINT ?? DEFAULT_CP_ENDPOINT).replace(/\/+$/, ""),
    endpointAuthzFrontendFallbacks: parseEndpointList(
      config.endpointAuthzFrontendFallbacks ?? process.env.IAM_AUTHZ_FRONTEND_FALLBACK_ENDPOINTS,
    ).filter((endpoint) => endpoint !== endpointAuthzFrontend),
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    cacheTtlSeconds: config.cache?.ttl ?? DEFAULT_CACHE_TTL_SECONDS,
    cacheEnabled: config.cache?.enabled ?? true,
    logLevel: config.logLevel ?? "INFO",
    apiAccessKey: config.apiAccessKey,
    apiSecretKey: config.apiSecretKey,
  };
}

export function authzFrontendEndpoints(config: NormalizedConfig): string[] {
  return [config.endpointAuthzFrontend, ...config.endpointAuthzFrontendFallbacks].filter(
    (endpoint, index, all) => endpoint && all.indexOf(endpoint) === index,
  );
}
