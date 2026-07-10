# Codex Instructions For `@totvs-cloud/iam-sdk`

These instructions are for AI agents and future maintainers working on this repository. Follow them before changing code.

## Project Context

- This is the framework-agnostic TypeScript core SDK for TOTVS Cloud IAM frontends.
- The package name is `@totvs-cloud/iam-sdk`.
- The first supported scope is core SDK only. Do not add React, Angular, Vue or other framework adapters to this package.
- The SDK mirrors the main behavior of `iam-sdk-python` (you may ask for project folder if needed context) while adapting authorization to the frontend BFF.
- The frontend authorization RFC is `RFCs/text/0009-autorizacao-frontend-iam-cedar.md` (you may ask for project folder if needed context).
- The real BFF implementation lives under `iam/src/infra/aws/rust/frontend_authorizations/` (you may ask for project folder if needed context).
- The SDK must never call the Cedar Agent directly from browser-facing APIs.

## Non-Negotiable Contracts

- Frontend authorization must call `POST {endpointAuthzBatchEvaluate}`.
- The endpoint should normally point to the full batch validation URL `/frontend/authorizations/evaluate`; the SDK must not append path segments.
- The request body is exactly `{ checks: [...] }`; do not send `tenant` in the body.
- The BFF extracts tenant from `ext.tenant` in the JWT.
- Use `Authorization: Bearer <token>` for the BFF, AuthN and Control Plane calls.
- Authorization checks v1 use direct actions in `service:action` format, for example `iam:listUsers`.
- Capability keys (`key`) are not supported in v1. Keep throwing `UnsupportedCapabilityKeyError` unless the BFF contract changes.
- The BFF limit is 50 checks per batch. Keep chunking batches above 50.
- Fallback authorization endpoints are used only for transport failures or timeouts. HTTP responses from an endpoint are authoritative and must not fall through to fallback endpoints.
- If multiple checks would produce the same response key, the SDK must generate aliases before sending the request to avoid BFF `decisions` map collisions.

## Public API Rules

- Preserve `IamClient` and `client()` exports from `src/index.ts`.
- Preserve ESM/CJS/types output through the existing `exports` map in `package.json`.
- `getCached()` is intentionally synchronous. Do not make it async without a deliberate public API change.
- `setToken()` and `assumeRole()` must invalidate the authorization cache.
- `hydrate()` and `invalidateCache()` are public cache APIs and should remain framework-independent.
- Keep runtime dependencies at zero unless there is a strong reason. Prefer platform `fetch` and injectable `fetcher`.
- Keep browser compatibility in mind: do not introduce Node-only runtime APIs in SDK source files that run in consumers' browsers.

## Code Organization

- `src/client`: public `IamClient` facade and factory.
- `src/authn`: login, assume role, token validation and current roles.
- `src/authz`: BFF authorization, batch chunking, aliases and cache integration.
- `src/cache`: in-memory authorization cache.
- `src/http`: fetch wrapper, timeout, JSON parsing, typed HTTP/transport errors and fallback behavior.
- `src/iam`: IAM Control Plane helper methods matching the Python SDK.
- `src/errors`: typed SDK errors.
- `src/types`: exported public types.
- Keep new modules small and focused. Do not collapse unrelated behavior into `IamClient`.

## Testing Requirements

Run these before finishing any code change:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Add or update tests when changing:

- BFF request body or headers.
- Authorization alias generation.
- Batch chunking.
- Cache keying, hydration, TTL or invalidation.
- Fallback endpoint behavior.
- AuthN response handling.
- Control Plane paths, payloads or URL encoding.
- Public exported types or errors.

Tests should use the injectable `fetcher`; do not hit real IAM services in unit tests.

## Error Handling Standards

- Use typed errors from `src/errors`.
- Map 401 to `TokenInvalidError`.
- Map 403 to `NotAuthorizedError`.
- Map malformed JSON or non-2xx HTTP responses to `InvalidRequestError`.
- Map network failures, aborts and exhausted fallback attempts to `TransportError`.
- Do not hide upstream HTTP errors by retrying another endpoint after a valid HTTP response.

## Versioning And Release

- Follow SemVer.
- Update `CHANGELOG.md` for user-visible changes.
- Treat changes to public method names, return shapes, exported types, package exports or error classes as public API changes.
- Use `.github/workflows/versioning.yml` to create the `vX.Y.Z` tag and GitHub Release. Use `version=current` only for publishing the version already declared in `package.json`; use SemVer bump options for normal releases so `package.json` and `package-lock.json` are updated.
- Keep `.github/workflows/release.yml` focused on npm publishing from a published GitHub Release, from successful completion of `.github/workflows/versioning.yml`, or from a manual run with an explicit existing tag. The `workflow_run` trigger is intentional because GitHub Releases created with `GITHUB_TOKEN` do not trigger a second workflow via `release: published`.
- Keep `dist/` generated by `npm run build`; it is ignored by Git and should not be manually edited.
- Do not put registry tokens, IAM credentials, service tokens or JWTs into the repo.
- The release workflow expects `NPM_TOKEN` in repository secrets.

## Security Notes

- The SDK is a UX authorization helper, not an enforcement layer. Backend services remain the authority.
- Do not expose Cedar Agent service credentials to frontend code.
- Do not log tokens, secrets or full authorization headers.
- Be careful with cache changes: authorization decisions are per token/principal context.

## Dependency Policy

- Prefer standard APIs and small code over adding dependencies.
- If adding a dependency, explain why it is needed and add tests around the behavior it supports.
- After dependency changes, run `npm audit --audit-level=moderate`.
- Avoid `npm audit fix --force` unless explicitly approved because it can introduce breaking toolchain upgrades.

## When Backend Contracts Change

If the BFF starts supporting capability keys or `evaluate-service`, update this SDK deliberately:

- Add tests for the new wire contract first.
- Keep direct `action` checks backward-compatible.
- Update README examples and `CHANGELOG.md`.
- Revisit `AuthorizationCheck` types and `UnsupportedCapabilityKeyError`.
- Do not assume RFC text alone is the source of truth; inspect the implemented BFF code.
