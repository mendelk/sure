# ADR-0002: TanStack Charts for Sure Visualizations

- **Status:** Accepted
- **Date:** 2026-09-08
- **Ticket:** `t_alt_fnd_016` (Evaluate TanStack Charts for Sure visualizations)
- **Scope:** Financial visualizations in the Sure alternate frontend
  (TanStack Start, `apps/web`): net-worth trend, cash-flow comparison, and
  allocation breakdown prototypes, against Recharts as the fallback.
- **Pinned version:** `@tanstack/charts` **`0.16.0` exact** (no range;
  `apps/web/package.json` pins `"0.16.0"`, resolved in `pnpm-lock.yaml`).
  React adapter entry `@tanstack/charts/react`; polar entry
  `@tanstack/charts/polar` (donut only, tree-shaken from other charts).
- **Downstream consumers:** every feature workstream that renders charts.
  Feature code MUST use the application-owned interface
  (`~/components/charts`: `NetWorthChart`, `CashFlowChart`,
  `AllocationDonut`, `SureChartLabels`) and MUST NOT import
  `@tanstack/charts` directly.

All factual claims were validated against the working tree at the
`t_alt_fnd_016` implementation commit (prototypes in
`apps/web/src/components/charts/`, stories in `charts.stories.tsx`, suites
in `*.test.ts(x)`, browser harness in
`apps/web/scripts/storybook-browser-check.mjs`).

---

## 1. Context

`t_alt_fnd_016` time-boxed a decision on the Alpha TanStack Charts library
(chart grammar: marks consume data, channels describe encodings, the engine
compiles a renderer-neutral scene) using three representative Sure charts,
with Recharts as the fallback. The localization/theme/privacy foundation
(`t_alt_fnd_011`) is being built concurrently, so the evaluation had to
avoid duplicating its global context or persistence layer.

## 2. Pass/fail criteria and measured results

| # | Criterion (fail = Recharts) | Result |
|---|------------------------------|--------|
| C1 | Responsive net-worth line/area, grouped cash-flow bars, allocation donut render from shared StyleX semantic tokens, zero raw literals (`no-raw-palette` green) | **Pass.** `areaY`+`lineY` (point x-scale, linear y), `barY` long-form + `layout: group()`, `pie`+`polar`+`radialArc` donut. Axis/grid/series colors via `defaultTheme` + per-mark `fill`/`stroke` from `sure-token-values` (the twin whose documented purpose includes SVG charts). |
| C2 | SSR/hydration safe (no browser globals in render, server HTML carries the chart) | **Pass.** Adapter server-renders complete SVG at `initialWidth`; `useChartEnvironment` keeps SSR/first-render fallbacks (light, reduced-motion) and resolves live values in effects only. `charts-ssr.test.tsx` asserts `renderToString` output (SVG + locale table + masked variant) for all three charts. |
| C3 | Keyboard + screen-reader behavior | **Pass.** Host `tabIndex={0}` + `ariaLabel`; arrows move point focus, Enter selects into a live paragraph (verified in real Chromium for all three charts, harness asserts `Selected …`). Visually-hidden data table carries every value, so SR access never depends on Alpha SVG internals. jsdom axe + full-rule Chromium axe green in both themes. |
| C4 | Privacy masking end to end | **Pass.** `SureChartLabels` injection: `withPrivacyMasking` maps every formatter to `•••`; axis ticks, tooltips, legends, totals, and tables all flow through the injected formatters, so masked SSR/CSR HTML contains no raw amounts (asserted). |
| C5 | Themes, localization, reduced motion | **Pass.** Theme resolves from the root `data-theme` convention post-hydration (hook test pins light default + dark reaction); axis/legend/table text uses injected `Intl` labels (de-DE/EUR verified: `49.750 €`); `svgAnimation` is off unless `prefers-reduced-motion: no-preference` (global CSS guard backstops). |
| C6 | Resize | **Pass.** Container-measured responsive width; probe: svg 560px at 1280/768 viewports (story column cap), 312px at 360px, zero horizontal overflow. |
| C7 | Empty / negative / large datasets | **Pass.** Empty and all-zero render `SureEmptyState` (no chart); negatives render (net-worth dip, diverging grouped bars, donut clamps negatives to zero with totals agreeing); 500-point net worth renders with one table row per point. |
| C8 | Bundle cost materially below Recharts | **Pass.** esbuild minified (react external): TanStack imports **125,608 B / 44,469 gzip** vs Recharts equivalents **433,429 B / 128,115 gzip** (~29% the size). Recharts additionally drags a Redux stack (`@reduxjs/toolkit`, `react-redux`, `immer`, `reselect`, `victory-vendor`); TanStack deps are `d3-*` algorithm modules + `tslib`. |

