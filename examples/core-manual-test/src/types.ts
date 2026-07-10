import type { FetchLike } from "../../../src";

export type RuntimeMode = "mock" | "real";
export type MockFailure = "none" | "401" | "403" | "invalid-json" | "transport";

export interface AppConfig {
  mode: RuntimeMode;
  endpointAuthn: string;
  endpointAuthzBatchEvaluate: string;
  endpointAuthzBatchEvaluateFallbacks: string;
  timeoutMs: number;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
  persistToken: boolean;
}

export interface MockConfig {
  failure: MockFailure;
  defaultAllowed: boolean;
  deniedActions: string;
}

export interface DebugCall {
  id: string;
  label: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status?: number;
  ok?: boolean;
  responseBody?: unknown;
  error?: string;
  durationMs: number;
  startedAt: string;
}

export interface InstrumentedFetcher {
  fetcher: FetchLike;
  setLabel: (label: string) => void;
}
