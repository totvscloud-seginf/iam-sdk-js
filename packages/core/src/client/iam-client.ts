import { AuthnClient } from "../authn/authn-client";
import { AuthzClient } from "../authz/authz-client";
import { AuthorizationCache } from "../cache/authorization-cache";
import { normalizeConfig, type NormalizedConfig } from "../config";
import { HttpClient } from "../http/http-client";
import { IamService } from "../iam/iam-service";
import type {
  AssumeRoleParams,
  AssumeRoleResponse,
  AuthorizationCheck,
  AuthorizationSnapshot,
  IamClientConfig,
  LoginParams,
  Role,
  TokenInfo,
} from "../types";

export class IamClient {
  readonly config: NormalizedConfig;
  readonly iam: IamService;

  private token = "";
  private readonly authn: AuthnClient;
  private readonly authz: AuthzClient;
  private readonly cache: AuthorizationCache;

  constructor(options: IamClientConfig = {}) {
    this.config = normalizeConfig(options);
    const http = new HttpClient({
      fetcher: options.fetcher,
      timeoutMs: this.config.timeoutMs,
    });
    this.cache = new AuthorizationCache(this.config.cacheTtlSeconds, this.config.cacheEnabled);
    const tokenProvider = async () => options.getToken ? await options.getToken() : this.token;
    this.authn = new AuthnClient(
      this.config,
      http,
      tokenProvider,
      (token) => {
        this.token = token;
      },
      () => this.invalidateCache(),
    );
    this.authz = new AuthzClient(this.config, http, this.cache, tokenProvider);
    this.iam = new IamService(this.config, http, tokenProvider);
  }

  setToken(token: string): this {
    this.token = token;
    this.invalidateCache();
    return this;
  }

  getToken(): string {
    return this.token;
  }

  login(params: LoginParams = {}): Promise<string> {
    return this.authn.login(params);
  }

  assumeRole(params: AssumeRoleParams): Promise<AssumeRoleResponse> {
    return this.authn.assumeRole(params);
  }

  listMyRoles(): Promise<Role[]> {
    return this.authn.listMyRoles();
  }

  validateToken(): Promise<TokenInfo> {
    return this.authn.validateToken();
  }

  evaluate(checks: AuthorizationCheck[]): Promise<AuthorizationSnapshot> {
    return this.authz.evaluate(checks);
  }

  can(actionOrCheck: string | AuthorizationCheck): Promise<boolean> {
    return this.authz.can(actionOrCheck);
  }

  canAny(checks: Array<string | AuthorizationCheck>): Promise<boolean> {
    return this.authz.canAny(checks);
  }

  canAll(checks: Array<string | AuthorizationCheck>): Promise<boolean> {
    return this.authz.canAll(checks);
  }

  getCached(check: string | AuthorizationCheck): boolean | undefined {
    return this.authz.getCached(check);
  }

  hydrate(snapshot: AuthorizationSnapshot): void {
    this.authz.hydrate(snapshot, this.token);
  }

  invalidateCache(scope?: string): void {
    this.cache.invalidate(scope);
  }
}

export function client(options: IamClientConfig = {}): IamClient {
  return new IamClient(options);
}
