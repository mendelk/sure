# @sure/web

Alternate Sure frontend built with TanStack Start (file-based Router,
React Query SSR hydration, strict TypeScript, Vite 8).

## Prerequisites

- Node.js 24 (see `.node-version` at the repo root)
- pnpm 10.15.0 (repo `packageManager`; run `corepack enable` if needed)

## Install (clean, frozen)

From the repo root:

```sh
pnpm install --frozen-lockfile
```

This installs the workspace deterministically from `pnpm-lock.yaml`.
`pnpm --filter @sure/web install:clean` runs the same frozen install.

## Commands

Run from the repo root (`pnpm --filter @sure/web <cmd>`) or from
`apps/web` (`pnpm <cmd>`):

| Command            | What it does                        |
| ------------------ | ----------------------------------- |
| `pnpm dev`         | Start the dev server on port 5173   |
| `pnpm build`       | Production build (client + SSR)     |
| `pnpm preview`     | Preview the production build (:5173)|
| `pnpm typecheck`   | `tsc` over the browser/server/test boundaries (regenerates `routeTree.gen.ts` first) |
| `pnpm test`        | `vitest run`                        |
| `pnpm api:generate` | Regenerate OpenAPI types AND Zod contracts from `docs/api/openapi.yaml` |
| `pnpm api:check`   | Fail when generated types or Zod contracts drift from `docs/api/openapi.yaml` |
| `pnpm contracts:generate` | Regenerate Zod contracts only |
| `pnpm contracts:check` | Fail when Zod contracts drift (CI gate) |
| `pnpm install:clean` | Frozen reinstall from the lockfile |

Root shortcuts: `pnpm web:dev`, `pnpm web:build`, `pnpm web:preview`,
`pnpm web:typecheck`, `pnpm web:test`, `pnpm web:api:generate`,
`pnpm web:api:check`, `pnpm web:contracts:generate`,
`pnpm web:contracts:check`.

## API contracts (Zod runtime parsers)

Static types (`src/lib/api/openapi.d.ts`, via `openapi-typescript`) are
not enough: upstream payloads are validated at runtime through generated
Zod parsers before they reach TanStack Query or application state.

- Source: `docs/api/openapi.yaml` (canonical; Ruby request specs own it).
- Generator: `scripts/generate-zod-contracts.mjs`, a small deterministic
  in-repo generator built on the maintained `yaml` (spec parsing) and
  `zod` (runtime) libraries — exact versions pinned in `package.json`
  (`zod 4.5.4`, `yaml 2.9.0`, `openapi-typescript ^7.13.0`). A bespoke
  generator (instead of an off-the-shelf OpenAPI-to-Zod tool) gives
  operation-scoped modules, fail-closed coverage (unsupported constructs
  abort generation instead of emitting `unknown`), and redacted
  diagnostics; static and runtime contracts are cross-checked by
  `src/lib/api/contract-compat.test.ts` so they cannot silently diverge.
- Output (`src/lib/api/generated/`, committed): `zod-schemas.ts` (one
  parser per component schema), `operations/<method>-<path>.ts` (one
  module per `METHOD /path` with params/body/success/error parsers, a
  `*Contract` value, and a typed validating fetch wrapper),
  `operation-contracts.ts` (`"METHOD /path"` registry + BFF lookup), and
  `manifest.json` (source sha + operation list for drift/coverage checks).
- Consume operation-scoped wrappers so routes only bundle the parsers
  they call: `import { getApiV1Accounts } from
  "~/lib/api/generated/operations/get-api-v1-accounts"`. The generic
  `apiGet`/`apiPost`/… wrappers accept a `contract` extra for the same
  validation. Violations throw `{ kind: "contract" }` `ApiError`s whose
  details carry schema paths and type tokens only — never raw payloads,
  tokens, or credentials.
- Server-only BFF code validates via `src/lib/api/bff-contracts.server.ts`
  (`validateBffRequest` / `validateUpstreamResponse`), which is secret-free
  and safe to import from `createServerFn` handlers.
