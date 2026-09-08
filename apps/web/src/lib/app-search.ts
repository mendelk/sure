/**
 * Typed search/filter state for app-shell routes (t_alt_fnd_010).
 *
 * Client-safe pure parsers for TanStack `validateSearch`: every route
 * accepts unknown record input and returns a fully-typed defaulted value,
 * so deep links (`/dashboard?q=rent&filter=active`), refreshes, and
 * browser back/forward always resolve to valid state — never to
 * `undefined` fields or invalid unions.
 *
 * Note on login `next`: the BFF `resolveSafeNext` allow-list accepts a
 * same-origin pathname plus a validated query string, so the login
 * redirect carries the full deep link (`/dashboard?q=rent&filter=active`)
 * and the post-login navigation restores the typed search state.
 */

export const DASHBOARD_FILTERS: readonly string[] = ["all", "active", "archived"];

export type DashboardFilter = "all" | "active" | "archived";

export interface DashboardSearch {
	readonly q: string;
	readonly filter: DashboardFilter;
}

function isDashboardFilter(value: unknown): value is DashboardFilter {
	return value === "all" || value === "active" || value === "archived";
}

/** Parse dashboard search state with safe defaults (`q=""`, `filter="all"`). */
export function parseDashboardSearch(input: Record<string, unknown>): DashboardSearch {
	const rawQ = input["q"];
	const rawFilter = input["filter"];
	const q = typeof rawQ === "string" ? rawQ.slice(0, 200) : "";
	const filter = isDashboardFilter(rawFilter) ? rawFilter : "all";
	return { q, filter };
}

export const SETTINGS_SECTIONS: readonly string[] = ["profile", "account", "notifications"];

export type SettingsSection = "profile" | "account" | "notifications";

export interface SettingsSearch {
	readonly section: SettingsSection;
}

function isSettingsSection(value: unknown): value is SettingsSection {
	return value === "profile" || value === "account" || value === "notifications";
}

/** Parse settings search state with safe default (`section="profile"`). */
export function parseSettingsSearch(input: Record<string, unknown>): SettingsSearch {
	const raw = input["section"];
	return { section: isSettingsSection(raw) ? raw : "profile" };
}

/** Serialize dashboard search back to a query string (deep-link helper). */
export function serializeDashboardSearch(search: DashboardSearch): string {
	const params = new URLSearchParams();
	if (search.q !== "") {
		params.set("q", search.q);
	}
	if (search.filter !== "all") {
		params.set("filter", search.filter);
	}
	const encoded = params.toString();
	return encoded === "" ? "" : `?${encoded}`;
}
