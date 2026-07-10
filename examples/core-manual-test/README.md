# IAM SDK Core Manual Test

Manual browser app for debugging the SDK core AuthN/AuthZ flows.

This package is intentionally isolated from the SDK root package. Its React/Vite dependencies live in this directory and are not installed, audited, packed, or published as part of `@totvs-cloud/iam-sdk`.

## Setup

```bash
npm install --prefix examples/core-manual-test
npm run dev:manual
```

## Checks

```bash
npm --prefix examples/core-manual-test run typecheck
npm run build:manual
npm --prefix examples/core-manual-test audit
```
