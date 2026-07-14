import type { AuthorizationCheck, AuthorizationDecision, AuthorizationSnapshot } from "../types";

interface CacheEntry {
  decision: AuthorizationDecision;
  expiresAt: number;
}

type CacheStorage = "memory" | "localStorage";

interface PersistedCache {
  version: 1;
  entries: Record<string, CacheEntry>;
}

export class AuthorizationCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlSeconds: number,
    private readonly enabled: boolean,
    private readonly storage: CacheStorage = "memory",
    private readonly storageKey = "@totvs-cloud/iam-sdk:authz-cache:v1",
  ) {
    this.loadPersisted();
  }

  get(namespace: string, check: AuthorizationCheck): boolean | undefined {
    if (!this.enabled) return undefined;
    this.loadPersisted();
    const key = this.key(namespace, check);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      this.persist();
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
    this.persist();
  }

  hydrate(namespace: string, snapshot: AuthorizationSnapshot): void {
    for (const [action, decision] of Object.entries(snapshot)) {
      this.set(namespace, { action }, decision);
    }
  }

  invalidate(scope?: string): void {
    if (!scope) {
      this.entries.clear();
      this.persist();
      return;
    }
    for (const key of this.entries.keys()) {
      if (key.includes(`"action":"${scope}:`) || key.includes(`"action":"${scope}`)) {
        this.entries.delete(key);
      }
    }
    this.persist();
  }

  invalidateMemory(scope?: string): void {
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

  private loadPersisted(): void {
    if (!this.enabled || this.storage !== "localStorage") return;
    const storage = this.localStorage();
    if (!storage) return;

    try {
      const raw = storage.getItem(this.storageKey);
      if (!raw) return;
      const persisted = JSON.parse(raw) as Partial<PersistedCache>;
      if (persisted.version !== 1 || !persisted.entries || typeof persisted.entries !== "object") return;

      const now = Date.now();
      let changed = false;
      for (const [key, entry] of Object.entries(persisted.entries)) {
        if (isCacheEntry(entry) && entry.expiresAt > now) {
          this.entries.set(key, entry);
        } else {
          changed = true;
        }
      }
      if (changed) this.persist();
    } catch {
      return;
    }
  }

  private persist(): void {
    if (!this.enabled || this.storage !== "localStorage") return;
    const storage = this.localStorage();
    if (!storage) return;

    try {
      this.pruneExpired();
      storage.setItem(
        this.storageKey,
        JSON.stringify({
          version: 1,
          entries: Object.fromEntries(this.entries),
        } satisfies PersistedCache),
      );
    } catch {
      return;
    }
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private localStorage(): Storage | undefined {
    try {
      return globalThis.localStorage;
    } catch {
      return undefined;
    }
  }
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CacheEntry>;
  return (
    typeof entry.expiresAt === "number" &&
    !!entry.decision &&
    typeof entry.decision === "object" &&
    typeof entry.decision.allowed === "boolean"
  );
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
