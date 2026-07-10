import { describe, expect, it } from "vitest";
import { IamClient, NotAuthorizedError, TokenInvalidError } from "../src";
import { createFetchMock, jsonResponse, token } from "./helpers";

describe("authn", () => {
  it("logs in and stores the access token", async () => {
    const { fetcher, calls } = createFetchMock(() =>
      jsonResponse({ data: { access_token: "access.jwt", expires_in: 3600 } }),
    );
    const client = new IamClient({ endpointAuthn: "http://authn/api", fetcher });

    await expect(client.login({ apiAccessKey: "user", apiSecretKey: "secret", region: "sa", service: "iam" })).resolves.toBe(
      "access.jwt",
    );

    expect(client.getToken()).toBe("access.jwt");
    expect(calls[0]?.url).toBe("http://authn/api/login");
    expect(calls[0]?.body).toEqual({
      username: "user",
      password: "secret",
      region: "sa",
      service: "iam",
    });
  });

  it("assumes role and invalidates authorization cache", async () => {
    const { fetcher } = createFetchMock((call) => {
      if (call.url.endsWith("/evaluate")) {
        return jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } });
      }
      return jsonResponse({ data: { access_token: token("CCODE1") } });
    });
    const client = new IamClient({
      endpointAuthn: "http://authn/api",
      endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
      fetcher,
    }).setToken(token("CCODE0"));

    await client.can("iam:listUsers");
    expect(client.getCached("iam:listUsers")).toBe(true);
    await client.assumeRole({ roleName: "admin", tenant: "CCODE1" });

    expect(client.getToken()).toBe(token("CCODE1"));
    expect(client.getCached("iam:listUsers")).toBeUndefined();
  });

  it("lists roles and validates token", async () => {
    const { fetcher } = createFetchMock((call) => {
      if (call.url.endsWith("/me/roles")) return jsonResponse({ data: { roles: [{ name: "admin" }] } });
      return jsonResponse({ data: { ext: { tenant: "CCODE0" } } });
    });
    const client = new IamClient({ endpointAuthn: "http://authn/api", fetcher }).setToken(token());

    await expect(client.listMyRoles()).resolves.toEqual([{ name: "admin" }]);
    await expect(client.validateToken()).resolves.toEqual({ ext: { tenant: "CCODE0" } });
  });

  it("maps 401 and 403 responses to typed errors", async () => {
    const unauthorized = new IamClient({
      endpointAuthn: "http://authn/api",
      fetcher: createFetchMock(() => jsonResponse({ message: "expired" }, 401)).fetcher,
    }).setToken(token());
    await expect(unauthorized.validateToken()).rejects.toBeInstanceOf(TokenInvalidError);

    const forbidden = new IamClient({
      endpointAuthn: "http://authn/api",
      fetcher: createFetchMock(() => jsonResponse({ message: "forbidden" }, 403)).fetcher,
    }).setToken(token());
    await expect(forbidden.assumeRole({ roleName: "admin", tenant: "CCODE0" })).rejects.toBeInstanceOf(
      NotAuthorizedError,
    );
  });
});
