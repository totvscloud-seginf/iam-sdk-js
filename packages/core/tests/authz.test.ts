import { describe, expect, it } from "vitest";
import { IamClient, UnsupportedCapabilityKeyError } from "../src";
import { createFetchMock, jsonResponse, token } from "./helpers";

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
