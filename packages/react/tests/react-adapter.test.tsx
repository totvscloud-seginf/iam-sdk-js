// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IamClient, type FetchLike } from "@totvs-cloud/iam-sdk";
import { AuthzProvider, Can, CanAll, CanAny, useCan, useCanAll, useCanAny, useIamClient } from "../src";

interface FetchCall {
  body: unknown;
  url: string;
}

type LooseFetchLike = (input: string | URL | Request, init?: RequestInit) => Response | Promise<Response>;

afterEach(cleanup);

describe("React IAM authorization adapter", () => {
  it("provides an existing IamClient", () => {
    const client = createClient(() => jsonResponse({ decisions: {} }));

    function Probe() {
      return <span>{useIamClient() === client ? "same" : "different"}</span>;
    }

    render(
      <AuthzProvider client={client}>
        <Probe />
      </AuthzProvider>,
    );

    expect(screen.getByText("same")).toBeTruthy();
  });

  it("creates an IamClient from config", async () => {
    const { fetcher } = createFetchMock(() =>
      jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }),
    );

    render(
      <AuthzProvider
        config={{
          endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
          fetcher,
        }}
      >
        <StateProbe action="iam:listUsers" />
      </AuthzProvider>,
    );

    await waitFor(() => expect(screen.getByText("allowed")).toBeTruthy());
  });

  it("preloads initial checks and renders fallback while loading", async () => {
    const deferred = createDeferred<Response>();
    const { fetcher } = createFetchMock(() => deferred.promise);
    const client = createClient(fetcher);

    render(
      <AuthzProvider client={client} fallback={<span>loading</span>} initialChecks={["iam:listUsers"]}>
        <span>ready</span>
      </AuthzProvider>,
    );

    expect(screen.getByText("loading")).toBeTruthy();
    deferred.resolve(jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }));
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
  });

  it("uses cached decisions before fetching", async () => {
    const { fetcher, calls } = createFetchMock(() =>
      jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }),
    );
    const client = createClient(fetcher);
    await client.evaluate([{ action: "iam:listUsers" }]);

    render(
      <AuthzProvider client={client}>
        <StateProbe action="iam:listUsers" />
      </AuthzProvider>,
    );

    expect(screen.getByText("allowed")).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it("deduplicates simultaneous useCan checks", async () => {
    const { fetcher, calls } = createFetchMock(() =>
      jsonResponse({ decisions: { "iam:listUsers": { allowed: true } } }),
    );
    const client = createClient(fetcher);

    render(
      <AuthzProvider client={client}>
        <StateProbe action="iam:listUsers" />
        <StateProbe action="iam:listUsers" />
      </AuthzProvider>,
    );

    await waitFor(() => expect(screen.getAllByText("allowed")).toHaveLength(2));
    expect(calls).toHaveLength(1);
  });

  it("refreshes a decision", async () => {
    const { fetcher, calls } = createFetchMock((_, index) =>
      jsonResponse({
        decisions: {
          "iam:listUsers": { allowed: index > 0 },
        },
      }),
    );
    const client = createClient(fetcher);

    render(
      <AuthzProvider client={client}>
        <RefreshProbe />
      </AuthzProvider>,
    );

    await waitFor(() => expect(screen.getByText("denied")).toBeTruthy());
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("allowed")).toBeTruthy());
    expect(calls).toHaveLength(2);
  });

  it("renders Can children only when allowed", async () => {
    const client = createClient(() =>
      jsonResponse({ decisions: { "iam:createUser": { allowed: false } } }),
    );

    render(
      <AuthzProvider client={client}>
        <Can action="iam:createUser" fallback={<span>blocked</span>}>
          <span>visible</span>
        </Can>
      </AuthzProvider>,
    );

    await waitFor(() => expect(screen.getByText("blocked")).toBeTruthy());
    expect(screen.queryByText("visible")).toBeNull();
  });

  it("allows useCanAny when at least one check is allowed", async () => {
    const client = createClient(() =>
      jsonResponse({
        decisions: {
          "iam:createUser": { allowed: false },
          "iam:listUsers": { allowed: true },
        },
      }),
    );

    render(
      <AuthzProvider client={client}>
        <GroupStateProbe checks={["iam:createUser", "iam:listUsers"]} mode="any" />
      </AuthzProvider>,
    );

    await waitFor(() => expect(screen.getByText("allowed")).toBeTruthy());
  });

  it("denies useCanAll when any check is denied", async () => {
    const client = createClient(() =>
      jsonResponse({
        decisions: {
          "iam:createUser": { allowed: true },
          "iam:deleteUser": { allowed: false },
        },
      }),
    );

    render(
      <AuthzProvider client={client}>
        <GroupStateProbe checks={["iam:createUser", "iam:deleteUser"]} mode="all" />
      </AuthzProvider>,
    );

    await waitFor(() => expect(screen.getByText("denied")).toBeTruthy());
  });

  it("renders CanAny and CanAll with group decisions", async () => {
    const client = createClient((input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : { checks: [] };
      const decisions = Object.fromEntries(
        (body.checks as Array<{ alias: string; action: string }>).map((check) => [
          check.alias,
          { allowed: check.action !== "iam:deleteUser" },
        ]),
      );
      return jsonResponse({ decisions });
    });

    render(
      <AuthzProvider client={client}>
        <CanAny checks={["iam:deleteUser", "iam:listUsers"]} fallback={<span>any-blocked</span>}>
          <span>any-visible</span>
        </CanAny>
        <CanAll checks={["iam:listUsers", "iam:deleteUser"]} fallback={<span>all-blocked</span>}>
          <span>all-visible</span>
        </CanAll>
      </AuthzProvider>,
    );

    await waitFor(() => expect(screen.getByText("any-visible")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("all-blocked")).toBeTruthy());
    expect(screen.queryByText("any-blocked")).toBeNull();
    expect(screen.queryByText("all-visible")).toBeNull();
  });

  it("treats empty useCanAll as allowed", () => {
    const client = createClient(() => jsonResponse({ decisions: {} }));

    render(
      <AuthzProvider client={client}>
        <GroupStateProbe checks={[]} mode="all" />
      </AuthzProvider>,
    );

    expect(screen.getByText("allowed")).toBeTruthy();
  });

  it("reports errors and denies by default", async () => {
    const onError = vi.fn();
    const client = createClient(() => {
      throw new Error("network down");
    });

    render(
      <AuthzProvider client={client} onError={onError}>
        <StateProbe action="iam:listUsers" />
      </AuthzProvider>,
    );

    await waitFor(() => expect(screen.getByText("TransportError")).toBeTruthy());
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("keeps capability keys rejected by the core SDK", async () => {
    const client = createClient(() => jsonResponse({ decisions: {} }));

    render(
      <AuthzProvider client={client}>
        <StateProbe check={{ key: "iam.users.list" }} />
      </AuthzProvider>,
    );

    await waitFor(() => expect(screen.getByText("UnsupportedCapabilityKeyError")).toBeTruthy());
    expect(screen.getByText("UnsupportedCapabilityKeyError")).toBeTruthy();
  });
});

