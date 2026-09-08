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
| `pnpm storybook`   | Start Storybook (UI primitives catalog) on port 6006 |
| `pnpm build-storybook` | Static Storybook build (`storybook-static/`) |
| `pnpm test:browser` | Browser Storybook checks: interactions + full axe (incl. color-contrast) in Chromium |
| `pnpm api:generate` | Regenerate OpenAPI types AND Zod parsers from `docs/api/openapi.yaml` |
| `pnpm api:check`   | Fail when generated types or Zod parsers drift from `docs/api/openapi.yaml` |
| `pnpm api:zod` | Regenerate Zod parsers only (Orval) |
| `pnpm api:zod:check` | Fail when Zod parsers drift (CI gate) |
| `pnpm install:clean` | Frozen reinstall from the lockfile |

Root shortcuts: `pnpm web:dev`, `pnpm web:build`, `pnpm web:preview`,
`pnpm web:typecheck`, `pnpm web:test`, `pnpm web:api:generate`,
`pnpm web:api:check`, `pnpm web:api:zod:generate`,
`pnpm web:api:zod:check`.

## API contracts (Zod runtime parsers)

Static types (`src/lib/api/openapi.d.ts`, via `openapi-typescript`) are
not enough: upstream payloads are validated at runtime through generated
Zod parsers before they reach TanStack Query or application state.

- Source: `docs/api/openapi.yaml` (canonical; Ruby request specs own it).
- Generator: [Orval](https://orval.dev) `8.30.0` (pinned in
  `package.json`), emitting Zod `4.5.4` parsers (pinned runtime
  dependency; `override.zod.version: 4` in `orval.config.ts` so output
  never depends on the installed Zod). Orval's supported
  `exactOptional: true` mode keeps generated parsers compatible with the
  repository's `exactOptionalPropertyTypes` setting without patching or
  forking generator code. Orval delegates output formatting to oxfmt.
  Static and runtime contracts are cross-checked by
  `src/lib/api/contract-compat.test.ts` so they cannot silently diverge.
- Output (`src/lib/api/zod/`, committed): `models/*.zod.ts` (one reusable
  parser per `#/components/schemas/*`, recursive cycles closed with
  `zod.lazy`) and `endpoints/<tag>/<tag>.zod.ts` (one module per API tag
  with operation-keyed parsers: `<Method><Path>QueryParams`,
  `<Method><Path>Body`, and `<Method><Path><Status>Response` for every
  documented status). Generator-provided format validation (`uuid`,
  `email`, `url`, `date`, `date-time`) is preserved, never weakened.
- `src/lib/api/operation-contracts.ts` is a hand-written adapter that
  only indexes those generated exports into a `"METHOD /path"` registry
  (`getOperationContract`) plus `parseOperationResponse` /
  `parseOperationRequest` helpers — no schema interpretation of its own.
  Import operation-scoped `./zod/endpoints/*` modules directly in routes
  for the smallest bundles; the registry is the full-surface lookup for
  the typed fetch layer and the BFF transport.
- Validation is mandatory: every `apiGet`/`apiPost`/`apiPut`/`apiPatch`/
  `apiDelete` success payload must parse against its documented status
  parser, and undocumented success statuses fail closed (the binary
  export download is the explicit `Blob` exception). Error payloads that
  fail their parser never surface raw — the status-mapped error keeps
  its kind with redacted diagnostics. Violations throw `{ kind:
  "contract" }` `ApiError`s carrying correlation (`requestId`) and
  schema paths/type tokens only — never raw payloads, tokens, or
  credentials.
- Server-only BFF code validates via `src/lib/api/bff-contracts.server.ts`
  (`validateBffRequest` / `validateUpstreamResponse`), which is secret-free
  and safe to import from `createServerFn` handlers.
- After any OpenAPI change, run `pnpm api:generate` (types + parsers)
  and commit the result; CI (`pnpm web:api:check`,
  `pnpm web:api:zod:check`, coverage + runtime suites) fails otherwise.

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

## Hardened BFF transport (`src/lib/bff-policy.ts`, `src/lib/sure-api-bff.server.ts`)

The browser's only path to the Sure Rails API is the TanStack Start
server-side transport (ADR-0001 `t_alt_fnd_005`; threat model in
`docs/adr/0001-browser-auth-bff-threat-model.md`):

- **Server-only origin and credentials (B2/REQ-TRAN-03, D1/REQ-SESS-01):**
  the upstream origin resolves from `SURE_API_ORIGIN` via the server-only
  `getSureApiOrigin()` accessor, and server credentials (per-session bearer
  token, optional deployment `SURE_API_KEY` via `getSureApiKey()`) attach
  inside the executor. Neither ever enters browser bundles or responses.
