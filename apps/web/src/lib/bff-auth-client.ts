/**
 * Browser-safe BFF session client for the Sure alternate frontend.
 *
 * Client-safe (no Node imports, no `process.env`, no `*.server.*` imports):
 * safe for route components, hooks, and tests. The browser NEVER holds Sure
 * tokens, API keys, or token-derived values (ADR-0001 D1/REQ-SESS-01) — the
 * only session artifacts here are display data, the TanStack Query status
 * entry, and the readable CSRF cookie echoed back as a mutation header.
 *
 * Clearing rule (t_alt_fnd_007 acceptance): local session state is cleared
 * on logout, revocation, deactivation, invalid refresh, AND deployment API
 * incompatibility — every one of those surfaces as an unauthenticated
 * status or an `api-*` error (`api-mismatch`, `api-too-old`, `api-too-new`,
 * `api-missing-capability`), all of which route through
 * `clearLocalSessionState`.
 */
import type { QueryClient } from "@tanstack/react-query";
import { BFF_CSRF_COOKIE_NAME } from "./bff-session";

/** Display-minimum user snapshot: the only user data the browser may see. */
export interface BffSessionUser {
	readonly id: string;
	readonly email: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly uiLayout: string;
	readonly aiEnabled: boolean;
	/**
	 * Server-provided role when Rails includes it in the login payload
	 * (forward-compatible: absent means non-admin, fail closed). Never
	 * set from client storage — it travels inside the sealed BFF session
	 * only, so capability derivation stays server-validated.
	 */
	readonly role?: string | undefined;
}

export type BffSessionInactiveReason = "missing" | "stale" | "expired";

/** Browser-visible session status (mirrors the status server function). */
export type BffSessionStatus =
	| { readonly authenticated: true; readonly user: BffSessionUser; readonly csrfToken: string }
	| { readonly authenticated: false; readonly reason: BffSessionInactiveReason };

/** TanStack Query key owning the session status (colocated here, shared). */
export const BFF_SESSION_QUERY_KEY = ["bff-session-status"] as const;

/** Login form failure states (one per upstream outcome class). */
export type BffLoginFormFailure =
	| "invalid-credentials"
	| "mfa-unsupported"
	| "unavailable"
	| "throttled"
	| "api-mismatch"
	| "api-too-old"
	| "api-too-new"
	| "api-missing-capability";

/** Server auth error codes that can surface from the login server function. */
export type BffLoginErrorCode =
	| "invalid-credentials"
	| "mfa-unsupported"
	| "unavailable"
	| "api-mismatch"
	| "api-too-old"
	| "api-too-new"
	| "api-missing-capability"
	| "throttled"
	| "session-expired"
	| "logged-out"
	| "deactivated"
	| "invalid-refresh"
	| "csrf"
	| "origin";

/**
 * Map a login server-function error to the form failure state. Anything
 * unexpected (stale sessions, guard rejections, transport unknowns) fails
 * closed to `unavailable` — the form never renders a state it cannot
 * explain, and never leaks upstream detail.
 */
export function mapLoginErrorToFailure(code: BffLoginErrorCode): BffLoginFormFailure {
	switch (code) {
		case "invalid-credentials":
			return "invalid-credentials";
		case "mfa-unsupported":
			return "mfa-unsupported";
		case "throttled":
			return "throttled";
		case "api-mismatch":
			return "api-mismatch";
		case "api-too-old":
			return "api-too-old";
		case "api-too-new":
			return "api-too-new";
		case "api-missing-capability":
			return "api-missing-capability";
		case "unavailable":
		default:
			return "unavailable";
	}
}

/**
 * Read the synchronized CSRF token from a cookie string (defaults to the
 * live `document.cookie` in browsers). Returns `undefined` outside browsers
 * or when absent — callers treat absence as logged-out, never as anonymous.
 *
 * The `globalThis` structural read (instead of a bare `document` global)
 * keeps this module compiling in the DOM-less server typecheck boundary;
 * the `typeof` narrowing keeps it safe at runtime.
 */
export function readBffCsrfToken(cookieString?: string): string | undefined {
	let source = cookieString;
	if (source === undefined) {
		const holder = globalThis as { readonly document?: { readonly cookie?: unknown } | undefined };
		const live = holder.document?.cookie;
		source = typeof live === "string" ? live : undefined;
	}
	if (typeof source !== "string" || source === "") {
		return undefined;
	}
	for (const part of source.split(";")) {
		const separator = part.indexOf("=");
		if (separator === -1) {
			continue;
		}
		if (part.slice(0, separator).trim() !== BFF_CSRF_COOKIE_NAME) {
			continue;
		}
		const value = part.slice(separator + 1).trim();
		return value === "" ? undefined : value;
	}
	return undefined;
}

/**
 * Clear every browser-side session artifact: the status query entry (user
 * display + CSRF token) and any in-flight session query. Server-side state
 * is destroyed by the logout server function, never here.
 */
export function clearLocalSessionState(queryClient: QueryClient): void {
	void queryClient.cancelQueries({ queryKey: BFF_SESSION_QUERY_KEY });
	queryClient.removeQueries({ queryKey: BFF_SESSION_QUERY_KEY });
}

/**
 * Proxied-call failure codes that end the local session (t_alt_fnd_021):
 * the browser must reset to signed-out when an authenticated query
 * surfaces one of these — revocation/expiry (`logged-out`,
 * `session-expired`), upstream deactivation (`deactivated`), or
 * deployment API incompatibility (`api-mismatch`). Every other failure
 * (transport, throttles, guard rejections) keeps the cached session.
 */
export const BFF_SESSION_ENDING_CODES = [
	"api-mismatch",
	"logged-out",
	"deactivated",
	"session-expired",
] as const;

export type BffSessionEndingCode = (typeof BFF_SESSION_ENDING_CODES)[number];

/** Whether a proxied-call failure code ends the local session. */
export function isSessionEndingCode(code: string): code is BffSessionEndingCode {
	return (BFF_SESSION_ENDING_CODES as readonly string[]).includes(code);
}

/**
 * Clear local session state when `code` ends the session. Returns whether
 * the session was cleared so callers can branch to the signed-out state.
 */
export function clearSessionOnEndingCode(queryClient: QueryClient, code: string): boolean {
	if (!isSessionEndingCode(code)) {
		return false;
	}
	clearLocalSessionState(queryClient);
	return true;
}

/** Whether a status/error means the browser must reset to signed-out. */
export function isSignedOutStatus(status: BffSessionStatus): boolean {
	return !status.authenticated;
}
