import type { AuthorizationCheck } from "@totvs-cloud/iam-sdk";
import type { AuthzCheckInput } from "./types";

export function coerceCheck(check: AuthzCheckInput): AuthorizationCheck {
  return typeof check === "string" ? { action: check } : check;
}

export function checkKey(check: AuthzCheckInput): string {
  const coerced = coerceCheck(check);
  return stableStringify({
    action: coerced.action,
    resource: coerced.resource,
    context: coerced.context,
    key: coerced.key,
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
