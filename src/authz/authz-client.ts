import { authzFrontendEndpoints, type NormalizedConfig } from "../config";
import { UnsupportedCapabilityKeyError } from "../errors";
import { AuthorizationCache } from "../cache/authorization-cache";
import type { HttpClient } from "../http/http-client";
import type { AuthorizationCheck, AuthorizationSnapshot } from "../types";

const MAX_BATCH_SIZE = 50;

interface EvaluateResponse {
  decisions: AuthorizationSnapshot;
}

interface PreparedCheck {
  original: AuthorizationCheck;
  request: AuthorizationCheck & { action: string; alias: string };
  responseKey: string;
}

export class AuthzClient {
  private currentNamespace = "";

  constructor(
    private readonly config: NormalizedConfig,
    private readonly http: HttpClient,
    private readonly cache: AuthorizationCache,
    private readonly tokenProvider: () => Promise<string>,
  ) {}

  async evaluate(checks: AuthorizationCheck[]): Promise<AuthorizationSnapshot> {
    if (checks.length === 0) return {};

    const token = await this.tokenProvider();
    const namespace = this.namespace(token);
    this.currentNamespace = namespace;
    const prepared = prepareChecks(checks);
    const snapshot: AuthorizationSnapshot = {};
    const misses: PreparedCheck[] = [];

    for (const check of prepared) {
      const cached = this.cache.get(namespace, check.original);
      if (cached === undefined) {
        misses.push(check);
      } else {
        snapshot[check.responseKey] = { allowed: cached };
      }
    }

    for (const chunk of chunks(misses, MAX_BATCH_SIZE)) {
      if (chunk.length === 0) continue;
      const response = await this.evaluateChunk(chunk, token);
      for (const item of chunk) {
        const decision = response.decisions[item.responseKey];
        if (!decision) continue;
        snapshot[item.responseKey] = decision;
        this.cache.set(namespace, item.original, decision);
      }
    }

    return snapshot;
  }

  async can(actionOrCheck: string | AuthorizationCheck): Promise<boolean> {
    const check = typeof actionOrCheck === "string" ? { action: actionOrCheck } : actionOrCheck;
    const cached = this.getCached(check);
    if (cached !== undefined) return cached;
    const snapshot = await this.evaluate([check]);
    const key = Object.keys(snapshot)[0];
    return key ? snapshot[key]?.allowed === true : false;
  }

  async canAny(checks: Array<string | AuthorizationCheck>): Promise<boolean> {
    const snapshot = await this.evaluate(checks.map(coerceCheck));
    return Object.values(snapshot).some((decision) => decision.allowed);
  }

  async canAll(checks: Array<string | AuthorizationCheck>): Promise<boolean> {
    if (checks.length === 0) return true;
    const snapshot = await this.evaluate(checks.map(coerceCheck));
    return Object.values(snapshot).length === checks.length && Object.values(snapshot).every((decision) => decision.allowed);
  }

  getCached(check: string | AuthorizationCheck): boolean | undefined {
    if (!this.currentNamespace) return undefined;
    return this.cache.get(this.currentNamespace, coerceCheck(check));
  }

  hydrate(snapshot: AuthorizationSnapshot, token: string): void {
    this.currentNamespace = this.namespace(token);
    this.cache.hydrate(this.currentNamespace, snapshot);
  }

  invalidateCache(scope?: string): void {
    this.cache.invalidate(scope);
  }

  private async evaluateChunk(chunk: PreparedCheck[], token: string): Promise<EvaluateResponse> {
    const endpoints = authzFrontendEndpoints(this.config).map((endpoint) => `${endpoint}/evaluate`);
    return this.http.requestJson<EvaluateResponse>(endpoints[0]!, {
      method: "POST",
      endpoints,
      headers: { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` },
      body: {
        checks: chunk.map((item) => stripUndefined(item.request)),
      },
    });
  }

  private namespace(token: string): string {
    return token;
  }
}

function prepareChecks(checks: AuthorizationCheck[]): PreparedCheck[] {
  const baseKeys = checks.map((check) => {
    if (check.key) throw new UnsupportedCapabilityKeyError();
    if (!check.action?.trim()) {
      throw new Error("Authorization check action is required.");
    }
    return check.alias?.trim() || check.action.trim();
  });
  const duplicateKeys = new Set(baseKeys.filter((key, index) => baseKeys.indexOf(key) !== index));
  const counters = new Map<string, number>();

  return checks.map((check) => {
    const action = check.action!.trim();
    const baseKey = check.alias?.trim() || action;
    const count = counters.get(baseKey) ?? 0;
    counters.set(baseKey, count + 1);
    const responseKey = duplicateKeys.has(baseKey) && !check.alias ? `${action}#${count}` : baseKey;
    const request: AuthorizationCheck & { action: string; alias: string } = {
      action,
      alias: responseKey,
    };
    if (check.resource !== undefined) request.resource = check.resource;
    if (check.context !== undefined) request.context = check.context;

    return {
      original: check,
      responseKey,
      request,
    };
  });
}

function coerceCheck(check: string | AuthorizationCheck): AuthorizationCheck {
  return typeof check === "string" ? { action: check } : check;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function stripUndefined(value: AuthorizationCheck): AuthorizationCheck {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as AuthorizationCheck;
}
