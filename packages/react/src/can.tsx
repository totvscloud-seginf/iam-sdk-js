import { useCan, useCanAll, useCanAny } from "./use-can";
import type { CanGroupProps, CanProps } from "./types";

export function Can({ action, children, context, fallback = null, resource }: CanProps) {
  const check = {
    action,
    ...(context === undefined ? {} : { context }),
    ...(resource === undefined ? {} : { resource }),
  };
  const { allowed, loading, error } = useCan(check);
  if (loading || error || !allowed) return <>{fallback}</>;
  return <>{children}</>;
}

export function CanAny({ checks, children, fallback = null }: CanGroupProps) {
  const { allowed, loading, error } = useCanAny(checks);
  if (loading || error || !allowed) return <>{fallback}</>;
  return <>{children}</>;
}

export function CanAll({ checks, children, fallback = null }: CanGroupProps) {
  const { allowed, loading, error } = useCanAll(checks);
  if (loading || error || !allowed) return <>{fallback}</>;
  return <>{children}</>;
}
