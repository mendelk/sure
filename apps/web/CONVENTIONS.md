# @sure/web conventions

How we name things, structure routes, key queries, write tests, and handle
environment in the Sure alternate frontend (`apps/web`, TanStack Start).
These conventions are enforced by the workspace tooling where noted; the
rest is review convention.

## Checks (run from the repo root)

| Command                     | What it does                                              |
| --------------------------- | --------------------------------------------------------- |
| `pnpm typecheck`            | `tsc` for every workspace package (browser/server/test boundaries in `apps/web`) |
| `pnpm lint:web`             | oxlint with type-aware rules + browser/server boundaries over `apps/` |
| `pnpm format:check:web`     | oxfmt check over `apps/` + workspace manifests            |
| `pnpm test`                 | vitest for every workspace package                        |
| `pnpm checks:web`           | All four above, in order                                  |

Per-boundary typechecks: `pnpm --filter @sure/web typecheck:app`,
`typecheck:server`, `typecheck:test`. `pretypecheck` regenerates the
(gitignored) `src/routeTree.gen.ts` via `tsr generate`, so typecheck works
from a clean checkout. Rails JavaScript (`app/javascript`) stays on Biome
(`pnpm lint`, `pnpm format:check`, `pnpm style:check`) and is never touched
by the workspace configs.

## Browser / server / test boundaries

`apps/web` is split into three TypeScript projects with the strictest flags
(see `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`,
...):

- **Browser** (`tsconfig.app.json`): everything that may ship to the
  client. Excludes `*.server.*`, tests, and `src/__fixtures__/`.
- **Server** (`tsconfig.server.json`): `*.server.*` modules plus
  `vite.config.ts`. No DOM lib: server code must not touch browser globals.
- **Test** (`tsconfig.test.json`): `*.test.*` / `__tests__/` only. Node
  globals and built-ins are allowed here.

Two lint boundaries apply on top (root `.oxlintrc.json`, error severity):

1. **No client import of server-only modules.** Client-safe code must not
   import `*.server.*`. Route modules (`src/routes/**`) are server-capable
   and may use server-only accessors, but only inside `createServerFn`
   handlers — never in render paths.
2. **No Node APIs in browser bundles.** No `node:*` / Node built-in imports
   and no `process`, `__dirname`, `__filename`, `Buffer`, `global` outside
   `*.server.*`, tests, and Node tooling configs. Read env through a
   `*.server.*` accessor and pass values via server functions/loaders.

Deliberate violation fixtures live in `src/__fixtures__/` (excluded from
typecheck and normal lint). `src/lib/boundary-enforcement.test.ts` lints
them with the real root config and asserts the violations are reported, so
the suite stays green while proving the boundaries bite.

## Naming

- Modules: `kebab-case.ts(x)` (`sure-api-origin.ts`, `sure-api.server.ts`).
- Suffixes carry meaning: `.server.` = server-only (Node allowed),
  `.test.` = vitest suite, `__fixtures__/` = deliberate lint fixtures.
- Route files follow TanStack file-based routing (`src/routes/__root.tsx`,
  `src/routes/index.tsx`); the generated `src/routeTree.gen.ts` is never
  edited by hand.
- Path alias `~/*` maps to `src/*` (`~/lib/...`); keep deep relative
  imports (`../..`) out of new code.
- Type-only imports must use `import type` (`verbatimModuleSyntax`); no
  enums, namespaces, or parameter properties (`erasableSyntaxOnly`); no
  `any`, no non-null assertions — narrow or handle the `undefined` case.

## Routes

- Define routes with `createFileRoute`, colocated data loading via route
  `loader`s that `ensureQueryData` (see `src/routes/index.tsx`).
- Server data access goes through `createServerFn({ method: "GET" })`
  handlers; handlers call `*.server.*` accessors, components never do.
- The root route (`__root.tsx`) owns document head, global stylesheet link,
  and provider-agnostic shell (`RootDocument`); keep per-page chrome in
  page routes.

## Query keys

- Build keys as domain-scoped arrays colocated with the route that owns
  them: `queryKey: ["sure-api-status"]`.
- Share a key by exporting its `queryOptions` object (e.g.
  `sureApiStatusQuery`) and reusing it in `loader` + `useSuspenseQuery` —
  never duplicate key arrays across files.
- Extend hierarchically for parameters/filters:
  `["resource", "list", { filter }]`; keep key segments serializable.

## Tests

- Colocate suites next to sources: `lib/foo.ts` → `lib/foo.test.ts`;
  import from `vitest` explicitly (`describe`/`it`/`expect`).
- Tests run in Node and may use Node APIs; they must stay hermetic — no
  deployment env required (`vite.config.ts` skips the serve-time
  `SURE_API_ORIGIN` check under `VITEST`), no network.
- `vitest/no-focused-tests` is an error: never commit `.only`/`.skip`.
- Boundary behavior is covered by `boundary-enforcement.test.ts`; add
  fixture-driven cases there when a new boundary rule lands.

## Environment

- The only deployment env var is `SURE_API_ORIGIN`: absolute `http(s)`
  origin, no credentials/path/query/fragment (trailing slash normalized).
  Copy `apps/web/.env.example` to `apps/web/.env` for local dev.
- Validate with `assertSureApiOrigin` (pure, unit-tested in
  `sure-api-origin.test.ts`); reach it at runtime only through the
  server-only `getSureApiOrigin()` accessor (`sure-api.server.ts`), which
  throws an actionable error on misconfiguration.
- `vite dev` / `vite preview` fail fast without a valid origin; production
  builds skip the serve-time check (CI builds without secrets) and the SSR
  loader re-validates on every server render.
- Never read `process.env` outside `*.server.*` and Node tooling — lint
  forbids it.
