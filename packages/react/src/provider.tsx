import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { IamClient } from "@totvs-cloud/iam-sdk";
import { checkKey, coerceCheck } from "./checks";
import type { AuthzContextValue, AuthzProviderProps } from "./types";

const AuthzContext = createContext<AuthzContextValue | undefined>(undefined);

export function AuthzProvider(props: AuthzProviderProps) {
  const { children, fallback = null, initialChecks = [], onError } = props;
  const providedClient = "client" in props ? props.client : undefined;
  const config = "config" in props ? props.config : undefined;
  const client = useMemo(
    () => providedClient ?? new IamClient(config),
    [providedClient, config],
  );
  const pendingRef = useRef(new Map<string, Promise<boolean>>());
  const [preloading, setPreloading] = useState(initialChecks.length > 0);
  const initialChecksKey = useMemo(
    () => initialChecks.map((check) => checkKey(check)).join("|"),
    [initialChecks],
  );

  useEffect(() => {
    if (initialChecks.length === 0) {
      setPreloading(false);
      return;
    }

    let active = true;
    setPreloading(true);
    client
      .evaluate(initialChecks.map(coerceCheck))
      .catch((caught: unknown) => {
        const error = normalizeError(caught);
        onError?.(error);
      })
      .finally(() => {
        if (active) setPreloading(false);
      });

    return () => {
      active = false;
    };
  }, [client, initialChecks, initialChecksKey, onError]);

  const value = useMemo<AuthzContextValue>(
    () => ({
      client,
      onError,
      evaluateCheck: async (check, force = false) => {
        const coerced = coerceCheck(check);
        const key = checkKey(coerced);

        if (!force) {
          const cached = client.getCached(coerced);
          if (cached !== undefined) return cached;
        } else if (coerced.action) {
          client.invalidateCache(coerced.action);
        }

        const pending = pendingRef.current.get(key);
        if (pending) return pending;

        const promise = client
          .can(coerced)
          .catch((caught: unknown) => {
            const error = normalizeError(caught);
            onError?.(error);
            throw error;
          })
          .finally(() => {
            pendingRef.current.delete(key);
          });
        pendingRef.current.set(key, promise);
        return promise;
      },
    }),
    [client, onError],
  );

  return (
    <AuthzContext.Provider value={value}>
      {preloading ? fallback : children}
    </AuthzContext.Provider>
  );
}

export function useIamClient(): IamClient {
  return useAuthzContext().client;
}

export function useAuthzContext(): AuthzContextValue {
  const context = useContext(AuthzContext);
  if (!context) {
    throw new Error("IAM authorization hooks must be used inside AuthzProvider.");
  }
  return context;
}

function normalizeError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught));
}
