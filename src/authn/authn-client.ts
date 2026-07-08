import type { AssumeRoleParams, AssumeRoleResponse, LoginParams, Role, TokenInfo } from "../types";
import type { NormalizedConfig } from "../config";
import type { HttpClient } from "../http/http-client";

interface LoginResponse {
  data: {
    access_token: string;
    expires_in?: number;
    [key: string]: unknown;
  };
}

interface RolesResponse {
  data: {
    roles: Role[];
  };
}

export class AuthnClient {
  constructor(
    private readonly config: NormalizedConfig,
    private readonly http: HttpClient,
    private readonly tokenProvider: () => Promise<string>,
    private readonly setTokenValue: (token: string) => void,
    private readonly invalidateAuthzCache: () => void,
  ) {}

  async login(params: LoginParams = {}): Promise<string> {
    const username = params.apiAccessKey ?? this.config.apiAccessKey;
    const password = params.apiSecretKey ?? this.config.apiSecretKey;
    const payload: Record<string, string> = {
      username: username ?? "",
      password: password ?? "",
    };
    if (params.service) payload.service = params.service;
    if (params.region) payload.region = params.region;

    const response = await this.http.requestJson<LoginResponse>(`${this.config.endpointAuthn}/login`, {
      method: "POST",
      body: payload,
    });

    this.setTokenValue(response.data.access_token);
    this.invalidateAuthzCache();
    return response.data.access_token;
  }

  async assumeRole(params: AssumeRoleParams): Promise<AssumeRoleResponse> {
    const payload: Record<string, string> = {
      role: params.roleName,
      tenant: params.tenant,
    };
    if (params.service) payload.service = params.service;
    if (params.region) payload.region = params.region;

    const response = await this.http.requestJson<LoginResponse>(`${this.config.endpointAuthn}/login/assumerole`, {
      method: "POST",
      headers: { Authorization: await this.authorizationHeader() },
      body: payload,
    });

    this.setTokenValue(response.data.access_token);
    this.invalidateAuthzCache();
    return response.data;
  }

  async listMyRoles(): Promise<Role[]> {
    const response = await this.http.requestJson<RolesResponse>(`${this.config.endpointAuthn}/me/roles`, {
      headers: { Authorization: await this.authorizationHeader() },
    });
    return response.data.roles;
  }

  async validateToken(): Promise<TokenInfo> {
    const response = await this.http.requestJson<{ data: TokenInfo }>(`${this.config.endpointAuthn}/token/validate`, {
      headers: { Authorization: await this.authorizationHeader() },
    });
    return response.data;
  }

  private async authorizationHeader(): Promise<string> {
    const token = await this.tokenProvider();
    return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }
}
