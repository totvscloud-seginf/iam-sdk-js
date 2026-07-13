import { InvalidRequestError, NotAuthorizedError, TokenInvalidError, TransportError } from "../errors";
import type { FetchLike } from "../types";

export interface HttpClientOptions {
  fetcher?: FetchLike | undefined;
  timeoutMs: number;
}

export interface RequestJsonOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  endpoints?: string[];
}

export class HttpClient {
  private readonly fetcher: FetchLike;

  constructor(private readonly options: HttpClientOptions) {
    this.fetcher = options.fetcher ?? globalThis.fetch?.bind(globalThis);
    if (!this.fetcher) {
      throw new TransportError("No fetch implementation available. Provide a fetcher in IamClient config.");
    }
  }

  async requestJson<T>(url: string, options: RequestJsonOptions = {}): Promise<T> {
    const endpoints = options.endpoints?.length ? options.endpoints : [url];
    let lastError: unknown;

    for (const endpoint of endpoints) {
      try {
        return await this.send<T>(endpoint, options);
      } catch (error) {
        if (!isTransportLikeError(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    throw new TransportError("Request failed on all configured endpoints.", { cause: lastError });
  }

  private async send<T>(url: string, options: RequestJsonOptions): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const requestInit: RequestInit = {
        method: options.method ?? "GET",
        headers: {
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...options.headers,
        },
        signal: controller.signal,
      };
      if (options.body !== undefined) {
        requestInit.body = JSON.stringify(options.body);
      }

      const response = await this.fetcher(url, requestInit);

      const responseBody = await parseResponseBody(response);
      if (!response.ok) {
        throw mapHttpError(response.status, responseBody);
      }
      return responseBody as T;
    } catch (error) {
      if (error instanceof InvalidRequestError || error instanceof TokenInvalidError || error instanceof NotAuthorizedError) {
        throw error;
      }
      throw new TransportError(error instanceof Error ? error.message : "Network request failed", { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new InvalidRequestError(response.status, "Invalid JSON response", text);
  }
}

function mapHttpError(status: number, body: unknown): Error {
  const message = extractMessage(body);
  if (status === 401) return new TokenInvalidError(message);
  if (status === 403) return new NotAuthorizedError(message);
  return new InvalidRequestError(status, message, body);
}

function extractMessage(body: unknown): string {
  if (body && typeof body === "object") {
    const object = body as Record<string, unknown>;
    const message = object.message ?? object.error ?? object.reason;
    if (typeof message === "string") return message;
  }
  return "Invalid API request";
}

function isTransportLikeError(error: unknown): boolean {
  return error instanceof TransportError;
}
