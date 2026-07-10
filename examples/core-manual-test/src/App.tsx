import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IamClient, type AuthorizationCheck, type AuthorizationSnapshot } from "../../../src";
import { createInstrumentedFetcher } from "./debug-fetch";
import { createMockFetcher } from "./mock";
import { defaultConfig, loadConfig, loadToken, saveConfig, saveToken } from "./storage";
import type { AppConfig, DebugCall, MockConfig } from "./types";

type Tab = "authn" | "authz";

const defaultChecks: AuthorizationCheck[] = [
  { action: "iam:listUsers" },
  {
    action: "iam:updateRole",
    alias: "editAdminRole",
    resource: "trn:tcloud:iam::CCODE0:role/admin-role",
    context: { requestedRegion: "global" },
  },
];

const defaultSnapshot = JSON.stringify({ "iam:listUsers": { allowed: true } }, null, 2);

export function App() {
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const [mockConfig, setMockConfig] = useState<MockConfig>({
    failure: "none",
    defaultAllowed: true,
    deniedActions: "iam:deleteUser,iam:updateRole",
  });
  const [token, setTokenState] = useState(() => (loadConfig().persistToken ? loadToken() : ""));
  const [tokenInput, setTokenInput] = useState(token);
  const [calls, setCalls] = useState<DebugCall[]>([]);
  const [tab, setTab] = useState<Tab>("authn");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<unknown>({});
  const [error, setError] = useState("");

  const [loginForm, setLoginForm] = useState({
    apiAccessKey: "mock-user",
    apiSecretKey: "",
    region: "sa-east-1",
    service: "iam",
  });
  const [assumeRoleForm, setAssumeRoleForm] = useState({
    roleName: "admin",
    tenant: "CCODE1",
    region: "sa-east-1",
    service: "iam",
  });
  const [checksJson, setChecksJson] = useState(JSON.stringify(defaultChecks, null, 2));
  const [singleCheckJson, setSingleCheckJson] = useState(JSON.stringify({ action: "iam:listUsers" }, null, 2));
  const [snapshotJson, setSnapshotJson] = useState(defaultSnapshot);
  const [cacheScope, setCacheScope] = useState("");

  const instrumentedRef = useRef<ReturnType<typeof createInstrumentedFetcher> | undefined>(undefined);

  useEffect(() => {
    saveConfig(config);
    if (config.persistToken) {
      saveToken(token);
    } else {
      saveToken("");
    }
  }, [config, token]);

  const fetcher = useMemo(() => {
    const delegate = config.mode === "mock" ? createMockFetcher(mockConfig) : globalThis.fetch.bind(globalThis);
    const instrumented = createInstrumentedFetcher(delegate, (call) => {
      setCalls((items) => [call, ...items].slice(0, 80));
    });
    instrumentedRef.current = instrumented;
    return instrumented.fetcher;
  }, [config.mode, mockConfig]);

  const client = useMemo(() => {
    const iam = new IamClient({
      endpointAuthn: config.endpointAuthn,
      endpointAuthzFrontend: config.endpointAuthzFrontend,
      endpointAuthzFrontendFallbacks: config.endpointAuthzFrontendFallbacks,
      timeoutMs: config.timeoutMs,
      cache: { enabled: config.cacheEnabled, ttl: config.cacheTtlSeconds },
      fetcher,
    });
    if (token) iam.setToken(token);
    return iam;
  }, [config, fetcher, token]);

  const setToken = useCallback((nextToken: string) => {
    setTokenState(nextToken);
    setTokenInput(nextToken);
  }, []);

  const run = useCallback(
    async (label: string, operation: () => Promise<unknown> | unknown) => {
      setBusy(label);
      setError("");
      instrumentedRef.current?.setLabel(label);
      const started = performance.now();
      try {
        const value = await operation();
        const nextToken = client.getToken();
        if (nextToken !== token) setToken(nextToken);
        setResult({ label, durationMs: Math.round(performance.now() - started), value });
      } catch (caught) {
        setError(formatError(caught));
        setResult({ label, durationMs: Math.round(performance.now() - started), error: serializeError(caught) });
      } finally {
        setBusy("");
      }
    },
    [client, setToken, token],
  );

  const decodedToken = useMemo(() => decodeJwtPayload(token), [token]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>IAM SDK Core Manual Test</h1>
          <p>Manual AuthN/AuthZ debug surface for the local SDK source.</p>
        </div>
        <div className="mode-toggle" role="group" aria-label="Runtime mode">
          <button className={config.mode === "mock" ? "active" : ""} onClick={() => updateConfig(setConfig, { mode: "mock" })}>
            Mock
          </button>
          <button className={config.mode === "real" ? "active" : ""} onClick={() => updateConfig(setConfig, { mode: "real" })}>
            Real
          </button>
        </div>
      </header>

      <section className="grid config-grid">
        <Field label="AuthN endpoint">
          <input value={config.endpointAuthn} onChange={(event) => updateConfig(setConfig, { endpointAuthn: event.target.value })} />
        </Field>
        <Field label="AuthZ frontend endpoint">
          <input
            value={config.endpointAuthzFrontend}
            onChange={(event) => updateConfig(setConfig, { endpointAuthzFrontend: event.target.value })}
          />
        </Field>
        <Field label="AuthZ fallback endpoints">
          <input
            value={config.endpointAuthzFrontendFallbacks}
            onChange={(event) => updateConfig(setConfig, { endpointAuthzFrontendFallbacks: event.target.value })}
            placeholder="comma separated"
          />
        </Field>
        <Field label="Timeout ms">
          <input
            type="number"
            min="1"
            value={config.timeoutMs}
            onChange={(event) => updateConfig(setConfig, { timeoutMs: Number(event.target.value) })}
          />
        </Field>
        <Field label="Cache TTL seconds">
          <input
            type="number"
            min="0"
            value={config.cacheTtlSeconds}
            onChange={(event) => updateConfig(setConfig, { cacheTtlSeconds: Number(event.target.value) })}
          />
        </Field>
        <label className="check-row">
          <input
            type="checkbox"
            checked={config.cacheEnabled}
            onChange={(event) => updateConfig(setConfig, { cacheEnabled: event.target.checked })}
          />
          Cache enabled
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={config.persistToken}
            onChange={(event) => updateConfig(setConfig, { persistToken: event.target.checked })}
          />
          Persist token
        </label>
        <button className="secondary" onClick={() => setConfig(defaultConfig)}>
          Reset config
        </button>
      </section>

      {config.mode === "mock" ? (
        <section className="panel mock-panel">
          <h2>Mock behavior</h2>
          <Field label="Failure mode">
            <select
              value={mockConfig.failure}
              onChange={(event) => setMockConfig((current) => ({ ...current, failure: event.target.value as MockConfig["failure"] }))}
            >
              <option value="none">none</option>
              <option value="401">401</option>
              <option value="403">403</option>
              <option value="invalid-json">invalid-json</option>
              <option value="transport">transport</option>
            </select>
          </Field>
          <label className="check-row">
            <input
              type="checkbox"
              checked={mockConfig.defaultAllowed}
              onChange={(event) => setMockConfig((current) => ({ ...current, defaultAllowed: event.target.checked }))}
            />
            Default allowed
          </label>
          <Field label="Denied actions">
            <input
              value={mockConfig.deniedActions}
              onChange={(event) => setMockConfig((current) => ({ ...current, deniedActions: event.target.value }))}
            />
          </Field>
        </section>
      ) : null}

      <section className="workspace">
        <aside className="panel session-panel">
          <h2>Session</h2>
          <textarea value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} rows={5} spellCheck={false} />
          <div className="button-row">
            <button onClick={() => setToken(tokenInput)}>Set token</button>
            <button
              className="secondary"
              onClick={() => {
                client.invalidateCache();
                setToken("");
              }}
            >
              Clear token
            </button>
          </div>
          <JsonBlock title="JWT payload" value={decodedToken} />
        </aside>

        <section className="main-panel">
          <nav className="tabs">
            <button className={tab === "authn" ? "active" : ""} onClick={() => setTab("authn")}>
              AuthN
            </button>
            <button className={tab === "authz" ? "active" : ""} onClick={() => setTab("authz")}>
              AuthZ
            </button>
          </nav>

          {tab === "authn" ? (
            <section className="panel tool-panel">
              <h2>AuthN</h2>
              <div className="form-grid">
                <Field label="apiAccessKey">
                  <input value={loginForm.apiAccessKey} onChange={(event) => setLoginForm({ ...loginForm, apiAccessKey: event.target.value })} />
                </Field>
                <Field label="apiSecretKey">
                  <input
                    type="password"
                    value={loginForm.apiSecretKey}
                    onChange={(event) => setLoginForm({ ...loginForm, apiSecretKey: event.target.value })}
                  />
                </Field>
                <Field label="region">
                  <input value={loginForm.region} onChange={(event) => setLoginForm({ ...loginForm, region: event.target.value })} />
                </Field>
                <Field label="service">
                  <input value={loginForm.service} onChange={(event) => setLoginForm({ ...loginForm, service: event.target.value })} />
                </Field>
              </div>
              <div className="button-row">
                <button disabled={Boolean(busy)} onClick={() => run("login", () => client.login(clean(loginForm)))}>
                  Login
                </button>
                <button disabled={Boolean(busy)} onClick={() => run("validateToken", () => client.validateToken())}>
                  Validate token
                </button>
                <button disabled={Boolean(busy)} onClick={() => run("listMyRoles", () => client.listMyRoles())}>
                  List my roles
                </button>
              </div>

              <h3>Assume role</h3>
              <div className="form-grid">
                <Field label="roleName">
                  <input
                    value={assumeRoleForm.roleName}
                    onChange={(event) => setAssumeRoleForm({ ...assumeRoleForm, roleName: event.target.value })}
                  />
                </Field>
                <Field label="tenant">
                  <input value={assumeRoleForm.tenant} onChange={(event) => setAssumeRoleForm({ ...assumeRoleForm, tenant: event.target.value })} />
                </Field>
                <Field label="region">
                  <input value={assumeRoleForm.region} onChange={(event) => setAssumeRoleForm({ ...assumeRoleForm, region: event.target.value })} />
                </Field>
                <Field label="service">
                  <input value={assumeRoleForm.service} onChange={(event) => setAssumeRoleForm({ ...assumeRoleForm, service: event.target.value })} />
                </Field>
              </div>
              <button disabled={Boolean(busy)} onClick={() => run("assumeRole", () => client.assumeRole(clean(assumeRoleForm)))}>
                Assume role
              </button>
            </section>
          ) : (
            <section className="panel tool-panel">
              <h2>AuthZ</h2>
              <Field label="Evaluate checks JSON">
                <textarea value={checksJson} onChange={(event) => setChecksJson(event.target.value)} rows={11} spellCheck={false} />
              </Field>
              <div className="button-row">
                <button disabled={Boolean(busy)} onClick={() => run("evaluate", () => client.evaluate(parseChecks(checksJson)))}>
                  Evaluate
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    setChecksJson(JSON.stringify(Array.from({ length: 51 }, (_, index) => ({ action: `iam:action${index}` })), null, 2))
                  }
                >
                  Generate 51 checks
                </button>
              </div>

              <Field label="Single check JSON">
                <textarea value={singleCheckJson} onChange={(event) => setSingleCheckJson(event.target.value)} rows={5} spellCheck={false} />
              </Field>
              <div className="button-row">
                <button disabled={Boolean(busy)} onClick={() => run("can", () => client.can(parseCheck(singleCheckJson)))}>
                  Can
                </button>
                <button disabled={Boolean(busy)} onClick={() => run("canAny", () => client.canAny(parseChecks(checksJson)))}>
                  Can any
                </button>
                <button disabled={Boolean(busy)} onClick={() => run("canAll", () => client.canAll(parseChecks(checksJson)))}>
                  Can all
                </button>
                <button onClick={() => setResult({ label: "getCached", value: client.getCached(parseCheck(singleCheckJson)) })}>Get cached</button>
              </div>

              <div className="split">
                <Field label="Hydrate snapshot JSON">
                  <textarea value={snapshotJson} onChange={(event) => setSnapshotJson(event.target.value)} rows={5} spellCheck={false} />
                </Field>
                <Field label="Invalidate cache scope">
                  <input value={cacheScope} onChange={(event) => setCacheScope(event.target.value)} placeholder="optional" />
                </Field>
              </div>
              <div className="button-row">
                <button
                  onClick={() =>
                    run("hydrate", () => {
                      client.hydrate(parseSnapshot(snapshotJson));
                      return client.getCached(parseCheck(singleCheckJson));
                    })
                  }
                >
                  Hydrate
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    run("invalidateCache", () => {
                      client.invalidateCache(cacheScope || undefined);
                      return client.getCached(parseCheck(singleCheckJson));
                    })
                  }
                >
                  Invalidate cache
                </button>
              </div>
            </section>
          )}
        </section>

        <aside className="panel output-panel">
          <h2>Result</h2>
          {busy ? <div className="status">Running {busy}</div> : null}
          {error ? <div className="error-box">{error}</div> : null}
          <JsonBlock value={result} />
          <div className="log-header">
            <h2>Calls</h2>
            <button className="secondary" onClick={() => setCalls([])}>
              Clear
            </button>
          </div>
          <div className="call-list">
            {calls.map((call) => (
              <details key={call.id} className="call-item">
                <summary>
                  <span>{call.label}</span>
                  <span>{call.method}</span>
                  <span>{call.status ?? "ERR"}</span>
                  <span>{call.durationMs}ms</span>
                </summary>
                <JsonBlock value={call} />
              </details>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function JsonBlock({ title, value }: { title?: string; value: unknown }) {
  return (
    <div className="json-block">
      {title ? <h3>{title}</h3> : null}
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function updateConfig(setConfig: React.Dispatch<React.SetStateAction<AppConfig>>, patch: Partial<AppConfig>): void {
  setConfig((current) => ({ ...current, ...patch }));
}

function clean<T extends Record<string, string>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== "")) as T;
}

function parseCheck(raw: string): AuthorizationCheck {
  const value = JSON.parse(raw) as unknown;
  if (typeof value === "string") return { action: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object or string for the check.");
  }
  return value as AuthorizationCheck;
}

function parseChecks(raw: string): AuthorizationCheck[] {
  const value = JSON.parse(raw) as unknown;
  if (!Array.isArray(value)) {
    throw new Error("Expected a JSON array of checks.");
  }
  return value as AuthorizationCheck[];
}

function parseSnapshot(raw: string): AuthorizationSnapshot {
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object snapshot.");
  }
  return value as AuthorizationSnapshot;
}

function decodeJwtPayload(rawToken: string): unknown {
  const [, payload] = rawToken.split(".");
  if (!payload) return {};
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return { error: "Unable to decode token payload" };
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}
