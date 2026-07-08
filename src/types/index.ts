export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface CacheConfig {
  ttl?: number;
  enabled?: boolean;
}

export interface IamClientConfig {
  endpointAuthn?: string;
  endpointAuthzFrontend?: string;
  endpointCp?: string;
  endpointAuthzFrontendFallbacks?: string[] | string;
  getToken?: () => string | Promise<string>;
  fetcher?: FetchLike;
  timeoutMs?: number;
  cache?: CacheConfig;
  logLevel?: LogLevel;
  apiAccessKey?: string;
  apiSecretKey?: string;
}

export interface LoginParams {
  apiAccessKey?: string;
  apiSecretKey?: string;
  region?: string;
  service?: string;
}

export interface AssumeRoleParams {
  roleName: string;
  tenant: string;
  service?: string;
  region?: string;
}

export interface AuthorizationCheck {
  action?: string;
  alias?: string;
  resource?: string;
  context?: Record<string, unknown>;
  key?: string;
}

export interface AuthorizationDecision {
  allowed: boolean;
}

export type AuthorizationSnapshot = Record<string, AuthorizationDecision>;

export interface TokenInfo {
  [key: string]: unknown;
}

export interface Role {
  [key: string]: unknown;
}

export interface AssumeRoleResponse {
  access_token: string;
  expires_in?: number;
  [key: string]: unknown;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  [key: string]: unknown;
}
