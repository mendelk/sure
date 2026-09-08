// Presentation-preference persistence (t_alt_fnd_011).
//
// ONLY non-sensitive presentation choices persist in the browser:
// theme choice (light/dark/system), locale tag, and the privacy-mask
// flag. Secrets, tokens, emails, balances, and transaction data NEVER
// persist here — session credentials live in the HttpOnly BFF session
// cookie (ADR-0001), and finance data stays in TanStack Query memory.
//
// Storage: three independent localStorage keys (theme keeps its
// pre-existing "sure-theme" contract; the e2e harness seeds it).
// Every reader is SSR-safe (defaults without browser globals) and every
// writer no-ops without localStorage.
//
// Future synchronization with a user-settings API (no implementation
// in this pass — contract only, see PRESENTATION_SYNC_PLAN):
//   GET  /api/v1/settings/presentation → { theme, locale, privacyMasked, updatedAt }
//   PUT  /api/v1/settings/presentation ← same shape; last-write-wins on
//   `updatedAt`; offline or signed-out clients keep the local values and
//   push on the next authenticated save. The server profile contains the
//   same three non-sensitive fields and nothing else.

import { SURE_THEME_STORAGE_KEY, parseThemeChoice } from "~/styles/theme";
import type { SureThemeChoice } from "~/styles/theme";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "~/lib/i18n/messages";
import { resolveLocale } from "~/lib/i18n/format";

export { SURE_THEME_STORAGE_KEY };

export const SURE_LOCALE_STORAGE_KEY = "sure-locale";
export const SURE_PRIVACY_STORAGE_KEY = "sure-privacy-masked";
export const SURE_PRIVACY_MASKED_VALUE = "1";

export interface PresentationPreferences {
	readonly themeChoice: SureThemeChoice;
	readonly locale: string;
	readonly privacyMasked: boolean;
}

export const DEFAULT_PRESENTATION: PresentationPreferences = {
	themeChoice: "system",
	locale: DEFAULT_LOCALE,
	privacyMasked: false,
};

/**
 * How a future user-settings API synchronizes these preferences.
 * Kept as data (not just a comment) so tests pin the contract: only
 * the three non-sensitive fields travel, last-write-wins on updatedAt.
 */
export const PRESENTATION_SYNC_PLAN = {
	endpoint: "/api/v1/settings/presentation",
	methods: ["GET", "PUT"],
	fields: ["theme", "locale", "privacyMasked"],
	conflictPolicy: "last-write-wins via updatedAt",
	offlineBehavior: "keep local values; push on next authenticated save",
	neverSynced: ["tokens", "credentials", "emails", "balances", "transactions"],
} as const;

function readStorage(key: string): string | null {
	try {
		if (typeof localStorage === "undefined") {
			return null;
		}
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStorage(key: string, value: string | null): void {
	try {
		if (typeof localStorage === "undefined") {
			return;
		}
		if (value === null) {
			localStorage.removeItem(key);
		} else {
			localStorage.setItem(key, value);
		}
	} catch {
		// Storage full or blocked (private mode): preferences are
		// best-effort; the app keeps running on defaults.
	}
}

/** Load persisted presentation prefs (SSR-safe: defaults without a DOM). */
export function loadPresentationPreferences(): PresentationPreferences {
	const themeChoice = parseThemeChoice(readStorage(SURE_THEME_STORAGE_KEY));
	const locale = resolveLocale(readStorage(SURE_LOCALE_STORAGE_KEY));
	const privacyMasked = readStorage(SURE_PRIVACY_STORAGE_KEY) === SURE_PRIVACY_MASKED_VALUE;
	return { themeChoice, locale, privacyMasked };
}

/**
 * Persist a subset of presentation prefs. Theme "system" clears the
 * override (absence IS the system state); locale validates against a
 * BCP47 shape and falls back to English; privacy stores "1"/absent.
 */
export function savePresentationPreferences(
	partial: Partial<PresentationPreferences>,
): PresentationPreferences {
	const current = loadPresentationPreferences();
	const next: PresentationPreferences = {
		themeChoice: partial.themeChoice ?? current.themeChoice,
		locale: partial.locale !== undefined ? resolveLocale(partial.locale) : current.locale,
		privacyMasked: partial.privacyMasked ?? current.privacyMasked,
	};
	writeStorage(SURE_THEME_STORAGE_KEY, next.themeChoice === "system" ? null : next.themeChoice);
	writeStorage(SURE_LOCALE_STORAGE_KEY, next.locale === DEFAULT_LOCALE ? null : next.locale);
	writeStorage(SURE_PRIVACY_STORAGE_KEY, next.privacyMasked ? SURE_PRIVACY_MASKED_VALUE : null);
	return next;
}

/** Clear every persisted presentation pref (keeps the session intact). */
export function clearPresentationPreferences(): void {
	writeStorage(SURE_THEME_STORAGE_KEY, null);
	writeStorage(SURE_LOCALE_STORAGE_KEY, null);
	writeStorage(SURE_PRIVACY_STORAGE_KEY, null);
}

export { SUPPORTED_LOCALES };
