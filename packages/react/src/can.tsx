import { useCan } from "./use-can";
import type { CanProps } from "./types";

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