function StateProbe({ action, check }: { action?: string; check?: Parameters<typeof useCan>[0] }) {
  const result = useCan(check ?? action!);
  if (result.error) return <span>{result.error.constructor.name}</span>;
  if (result.loading) return <span>loading</span>;
  return <span>{result.allowed ? "allowed" : "denied"}</span>;
}

function RefreshProbe() {
  const result = useCan("iam:listUsers");
  return (
    <>
      <span>{result.loading ? "loading" : result.allowed ? "allowed" : "denied"}</span>
      <button type="button" onClick={() => void result.refresh()}>
        refresh
      </button>
    </>
  );
}

function GroupStateProbe({ checks, mode }: { checks: string[]; mode: "all" | "any" }) {
  const result = mode === "all" ? useCanAll(checks) : useCanAny(checks);
  if (result.error) return <span>{result.error.constructor.name}</span>;
  if (result.loading) return <span>loading</span>;
  return <span>{result.allowed ? "allowed" : "denied"}</span>;
}

function createClient(fetcher: LooseFetchLike): IamClient {
  const wrappedFetcher = (async (input: string | URL | Request, init?: RequestInit) =>
    fetcher(input, init)) as FetchLike;
  return new IamClient({
    endpointAuthzBatchEvaluate: "http://iam/frontend/authorizations/evaluate",
    fetcher: wrappedFetcher,
  }).setToken(token());
}

function createFetchMock(handler: (call: FetchCall, index: number) => Response | Promise<Response>): {
  calls: FetchCall[];
  fetcher: FetchLike;
} {
  const calls: FetchCall[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call = {
      url: input.toString(),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as FetchLike;
  return { calls, fetcher };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function token(value = "CCODE0"): string {
  const payload = btoa(JSON.stringify({ ext: { tenant: value } }));
  return `header.${payload}.signature`;
}

function createDeferred<T>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, reject, resolve };
}
