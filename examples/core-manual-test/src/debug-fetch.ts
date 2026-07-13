import type { DebugCall, InstrumentedFetcher } from "./types";
import type { FetchLike } from "../../../packages/core/src";

export function createInstrumentedFetcher(
  delegate: FetchLike,
  onCall: (call: DebugCall) => void,
): InstrumentedFetcher {
  let nextLabel = "fetch";

  return {
    setLabel(label: string) {
      nextLabel = label;
    },
    async fetcher(input, init) {
      const label = nextLabel;
      nextLabel = "fetch";
      const started = performance.now();
      const startedAt = new Date().toISOString();
      const url = input.toString();
      const method = init?.method ?? "GET";
      const requestHeaders = normalizeHeaders(init?.headers);
      const requestBody = parseBody(init?.body);

      try {
        const response = await delegate(input, init);
        const responseBody = await readResponseBody(response);
        onCall({
          id: crypto.randomUUID(),
          label,
          url,
          method,
          requestHeaders,
          requestBody,
          status: response.status,
          ok: response.ok,
          responseBody,
          durationMs: Math.round(performance.now() - started),
          startedAt,
        });
        return response;
      } catch (error) {
        onCall({
          id: crypto.randomUUID(),
          label,
          url,
          method,
          requestHeaders,
          requestBody,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
          durationMs: Math.round(performance.now() - started),
          startedAt,
        });
        throw error;
      }
    },
  };
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (!body) return undefined;
  if (typeof body !== "string") return "[non-string body]";
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.clone().text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
