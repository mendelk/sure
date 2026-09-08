// Test-only StyleX runtime shim (apps/web, vitest only).
//
// Unit/interaction tests assert ARIA behavior, never compiled CSS (per
// apps/web/CONVENTIONS.md and styles/README.md). The real `@stylexjs/stylex`
// runtime throws without the babel compiler, so vitest aliases the package
// to this module (see `test.alias` in vite.config.ts). Product code never
// imports this file — it is reachable only through the test alias.
type StyleMap = Record<string, unknown>;

/** Passthrough: returns the style object unchanged. */
export function create<T extends StyleMap>(styles: T): T {
	return styles;
}

/**
 * Returns `var(--test-<name>)` placeholders for every token. Typed loosely
 * on purpose: this module only ever runs through the vitest alias (type
 * checking always sees the real `@stylexjs/stylex` types), so no assertion
 * back to a mapped type is needed here.
 */
export function defineVars(variables: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of Object.keys(variables)) {
		const name: string = key;
		out[name] = `var(--test-${name})`;
	}
	return out;
}

/** Theme classes collapse to an empty record in tests. */
export function createTheme(_variables: unknown, _overrides: unknown): Record<string, string> {
	return {};
}

/** Keyframe names collapse to a placeholder (motion is not under test). */
export function keyframes(_frames: unknown): string {
	return "test-keyframes";
}

export interface ShimmedProps {
	className: string;
}

/** Merges style objects into an empty className (CSS is not under test). */
export function props(..._styles: ReadonlyArray<unknown>): ShimmedProps {
	return { className: "" };
}
