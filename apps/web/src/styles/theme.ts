// Sure theme runtime (apps/web).
//
// Resolves which generated StyleX theme (sure-tokens.stylex.ts) applies: an
// explicit choice wins, otherwise the OS color-scheme default applies. This
// module deliberately does NOT import the `.stylex.ts` file — callers apply
// the compiled themes declaratively via `stylex.props(sureLightTheme |_
// sureDarkTheme)`, so unit tests stay compiler-free. See styles/README.md.

export type SureThemeName = "light" | "dark";

/**
 * User-facing theme choice (t_alt_fnd_011): an explicit light/dark theme,
 * or "system" to follow the OS `prefers-color-scheme` default. "system"
 * is the default (no stored preference) so first renders never depend on
 * browser state — SSR and the first client render agree, and the choice
 * resolves post-hydration with no mismatch.
 */
export type SureThemeChoice = "light" | "dark" | "system";

export const SURE_THEME_STORAGE_KEY = "sure-theme";
export const SURE_THEME_ATTR = "data-theme";
// Explicitly stored "follow the OS" value. `parseStoredTheme` (below)
// intentionally keeps treating it as "no explicit theme" (null) so the
// original light/dark contract is unchanged; `parseThemeChoice` maps it
// to "system".
export const SURE_THEME_CHOICE_SYSTEM_VALUE = "system";

const THEME_NAMES: readonly SureThemeName[] = ["light", "dark"];
const THEME_CHOICES: readonly SureThemeChoice[] = ["light", "dark", "system"];

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

/** Validate a theme *choice* (light/dark/system). Anything else → "system". */
export function parseThemeChoice(raw: string | null | undefined): SureThemeChoice {
	if (raw === "light" || raw === "dark" || raw === "system") {
		return raw;
	}
	return "system";
}

/** Type guard for the user-facing choice (light/dark/system). */
export function isThemeChoice(value: unknown): value is SureThemeChoice {
	return value === "light" || value === "dark" || value === "system";
}

/**
 * Resolve a choice to the concrete theme to apply: explicit light/dark
 * wins, "system" follows the OS default. Pure, like `getInitialTheme`.
 */
export function resolveThemeChoice(choice: SureThemeChoice, prefersDark: boolean): SureThemeName {
	if (choice === "light") {
		return "light";
	}
	if (choice === "dark") {
		return "dark";
	}
	return systemThemeName(prefersDark);
}

/**
 * Persist a theme choice, where "system" (and null) clears the stored
 * override so the OS default applies. An explicit "system" string is
 * normalized to removal: absence IS the system state, which keeps the
 * storage contract ("sure-theme" holds only light/dark) stable for
 * existing readers such as the e2e harness. No-ops without localStorage.
 */
export function persistThemeChoiceValue(choice: SureThemeChoice | null): void {
	if (typeof localStorage === "undefined") {
		return;
	}
	if (choice === null || choice === "system") {
		localStorage.removeItem(SURE_THEME_STORAGE_KEY);
		return;
	}
	localStorage.setItem(SURE_THEME_STORAGE_KEY, choice);
}

/**
 * Read the OS dark-mode preference once. Split out so components can
 * resolve the stored/system choice without touching matchMedia in
 * render (SSR-safe: call inside effects only).
 */
export function readSystemPrefersDark(): boolean {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return false;
	}
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Subscribe to OS color-scheme changes (for "system" followers). Returns
 * an unsubscribe function. No-ops (returns a no-op unsubscribe) without
 * matchMedia. Call from effects only — never during render/SSR.
 */
export function subscribeToSystemTheme(listener: (prefersDark: boolean) => void): () => void {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return () => {};
	}
	const query = window.matchMedia("(prefers-color-scheme: dark)");
	const handler = (event: MediaQueryListEvent): void => {
		listener(event.matches);
	};
	query.addEventListener("change", handler);
	return () => {
		query.removeEventListener("change", handler);
	};
}

export { THEME_NAMES, THEME_CHOICES };
