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
| `pnpm typecheck`   | `tsc --noEmit`                      |
| `pnpm test`        | `vitest run`                        |
| `pnpm api:generate` | Regenerate OpenAPI types from `docs/api/openapi.yaml` |
| `pnpm api:check`   | Fail when generated types drift from `docs/api/openapi.yaml` |
| `pnpm install:clean` | Frozen reinstall from the lockfile |

Root shortcuts: `pnpm web:dev`, `pnpm web:build`, `pnpm web:preview`,
`pnpm web:typecheck`, `pnpm web:test`, `pnpm web:api:generate`,
`pnpm web:api:check`.

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
  (`X-Api-Key` auth, `X-Request-Id` correlation) plus `apiGet`/`apiPost`/
  `apiPut`/`apiPatch`/`apiDelete`/`apiDownload` wrappers that normalize
  every outcome — validation (400/422), auth (401/403), missing (404),
  conflicts (409), rate limits (429 + `Retry-After`), other HTTP failures,
  unparseable bodies, aborts, and network errors — into `ApiError`
  (`error.kind`, `error.retryable` for Query retries).
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
  Query interop, and compile-time type assertions — all model shapes are
  referenced from the generated types, never hand-copied.

[`openapi-typescript`]: https://github.com/openapi-ts/openapi-typescript
[`openapi-fetch`]: https://github.com/openapi-ts/openapi-fetch
