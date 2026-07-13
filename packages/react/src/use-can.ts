import { useCallback, useEffect, useMemo, useState } from "react";
import { checkKey, coerceCheck } from "./checks";
import { useAuthzContext } from "./provider";
import type { AuthzCheckInput, UseCanGroupResult, UseCanResult } from "./types";

export function useCan(check: AuthzCheckInput): UseCanResult {
  const { client, evaluateCheck } = useAuthzContext();
  const coerced = useMemo(() => coerceCheck(check), [check]);
  const key = useMemo(() => checkKey(coerced), [coerced]);
  const [allowed, setAllowed] = useState<boolean | undefined>(() => client.getCached(coerced));
  const [loading, setLoading] = useState(allowed === undefined);
  const [error, setError] = useState<Error | undefined>(undefined);

  const evaluate = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(undefined);
      try {
        const nextAllowed = await evaluateCheck(coerced, force);
        setAllowed(nextAllowed);
        return nextAllowed;
      } catch (caught) {
        const nextError = caught instanceof Error ? caught : new Error(String(caught));
        setAllowed(false);
        setError(nextError);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [coerced, evaluateCheck],
  );

  useEffect(() => {
    let active = true;
    const cached = client.getCached(coerced);
    if (cached !== undefined) {
      setAllowed(cached);
      setLoading(false);
      setError(undefined);
      return;
    }

    setLoading(true);
    setError(undefined);
    evaluateCheck(coerced)
      .then((nextAllowed) => {
        if (active) setAllowed(nextAllowed);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setAllowed(false);
        setError(caught instanceof Error ? caught : new Error(String(caught)));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [client, coerced, evaluateCheck, key]);

  return {
    allowed,
    loading,
    error,
    refresh: () => evaluate(true).then(() => undefined),
  };
}

export function useCanAny(checks: AuthzCheckInput[]): UseCanGroupResult {
  return useCanGroup(checks, "any");
}

export function useCanAll(checks: AuthzCheckInput[]): UseCanGroupResult {
  return useCanGroup(checks, "all");
}

function useCanGroup(checks: AuthzCheckInput[], mode: "all" | "any"): UseCanGroupResult {
  const { client, evaluateCheck } = useAuthzContext();
  const key = useMemo(() => checks.map((check) => checkKey(check)).join("|"), [checks]);
  const coerced = useMemo(() => checks.map(coerceCheck), [key]);
  const initialAllowed = useMemo(() => cachedGroupDecision(client, coerced, mode), [client, coerced, mode]);
  const [allowed, setAllowed] = useState<boolean | undefined>(initialAllowed);
  const [loading, setLoading] = useState(initialAllowed === undefined);
  const [error, setError] = useState<Error | undefined>(undefined);

  const evaluate = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(undefined);
      try {
        const decisions = await Promise.all(coerced.map((check) => evaluateCheck(check, force)));
        const nextAllowed = combineDecisions(decisions, mode);
        setAllowed(nextAllowed);
        return nextAllowed;
      } catch (caught) {
        const nextError = caught instanceof Error ? caught : new Error(String(caught));
        setAllowed(false);
        setError(nextError);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [coerced, evaluateCheck, mode],
  );

  useEffect(() => {
    let active = true;
    const cached = cachedGroupDecision(client, coerced, mode);
    if (cached !== undefined) {
      setAllowed(cached);
      setLoading(false);
      setError(undefined);
      return;
    }

    setLoading(true);
    setError(undefined);
    Promise.all(coerced.map((check) => evaluateCheck(check)))
      .then((decisions) => {
        if (active) setAllowed(combineDecisions(decisions, mode));
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setAllowed(false);
        setError(caught instanceof Error ? caught : new Error(String(caught)));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [client, coerced, evaluateCheck, key, mode]);

  return {
    allowed,
    loading,
    error,
    refresh: () => evaluate(true).then(() => undefined),
  };
}

function cachedGroupDecision(
  client: ReturnType<typeof useAuthzContext>["client"],
  checks: ReturnType<typeof coerceCheck>[],
  mode: "all" | "any",
): boolean | undefined {
  if (checks.length === 0) return mode === "all";
  const decisions = checks.map((check) => client.getCached(check));
  if (decisions.some((decision) => decision === undefined)) return undefined;
  return combineDecisions(decisions as boolean[], mode);
}

function combineDecisions(decisions: boolean[], mode: "all" | "any"): boolean {
  return mode === "all" ? decisions.every(Boolean) : decisions.some(Boolean);
}
