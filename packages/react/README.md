# @totvs-cloud/iam-sdk-react

React adapter for `@totvs-cloud/iam-sdk`.

The adapter is a frontend UX helper. Backend services remain the authorization authority.

## Install

```bash
npm install @totvs-cloud/iam-sdk @totvs-cloud/iam-sdk-react
```

## Provider

```tsx
import { AuthzProvider } from "@totvs-cloud/iam-sdk-react";

export function App() {
  return (
    <AuthzProvider
      config={{
        endpointAuthzBatchEvaluate: "https://iam.example.com/frontend/authorizations/evaluate",
        getToken: () => localStorage.getItem("access_token") ?? "",
      }}
      initialChecks={["iam:listUsers"]}
    >
      <Routes />
    </AuthzProvider>
  );
}
```

You can also pass an existing `IamClient` with `client`.

## Hooks

```tsx
import { useCan } from "@totvs-cloud/iam-sdk-react";

export function UsersButton() {
  const { allowed, loading, refresh } = useCan("iam:listUsers");

  if (loading) return null;
  return allowed ? <button onClick={() => void refresh()}>Users</button> : null;
}
```

## Component

```tsx
import { Can } from "@totvs-cloud/iam-sdk-react";

<Can action="iam:createUser" fallback={null}>
  <button>Create user</button>
</Can>;
```

## BFF v1 Contract

Use direct actions in `service:action` format. Capability keys, `services` and `loadServicePermissions` are intentionally not implemented until the real BFF supports those contracts.
