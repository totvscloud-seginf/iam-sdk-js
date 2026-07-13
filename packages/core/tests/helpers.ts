import { vi } from "vitest";
import type { FetchLike } from "../src";

export interface FetchCall {
  url: string;
  init: RequestInit | undefined;
  body: unknown;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createFetchMock(handler: (call: FetchCall, index: number) => Response | Promise<Response>): {
  fetcher: FetchLike;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: FetchCall = {
      url: input.toString(),
      init,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as FetchLike;
  return { fetcher, calls };
}

export function token(value = "CCODE0"): string {
  const payload = Buffer.from(JSON.stringify({ ext: { tenant: value } })).toString("base64url");
  return `header.${payload}.signature`;
}
