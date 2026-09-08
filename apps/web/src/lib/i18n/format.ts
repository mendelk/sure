// Locale-aware formatting (t_alt_fnd_011).
//
// Thin, deterministic wrappers over `Intl` for the four formatting
// concerns in the acceptance criteria: currency, number, date, and
// timezone. Pure functions (explicit `locale` + `timeZone`, UTC-defaulted)
// so SSR and the first client render agree exactly — no hydration
// mismatch from environment-dependent defaults. Components format via
// these helpers (or `useLocale()`), never via inline `Intl` or
// `toLocaleString` calls with implicit locales.

import { DEFAULT_LOCALE } from "./messages";

export const DEFAULT_TIME_ZONE = "UTC" as const;

export interface CurrencyFormatInput {
	readonly amount: number;
	readonly currency: string;
	readonly locale?: string | undefined;
}

export interface NumberFormatInput {
	readonly value: number;
	readonly locale?: string | undefined;
	readonly options?: Intl.NumberFormatOptions | undefined;
}

export interface DateFormatInput {
	readonly date: Date | string | number;
	readonly locale?: string | undefined;
	/** IANA timezone; defaults to UTC so SSR/client agree. */
	readonly timeZone?: string | undefined;
	readonly options?: Intl.DateTimeFormatOptions | undefined;
}

/** Normalize a locale tag, falling back to English on garbage input. */
export function resolveLocale(raw: string | null | undefined): string {
	if (raw === null || raw === undefined || raw.trim() === "") {
		return DEFAULT_LOCALE;
	}
	try {
		// Canonicalize (throws on structurally invalid tags); Intl
		// itself negotiates the closest supported locale at format time.
		return new Intl.NumberFormat(raw).resolvedOptions().locale;
	} catch {
		return DEFAULT_LOCALE;
	}
}

/** Locale-aware currency (ISO 4217 code, e.g. "USD"). */
export function formatCurrency(input: CurrencyFormatInput): string {
	const locale = resolveLocale(input.locale);
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency: input.currency,
	}).format(input.amount);
}

/** Locale-aware plain number. */
export function formatNumber(input: NumberFormatInput): string {
	const locale = resolveLocale(input.locale);
	return new Intl.NumberFormat(locale, input.options).format(input.value);
}

/**
 * Locale-aware date with an explicit timezone (default UTC). The
 * timezone is always pinned — never inherited from the host — so a
 * server in one zone and a browser in another render byte-identical
 * output for the same input.
 */
export function formatDate(input: DateFormatInput): string {
	const locale = resolveLocale(input.locale);
	const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
	return new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		...input.options,
		timeZone,
	}).format(new Date(input.date));
}

/** Locale-aware date + time with an explicit timezone (default UTC). */
export function formatDateTime(input: DateFormatInput): string {
	const locale = resolveLocale(input.locale);
	const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
	return new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
		...input.options,
		timeZone,
	}).format(new Date(input.date));
}

/** The IANA zone the app formats in when no explicit zone is given. */
export function defaultTimeZone(): string {
	return DEFAULT_TIME_ZONE;
}
