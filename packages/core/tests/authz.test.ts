import { afterEach, describe, expect, it, vi } from "vitest";
import { IamClient, UnsupportedCapabilityKeyError } from "../src";
import { createFetchMock, jsonResponse, token } from "./helpers";

const STORAGE_KEY = "test:iam-authz-cache";

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("frontend authorization", () => {
  it("posts checks to the BFF without tenant in the body", async () => {
    const { fetcher, calls } = createFetchMock(() =>
      jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }),
    );
    const client = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher,
    }).setToken(token());

    const snapshot = await client.evaluate([{ action: "iam:listUsers" }]);

    expect(snapshot["iam:listUsers"]?.allowed).toBe(true);
    expect(calls[0]?.url).toBe("http://iam/frontend/authorizations/evaluate");
    expect(calls[0]?.init?.headers).toMatchObject({ Authorization: `Bearer ${token()}` });
    expect(calls[0]?.body).toEqual({
      checks: [{ action: "iam:listUsers", alias: "iam:listUsers" }],
    });
    expect(calls[0]?.body).not.toHaveProperty("tenant");
  });

  it("generates aliases for duplicate action response keys", async () => {
    const { fetcher, calls } = createFetchMock(() =>
      jsonResponse({
        decisions: {
          "iam:updateRole#0": { allowed: true },
          "iam:updateRole#1": { allowed: false },
        },
      }),
    );
    const client = new IamClient({ endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate", fetcher }).setToken(
      token(),
    );

    const snapshot = await client.evaluate([
      { action: "iam:updateRole", resource: "trn:tcloud:iam::CCODE0:role/admin" },
      { action: "iam:updateRole", resource: "trn:tcloud:iam::CCODE0:role/viewer" },
    ]);

    expect(calls[0]?.body).toEqual({
      checks: [
        {
          action: "iam:updateRole",
          alias: "iam:updateRole#0",
          resource: "trn:tcloud:iam::CCODE0:role/admin",
        },
        {
          action: "iam:updateRole",
          alias: "iam:updateRole#1",
          resource: "trn:tcloud:iam::CCODE0:role/viewer",
        },
      ],
    });
    expect(snapshot["iam:updateRole#0"]?.allowed).toBe(true);
    expect(snapshot["iam:updateRole#1"]?.allowed).toBe(false);
  });

  it("splits batches above the BFF limit of 50", async () => {
    const { fetcher, calls } = createFetchMock((call) => {
      const decisions = Object.fromEntries(
        (call.body as { checks: Array<{ alias: string }> }).checks.map((check) => [check.alias, { allowed: true }]),
      );
      return jsonResponse({ decisions });
    });
    const client = new IamClient({ endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate", fetcher }).setToken(
      token(),
    );

    const checks = Array.from({ length: 51 }, (_, index) => ({ action: `iam:action${index}` }));
    const snapshot = await client.evaluate(checks);

    expect(calls).toHaveLength(2);
    expect((calls[0]?.body as { checks: unknown[] }).checks).toHaveLength(50);
    expect((calls[1]?.body as { checks: unknown[] }).checks).toHaveLength(1);
    expect(Object.keys(snapshot)).toHaveLength(51);
  });

  it("rejects capability keys in v1", async () => {
    const client = new IamClient({ fetcher: createFetchMock(() => jsonResponse({})).fetcher }).setToken(token());

    await expect(client.evaluate([{ key: "iam.users.list" }])).rejects.toBeInstanceOf(UnsupportedCapabilityKeyError);
  });

  it("uses cache and invalidates it after setToken", async () => {
    const { fetcher, calls } = createFetchMock(() =>
      jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }),
    );
    const client = new IamClient({ endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate", fetcher }).setToken(
      token(),
    );

    await expect(client.can("iam:listUsers")).resolves.toBe(true);
    await expect(client.can("iam:listUsers")).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(client.getCached("iam:listUsers")).toBe(true);

    client.setToken(token("CCODE1"));
    expect(client.getCached("iam:listUsers")).toBeUndefined();
  });

  it("keeps cache in memory by default", async () => {
    const storage = installLocalStorageMock();
    const { fetcher } = createFetchMock(() => jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }));
    const client = new IamClient({ endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate", fetcher }).setToken(
      token(),
    );

    await client.can("iam:listUsers");

    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("persists cache in localStorage and reuses it with the same token", async () => {
    installLocalStorageMock();
    const first = createFetchMock(() => jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }));
    const client = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher: first.fetcher,
      cache: { storage: "localStorage", storageKey: STORAGE_KEY },
    }).setToken(token());

    await expect(client.can("iam:listUsers")).resolves.toBe(true);
    expect(first.calls).toHaveLength(1);

    const second = createFetchMock(() => jsonResponse({ decisions: { "iam:listUsers": { allowed: false } } }));
    const reloaded = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher: second.fetcher,
      cache: { storage: "localStorage", storageKey: STORAGE_KEY },
    }).setToken(token());

    await expect(reloaded.can("iam:listUsers")).resolves.toBe(true);
    expect(second.calls).toHaveLength(0);
  });

  it("does not reuse a persisted decision for a different token", async () => {
    installLocalStorageMock();
    const first = createFetchMock(() => jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }));
    const client = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher: first.fetcher,
      cache: { storage: "localStorage", storageKey: STORAGE_KEY },
    }).setToken(token("CCODE0"));

    await expect(client.can("iam:listUsers")).resolves.toBe(true);

    const second = createFetchMock(() => jsonResponse({ decisions: { "iam:listUsers": { allowed: false } } }));
    const reloaded = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher: second.fetcher,
      cache: { storage: "localStorage", storageKey: STORAGE_KEY },
    }).setToken(token("CCODE1"));

    await expect(reloaded.can("iam:listUsers")).resolves.toBe(false);
    expect(second.calls).toHaveLength(1);
  });

  it("keeps persisted entries after token changes until they expire", async () => {
    const storage = installLocalStorageMock();
    const { fetcher } = createFetchMock(() => jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }));
    const client = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher,
      cache: { storage: "localStorage", storageKey: STORAGE_KEY },
    }).setToken(token("CCODE0"));

    await client.can("iam:listUsers");
    const persistedBefore = storage.getItem(STORAGE_KEY);

    client.setToken(token("CCODE1"));

    expect(storage.getItem(STORAGE_KEY)).toBe(persistedBefore);
  });

  it("ignores and removes expired persisted entries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const storage = installLocalStorageMock();
    const first = createFetchMock(() => jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }));
    const client = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher: first.fetcher,
      cache: { ttl: 1, storage: "localStorage", storageKey: STORAGE_KEY },
    }).setToken(token());

    await client.can("iam:listUsers");

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    const second = createFetchMock(() => jsonResponse({ decisions: { "iam:listUsers": { allowed: false } } }));
    const reloaded = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher: second.fetcher,
      cache: { ttl: 1, storage: "localStorage", storageKey: STORAGE_KEY },
    }).setToken(token());

    await expect(reloaded.can("iam:listUsers")).resolves.toBe(false);
    expect(second.calls).toHaveLength(1);
    expect(storage.getItem(STORAGE_KEY)).toContain("\"allowed\":false");
    expect(storage.getItem(STORAGE_KEY)).not.toContain("\"allowed\":true");
  });

  it("invalidates persisted cache explicitly", async () => {
    const storage = installLocalStorageMock();
    const { fetcher } = createFetchMock(() => jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }));
    const client = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher,
      cache: { storage: "localStorage", storageKey: STORAGE_KEY },
    }).setToken(token());

    await client.can("iam:listUsers");
    expect(storage.getItem(STORAGE_KEY)).toContain("iam:listUsers");

    client.invalidateCache();

    expect(client.getCached("iam:listUsers")).toBeUndefined();
    expect(storage.getItem(STORAGE_KEY)).toBe("{\"version\":1,\"entries\":{}}");
  });

  it("invalidates persisted cache by scope", async () => {
    const storage = installLocalStorageMock();
    const { fetcher } = createFetchMock(() =>
      jsonResponse({
        decisions: {
          "iam:listUsers": { allowed: true },
          "billing:listInvoices": { allowed: true },
        },
      }),
    );
    const client = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher,
      cache: { storage: "localStorage", storageKey: STORAGE_KEY },
    }).setToken(token());

    await client.evaluate([{ action: "iam:listUsers" }, { action: "billing:listInvoices" }]);
    client.invalidateCache("iam");

    const persisted = storage.getItem(STORAGE_KEY);
    expect(client.getCached("iam:listUsers")).toBeUndefined();
    expect(client.getCached("billing:listInvoices")).toBe(true);
    expect(persisted).not.toContain("iam:listUsers");
    expect(persisted).toContain("billing:listInvoices");
  });

  it("does not read or write localStorage when cache is disabled", async () => {
    const storage = installLocalStorageMock();
    const { fetcher, calls } = createFetchMock(() =>
      jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }),
    );
    const client = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher,
      cache: { enabled: false, storage: "localStorage", storageKey: STORAGE_KEY },
    }).setToken(token());

    await client.can("iam:listUsers");
    await client.can("iam:listUsers");

    expect(calls).toHaveLength(2);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("falls back to memory cache when localStorage is invalid or unavailable", async () => {
    const storage = installLocalStorageMock();
    storage.setItem(STORAGE_KEY, "not json");
    const { fetcher, calls } = createFetchMock(() =>
      jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }),
    );
    const client = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher,
      cache: { storage: "localStorage", storageKey: STORAGE_KEY },
    }).setToken(token());

    await expect(client.can("iam:listUsers")).resolves.toBe(true);
    await expect(client.can("iam:listUsers")).resolves.toBe(true);

    expect(calls).toHaveLength(1);

    installThrowingLocalStorageMock();
    const withoutStorage = new IamClient({
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher,
      cache: { storage: "localStorage", storageKey: STORAGE_KEY },
    }).setToken(token());

    await expect(withoutStorage.can("iam:listUsers")).resolves.toBe(true);
  });

  it("tries fallback endpoints only for transport failures", async () => {
    const { fetcher, calls } = createFetchMock((call, index) => {
      if (index === 0) throw new Error("network down");
      return jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } });
    });
    const client = new IamClient({
      endpointAuthzBatchEvaluate: "http://primary/frontend/authorizations/evaluate",
      endpointAuthzBatchEvaluateFallbacks: ["http://fallback/frontend/authorizations/evaluate"],
      fetcher,
    }).setToken(token());

    await expect(client.can("iam:listUsers")).resolves.toBe(true);
    expect(calls.map((call) => call.url)).toEqual([
      "http://primary/frontend/authorizations/evaluate",
      "http://fallback/frontend/authorizations/evaluate",
    ]);
  });
});

function installLocalStorageMock(): Storage {
  const items = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return items.size;
    },
    clear: vi.fn(() => items.clear()),
    getItem: vi.fn((key: string) => items.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(items.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      items.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      items.set(key, value);
    }),
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  return storage;
}

function installThrowingLocalStorageMock(): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("storage unavailable");
    },
  });
}