- After any OpenAPI change, run `pnpm api:generate` (types + contracts)
  and commit the result; CI (`pnpm web:api:check`,
  `pnpm web:contracts:check`, coverage + runtime suites) fails otherwise.

Workspace-wide checks run from the repo root (see `CONVENTIONS.md` for the
rules they enforce): `pnpm typecheck` (all packages, future-proof via
`pnpm -r`), `pnpm lint:web` (oxlint, type-aware, browser/server import
boundaries), `pnpm format:check:web` (oxfmt), `pnpm test`, or all four via
`pnpm checks:web`. Naming, route, query-key, test, and environment
conventions live in [`CONVENTIONS.md`](./CONVENTIONS.md).

## SURE_API_ORIGIN setup

The web app talks to the Rails API through a deployment-level origin:

1. Copy the example file:

   ```sh
   cp apps/web/.env.example apps/web/.env
   ```

2. Set `SURE_API_ORIGIN` to the Rails API origin (no trailing path):

   ```sh
   SURE_API_ORIGIN=http://localhost:3000
   ```

Rules: absolute `http(s)` URL, true origin only -- no credentials,
no non-root path, no query string, no fragment. A trailing slash is
accepted and normalized (e.g. `https://api.example.com/` becomes
`https://api.example.com`). `vite dev` / `vite preview` fail fast on
startup with an actionable error when the value is missing or invalid;
production builds skip the serve-time check (so CI can build without
secrets) and the SSR loader re-validates on every server render.

## Running Rails and the web app together

1. Start Rails (API) on `http://localhost:3000` per the main repo docs
   (e.g. `bin/dev`).
2. In another terminal, from the repo root:

   ```sh
   cp apps/web/.env.example apps/web/.env  # first time only
   pnpm web:dev
   ```

3. Open `http://localhost:5173`. The index page server-renders the
   configured API origin as its connection status.

## Typed API client (`src/lib/api/`)

- **Generator:** [`openapi-typescript`] + [`openapi-fetch`] (same
  maintained org, deterministic output). `openapi-fetch` is a thin typed
  `fetch` wrapper with no store or cache — TanStack Query remains the only
  async-state layer.
- **Generated types:** `src/lib/api/openapi.d.ts` is committed and built
  only from `docs/api/openapi.yaml`. Regenerate with `pnpm api:generate`
  (run twice → no diff). CI fails on drift via `pnpm web:api:check`.
- **Fetch layer:** `src/lib/api/client.ts` exposes `createApiClient`
  plus `apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete`/`apiDownload`
  wrappers that normalize every outcome — validation (400/422), auth
  (401/403), missing (404), conflicts (409), rate limits (429 +
  `Retry-After`), other HTTP failures, unparseable bodies, aborts, and
  network errors — into `ApiError` (`error.kind`, `error.retryable` for
  Query retries). Every request carries an `X-Request-Id` correlation id.
- **Browser auth (ADR-0001):** production browser calls target the
  same-origin BFF — never the Rails API directly — and authenticate only
  with the BFF's `HttpOnly` session cookie (`credentials: "same-origin"`,
  pinned per request). This module defines no API-key/bearer-token
  surface: no getters, no `Authorization`/`X-Api-Key` constants, no
  injection middleware (see `docs/adr/0001-browser-auth-bff-threat-model.md`
  D1/REQ-SESS-01).
- **TanStack Query usage:** wrappers forward `AbortSignal`, so use them
  directly as a `queryFn`:
  ```ts
  queryFn: ({ signal }) =>
    apiGet(client, "/api/v1/accounts", {
      params: { query: pageQuery(page, 25) },
      signal,
    }).then((result) => result.data),
  ```
- **Tests:** `src/lib/api/client.test.ts` covers success, query/path/JSON
  bodies, file downloads, cancellation, correlation, pagination helpers,
  Query interop, compile-time type assertions, and the ADR-0001 security
  properties (no `Authorization`/`X-Api-Key` injection, same-origin
  credentials) — all model shapes are referenced from the generated types,
  never hand-copied.

[`openapi-typescript`]: https://github.com/openapi-ts/openapi-typescript
[`openapi-fetch`]: https://github.com/openapi-ts/openapi-fetch
