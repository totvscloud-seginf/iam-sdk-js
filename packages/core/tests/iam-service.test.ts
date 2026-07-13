import { describe, expect, it } from "vitest";
import { IamClient } from "../src";
import { createFetchMock, jsonResponse, token } from "./helpers";

describe("iam control plane service", () => {
  it("creates IAM resources with the same payload shape as the Python SDK", async () => {
    const { fetcher, calls } = createFetchMock(() => jsonResponse({ data: {} }));
    const client = new IamClient({ endpointCp: "http://iam/v1", fetcher }).setToken(token());

    await client.iam.createPolicy("policy", "description", [{ Effect: "permit" }]);
    await client.iam.createRole("role", "role", { Effect: "permit" });
    await client.iam.createService("svc", "tenant", []);

    expect(calls[0]?.url).toBe("http://iam/v1/policies");
    expect(calls[0]?.body).toMatchObject({
      name: "policy",
      policyType: "tenant",
      engineVersion: "2023-09-18",
      statements: [{ Effect: "permit" }],
    });
    expect(calls[1]?.body).toMatchObject({
      name: "role",
      type: "role",
      trustPolicyEngineVersion: "2023-09-18",
    });
    expect(calls[2]?.body).toMatchObject({
      name: "svc",
      type: "tenant",
      permissionsManifest: [],
    });
  });

  it("encodes path parameters for attachments and deletes", async () => {
    const { fetcher, calls } = createFetchMock(() => jsonResponse({ data: {} }));
    const client = new IamClient({ endpointCp: "http://iam/v1", fetcher }).setToken(token());

    await client.iam.attachRolePolicies("admin role", ["trn:tenant::iam::global:policy/name"]);
    await client.iam.detachUserPolicy("user@example.com", "trn:tenant::iam::global:policy/name");

    expect(calls[0]?.url).toBe("http://iam/v1/roles/admin+role/policies");
    expect(calls[1]?.url).toBe(
      "http://iam/v1/users/user%40example.com/policies/trn%3Atenant%3A%3Aiam%3A%3Aglobal%3Apolicy%2Fname",
    );
  });

  it("supports list and get helpers", async () => {
    const { fetcher, calls } = createFetchMock((call) => {
      if (call.url.includes("/users/alice")) return jsonResponse({ data: { username: "alice" } });
      return jsonResponse({ data: { items: [] } });
    });
    const client = new IamClient({ endpointCp: "http://iam/v1", fetcher }).setToken(token());

    await expect(client.iam.getUser("alice")).resolves.toEqual({ username: "alice" });
    await client.iam.listUsers(2, 25);

    expect(calls[1]?.url).toBe("http://iam/v1/users?page=2&size=25");
  });
});
