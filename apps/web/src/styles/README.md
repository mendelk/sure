# Sure StyleX theme (apps/web)

Semantic-only design tokens for the alternate frontend, generated from the
canonical `design/tokens/sure.tokens.json`. Never hand-edit the generated
files — edit the JSON, run `npm run tokens:build` from the repo root, and
commit every generated file together.

## Files

| File                       | Kind      | What it is                                                              |
| -------------------------- | --------- | ----------------------------------------------------------------------- |
| `sure-tokens.stylex.ts`    | generated | `vars` (`stylex.defineVars`), `sureLightTheme` / `sureDarkTheme` classes |
| `sure-token-values.ts`     | generated | Same values as plain data (tests, canvas/SVG charts)                    |
| `sure-theme.css`           | generated | `color-scheme` defaults, reduced-motion + forced-colors guards           |
| `theme.ts`                 | handwritten | Theme choice parsing, resolution, persistence, and OS subscription       |
| `TokenPreview.tsx`         | handwritten | Representative preview (tests now, Storybook in `t_alt_fnd_009`)       |

## Rule: semantic tokens only

Product components (`routes/`, `lib/`, future `components/`) MUST use the
semantic `vars` from `sure-tokens.stylex.ts`. Raw palette ladders
(`gray`/`red`/`green`/`yellow`/`cyan`/`blue`/`indigo`/`violet`/`fuchsia`/`pink`/`orange`
scales, base `white`/`black`) are intentionally **not exported** — they exist
once in the JSON and are inlined by the generator.

```tsx
// ✅ Semantic: survives palette shifts and theme changes.
import * as stylex from "@stylexjs/stylex";
import { vars } from "~/styles/sure-tokens.stylex";

const styles = stylex.create({
	root: {
		backgroundColor: vars.container,
		color: vars.textPrimary,
		borderColor: vars.borderPrimary,
		borderRadius: vars.radiusMd,
		boxShadow: vars.shadowXs,
		fontFamily: vars.fontSans,
	},
	status: {
		color: vars.destructive,
		backgroundColor: vars.destructiveSubtle,
	},
});
```

```tsx
// ❌ PROHIBITED: raw palette literals and palette imports.
// - Hex/rgb literals in product components (e.g. backgroundColor: "#F13636").
// - Reaching into palette scales (there is nothing to import — by design).
// The `no-raw-palette` drift test fails the suite if it finds hex literals
// outside `src/styles/` and `*.test.*`.
```

## Charts

Canvas/SVG code cannot consume CSS variables directly, so chart fills use the
plain-data twin with the same guarantees:

```tsx
import { darkValues, lightValues } from "~/styles/sure-token-values";

const fills = theme === "dark" ? darkValues : lightValues;
series.color = fills.chartUnusedFill; // budget-chart token, theme-aware
trend.color = fills.success; // status colors double as chart accents
```

## Theming: light / dark / system default

Resolution order: explicit user choice (`localStorage["sure-theme"]`) wins,
otherwise the OS `prefers-color-scheme` default applies (`theme.ts`
`getInitialTheme`). The root route resolves the theme on hydration and
applies the matching compiled theme declaratively with `stylex.props`.
There are deliberately NO inline scripts: ADR-0001 REQ-TRAN-02 requires an
enforced CSP with no inline scripts, so `dangerouslySetInnerHTML` and
pre-hydration theme scripts are prohibited (the `csp-no-inline-scripts`
test fails the suite if either appears in `src/`).

```tsx
import * as stylex from "@stylexjs/stylex";
import { sureDarkTheme, sureLightTheme } from "~/styles/sure-tokens.stylex";
import { getInitialTheme } from "~/styles/theme";

// null until hydration: SSR and the first client render agree, so there is
// no hydration mismatch and no inline script is needed.
const [theme, setTheme] = useState<SureThemeName | null>(null);
useEffect(() => {
	setTheme(
		getInitialTheme(
			localStorage.getItem("sure-theme"),
			window.matchMedia("(prefers-color-scheme: dark)").matches,
		),
	);
}, []);

<html
	data-theme={theme ?? undefined}
	{...stylex.props(theme === "dark" ? sureDarkTheme : sureLightTheme)}
>
```

Pre-hydration, `data-theme` is absent, so `sure-theme.css` falls through to
the system default (`color-scheme: light dark` plus the
`prefers-color-scheme: dark` rule): scrollbars, form controls, and other UA
chrome already match the OS before React hydrates. App surfaces, meanwhile,
fall back to the compiled light semantic variables — the conditional above
applies `sureLightTheme` while `theme` is null, and its values are identical
to the `defineVars` defaults. The stored/OS choice (including OS dark) takes
effect in the hydration effect above.

`data-theme` also drives `color-scheme` (sure-theme.css), so scrollbars and
form controls follow the app theme once it resolves. The `t_alt_fnd_011`
controls support light/dark/system and persist only explicit light/dark
overrides; absence means system. `RootComponent` owns the single
`useThemeChoice` instance and shares it through `ThemeChoiceProvider`, so
shell/settings controls update the root immediately. Never toggle theme
classes imperatively via `classList` — `createTheme` results are opaque
`Theme<>` objects that only `stylex.props` understands.

## Reduced motion

`sure-theme.css` collapses all animations/transitions under
`@media (prefers-reduced-motion: reduce)`. For component-level transitions,
prefer the StyleX media pattern so the intent is local:

```tsx
const styles = stylex.create({
	animated: {
		transitionProperty: "opacity",
		transitionDuration: "200ms",
		"@media (prefers-reduced-motion: reduce)": {
			transitionDuration: "0.01ms",
		},
	},
});
```

The motion token itself (`vars.motionStrokeFill`) is the `stroke-fill`
keyframe shorthand from the token JSON; do not re-declare the keyframes.

## Forced colors (Windows High Contrast)

`sure-theme.css` removes decorative shadows and guarantees a `CanvasText`
focus ring under `@media (forced-colors: active)`. Components MUST NOT set
`forced-color-adjust: none` except to preserve meaningful imagery, and MUST
NOT replace semantic colors with hardcoded fallbacks inside the block — the
OS palette wins there by design.

## Regeneration + drift checks

```sh
npm run tokens:build   # regenerate Rails CSS + all three StyleX outputs
npm run tokens:check   # rebuild and fail if any generated file drifts
pnpm web:test          # consumer tests (values, themes, no-raw-palette, preview)
```

`tokens:check` covers both consumers: the Rails `_generated.css` and the
three `apps/web/src/styles/sure-*` files must be committed in sync with
`design/tokens/sure.tokens.json`.