- **SSRF allow-list (REQ-TRAN-03):** `validateBffPath` accepts only relative
  `/api/v1/*` paths on the documented allow-list (mirrors
  `docs/api/openapi.yaml` operations). Absolute URLs, protocol-relative
  URLs, schemes, backslashes, query/fragment smuggling, control characters,
  encoded slashes, dot-segment escapes, and off-list paths are rejected
  before any fetch. Only documented methods per route, only
  `application/json` / `multipart/form-data` bodies, and only an opaque,
  length-capped query string pass.
- **Header hygiene (REQ-TRAN-03):** inbound `Cookie`, `Authorization`,
  `X-Forwarded-*`, and hop-by-hop headers are stripped; only `accept`,
  `accept-language`, `content-type`, and `X-Request-Id` forward. Upstream
  `Set-Cookie` and server internals never propagate back.
- **Mutations (REQ-TRAN-01):** `POST`/`PUT`/`PATCH`/`DELETE` require an
  `Origin` header exactly matching the BFF origin plus a non-empty
  anti-CSRF token. There are no state-changing GETs.
- **Robustness:** 15s default timeout, caller-abort propagation, one retry
  for idempotent methods on network failure/timeout/502/503/504 only
  (never `POST`/`PATCH`, never 4xx/429), 10 MiB request / 25 MiB response
  caps with bounded buffered or streamed downloads, status + `Retry-After`
  + `X-Request-Id` propagation, and redacted `BffError`s safe for browser
  delivery (`toSafeBody()` carrying `retryAfterMs` where present, plus the
  `bffErrorResponseHeaders` adapter so `Retry-After` reaches the browser on
  error outcomes; 5xx bodies replaced, 4xx hints scrubbed).
- **Generated contracts (`t_alt_fnd_018`):** every allow-listed operation
  validates outgoing path/query/body data and upstream success/error data
  through the Orval-generated Zod parsers (`src/lib/api/bff-contracts.server.ts`)
  before dispatch or forwarding — gates, never transforms — with wire
  decoding (query/multipart strings, JSON bodies) plus a coerced fallback
  pass, the generated parser authoritative in both. Violations fail closed
  as redacted `contract` errors; binary downloads bypass JSON validation
  per the generated `isBinaryDownload` rule. No hand-written schemas: the
  route/method allow-list is covered by a test pinning it to the registry.
- **Upload bounds:** multipart bodies are pre-flight sized (field names,
  string bytes, Blob/File sizes, framing overhead) and rejected with 413
  before any upstream call; only sizes are read, so `FormData` forwarding
  stays stream-friendly and bounded multipart Blob/File is the supported
  streaming upload path (raw streams stay fail-closed).
- **Bounded error reads:** upstream error bodies stream through the same
  byte cap (64 KiB) with reader cancellation on overflow — never buffered
  unbounded — and overflow maps to a generic redacted error.
- **Binary redirects:** the documented family-export 302 is a successful
  transport result with its `Location` validated as a credential-free
  http(s) URL (relative values resolved against the upstream origin,
  absolute URL forwarded) plus an empty bounded body; `redirect: manual`
  is kept and every other 3xx fails closed.
- **Caching (REQ-TRAN-05):** every BFF response carries
  `Cache-Control: private, no-store` and `Vary: Cookie, Authorization`.
- **Tests:** `bff-policy.test.ts` (SSRF matrix, method/path/header
  validation, CSRF/origin, cache headers, redaction) and
  `sure-api-bff.server.test.ts` (timeout, abort, retry semantics, size
  limits, binary streaming, upstream error mapping, credential
  non-disclosure) satisfy the ticket verification list.

[`openapi-typescript`]: https://github.com/openapi-ts/openapi-typescript
[`openapi-fetch`]: https://github.com/openapi-ts/openapi-fetch

## UI primitives (`src/components/ui/`) and Storybook

The accessible component system lives in `src/components/ui/` (React Aria
behavior + Sure semantic tokens). Composition rules for feature teams are
in [`COMPOSITION.md`](./src/components/ui/COMPOSITION.md).

- `pnpm storybook` — catalog with light/dark theme toolbar and viewports.
- `pnpm build-storybook && pnpm test:browser` — automated browser
  validation: every story renders in real Chromium (light + dark), targeted
  keyboard/pointer interactions run, then the full axe-core rule set runs.
  First time only, install the browser:
  `pnpm exec playwright install --only-shell chromium`
  (CI uses `... --with-deps` for system libraries).

Coverage split: jsdom suites (`*.test.tsx`) assert ARIA behavior and run
axe with `color-contrast` disabled (jsdom has no layout, so the rule cannot
complete there — and without the opt-out every run prints canvas
`getContext()` noise). Contrast is covered by `test:browser` instead; do
not claim contrast coverage from jsdom suites.
