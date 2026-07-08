import type { AuthorizationCheck, AuthorizationDecision, AuthorizationSnapshot } from "../types";

interface CacheEntry {
  decision: AuthorizationDecision;
  expiresAt: number;
}

export class AuthorizationCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlSeconds: number,
    private readonly enabled: boolean,
  ) {}

  get(namespace: string, check: AuthorizationCheck): boolean | undefined {
    if (!this.enabled) return undefined;
    const key = this.key(namespace, check);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.decision.allowed;
  }

  set(namespace: string, check: AuthorizationCheck, decision: AuthorizationDecision): void {
    if (!this.enabled) return;
    this.entries.set(this.key(namespace, check), {
      decision,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    });
  }

  hydrate(namespace: string, snapshot: AuthorizationSnapshot): void {
    for (const [action, decision] of Object.entries(snapshot)) {
      this.set(namespace, { action }, decision);
    }
  }

  invalidate(scope?: string): void {
    if (!scope) {
      this.entries.clear();
      return;
    }
    for (const key of this.entries.keys()) {
      if (key.includes(`"action":"${scope}:`) || key.includes(`"action":"${scope}`)) {
        this.entries.delete(key);
      }
    }
  }

  key(namespace: string, check: AuthorizationCheck): string {
    return `${namespace}:${stableStringify({
      action: check.action,
      resource: check.resource,
      context: check.context ?? {},
    })}`;
  }
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}
