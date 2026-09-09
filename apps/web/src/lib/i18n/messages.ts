// English-first message catalog (t_alt_fnd_011).
//
// Every user-facing string in apps/web resolves through a `MessageKey`
// here — components never hardcode display copy. English is the only
// shipped locale today (`DEFAULT_LOCALE = "en"`); additional locales add
// dictionaries behind the same keys. Formatting (currency, number, date,
// timezone) lives in `./format`, never in these strings.
//
// Conventions:
// - Keys are namespaced `area.name` (shell, public, routes, auth, prefs,
//   privacy, dashboard, settings, admin).
// - `{var}` interpolation only — no plural/ICU logic in this pass; future
//   locales keep the same placeholders (covered by `messages.test.ts`).
// - Test-only pseudolocales derive from these values via `./fixtures`
//   (`toPseudolocale`), so layout/overflow suites never hand-copy copy.

export const DEFAULT_LOCALE = "en" as const;

/** English-first: the only locale with a shipped dictionary today. */
export const SUPPORTED_LOCALES = ["en"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const enMessageData = {
	// Application document metadata.
	"app.title": "Sure Web",
	"app.documentTitle": "{title} · Sure Web",

	// App shell (components/shell/app-shell.tsx).
	"shell.skipToMain": "Skip to main content",
	"shell.skipToNav": "Skip to navigation",
	"shell.brand": "Sure Web",
	"shell.signedOut": "Signed out",
	"shell.logIn": "Log in",
	"shell.logOut": "Log out",
	"shell.navPrimary": "Primary",
	"shell.navDashboard": "Dashboard",
	"shell.navSettings": "Settings",
	"shell.navAdmin": "Admin",
	"shell.breadcrumb": "Breadcrumb",

	// Public chrome (components/shell/public-chrome.tsx).
	"public.skipToMain": "Skip to main content",
	"public.brand": "Sure Web",
	"public.logIn": "Log in",

	// Route states (components/shell/route-states.tsx).
	"routes.loading": "Loading",
	"routes.loadingDashboard": "Loading dashboard",
	"routes.loadingSettings": "Loading settings",
	"routes.loadingAdmin": "Loading administration",
	"routes.loadingWorkspace": "Loading your workspace",
	"routes.loadingSure": "Loading Sure Web",
	"routes.notFoundTitle": "Page not found",
	"routes.notFoundDescription":
		"The page you are looking for does not exist. Check the address or return to the dashboard.",
	"routes.backToDashboard": "Back to dashboard",
	"routes.unauthorizedTitle": "Not authorized",
	"routes.unauthorizedDescription":
		"You are signed in, but this area needs a capability your account does not have. Contact a family admin if you need access.",
	"routes.errorTitle": "Something went wrong",
	"routes.errorDescription": "The page could not be loaded. Try again in a moment.",
	"routes.errorFallback": "Something went wrong.",
	"routes.workspaceError": "The page could not be loaded.",
	"routes.dashboardError": "The dashboard could not be loaded.",
	"routes.settingsError": "Settings could not be loaded.",
	"routes.adminError": "Administration could not be loaded.",
	"routes.retry": "Try again",

	// Reusable primitive defaults and accessibility labels.
	"ui.loading": "Loading",
	"ui.selectPlaceholder": "Select an option",
	"ui.comboboxPlaceholder": "Search or select",
	"ui.showOptions": "Show options",
	"ui.options": "{label} options",
	"ui.closeDialog": "Close dialog",
	"ui.notifications": "Notifications",
	"ui.dismissNotification": "Dismiss notification: {name}",

	// Auth: login form (components/auth/login-form.tsx).
	"auth.loginTitle": "Log in to Sure",
	"auth.loginDescription": "Sign in with your Sure account to continue.",
	"auth.email": "Email",
	"auth.emailPlaceholder": "you@example.com",
	"auth.password": "Password",
	"auth.submit": "Log in",
	"auth.submitting": "Signing in…",
	"auth.invalidTitle": "Could not sign in",
	"auth.invalidBody": "Invalid email or password. Check your credentials and try again.",
	"auth.mfaTitle": "Two-factor accounts are not supported here",
	"auth.mfaBody":
		"This account uses two-factor authentication, which the web app does not support yet. Please sign in with the mobile app instead.",
	"auth.throttledTitle": "Too many attempts",
	"auth.throttledBody": "Too many sign-in attempts. Wait a few minutes and try again.",
	"auth.mismatchTitle": "Service is being updated",
	"auth.mismatchBody": "The service is being updated right now. Try signing in again in a moment.",
	"auth.tooOldBody":
		"The server version is older than this app supports. Ask your administrator to upgrade the Sure server, then try again.",
	"auth.tooNewBody":
		"The server version is newer than this app supports. Update the web app to continue.",
	"auth.missingCapabilityBody":
		"The server lacks features this app needs. Ask your administrator to upgrade the Sure server, then try again.",
	"auth.unavailableTitle": "Service unavailable",
	"auth.unavailableBody":
		"The sign-in service is unavailable. Check your connection and try again.",
	"auth.invalidData": "Invalid login data.",

	// Session-ending guard (components/auth/session-ending.tsx): rendered
	// in place when an authenticated query surfaces a session-ending
	// failure after the route guard already passed.
	"session.signedOutTitle": "Session ended",
	"session.signedOutBody": "Your session has ended. Sign in again to continue.",

	// Auth: logout page (routes/logout.tsx).
	"auth.logoutTitle": "Log out of Sure",
	"auth.logoutDescription": "This signs you out on this device and revokes the session.",
	"auth.logoutAction": "Log out",
	"auth.loggingOut": "Logging out…",
	"auth.logoutFailedTitle": "Could not log out",
	"auth.logoutFailedBody": "The sign-out service is unavailable. Try again in a moment.",

	// Presentation preferences (components/preferences/*).
	"prefs.themeLabel": "Theme",
	"prefs.themeSystem": "System",
	"prefs.themeLight": "Light",
	"prefs.themeDark": "Dark",
	"prefs.themeDescription": "Follow your device, or pick light or dark.",
	"prefs.privacyLabel": "Hide sensitive values",
	"prefs.privacyDescription": "Mask balances and amounts on this device.",
	"prefs.localeLabel": "Language",
	"prefs.localeDescription": "English only for now; formatting follows your locale.",
	"prefs.settingsTitle": "Display",
	"prefs.settingsDescription":
		"Theme, language, and privacy choices stay on this device. A future settings API can sync them to your account without ever storing sensitive values.",
	"prefs.syncNote":
		"Stored locally only. Future sync: GET/PUT the presentation profile on the user-settings API (last write wins); sensitive data is never persisted.",

	// Privacy masking (components/privacy/*, lib/privacy/*).
	"privacy.maskedValue": "Hidden value",
	"privacy.maskedBalance": "Hidden balance",
	"privacy.showValues": "Show values",
	"privacy.hideValues": "Hide values",
	"privacy.copyMasked": "Copy hidden value",

	// Starter route (routes/index.tsx).
	"home.title": "Sure Web starter route",
	"home.hydrated": "Hydrated in the browser with TanStack Query.",
	"home.ssrPrefix": "Rendered on the server",
	"home.ssrAt": "at",

	// API compatibility status (lib/sure-api-compat.ts).
	"compat.readyTitle": "Connected",
	"compat.readyDetail": "The Sure API contract is supported.",
	"compat.unreachableTitle": "Cannot reach the Sure API",
	"compat.unreachableDetail":
		"The server could not be reached. Check your connection and try again. If the problem persists, contact your administrator.",
	"compat.unauthenticatedTitle": "API credentials rejected",
	"compat.unauthenticatedDetail":
		"The server rejected the app's API credentials. An administrator should check the deployment configuration and try again.",
	"compat.tooOldTitle": "Sure server is too old",
	"compat.tooOldDetail":
		"The server API version is older than this app supports. Ask your administrator to upgrade the Sure server, then try again.",
	"compat.tooOldVersionDetail":
		"The server API version ({version}) is older than this app supports. Ask your administrator to upgrade the Sure server, then try again.",
	"compat.tooNewTitle": "App update required",
	"compat.tooNewDetail":
		"The server API version is newer than this app supports. Update the web app to continue.",
	"compat.tooNewVersionDetail":
		"The server API version ({version}) is newer than this app supports. Update the web app to continue.",
	"compat.missingTitle": "Server is missing required features",
	"compat.missingDetail":
		"The server lacks required features ({capabilities}). Ask your administrator to upgrade the Sure server, then try again.",

	// Dashboard (routes/_authenticated/dashboard.tsx).
	"dashboard.title": "Dashboard",
	"dashboard.homeCrumb": "Home",
	"dashboard.overview": "Workspace overview",
	"dashboard.showing": "Showing {filter} items",
	"dashboard.matching": "matching",
	"dashboard.filterLabel": "Filter workspace items",
	"dashboard.searchLabel": "Search",
	"dashboard.searchPlaceholder": "Search items",
	"dashboard.statusLabel": "Status filter",
	"dashboard.filterAll": "All",
	"dashboard.filterActive": "Active",
	"dashboard.filterArchived": "Archived",
	"dashboard.deepLink": "Deep link to this filtered view",
	"dashboard.goToSettings": "Go to settings",
	"dashboard.accounts": "Workspace accounts: {count}.",

	// Settings (routes/_authenticated/settings*.tsx).
	"settings.title": "Settings",
	"settings.homeCrumb": "Home",
	"settings.sectionsTitle": "Settings sections",
	"settings.sectionsLabel": "Settings sections",
	"settings.profile": "Profile",
	"settings.profileBody": "Profile preferences live here.",
	"settings.account": "Account",
	"settings.accountBody": "Account details live here.",
	"settings.notifications": "Notifications",
	"settings.notificationsBody": "Notification preferences live here.",
	"settings.openAccount": "Open the account page (keeps section)",
	"settings.currentSection": "Current section: {section}.",
	"settings.accountPageTitle": "Account",
	"settings.accountMetaTitle": "Account settings",
	"settings.accountBack": "Back to settings (keeps section)",

	// Admin (routes/_authenticated/admin.tsx).
	"admin.title": "Admin",
	"admin.homeCrumb": "Home",
	"admin.cardTitle": "Family administration",
	"admin.onlyTitle": "Admins only",
	"admin.onlyBody":
		"This area rendered because the server-validated session carries the administer capability. Everyone else sees the unauthorized state.",
	"admin.marker": "Admin workspace content.",

	// Unauthorized (routes/unauthorized.tsx).
	"unauthorized.title": "Not authorized",
	"unauthorized.requestedPage": "Requested page",
} as const;

export type MessageKey = keyof typeof enMessageData;

export type MessageVars = Record<string, string | number>;

const INTERPOLATION_PATTERN = /\{([A-Za-z0-9_]+)\}/g;

/** Widened lookup view (unknown keys degrade to the key itself). */
const enMessages: Record<MessageKey, string> = { ...enMessageData };

/**
 * Resolve a typed message key to its display string, interpolating
 * `{vars}`. Call sites cannot compile with a missing catalog key.
 */
export function formatMessage(
	key: MessageKey,
	vars?: MessageVars,
	locale: string = DEFAULT_LOCALE,
): string {
	const lookup: Record<string, string | undefined> = enMessages;
	const template = lookup[key];
	if (template === undefined) {
		return key;
	}
	void locale;
	if (vars === undefined) {
		return template;
	}
	return template.replace(INTERPOLATION_PATTERN, (match, name: string) => {
		const value = vars[name];
		return value === undefined ? match : String(value);
	});
}

/** Every `{placeholder}` used by a message (for locale-parity checks). */
export function messagePlaceholders(key: MessageKey): readonly string[] {
	const found: string[] = [];
	for (const match of enMessages[key].matchAll(INTERPOLATION_PATTERN)) {
		const name = match[1];
		if (name !== undefined && !found.includes(name)) {
			found.push(name);
		}
	}
	return found;
}

/** The shipped English dictionary (frozen view for tests and fixtures). */
export function getEnglishMessages(): Record<MessageKey, string> {
	return { ...enMessages };
}
