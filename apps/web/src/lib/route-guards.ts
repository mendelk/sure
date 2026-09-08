/**
 * SSR-safe route-guard helpers for the Sure alternate frontend.
 *
 * Client-safe pure functions (no Node imports, no `process.env`): route
 * `beforeLoad` handlers call the BFF status server function
 * (`bffSessionStatusFn`, cookie-reading server-side, cookie-sending via
 * RPC client-side — hence SSR-safe), then decide with these helpers.
 * Components never re-implement the checks; they read the context the
 * layout route provides.
 */
import { resolveSafeNext } from "./bff-session";
import type { BffSessionStatus } from "./bff-auth-client";
import type { AppCapabilities, AppCapability } from "./app-capabilities";
import { deriveCapabilities, hasCapability } from "./app-capabilities";

export type GuardDecision =
	| { readonly allowed: true; readonly capabilities: AppCapabilities }
	| { readonly allowed: false; readonly reason: "unauthenticated" | "forbidden" };

/**
 * Authenticate a status: signed-in passes with its capability map,
 * anything else fails as `unauthenticated` (the route redirects to
 * `/login?next=<pathname>`).
 */
export function guardAuthenticated(status: BffSessionStatus): GuardDecision {
	if (!status.authenticated) {
		return { allowed: false, reason: "unauthenticated" };
	}
	return { allowed: true, capabilities: deriveCapabilities(status) };
}

/**
 * Authorize a single capability on top of authentication. Unauthenticated
 * callers get `unauthenticated`; authenticated callers without the
 * capability get `forbidden` (the route redirects to `/unauthorized`).
 */
export function guardCapability(
	status: BffSessionStatus,
	capability: AppCapability,
): GuardDecision {
	const auth = guardAuthenticated(status);
	if (!auth.allowed) {
		return auth;
	}
	if (!hasCapability(auth.capabilities, capability)) {
		return { allowed: false, reason: "forbidden" };
	}
	return auth;
}

/**
 * Build the login `next` value for the current location. Delegates to the
 * BFF same-origin allow-list (`resolveSafeNext`) so guards can never mint
 * an open redirect; invalid inputs fall back to `/`. Callers pass the
 * full target (`location.pathname + location.searchStr`) so typed
 * search/filter state survives the login round-trip as a deep link.
 */
export function loginNextFor(target: string): string {
	return resolveSafeNext(target);
}

/** Login search object for a guarded redirect (`/login?next=...`). */
export function loginSearchFor(target: string): { readonly next: string } {
	return { next: loginNextFor(target) };
}

/** Unauthorized search object (`/unauthorized?from=...`). */
export function unauthorizedSearchFor(target: string): { readonly from: string } {
	return { from: loginNextFor(target) };
}

export interface NextTarget {
	/** Same-origin pathname (no query — safe for router `to`). */
	readonly to: string;
	/** Decoded query entries for the router `search` option. */
	readonly search: Record<string, string>;
}

/**
 * Split a validated `next` target for TanStack navigation. The router
 * treats `to` as a pathname only (an embedded `?query` would corrupt
 * route matching), so the query travels via `search`. Inputs are
 * re-validated through `resolveSafeNext` — never trust a raw string.
 */
export function splitNextTarget(rawNext: unknown): NextTarget {
	const safe = resolveSafeNext(rawNext);
	const queryIndex = safe.indexOf("?");
	if (queryIndex === -1) {
		return { to: safe, search: {} };
	}
	const search: Record<string, string> = {};
	const params = new URLSearchParams(safe.slice(queryIndex + 1));
	params.forEach((value, key) => {
		search[key] = value;
	});
	return { to: safe.slice(0, queryIndex), search };
}
