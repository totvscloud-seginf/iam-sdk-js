# @totvs-cloud/iam-sdk

Framework-agnostic TypeScript SDK for TOTVS Cloud IAM frontends.

This package is the core SDK only. React, Angular, Vue or other framework adapters should be built on top of this package.

## Install

```bash
npm install @totvs-cloud/iam-sdk
```

## Create A Client

```ts
import { IamClient } from "@totvs-cloud/iam-sdk";

const iam = new IamClient({
  endpointAuthn: "https://iam.example.com/api",
  endpointAuthzBatchEvaluate: "https://iam.example.com/frontend/authorizations/evaluate",
  endpointCp: "https://iam.example.com/v1",
  getToken: () => localStorage.getItem("access_token") ?? "",
  cache: { ttl: 300 },
});
```

## AuthN

```ts
await iam.login({
  apiAccessKey: "user",
  apiSecretKey: "secret",
  region: "sa-east-1",
  service: "iam",
});

const roles = await iam.listMyRoles();
const claims = await iam.validateToken();

await iam.assumeRole({
  roleName: "admin",
  tenant: "CCODE0",
});
```

`assumeRole()` and `setToken()` invalidate the authorization cache because the principal changed.

## Frontend Authorization

The SDK talks to the IAM BFF endpoint:

```http
POST /frontend/authorizations/evaluate
Authorization: Bearer <JWT>
```

Request bodies contain only checks. The tenant is not sent in the body because the BFF extracts it from `ext.tenant` in the JWT.

```ts
const snapshot = await iam.evaluate([
  { action: "iam:listUsers" },
  {
    action: "iam:updateRole",
    alias: "editAdminRole",
    resource: "trn:tcloud:iam::CCODE0:role/admin-role",
    context: { requestedRegion: "global" },
  },
]);

if (snapshot["iam:listUsers"]?.allowed) {
  // show UI
}
```

Capability keys are intentionally not supported in v1 because the current BFF rejects `key`. Use direct actions in `service:action` format.

## Helpers And Cache

```ts
const canListUsers = await iam.can("iam:listUsers");
const canManageUsers = await iam.canAll(["iam:listUsers", "iam:createUser"]);
const canDoSomething = await iam.canAny(["iam:createUser", "iam:updateUser"]);

const cached = iam.getCached("iam:listUsers");
iam.invalidateCache();
```

The default cache TTL is 300 seconds. Batches larger than 50 checks are automatically split because the BFF limit is 50 checks per request.

## Fallbacks

Fallback endpoints are tried only for transport failures or timeouts. HTTP responses from the server, including 4xx and 5xx, are treated as authoritative.

```ts
const iam = new IamClient({
  endpointAuthzBatchEvaluate: "https://primary/frontend/authorizations/evaluate",
  endpointAuthzBatchEvaluateFallbacks: [
    "https://fallback-1/frontend/authorizations/evaluate",
    "https://fallback-2/frontend/authorizations/evaluate",
  ],
});
```

## Control Plane

The `iam.iam` module mirrors the main IAM Control Plane helpers from the Python SDK:

```ts
await iam.iam.createUser("alice");
await iam.iam.createRole("admin", "role", trustPolicy);
await iam.iam.attachRolePolicies("admin", ["trn:tenant::iam::global:policy/name"]);
const users = await iam.iam.listUsers();
```

## Development

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

## Versioning

This package follows SemVer. The initial version is `0.1.0`; public API changes before `1.0.0` may still occur, but breaking changes should be documented in `CHANGELOG.md`.

Versioning is handled by the `Versioning` GitHub Actions workflow. Run it from the `main` branch and choose `current` for the first `0.1.0` deploy, or a SemVer bump (`patch`, `minor`, `major` or pre-release variants) for later releases. The `current` option tags the version already declared in `package.json`; bump options update `package.json` and `package-lock.json`. The workflow pushes a `vX.Y.Z` tag and creates a GitHub Release.

Publishing to npm is handled by the `Release` workflow when a GitHub Release is published or when the `Versioning` workflow completes successfully. The `workflow_run` trigger is required because releases created with GitHub's default `GITHUB_TOKEN` do not trigger a second workflow from the `release` event. If a release already exists and did not publish, run `Release` manually with the existing tag, for example `v0.1.0`.
