// Sure theme runtime (apps/web).
//
// Resolves which generated StyleX theme (sure-tokens.stylex.ts) applies: an
// explicit choice wins, otherwise the OS color-scheme default applies. This
// module deliberately does NOT import the `.stylex.ts` file — callers apply
// the compiled themes declaratively via `stylex.props(sureLightTheme |_
// sureDarkTheme)`, so unit tests stay compiler-free. See styles/README.md.

export type SureThemeName = "light" | "dark";

export const SURE_THEME_STORAGE_KEY = "sure-theme";
export const SURE_THEME_ATTR = "data-theme";

const THEME_NAMES: readonly SureThemeName[] = ["light", "dark"];

export function isThemeName(value: unknown): value is SureThemeName {
	return value === "light" || value === "dark";
}

/** Validate a stored preference (localStorage). Anything else → null. */
export function parseStoredTheme(raw: string | null | undefined): SureThemeName | null {
	return isThemeName(raw) ? raw : null;
}

/** Map `matchMedia("(prefers-color-scheme: dark)")` to a theme name. */
export function systemThemeName(prefersDark: boolean): SureThemeName {
	return prefersDark ? "dark" : "light";
}

/**
 * Resolve the theme to apply: stored preference first, OS default second.
 * Pure function so tests can cover every branch without a DOM.
 */
export function getInitialTheme(
	stored: string | null | undefined,
	prefersDark: boolean,
): SureThemeName {
	return parseStoredTheme(stored) ?? systemThemeName(prefersDark);
}

/**
 * Persist an explicit user choice. Pass null to clear it and fall back to
 * the OS default. No-ops without localStorage.
 */
export function persistThemeChoice(theme: SureThemeName | null): void {
	if (typeof localStorage === "undefined") {
		return;
	}
	if (theme === null) {
		localStorage.removeItem(SURE_THEME_STORAGE_KEY);
		return;
	}
	localStorage.setItem(SURE_THEME_STORAGE_KEY, theme);
}

/**
 * Inline `<script>` for the document `<head>` (or top of `<body>`): sets
 * `data-theme` before first paint so the OS-default dark path does not flash
 * light. Rendered via dangerouslySetInnerHTML in the root route. Kept as a
 * string constant — not a function of the helpers above — so it can run with
 * zero dependencies; the drift test asserts the key literals stay in sync.
 */
export const sureThemeInlineScript: string =
	`(function(){try{var s=null;try{s=localStorage.getItem("sure-theme")}catch(e){}` +
	`var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");` +
	`document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

export { THEME_NAMES };
