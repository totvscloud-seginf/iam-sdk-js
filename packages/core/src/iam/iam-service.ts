import type { NormalizedConfig } from "../config";
import type { HttpClient } from "../http/http-client";

type JsonObject = Record<string, unknown>;
type RoleType = "role" | "federatedRole" | "serviceRole";
type ServiceType = "tenant" | "global";

export class IamService {
  constructor(
    private readonly config: NormalizedConfig,
    private readonly http: HttpClient,
    private readonly tokenProvider: () => Promise<string>,
  ) {}

  attachRolePolicies(roleName: string, policiesTrn: string[]): Promise<unknown> {
    return this.request("POST", `/roles/${encode(roleName)}/policies`, { policies: policiesTrn });
  }

  attachUserGroups(username: string, groups: string[]): Promise<unknown> {
    return this.request("POST", `/users/${encode(username)}/groups`, { groups });
  }

  attachUserPolicies(username: string, policiesTrn: string[]): Promise<unknown> {
    return this.request("POST", `/users/${encode(username)}/policies`, { policies: policiesTrn });
  }

  createGroup(name: string, description: string): Promise<unknown> {
    return this.request("POST", "/groups", { name, description });
  }

  createPolicy(name: string, description: string, policiesStatements: JsonObject[]): Promise<unknown> {
    return this.request("POST", "/policies", {
      name,
      policyType: "tenant",
      description,
      engineVersion: "2023-09-18",
      statements: policiesStatements,
    });
  }

  createRole(name: string, roleType: RoleType, trustPolicy: JsonObject, description = ""): Promise<unknown> {
    return this.request("POST", "/roles", {
      name,
      type: roleType,
      description,
      trustPolicy,
      trustPolicyEngineVersion: "2023-09-18",
    });
  }

  createService(name: string, serviceType: ServiceType, permissionManifest: JsonObject[]): Promise<unknown> {
    return this.request("POST", "/services", {
      name,
      type: serviceType,
      permissionsManifest: permissionManifest,
    });
  }

  async createUser(username: string): Promise<unknown> {
    const response = await this.request<JsonObject>("POST", "/users", { username });
    return response.username ?? response;
  }

  async createUserAccessKey(username: string, description: string): Promise<unknown> {
    const response = await this.request<{ data?: unknown }>("POST", `/users/${encode(username)}/accesskey`, { description });
    return response.data ?? response;
  }

  deleteGroup(groupName: string): Promise<unknown> {
    return this.request("DELETE", `/groups/${encode(groupName)}`);
  }

  deletePolicy(policyTrn: string): Promise<unknown> {
    return this.request("DELETE", `/policies/${encode(policyTrn)}`);
  }

  deleteRole(roleName: string): Promise<unknown> {
    return this.request("DELETE", `/roles/${encode(roleName)}`);
  }

  deleteService(serviceName: string): Promise<unknown> {
    return this.request("DELETE", `/services/${encode(serviceName)}`);
  }

  deleteUser(username: string): Promise<unknown> {
    return this.request("DELETE", `/users/${encode(username)}`);
  }

  deleteUserAccessKey(username: string, accessKeyId: string): Promise<unknown> {
    return this.request("DELETE", `/users/${encode(username)}/accesskey/${encode(accessKeyId)}`);
  }

  detachRolePolicy(roleName: string, policyTrn: string): Promise<unknown> {
    return this.request("DELETE", `/roles/${encode(roleName)}/policies/${encode(policyTrn)}`);
  }

  detachUserGroup(username: string, groupName: string): Promise<unknown> {
    return this.request("DELETE", `/users/${encode(username)}/groups/${encode(groupName)}`);
  }

  detachUserPolicy(username: string, policyTrn: string): Promise<unknown> {
    return this.request("DELETE", `/users/${encode(username)}/policies/${encode(policyTrn)}`);
  }

  async getGroup(groupName: string): Promise<unknown> {
    return data(await this.request("GET", `/groups/${encode(groupName)}`));
  }

  async getPolicy(policyTrn: string): Promise<unknown> {
    return data(await this.request("GET", `/policies/${encode(policyTrn)}`));
  }

  async getRole(roleName: string): Promise<unknown> {
    return data(await this.request("GET", `/roles/${encode(roleName)}`));
  }

  async getService(serviceName: string): Promise<unknown> {
    return data(await this.request("GET", `/services/${encode(serviceName)}`));
  }

  async getUser(username: string): Promise<unknown> {
    return data(await this.request("GET", `/users/${encode(username)}`));
  }

  listAttachedUserGroups(username: string, page = 1, size = 10): Promise<unknown> {
    return this.request("GET", `/users/${encode(username)}/groups?page=${page}&size=${size}`);
  }

  listAttachedRolePolicies(roleName: string, page = 1, size = 10): Promise<unknown> {
    return this.request("GET", `/roles/${encode(roleName)}/policies?page=${page}&size=${size}`);
  }

  listAttachedUserPolicies(username: string, page = 1, size = 10): Promise<unknown> {
    return this.request("GET", `/users/${encode(username)}/policies?page=${page}&size=${size}`);
  }

  listGroupPolicies(groupName: string, page = 1, size = 10): Promise<unknown> {
    return this.request("GET", `/groups/${encode(groupName)}/policies?page=${page}&size=${size}`);
  }

  listGroupUsers(groupName: string, page = 1, size = 10): Promise<unknown> {
    return this.request("GET", `/groups/${encode(groupName)}/users?page=${page}&size=${size}`);
  }

  listPolicies(page = 1, size = 10): Promise<unknown> {
    return this.request("GET", `/policies?page=${page}&size=${size}`);
  }

  listRoles(page = 1, size = 10): Promise<unknown> {
    return this.request("GET", `/roles?page=${page}&size=${size}`);
  }

  listServices(page = 1, size = 10): Promise<unknown> {
    return this.request("GET", `/services?page=${page}&size=${size}`);
  }

  listUsers(page = 1, size = 10): Promise<unknown> {
    return this.request("GET", `/users?page=${page}&size=${size}`);
  }

  updateGroup(groupName: string, description: string): Promise<unknown> {
    return this.request("PUT", `/groups/${encode(groupName)}`, { description });
  }

  updatePolicy(policyTrn: string, name: string, description: string, policiesStatements: JsonObject[]): Promise<unknown> {
    return this.request("PUT", `/policies/${encode(policyTrn)}`, {
      name,
      description,
      statements: policiesStatements,
    });
  }

  updateRole(roleName: string, trustPolicy: JsonObject, description = ""): Promise<unknown> {
    return this.request("PUT", `/roles/${encode(roleName)}`, {
      description,
      trustPolicy,
      trustPolicyEngineVersion: "2023-09-18",
    });
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    return this.http.requestJson<T>(`${this.config.endpointCp}${path}`, {
      method,
      headers: { Authorization: await this.authorizationHeader() },
      body,
    });
  }

  private async authorizationHeader(): Promise<string> {
    const token = await this.tokenProvider();
    return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

function data(response: unknown): unknown {
  if (response && typeof response === "object" && "data" in response) {
    return (response as { data: unknown }).data;
  }
  return response;
}