Full verification on the final tree: `pnpm typecheck` (app/server/test)
green, `pnpm lint:web` green, `pnpm format:check:web` green, `pnpm test`
**474 passed** (29 chart tests, incl. 4 SSR), production `vite build`
green, Storybook browser harness **94/94** (47 stories × light/dark, full
axe incl. contrast + keyboard selection on all three charts).

## 3. Comparison against Recharts

- **Bundle cost:** TanStack ~29% of Recharts (C8). Decisive for mobile web.
- **API stability risk:** TanStack is `0.x` (grammar churn possible) vs
  Recharts `3.x` stable. Contained by the application-owned interface
  (§5) + exact pin + upgrade policy (§6). Residual risk accepted, not hidden.
- **Testability:** TanStack renders in jsdom via its SSR path and in
  `renderToString` without globals; Recharts historically needs
  `ResizeObserver` mocks and `ResponsiveContainer` dimension stubs. Observed
  advantage: TanStack.
- **Visual control:** `defaultTheme` (foreground/muted/grid/background) +
  per-datum `fill`/`stroke` + tick formatters cover every Sure need with
  semantic tokens. Recharts offers more out-of-the-box chrome, but that
  chrome is exactly what would fight the token system.
- **Migration effort:** the seam (§5) localizes a future swap to the chart
  modules; feature code and stories speak only Sure types. Fallback cost is
  bounded and pre-analyzed (§7).

## 4. Decision

**Select `@tanstack/charts` (pinned `0.16.0` exact) for Sure
visualizations.** It passes every criterion, costs a third of the fallback
in bundle, and integrates with the token/theme/SSR conventions instead of
around them. The `0.x` stability risk is fenced by §5–§7, not wished away.

## 5. Application-owned interface (Alpha insulation)

- Feature code imports from `~/components/charts` only. Direct
  `@tanstack/charts` imports outside the three chart modules are a
  close/rewrite review finding (same weight as the COMPOSITION.md rules).
- `SureChartLabels` (`chart-format.ts`) is the injectable
  locale/currency/privacy surface. **Integration point for `t_alt_fnd_011`:**
  its provider resolves locale + privacy state once and passes the
  resulting labels down; no chart changes required.
- Series meaning is fixed in `chart-palette.ts`
  (positive/income→success, negative/expenses→destructive,
  primary→info, unallocated→chartUnallocatedFill).
- `useChartEnvironment` (`chart-environment.ts`) owns the SSR-safe
  theme/reduced-motion resolution; charts rebuild their (memoized)
  definitions from it.

## 6. Upgrade policy

1. The pin stays exact. Never float `0.x` (`^`/`~` on this dependency is a
   review failure).
2. Upgrades are deliberate tickets: bump, run the chart suites
   (`src/components/charts/`), `pnpm checks:web`, the production build,
   and the Storybook browser harness, then re-measure the esbuild bundle
   pair in §2/C8 and record both numbers in the ticket.
3. Any upgrade that breaks type inference without code changes, regresses
   axe/keyboard/SSR behavior, or grows the gzip delta past 150% of C8
   triggers the fallback review (§7) instead of an API workaround.

## 7. Fallback

If §6 trips or TanStack stalls below `1.0` with breaking churn, fall back
to **Recharts `3.x`**: re-implement the three chart modules behind the
unchanged `~/components/charts` props (Recharts needs explicit
`ResponsiveContainer` sizing + `ResizeObserver` test doubles + per-axis
token styling — all contained inside the modules), keep the labels,
palette, environment, host, table, and legend files untouched, and port the
suites story-for-story. No feature code changes.

