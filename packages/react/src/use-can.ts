import { useCallback, useEffect, useMemo, useState } from "react";
import { checkKey, coerceCheck } from "./checks";
import { useAuthzContext } from "./provider";
import type { AuthzCheckInput, UseCanResult } from "./types";

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
