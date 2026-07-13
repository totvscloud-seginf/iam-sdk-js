import type {
  AuthorizationCheck,
  IamClient,
  IamClientConfig,
} from "@totvs-cloud/iam-sdk";
import type { ReactNode } from "react";

export type AuthzCheckInput = string | AuthorizationCheck;

interface SharedAuthzProviderProps {
  children: ReactNode;
  fallback?: ReactNode;
  initialChecks?: AuthzCheckInput[];
  onError?: (error: Error) => void;
}

export type AuthzProviderProps = SharedAuthzProviderProps &
  (
    | {
        client: IamClient;
        config?: never;
      }
    | {
        client?: never;
        config?: IamClientConfig;
      }
  );

export interface AuthzContextValue {
  client: IamClient;
  evaluateCheck: (check: AuthzCheckInput, force?: boolean) => Promise<boolean>;
  onError?: ((error: Error) => void) | undefined;
}

export interface UseCanResult {
  allowed: boolean | undefined;
  loading: boolean;
  error: Error | undefined;
  refresh: () => Promise<void>;
}

export interface CanProps {
  action: string;
  children: ReactNode;
  context?: Record<string, unknown>;
  fallback?: ReactNode;
  resource?: string;
}
