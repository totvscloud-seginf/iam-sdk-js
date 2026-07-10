import type { AuthorizationCheck, FetchLike } from "../../../src";
import type { MockConfig } from "./types";

interface MockRequest {
  url: URL;
  method: string;
  body: Record<string, unknown>;
}

export function createMockFetcher(config: MockConfig): FetchLike {
  return async (input, init) => {
    if (config.failure === "transport") {
      throw new Error("Mock transport failure");
    }
    if (config.failure === "invalid-json") {
      return new Response("not json", { status: 200 });
    }
    if (config.failure === "401") {
      return json({ message: "mock token expired" }, 401);
    }
    if (config.failure === "403") {
      return json({ message: "mock forbidden" }, 403);
    }

    const request: MockRequest = {
      url: new URL(input.toString()),
      method: init?.method ?? "GET",
      body: parseBody(init?.body),
    };
    const path = request.url.pathname;

    if (request.method === "POST" && path.endsWith("/login/assumerole")) {
      const tenant = stringValue(request.body.tenant) || "CCODE1";
      const role = stringValue(request.body.role) || "admin";
      return json({
        data: {
          access_token: token({ tenant, role, source: "assumeRole" }),
          expires_in: 3600,
          role,
        },
      });
    }

    if (request.method === "POST" && path.endsWith("/login")) {
      return json({
        data: {
          access_token: token({ tenant: "CCODE0", role: "user", source: "login" }),
          expires_in: 3600,
        },
      });
    }

    if (request.method === "GET" && path.endsWith("/me/roles")) {
      return json({
        data: {
          roles: [
            { name: "admin", tenant: "CCODE0", description: "Mock admin role" },
            { name: "viewer", tenant: "CCODE1", description: "Mock viewer role" },
          ],
        },
      });
    }

    if (request.method === "GET" && path.endsWith("/token/validate")) {
      const authorization = String(init?.headers && "Authorization" in init.headers ? init.headers.Authorization : "");
      return json({
        data: {
          active: true,
          sub: "mock-user",
          authorization,
          ext: { tenant: tenantFromAuthorization(authorization) },
        },
      });
    }

    if (request.method === "POST" && path.endsWith("/frontend/authorizations/evaluate")) {
      const checks = Array.isArray(request.body.checks) ? (request.body.checks as AuthorizationCheck[]) : [];
      const denied = new Set(
        config.deniedActions
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      );
      const decisions = Object.fromEntries(
        checks.map((check) => {
          const key = check.alias || check.action || "unknown";
          const action = check.action ?? "";
          return [key, { allowed: denied.has(action) ? false : config.defaultAllowed }];
        }),
      );
      return json({ decisions });
    }

    return json({ message: `Mock route not found: ${request.method} ${path}` }, 404);
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (!body || typeof body !== "string") return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function token(payload: Record<string, unknown>): string {
  const header = encode({ alg: "none", typ: "JWT" });
  const body = encode({ sub: "mock-user", ext: { tenant: payload.tenant }, ...payload });
  return `${header}.${body}.signature`;
}

function encode(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function tenantFromAuthorization(authorization: string): string {
  const [, payload] = authorization.replace(/^Bearer\s+/i, "").split(".");
  if (!payload) return "CCODE0";
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded)) as { ext?: { tenant?: string } };
    return decoded.ext?.tenant ?? "CCODE0";
  } catch {
    return "CCODE0";
  }
}
