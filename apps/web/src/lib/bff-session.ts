/**
 * Pure BFF session policy for the Sure alternate frontend.
 *
 * Client-safe (no Node imports, no `process.env`): unit tests, the
 * server-only session store (`sure-auth-session.server.ts`), and route
 * loaders import from here.
 *
 * ADR-0001 traceability (docs/adr/0001-browser-auth-bff-threat-model.md):
 * - D1 / REQ-SESS-01 — the browser holds only an opaque session id; Sure
 *   tokens never enter cookies readable by JS, storage, URLs, or bodies.
 * - D3 / REQ-SESS-03 — `__Host-` cookie name, `HttpOnly`, `Secure`,
 *   `SameSite=Lax`, host-only, `Path=/`, `Max-Age` aligned with the idle
 *   timeout.
 * - D7 / REQ-SESS-04 — fresh session ids at login; client-supplied ids are
 *   validated strictly and stale ids are rejected without consulting
 *   upstream (fail closed).
 * - REQ-SESS-02 — idle timeout + absolute lifetime at or below the
 *   refresh-token lifetime (30 days for device-issued tokens); the BFF
 *   treats per-response `expires_in` as authoritative and caps the
 *   session accordingly.
 * - REQ-TRAN-04 — after-login `next` targets restricted to same-origin
 *   relative paths.
 */

import type { BffSetCookie } from "./bff-session-cookie";
export type { BffSetCookie };

/** Opaque BFF session cookie (HttpOnly; JS must never read it). */
export const BFF_SESSION_COOKIE_NAME = "__Host-sure-bff-session";

/**
 * Synchronized anti-CSRF token cookie (readable by JS so the browser can
 * echo it in the `x-csrf-token` header; the value is meaningless without
 * the server-side session it is bound to). Mutations are accepted only
 * when the presented token constant-time-equals the session's stored
 * token (REQ-TRAN-01).
 */
export const BFF_CSRF_COOKIE_NAME = "__Host-sure-bff-csrf";

/** Idle timeout: a session unused this long is destroyed server-side. */
export const BFF_SESSION_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Absolute lifetime: a session older than this is destroyed even when
 * active. Stays below the 30-day refresh-token lifetime (REQ-SESS-02).
 */
export const BFF_SESSION_ABSOLUTE_LIFETIME_MS = 29 * 24 * 60 * 60 * 1000;

/** Clock-skew tolerance for expiry comparison only; never extends validity. */
export const BFF_SESSION_CLOCK_SKEW_MS = 60 * 1000;

/** Minimum CSRF token entropy (256 bits, base64url-encoded). */
export const BFF_CSRF_TOKEN_BYTES = 32;

/** Minimum session-id entropy (128 bits, base64url-encoded). */
export const BFF_SESSION_ID_BYTES = 16;

/**
 * `Set-Cookie` attributes for the session cookie (REQ-SESS-03): `__Host-`
 * prefix (set by the name), `HttpOnly`, `Secure`, `SameSite=Lax`,
 * host-only (no `Domain`), `Path=/`, `Max-Age` aligned with the idle
 * timeout. The value itself is produced by the server-only store.
 */
export function bffSessionCookieAttributes(): Omit<BffSetCookie, "name" | "value"> {
	return {
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		path: "/",
		maxAge: Math.floor(BFF_SESSION_IDLE_TIMEOUT_MS / 1000),
	};
}

/**
 * `Set-Cookie` attributes for the readable CSRF cookie: same host-only,
 * `Secure`, `SameSite=Lax`, `Path=/` posture as the session cookie but
 * deliberately **not** `HttpOnly` — page JavaScript must read it to echo
 * it back as the mutation header.
 */
export function bffCsrfCookieAttributes(): Omit<BffSetCookie, "name" | "value"> {
	return {
		httpOnly: false,
		secure: true,
		sameSite: "lax",
		path: "/",
		maxAge: Math.floor(BFF_SESSION_IDLE_TIMEOUT_MS / 1000),
	};
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;

/** Control-character check without a control-char regex (lint-clean). */
function hasSessionControlChars(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code <= 0x1f || code === 0x7f) {
			return true;
		}
	}
	return false;
}

/**
 * Strictly parse the opaque session id from a `Cookie` header value.
 * Fails closed (`undefined`) on missing headers, missing cookies, empty
 * values, duplicates, or non-base64url shapes — a client-supplied id is
 * never trusted beyond this gate (REQ-SESS-04), and stale ids never reach
 * upstream.
 */
export function parseBffSessionId(cookieHeader: string | null | undefined): string | undefined {
	if (typeof cookieHeader !== "string" || cookieHeader === "") {
		return undefined;
	}
	let found: string | undefined;
	for (const part of cookieHeader.split(";")) {
		const separator = part.indexOf("=");
		if (separator === -1) {
			continue;
		}
		const name = part.slice(0, separator).trim();
		if (name !== BFF_SESSION_COOKIE_NAME) {
			continue;
		}
		const value = part.slice(separator + 1).trim();
		if (value !== "" && found === undefined) {
			found = value;
		} else {
			// Empty value or a duplicate session cookie: fail closed.
			return undefined;
		}
	}
	if (found === undefined || !SESSION_ID_PATTERN.test(found)) {
		return undefined;
	}
	return found;
}

/**
 * Read the synchronized CSRF token from a `Cookie` header value.
 * Returns `undefined` when absent; binding is enforced server-side
 * against the stored session token, so absence fails closed there.
 */
export function parseBffCsrfCookie(cookieHeader: string | null | undefined): string | undefined {
	if (typeof cookieHeader !== "string" || cookieHeader === "") {
		return undefined;
	}
	for (const part of cookieHeader.split(";")) {
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
 * Resolve an after-login `next` target against the same-origin relative
 * allow-list (REQ-TRAN-04 / T-REDIR). Accepts only single-leading-slash
 * relative paths; rejects absolute URLs, protocol-relative URLs (`//evil`),
 * schemes, backslashes, control characters, encoded slashes, dot-segment
 * escapes, and query/fragment smuggling. Falls back to `/`.
 */
export function resolveSafeNext(rawNext: unknown): string {
	if (typeof rawNext !== "string" || rawNext === "" || !rawNext.startsWith("/")) {
		return "/";
	}
	if (
		rawNext.startsWith("//") ||
		rawNext.includes("\\") ||
		rawNext.includes("?") ||
		rawNext.includes("#") ||
		/%2f|%5c/i.test(rawNext) ||
		/[ \t]/.test(rawNext) ||
		hasSessionControlChars(rawNext)
	) {
		return "/";
	}
	let decoded: string;
	try {
		decoded = decodeURIComponent(rawNext);
	} catch {
		return "/";
	}
	if (
		decoded.includes("\\") ||
		decoded.includes("?") ||
		decoded.includes("#") ||
		decoded.startsWith("//") ||
		hasSessionControlChars(decoded)
	) {
		return "/";
	}
	for (const segment of decoded.split("/").slice(1)) {
		if (segment === "" || segment === "." || segment === "..") {
			return "/";
		}
	}
	return rawNext;
}
