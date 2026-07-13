# IAM SDK JS

Monorepo for TOTVS Cloud IAM frontend SDK packages.

## Packages

| Package | Version | Description |
| --- | --- | --- |
| `@totvs-cloud/iam-sdk` | `0.2.0` | Framework-agnostic TypeScript core SDK. |
| `@totvs-cloud/iam-sdk-react` | `0.1.0` | React authorization adapter built on top of the core SDK. |

## Examples

`examples/core-manual-test` is an isolated Vite/React app for manually debugging the core AuthN/AuthZ flows. It is published to GitHub Pages and is not an npm workspace package.

```bash
npm run dev:manual
npm run build:manual
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

Packages are versioned independently. Use package-scoped Git tags:

- `iam-sdk@0.2.1` for `@totvs-cloud/iam-sdk`.
- `iam-sdk-react@0.1.0` for `@totvs-cloud/iam-sdk-react`.

The historical `vX.Y.Z` tags belong to the initial single-package core releases.
Pushes to `main` publish stable releases with the npm `latest` tag. Pushes to
`development` publish prereleases with the npm `dev` tag.

Version bumps are resolved from Conventional Commits:

- `fix(core): correct token refresh` publishes a patch release.
- `feat(react): add provider option` publishes a minor release.
- `feat(core)!: change auth flow` publishes a major release.

Commit messages are validated locally by Husky and in pull request checks with
commitlint.