## 8. Consequences

- One more exact-pinned `0.x` dependency with a rehearsed fallback; the
  review burden is real but bounded to chart-module diffs.
- Chart series colors are a closed semantic set — new intents extend
  `chart-palette.ts` with tokens + stories + tests, mirroring the
  `SureButtonVariant` rule.
- `t_alt_fnd_011` inherits a ready-made injection point instead of a
  retrofit.

## 9. Open risks (non-blocking, tracked)

1. `0.x` grammar churn (mitigated §5–§6).
2. Donut depends on the `@tanstack/charts/polar` subpath; if its API moves
   independently, the donut module absorbs it first.
3. ~~Tooltip body content is library-rendered~~ — **closed by the review
   follow-up below (Amendment A):** tooltips are now built by label-driven
   `content` callbacks; re-verify tooltip text on every upgrade via the
   masked tooltip suites.

## Amendment A (2026-09-08, review follow-up)

Three review findings, all fixed and verified on the final tree
(`pnpm checks:web` green, `vitest` 481 passed, browser harness 98/98,
production `vite build` green):

1. **Privacy leak via default tooltips (High, closed).** The default
   tooltip formatted raw data in a default locale (`49,750` on a masked
   de-DE chart), bypassing `SureChartLabels` — confirmed in Chromium and
   jsdom. All three charts now build tooltip content through a `content`
   callback from the injected labels + copy, so masked tooltips show `•••`
   and localized tooltips use the active locale (`5.200 €`). The bare
   `tooltip` extension without `content` is banned by the privacy note in
   each chart module. Regression suites keyboard-navigate with masked
   labels and assert no raw value in any locale formatting; the net-worth
   suite was verified to fail against the default tooltip (negative
   control) and pass with the fix.
2. **Localizable copy (Medium, closed).** New `chart-copy.ts`: per-chart
   copy objects (`NetWorthCopy`, `CashFlowCopy`, `AllocationCopy` with
   `{count}`-templated summaries) cover axis bases, empty states,
   selection prefixes, table headers, totals, series names, and tooltip
   row labels. Charts take an optional `copy` prop (English defaults);
   `seriesNames`/`unallocatedLabel` props folded in. `t_alt_fnd_011`
   builds these per locale; demonstrated by the `NetWorthLocalized`
   story and copy-override suites.
3. **Stable slice identity (Medium, closed).** `AllocationSlice` gains a
   required stable `id`; color domain, arc key, and legend key use it
   while `label` stays display-only. Duplicate holding names render as
   distinct slices (covered by suite + `AllocationDuplicateLabels`
   story); remainder entry uses fixed id `sure-unallocated`.

## Amendment B (2026-09-08, review follow-up)

Two further findings, both fixed and verified on the final tree
(`pnpm checks:web` green, `vitest` 484 passed, browser harness 98/98,
production `vite build` green):

1. **Accessibility-only copy hardcoded (Medium, closed).** The legend
   `aria-label` and data-table captions (`{title} data`) were still
   English-only. `ChartCopyBase` in `chart-copy.ts` now carries
   `legendLabel` and `tableCaptionTemplate` (`{title}` placeholder, with
   `applyTitleTemplate`); `SureChartLegend` takes its accessible name as
   a required prop from chart copy. Copy-override suites assert localized
   legend names and table accessible names; the `NetWorthLocalized`
   story covers the browser path.
2. **Definition rebuilt on every render (Medium, closed).** Calling
   `defaultXxxCopy()` and `sureChartTheme()` inline produced fresh
   objects per render, so selection state updates recreated the complete
   TanStack definition (wasted scene work, risk of resetting adapter
   interaction state). All three charts now memoize the resolved copy
   and theme mapping (`useMemo` on the `copy` prop / theme name); an
   omitted `copy` is allocation-free across re-renders. Callers passing
   inline copy objects still rebuild — documented at the integration
   point: `t_alt_fnd_011` must pass a stable reference. The new
   `chart-definition-stability` suite counts `defineChart` invocations
   across real keyboard selections (Proxy-based counter, no casts) and
   fails on any rebuild; verified to fail against the unmemoized code
   (negative control) and pass with the fix.
