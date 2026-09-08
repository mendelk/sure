/**
 * Capability-derived navigation for the Sure alternate frontend.
 *
 * Client-safe (no Node imports, no `process.env`, no `*.server.*` imports):
 * safe for route components, the AppShell, and unit tests.
 *
 * Source rule (t_alt_fnd_010 acceptance): visible navigation is derived
 * ONLY from the server-validated BFF session status
 * (`BffSessionStatus`, sealed server-side in `sure-auth-session.server.ts`
 * and read through `bffSessionStatusFn`). There is no localStorage role,
 * no JWT decode, and no client-only role assumption — an unknown or
 * signed-out status yields zero capabilities (fail closed). The optional
 * upstream `role` travels inside the sealed session when Rails provides
 * it; absence means non-admin (fail closed, forward-compatible).
 */
import type { BffSessionStatus } from "./bff-auth-client";
import type { MessageKey } from "./i18n/messages";

/** Actions the shell can gate navigation and routes on. */
export type AppCapability = "view-dashboard" | "manage-settings" | "administer";

/** Capability map: every key present, `true` only when granted. */
export type AppCapabilities = Record<AppCapability, boolean>;

/** Roles that grant the `administer` capability (server-provided only). */
const ADMIN_ROLES: readonly string[] = ["admin", "super_admin"];

/**
 * Whether a server-provided role value grants administration.
 * Unknown, missing, or non-admin values fail closed to `false`.
 */
export function isAdminRole(role: unknown): boolean {
	return typeof role === "string" && ADMIN_ROLES.includes(role);
}

/**
 * Derive capabilities from the server-validated session status.
 * Signed-out statuses grant nothing; signed-in statuses grant the
 * authenticated capabilities, plus `administer` only when the sealed
 * session user carries an admin role.
 */
export function deriveCapabilities(status: BffSessionStatus): AppCapabilities {
	if (!status.authenticated) {
		return { "view-dashboard": false, "manage-settings": false, administer: false };
	}
	return {
		"view-dashboard": true,
		"manage-settings": true,
		administer: isAdminRole(status.user.role),
	};
}

/** Whether the capability map grants a single capability. */
export function hasCapability(capabilities: AppCapabilities, capability: AppCapability): boolean {
	return capabilities[capability];
}

/** Navigation entry owned by the AppShell (label + target + gate). */
export interface AppNavItem {
	readonly id: string;
	readonly labelKey: MessageKey;
	readonly to: string;
	readonly capability: AppCapability;
	readonly descriptionKey: MessageKey;
}

/**
 * Full navigation catalogue. Visibility is computed with
 * `getVisibleNavItems` — never by reading a role string in a component.
 */
export const APP_NAV_ITEMS: readonly AppNavItem[] = [
	{
		id: "dashboard",
		labelKey: "shell.navDashboard",
		to: "/dashboard",
		capability: "view-dashboard",
		descriptionKey: "dashboard.overview",
	},
	{
		id: "settings",
		labelKey: "shell.navSettings",
		to: "/settings",
		capability: "manage-settings",
		descriptionKey: "prefs.settingsDescription",
	},
	{
		id: "admin",
		labelKey: "shell.navAdmin",
		to: "/admin",
		capability: "administer",
		descriptionKey: "admin.cardTitle",
	},
];

/**
 * Visible navigation for the current session: every item whose capability
 * is granted. Pure filter over the server-derived map — the shell renders
 * exactly this list in both the sidebar and the bottom navigation.
 */
export function getVisibleNavItems(capabilities: AppCapabilities): readonly AppNavItem[] {
	return APP_NAV_ITEMS.filter((item) => hasCapability(capabilities, item.capability));
}
