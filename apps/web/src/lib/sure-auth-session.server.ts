/**
 * Server-only BFF session layer (TanStack Start server executor).
 *
 * The browser's Sure authentication lives here and ONLY here: the BFF
 * holds the Sure OAuth access/refresh pair server-side, keyed by an opaque
 * random session id carried in an `HttpOnly` cookie. No Sure token, API
 * key, or token-derived value ever enters a browser response
 * (ADR-0001 D1/REQ-SESS-01) — every public outcome below returns display
 * data (`BffSessionUser`) and `Set-Cookie` instructions, never secrets.
 *
 * ADR-0001 traceability (docs/adr/0001-browser-auth-bff-threat-model.md):
 * - §3.1 / REQ-AUTH-01 — login exchanges credentials server-side only;
 *   MFA-gated accounts fail closed with `mfa-unsupported` (REQ-AUTH-07),
 *   never bypassed.
 * - §3.1 / REQ-SESS-04 — fresh ≥128-bit session id at login; any
 *   pre-login id presented in the request cookie is destroyed first
 *   (fixation defense).
 * - §3.2 / REQ-AUTH-03 — rotation, not reuse: refresh mints a new pair
 *   and the old refresh token dies upstream; replaying an old token
 *   yields 401, which destroys the BFF session (family teardown).
 * - §3.2 / REQ-AUTH-04 — single-flight refresh per session: concurrent
 *   requests that observe expiry converge on one upstream
 *   `POST /api/v1/auth/refresh`.
 * - §3.2 / REQ-AUTH-05 — at most one automatic retry after a successful
 *   refresh; a second 401 destroys the session and forces logout, never
 *   an infinite loop.
 * - §3.3 / REQ-API-01 — logout is three-step: destroy the server-side
 *   session, best-effort explicit revocation via
 *   `POST /api/v1/auth/logout`, clear the cookies. Never "cookie only".
 * - §3.4 / REQ-SESS-02 — idle timeout + absolute lifetime ≤ refresh-token
 *   lifetime; stale sessions destroyed server-side, stale cookies rejected
 *   without consulting upstream (fail closed); ≤60s skew on expiry only.
 * - §3.5-§3.6 / REQ-AUTH-06 — every proxied call revalidates: Rails
 *   rejects inactive users with 401-deactivated, which destroys the BFF
 *   session on the next upstream call at the latest; authorization stays
 *   server-side per request (403s propagate, session kept).
 * - D2 — sessions are encrypted at rest (AES-256-GCM, versioned key ids
 *   with a dual-accept window) and carry display-minimum payloads only.
 * - D3 / REQ-SESS-03 — cookie attributes from `./bff-session` (explicit,
 *   never framework defaults).
 * - REQ-TRAN-01 — session-authenticated mutations bind the presented
 *   anti-CSRF token to the stored session token (constant-time compare).
 * - REQ-TRAN-06 — BFF login/refresh throttles independent of upstream
 *   Rack::Attack.
 * - REQ-OPS-01 — redacted structured errors; credentials never logged.
 *
 * Storage note: the default store is process-memory (single-container BFF
 * v1). Sessions do not survive restarts or replicate across instances —
 * stale cookies then fail closed to `session-expired` and the browser
 * clears local state. A shared Redis/DB store can replace `BffSessionStore`
 * without touching callers.
 */
import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import {
	BFF_CSRF_COOKIE_NAME,
	BFF_SESSION_ABSOLUTE_LIFETIME_MS,
	BFF_SESSION_CLOCK_SKEW_MS,
	BFF_SESSION_COOKIE_NAME,
	BFF_SESSION_ID_BYTES,
	BFF_SESSION_IDLE_TIMEOUT_MS,
	BFF_CSRF_TOKEN_BYTES,
	bffCsrfCookieAttributes,
	bffSessionCookieAttributes,
	parseBffSessionId,
} from "./bff-session";
import type { BffSetCookie } from "./bff-session-cookie";
import { BffError, checkBffMutationGuards } from "./bff-policy";
import type { BffMethod } from "./bff-policy";
import { proxyToSureApi } from "./sure-api-bff.server";
import type { BffBodyInit, BffProxyRequest, BffProxyResult } from "./sure-api-bff.server";
import { checkApiCompatibility } from "./sure-api-compat.server";
import type { ApiCompatibility } from "./sure-api-compat.server";
import { describeApiCompatibility } from "./sure-api-compat";
import type { ApiCompatibilityState } from "./sure-api-compat";
import type { BffSessionUser } from "./bff-auth-client";

export type BffAuthErrorCode =
	| "invalid-credentials"
	| "mfa-unsupported"
	| "unavailable"
	| "api-mismatch"
	| "api-too-old"
	| "api-too-new"
	| "api-missing-capability"
	| "session-expired"
	| "logged-out"
	| "deactivated"
	| "invalid-refresh"
	| "csrf"
	| "origin"
	| "throttled";

export interface BffAuthError {
	readonly code: BffAuthErrorCode;
	readonly message: string;
	readonly retryAfterMs?: number | undefined;
}

export type BffAuthFailure = { readonly ok: false; readonly error: BffAuthError };

function fail(code: BffAuthErrorCode, message: string, retryAfterMs?: number): BffAuthFailure {
	return { ok: false, error: { code, message, retryAfterMs } };
}

/** Versioned session-encryption key (`kid` selects the envelope key). */
export interface BffSessionKey {
	readonly kid: string;
	readonly key: Buffer;
}

export interface BffSessionSecrets {
	readonly current: BffSessionKey;
	readonly previous?: BffSessionKey | undefined;
}

function parseSessionKey(raw: string | undefined, kid: string, envVar: string): BffSessionKey {
	const text = (raw ?? "").trim();
	if (text === "") {
		throw new Error(`${envVar} is missing or empty. Set it to a base64 256-bit session key.`);
	}
	let key: Buffer;
	try {
		key = Buffer.from(text, "base64");
	} catch {
		throw new Error(`${envVar} is not valid base64.`);
	}
	if (key.length !== 32) {
		throw new Error(`${envVar} must decode to 32 bytes (256 bits).`);
	}
	return { kid, key };
}

/**
 * Resolve the session-encryption secrets from the environment.
 * `SURE_SESSION_SECRET` (current) is required; `SURE_SESSION_PREVIOUS_SECRET`
 * opens the dual-accept rotation window (REQ-OPS-01/D8): new sessions seal
 * with `current`, reads accept `previous` until rotation completes.
 */
export function getBffSessionSecrets(env: NodeJS.ProcessEnv = process.env): BffSessionSecrets {
	const current = parseSessionKey(
		env["SURE_SESSION_SECRET"],
		(env["SURE_SESSION_KEY_ID"] ?? "").trim() || "v1",
		"SURE_SESSION_SECRET",
	);
	const previousRaw = (env["SURE_SESSION_PREVIOUS_SECRET"] ?? "").trim();
	if (previousRaw === "") {
		return { current };
	}
	return {
		current,
		previous: parseSessionKey(
			previousRaw,
			`${current.kid}-previous`,
			"SURE_SESSION_PREVIOUS_SECRET",
		),
	};
}

/** Opaque encrypted blob persisted per session id. */
export type BffStoredBlob = string;

export interface BffSessionStore {
	get(sessionId: string): BffStoredBlob | undefined;
	set(sessionId: string, blob: BffStoredBlob): void;
	delete(sessionId: string): void;
}

function createMemorySessionStore(): BffSessionStore {
	const backing = new Map<string, BffStoredBlob>();
	return {
		get: (sessionId) => backing.get(sessionId),
		set: (sessionId, blob) => {
			backing.set(sessionId, blob);
		},
		delete: (sessionId) => {
			backing.delete(sessionId);
		},
	};
}

let defaultSessionStore: BffSessionStore | undefined;

/** Isolated in-memory store (tests; production uses the default singleton). */
export function createBffSessionStore(): BffSessionStore {
	return createMemorySessionStore();
}

/** Process-memory default store (single-container BFF v1; see module note). */
export function getDefaultSessionStore(): BffSessionStore {
	if (defaultSessionStore === undefined) {
		defaultSessionStore = createMemorySessionStore();
	}
	return defaultSessionStore;
}

/** Test hook: replace the process default store (tests pass `store` instead). */
export function resetDefaultSessionStoreForTests(): void {
	defaultSessionStore = undefined;
}

interface BffSessionPayload {
	readonly csrfToken: string;
	readonly accessToken: string;
	readonly refreshToken: string;
	/** Epoch ms when the access token expires (0 = unknown, no preemption). */
	readonly accessExpiresAt: number;
	/** Epoch ms when the refresh token expires (0 = unknown). */
	readonly refreshExpiresAt: number;
	readonly idleExpiresAt: number;
	readonly absoluteExpiresAt: number;
	readonly deviceId: string;
	readonly user: BffSessionUser;
}

function sealPayload(payload: BffSessionPayload, secrets: BffSessionSecrets): BffStoredBlob {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", secrets.current.key, iv);
	const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	const envelope = {
		v: 1,
		kid: secrets.current.kid,
		iv: iv.toString("base64"),
		tag: tag.toString("base64"),
		data: ciphertext.toString("base64"),
	};
	return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64");
}

interface SealEnvelope {
	readonly v: number;
	readonly kid: string;
	readonly iv: string;
	readonly tag: string;
	readonly data: string;
}

function isSealEnvelope(value: unknown): value is SealEnvelope {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	// eslint-disable-next-line typescript/no-unsafe-type-assertion -- Narrowing boundary: typeof/value-null checks above establish a plain object; field types are validated literally below.
	const record = value as Record<string, unknown>;
	return (
		record["v"] === 1 &&
		typeof record["kid"] === "string" &&
		typeof record["iv"] === "string" &&
		typeof record["tag"] === "string" &&
		typeof record["data"] === "string"
	);
}

function unsealPayload(
	blob: BffStoredBlob,
	secrets: BffSessionSecrets,
): BffSessionPayload | undefined {
	let envelope: unknown;
	try {
		envelope = JSON.parse(Buffer.from(blob, "base64").toString("utf8"));
	} catch {
		return undefined;
	}
	if (!isSealEnvelope(envelope)) {
		return undefined;
	}
	const key =
		envelope.kid === secrets.current.kid
			? secrets.current.key
			: envelope.kid === secrets.previous?.kid
				? secrets.previous.key
				: undefined;
	if (key === undefined) {
		return undefined;
	}
	try {
		const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
		decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
		const plaintext = Buffer.concat([
			decipher.update(Buffer.from(envelope.data, "base64")),
			decipher.final(),
		]).toString("utf8");
		// eslint-disable-next-line typescript/no-unsafe-type-assertion -- Narrowing boundary: JSON.parse returns any; every consumed field is validated literally below before the payload escapes.
		const payload = JSON.parse(plaintext) as Partial<BffSessionPayload>;
		if (
			typeof payload.csrfToken !== "string" ||
			typeof payload.accessToken !== "string" ||
			typeof payload.refreshToken !== "string" ||
			typeof payload.deviceId !== "string" ||
			typeof payload.user !== "object" ||
			payload.user === null
		) {
			return undefined;
		}
		// eslint-disable-next-line typescript/no-unsafe-type-assertion -- Narrowing boundary: required string/object fields validated above; BffSessionPayload carries no methods or prototypes to confuse.
		return payload as BffSessionPayload;
	} catch {
		return undefined;
	}
}

/** Upstream device identity for BFF-held sessions (one row per session). */
export const BFF_DEVICE_TYPE = "web";
export const BFF_DEVICE_NAME = "Sure Web";
export const BFF_DEVICE_OS_VERSION = "bff/1";
export const BFF_APP_VERSION = "0.1.0";

function bffDeviceParams(deviceId: string): Record<string, string> {
	return {
		device_id: deviceId,
		device_name: BFF_DEVICE_NAME,
		device_type: BFF_DEVICE_TYPE,
		os_version: BFF_DEVICE_OS_VERSION,
		app_version: BFF_APP_VERSION,
	};
}

export interface BffAuthDeps {
	readonly fetchImpl?: typeof fetch | undefined;
	readonly upstreamOrigin?: string | undefined;
	readonly secrets?: BffSessionSecrets | undefined;
	readonly store?: BffSessionStore | undefined;
	/** In-flight refreshes keyed by session id (single-flight, REQ-AUTH-04). */
	readonly pendingRefreshes?: Map<string, Promise<BffRefreshOutcome>> | undefined;
	/** Throttle buckets keyed by scope (login IP / refresh session). */
	readonly throttleBuckets?: Map<string, number[]> | undefined;
	readonly now?: (() => number) | undefined;
}

interface ResolvedAuthDeps {
	readonly fetchImpl: typeof fetch | undefined;
	readonly upstreamOrigin: string | undefined;
	readonly secrets: BffSessionSecrets | undefined;
	readonly store: BffSessionStore;
	readonly pendingRefreshes: Map<string, Promise<BffRefreshOutcome>>;
	readonly throttleBuckets: Map<string, number[]>;
	readonly now: () => number;
}

function resolveDeps(deps: BffAuthDeps | undefined): ResolvedAuthDeps {
	return {
		fetchImpl: deps?.fetchImpl,
		upstreamOrigin: deps?.upstreamOrigin,
		secrets: deps?.secrets,
		store: deps?.store ?? getDefaultSessionStore(),
		pendingRefreshes: deps?.pendingRefreshes ?? defaultPendingRefreshes,
		throttleBuckets: deps?.throttleBuckets ?? defaultThrottleBuckets,
		now: deps?.now ?? Date.now,
	};
}

let defaultPendingRefreshes = new Map<string, Promise<BffRefreshOutcome>>();
let defaultThrottleBuckets = new Map<string, number[]>();

function resolveSecrets(deps: { secrets?: BffSessionSecrets | undefined }): BffSessionSecrets {
	return deps.secrets ?? getBffSessionSecrets();
}

function randomId(): string {
	return randomBytes(BFF_SESSION_ID_BYTES).toString("base64url");
}

function randomCsrfToken(): string {
	return randomBytes(BFF_CSRF_TOKEN_BYTES).toString("base64url");
}

function sessionCookies(sessionId: string, csrfToken: string): BffSetCookie[] {
	return [
		{ name: BFF_SESSION_COOKIE_NAME, value: sessionId, ...bffSessionCookieAttributes() },
		{ name: BFF_CSRF_COOKIE_NAME, value: csrfToken, ...bffCsrfCookieAttributes() },
	];
}

function clearSessionCookies(): BffSetCookie[] {
	return [
		{ name: BFF_SESSION_COOKIE_NAME, value: "", ...bffSessionCookieAttributes(), maxAge: 0 },
		{ name: BFF_CSRF_COOKIE_NAME, value: "", ...bffCsrfCookieAttributes(), maxAge: 0 },
	];
}

/**
 * Decode a buffered proxy body as JSON. Streams never occur here (the
 * session layer always proxies in `"buffer"` mode); anything else fails
 * closed to `undefined` and the caller maps it to `api-mismatch`.
 */
function decodeProxyJsonBody(result: BffProxyResult): unknown {
	if (!(result.body instanceof ArrayBuffer)) {
		return undefined;
	}
	const text = new TextDecoder().decode(result.body);
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

/** Type predicate for JSON-object narrowing without assertions. */
function isStringRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function narrowUser(raw: unknown): BffSessionUser | undefined {
	if (!isStringRecord(raw)) {
		return undefined;
	}
	const id: unknown = raw["id"];
	const email: unknown = raw["email"];
	// Rails returns null for unset names (mobile_user_payload); the session
	// user is display data only, so coerce to empty string rather than
	// rejecting the login.
	const firstName: unknown = raw["first_name"] ?? "";
	const lastName: unknown = raw["last_name"] ?? "";
	const uiLayout: unknown = raw["ui_layout"];
	const aiEnabled: unknown = raw["ai_enabled"];
	const role: unknown = raw["role"];
	if (
		typeof id !== "string" ||
		typeof email !== "string" ||
		typeof firstName !== "string" ||
		typeof lastName !== "string" ||
		typeof uiLayout !== "string" ||
		typeof aiEnabled !== "boolean"
	) {
		return undefined;
	}
	// Optional upstream role (forward-compatible): kept only when a
	// non-empty string, otherwise omitted so capabilities fail closed.
	const adminRole = typeof role === "string" && role !== "" ? role : undefined;
	return {
		id,
		email,
		firstName,
		lastName,
		uiLayout,
		aiEnabled,
		...(adminRole === undefined ? {} : { role: adminRole }),
	};
}

function isMfaFailure(message: string): boolean {
	return /mfa|two-factor|otp/i.test(message);
}

/** `expires_in` (seconds) narrowed to milliseconds; 0 = absent/invalid. */
function narrowExpiresInMs(record: Record<string, unknown>): number {
	const expiresIn: unknown = record["expires_in"];
	if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
		return 0;
	}
	return Math.floor(expiresIn * 1000);
}

function isDeactivatedFailure(message: string): boolean {
	return /deactivat/i.test(message);
}

const THROTTLE_LOGIN_LIMIT = 10;
const THROTTLE_LOGIN_WINDOW_MS = 10 * 60 * 1000;
const THROTTLE_REFRESH_LIMIT = 20;
const THROTTLE_REFRESH_WINDOW_MS = 10 * 60 * 1000;

/** Sliding-window throttle (REQ-TRAN-06). Returns retry hint when limited. */
export function checkBffThrottle(
	buckets: Map<string, number[]>,
	key: string,
	limit: number,
	windowMs: number,
	now: number,
): { readonly limited: boolean; readonly retryAfterMs?: number | undefined } {
	const seen = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
	if (seen.length >= limit) {
		const oldest = Math.min(...seen);
		buckets.set(key, seen);
		return { limited: true, retryAfterMs: Math.max(0, oldest + windowMs - now) };
	}
	seen.push(now);
	buckets.set(key, seen);
	return { limited: false };
}

export interface BffLoginInput {
	readonly email: string;
	readonly password: string;
	/** Inbound `Origin` header (same-origin enforced; login has no session yet). */
	readonly origin: string | null | undefined;
	readonly bffOrigin: string;
	/** Request cookie header (pre-login id is destroyed: fixation defense). */
	readonly cookieHeader: string | null | undefined;
	/** Throttle key, e.g. client IP (never logged with credentials). */
	readonly clientKey: string;
}

export type BffLoginResult =
	| {
			readonly ok: true;
			readonly user: BffSessionUser;
			readonly csrfToken: string;
			readonly cookies: readonly BffSetCookie[];
	  }
	| BffAuthFailure;

/**
 * Server-side login (REQ-AUTH-01): credentials travel only BFF→Rails,
 * never touch the browser beyond this call's arguments, and the Sure
 * token pair lands directly in the encrypted server-side session.
 *
 * Compatibility gate (`t_alt_fnd_015`): the deployment contract is checked
 * first and an incompatible API fails closed before any credential leaves
 * the BFF — with one distinct error per state (`unreachable` →
 * `unavailable`, `too-old`/`too-new`/`missing-capability` → the matching
 * `api-*` code). Messages are origin-free (see `./sure-api-compat`).
 */
export async function loginToBffSession(
	input: BffLoginInput,
	deps?: BffAuthDeps,
): Promise<BffLoginResult> {
	const resolved = resolveDeps(deps);
	const now = resolved.now();
	const throttle = checkBffThrottle(
		resolved.throttleBuckets,
		`login:${input.clientKey}`,
		THROTTLE_LOGIN_LIMIT,
		THROTTLE_LOGIN_WINDOW_MS,
		now,
	);
	if (throttle.limited) {
		return fail("throttled", "Too many login attempts. Retry later.", throttle.retryAfterMs);
	}

	const email = input.email.trim();
	if (email === "" || input.password === "") {
		return fail("invalid-credentials", "Invalid email or password.");
	}

	const compatibility = await checkApiCompatibility({
		fetchImpl: resolved.fetchImpl,
		upstreamOrigin: resolved.upstreamOrigin,
	});
	if (compatibility.state !== "ready") {
		return mapCompatibilityToLoginFailure(compatibility.state, compatibility);
	}

	// Fixation defense (REQ-SESS-04): a pre-login session id is never
	// honored — destroy it before minting the fresh post-login session.
	const preLoginId = parseBffSessionId(input.cookieHeader);
	if (preLoginId !== undefined) {
		resolved.store.delete(preLoginId);
	}

	const sessionId = randomId();
	const csrfToken = randomCsrfToken();
	const deviceId = `bff-${sessionId}`;

	let upstream: BffProxyResult;
	try {
		upstream = await proxyToSureApi(
			{
				method: "POST",
				path: "/api/v1/auth/login",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email,
					password: input.password,
					device: bffDeviceParams(deviceId),
				}),
				// Pre-session: only the origin check can apply (no stored
				// token exists yet); login-CSRF is contained by always
				// minting a fresh session id above plus this same-origin
				// gate. The presented token is single-use for this call.
				origin: input.origin,
				csrfToken: randomCsrfToken(),
				bffOrigin: input.bffOrigin,
			},
			{ fetchImpl: resolved.fetchImpl, upstreamOrigin: resolved.upstreamOrigin },
		);
	} catch (error) {
		if (error instanceof BffError) {
			return mapLoginUpstreamError(error);
		}
		throw error;
	}

	const decodedLogin = decodeProxyJsonBody(upstream);
	if (!isStringRecord(decodedLogin)) {
		return fail("api-mismatch", "Login response was unreadable. Try again later.");
	}
	const loginAccessToken: unknown = decodedLogin["access_token"];
	const loginRefreshToken: unknown = decodedLogin["refresh_token"];
	if (
		typeof loginAccessToken !== "string" ||
		loginAccessToken === "" ||
		typeof loginRefreshToken !== "string" ||
		loginRefreshToken === ""
	) {
		return fail("api-mismatch", "Login response was unreadable. Try again later.");
	}
	const user = narrowUser(decodedLogin["user"]);
	if (user === undefined) {
		return fail("api-mismatch", "Login response was unreadable. Try again later.");
	}
	const loginExpiresInMs = narrowExpiresInMs(decodedLogin);

	const secrets = resolveSecrets(resolved);
	const expiresInMs = loginExpiresInMs;
	const payload: BffSessionPayload = {
		csrfToken,
		accessToken: loginAccessToken,
		refreshToken: loginRefreshToken,
		accessExpiresAt: expiresInMs === 0 ? 0 : now + expiresInMs,
		refreshExpiresAt: expiresInMs === 0 ? 0 : now + expiresInMs,
		idleExpiresAt: now + BFF_SESSION_IDLE_TIMEOUT_MS,
		absoluteExpiresAt: now + BFF_SESSION_ABSOLUTE_LIFETIME_MS,
		deviceId,
		user,
	};
	resolved.store.set(sessionId, sealPayload(payload, secrets));
	return { ok: true, user, csrfToken, cookies: sessionCookies(sessionId, csrfToken) };
}

/**
 * Map a compatibility decision to a login failure without leaking the
 * upstream origin: the `api-*` codes stay distinct per state while every
 * message comes from the origin-free `describeApiCompatibility` policy.
 */
function mapCompatibilityToLoginFailure(
	state: ApiCompatibilityState,
	compatibility: ApiCompatibility,
): BffAuthFailure {
	switch (state) {
		case "ready":
			throw new Error("mapCompatibilityToLoginFailure called for a ready API.");
		case "unreachable":
			return fail("unavailable", describeApiCompatibility(compatibility).detail);
		case "unauthenticated":
			return fail("unavailable", describeApiCompatibility(compatibility).detail);
		case "too-old":
			return fail("api-too-old", describeApiCompatibility(compatibility).detail);
		case "too-new":
			return fail("api-too-new", describeApiCompatibility(compatibility).detail);
		case "missing-capability":
			return fail("api-missing-capability", describeApiCompatibility(compatibility).detail);
		default: {
			const exhaustive: never = state;
			throw new Error(`Unhandled compatibility state: ${String(exhaustive)}`);
		}
	}
}

function mapLoginUpstreamError(error: BffError): BffAuthFailure {
	switch (error.code) {
		case "origin":
			return fail("origin", error.message);
		case "csrf":
			return fail("csrf", error.message);
		case "rate_limited":
			return fail("throttled", "Too many login attempts. Retry later.", error.retryAfterMs);
		case "contract":
			return fail("api-mismatch", "The service is being updated. Try again later.");
		case "network":
		case "timeout":
			return fail("unavailable", "The login service is unavailable. Try again later.");
		case "upstream":
			if (error.status === 401) {
				if (isMfaFailure(error.message)) {
					// REQ-AUTH-07: MFA-gated accounts surface "unsupported"
					// rather than bypassing MFA in-browser.
					return fail(
						"mfa-unsupported",
						"This account uses two-factor authentication, which the web app does not support yet. Use the mobile app to sign in.",
					);
				}
				return fail("invalid-credentials", "Invalid email or password.");
			}
			if (error.status >= 500) {
				return fail("unavailable", "The login service is unavailable. Try again later.");
			}
			if (error.status === 400 || error.status === 422) {
				return fail("invalid-credentials", "Invalid email or password.");
			}
			return fail("unavailable", "The login service is unavailable. Try again later.");
		default:
			return fail("unavailable", "The login service is unavailable. Try again later.");
	}
}

export type BffSessionReadResult =
	| { readonly ok: true; readonly sessionId: string; readonly payload: BffSessionPayload }
	| { readonly ok: false; readonly reason: "missing" | "stale" | "expired" };

/**
 * Resolve + open a session (sliding idle renewal). `stale` covers unknown
 * ids, undecryptable blobs, and rotated keys — all rejected without
 * consulting upstream (fail closed, REQ-SESS-02).
 */
export function readBffSession(
	cookieHeader: string | null | undefined,
	deps?: BffAuthDeps,
): BffSessionReadResult {
	const resolved = resolveDeps(deps);
	const now = resolved.now();
	const sessionId = parseBffSessionId(cookieHeader);
	if (sessionId === undefined) {
		return { ok: false, reason: "missing" };
	}
	const blob = resolved.store.get(sessionId);
	if (blob === undefined) {
		return { ok: false, reason: "stale" };
	}
	const payload = unsealPayload(blob, resolveSecrets(resolved));
	if (payload === undefined) {
		resolved.store.delete(sessionId);
		return { ok: false, reason: "stale" };
	}
	if (
		now > payload.absoluteExpiresAt + BFF_SESSION_CLOCK_SKEW_MS ||
		(payload.refreshExpiresAt !== 0 &&
			now > payload.refreshExpiresAt + BFF_SESSION_CLOCK_SKEW_MS) ||
		now > payload.idleExpiresAt + BFF_SESSION_CLOCK_SKEW_MS
	) {
		resolved.store.delete(sessionId);
		return { ok: false, reason: "expired" };
	}
	// Sliding idle renewal (absolute lifetime untouched).
	const renewed: BffSessionPayload = {
		...payload,
		idleExpiresAt: now + BFF_SESSION_IDLE_TIMEOUT_MS,
	};
	resolved.store.set(sessionId, sealPayload(renewed, resolveSecrets(resolved)));
	return { ok: true, sessionId, payload: renewed };
}

export type BffSessionStatusResult =
	| {
			readonly ok: true;
			readonly authenticated: true;
			readonly user: BffSessionUser;
			readonly csrfToken: string;
	  }
	| {
			readonly ok: true;
			readonly authenticated: false;
			readonly reason: "missing" | "stale" | "expired";
	  };

/** Browser-visible session status: display data only, never tokens. */
export function getBffSessionStatus(
	cookieHeader: string | null | undefined,
	deps?: BffAuthDeps,
): BffSessionStatusResult {
	const read = readBffSession(cookieHeader, deps);
	if (!read.ok) {
		return { ok: true, authenticated: false, reason: read.reason };
	}
	return {
		ok: true,
		authenticated: true,
		user: read.payload.user,
		csrfToken: read.payload.csrfToken,
	};
}

export interface BffRefreshDeps extends BffAuthDeps {
	readonly bffOrigin: string;
}

export type BffRefreshOutcome =
	| { readonly ok: true; readonly sessionId: string; readonly payload: BffSessionPayload }
	| { readonly ok: false; readonly reason: "invalid-refresh" }
	| { readonly ok: false; readonly reason: "deactivated" }
	| { readonly ok: false; readonly reason: "unavailable" }
	| { readonly ok: false; readonly reason: "api-mismatch" }
	| {
			readonly ok: false;
			readonly reason: "throttled";
			readonly retryAfterMs?: number | undefined;
	  };

/**
 * Single-flight refresh (REQ-AUTH-04): concurrent callers for one session
 * converge on a single upstream `POST /api/v1/auth/refresh`; losers await
 * the winner. Rotation (REQ-AUTH-03): the new pair replaces the old in
 * the sealed session; a 401 (reuse/revocation/deactivation) destroys it.
 */
export function refreshBffSession(
	sessionId: string,
	sessionDeps: BffRefreshDeps,
): Promise<BffRefreshOutcome> {
	const resolved = resolveDeps(sessionDeps);
	const inFlight = resolved.pendingRefreshes.get(sessionId);
	if (inFlight !== undefined) {
		return inFlight;
	}
	const outcome = runBffRefresh(sessionId, sessionDeps, resolved);
	resolved.pendingRefreshes.set(sessionId, outcome);
	void outcome.finally(() => {
		if (resolved.pendingRefreshes.get(sessionId) === outcome) {
			resolved.pendingRefreshes.delete(sessionId);
		}
	});
	return outcome;
}

async function runBffRefresh(
	sessionId: string,
	sessionDeps: BffRefreshDeps,
	resolved: ResolvedAuthDeps,
): Promise<BffRefreshOutcome> {
	const now = resolved.now();
	const throttle = checkBffThrottle(
		resolved.throttleBuckets,
		`refresh:${sessionId}`,
		THROTTLE_REFRESH_LIMIT,
		THROTTLE_REFRESH_WINDOW_MS,
		now,
	);
	if (throttle.limited) {
		return { ok: false, reason: "throttled", retryAfterMs: throttle.retryAfterMs };
	}
	const blob = resolved.store.get(sessionId);
	const secrets = resolveSecrets(resolved);
	const payload = blob === undefined ? undefined : unsealPayload(blob, secrets);
	if (payload === undefined) {
		return { ok: false, reason: "invalid-refresh" };
	}

	let upstream: BffProxyResult;
	try {
		upstream = await proxyToSureApi(
			{
				method: "POST",
				path: "/api/v1/auth/refresh",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					refresh_token: payload.refreshToken,
					device: { device_id: payload.deviceId },
				}),
				origin: sessionDeps.bffOrigin,
				csrfToken: payload.csrfToken,
				bffOrigin: sessionDeps.bffOrigin,
			},
			{
				fetchImpl: resolved.fetchImpl,
				upstreamOrigin: resolved.upstreamOrigin,
			},
		);
	} catch (error) {
		if (error instanceof BffError) {
			return mapRefreshUpstreamError(sessionId, resolved, error);
		}
		throw error;
	}

	const decodedRefresh = decodeProxyJsonBody(upstream);
	if (!isStringRecord(decodedRefresh)) {
		return { ok: false, reason: "api-mismatch" };
	}
	const refreshAccessToken: unknown = decodedRefresh["access_token"];
	const refreshRefreshToken: unknown = decodedRefresh["refresh_token"];
	if (
		typeof refreshAccessToken !== "string" ||
		refreshAccessToken === "" ||
		typeof refreshRefreshToken !== "string" ||
		refreshRefreshToken === ""
	) {
		return { ok: false, reason: "api-mismatch" };
	}
	const refreshExpiresInMs = narrowExpiresInMs(decodedRefresh);
	const rotated: BffSessionPayload = {
		...payload,
		accessToken: refreshAccessToken,
		refreshToken: refreshRefreshToken,
		accessExpiresAt: refreshExpiresInMs === 0 ? payload.accessExpiresAt : now + refreshExpiresInMs,
		refreshExpiresAt:
			refreshExpiresInMs === 0 ? payload.refreshExpiresAt : now + refreshExpiresInMs,
		idleExpiresAt: now + BFF_SESSION_IDLE_TIMEOUT_MS,
	};
	resolved.store.set(sessionId, sealPayload(rotated, secrets));
	return { ok: true, sessionId, payload: rotated };
}

function mapRefreshUpstreamError(
	sessionId: string,
	resolved: ResolvedAuthDeps,
	error: BffError,
): BffRefreshOutcome {
	switch (error.code) {
		case "rate_limited":
			// Transient: keep the session, let the caller surface throttled.
			return { ok: false, reason: "throttled", retryAfterMs: error.retryAfterMs };
		case "contract":
			return { ok: false, reason: "api-mismatch" };
		case "network":
		case "timeout":
			// Transient: keep the session for the next attempt.
			return { ok: false, reason: "unavailable" };
		case "upstream":
			if (error.status === 401) {
				// Reuse, revocation, or deactivation: destroy the session
				// family and force logout (REQ-AUTH-03/06).
				resolved.store.delete(sessionId);
				return {
					ok: false,
					reason: isDeactivatedFailure(error.message) ? "deactivated" : "invalid-refresh",
				};
			}
			if (error.status >= 500 || error.status === 429) {
				return { ok: false, reason: "unavailable" };
			}
			return { ok: false, reason: "unavailable" };
		default:
			return { ok: false, reason: "unavailable" };
	}
}

export interface BffLogoutInput {
	readonly cookieHeader: string | null | undefined;
	readonly origin: string | null | undefined;
	readonly csrfToken: string | null | undefined;
	readonly bffOrigin: string;
}

export type BffLogoutResult =
	| {
			readonly ok: true;
			readonly cookies: readonly BffSetCookie[];
	  }
	| BffAuthFailure;

/**
 * Three-step logout, atomic-from-the-user's-view (ADR-0001 §3.3): destroy
 * the server-side session, best-effort explicit revocation via
 * `POST /api/v1/auth/logout` (failures swallowed — the tokens are already
 * unreachable without the destroyed session), clear the cookies.
 *
 * Mutation guards (t_alt_fnd_021, REQ-TRAN-01) are enforced here directly,
 * not only inside the best-effort upstream revocation: a live session
 * requires same-origin plus CSRF binding to its stored token, so a
 * cross-origin or cross-session logout is rejected with the session
 * preserved. A stale/missing session stays idempotent-success on
 * same-origin requests (origin still enforced); only the CSRF binding has
 * nothing to bind to. Guard rejections return a failure with no cookies —
 * the caller must not clear local state for them.
 */
export async function logoutOfBffSession(
	input: BffLogoutInput,
	deps?: BffAuthDeps,
): Promise<BffLogoutResult> {
	const resolved = resolveDeps(deps);
	const read = readBffSession(input.cookieHeader, resolved);
	if (!read.ok) {
		if (input.origin !== input.bffOrigin) {
			return fail("origin", "Mutations require a same-origin request.");
		}
		return { ok: true, cookies: clearSessionCookies() };
	}
	const guard = checkBffMutationGuards({
		method: "POST",
		origin: input.origin,
		csrfToken: input.csrfToken,
		bffOrigin: input.bffOrigin,
		expectedCsrfToken: read.payload.csrfToken,
	});
	if (!guard.ok) {
		return fail(guard.code, guard.message);
	}
	resolved.store.delete(read.sessionId);
	try {
		const request: BffProxyRequest = {
			method: "POST",
			path: "/api/v1/auth/logout",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ refresh_token: read.payload.refreshToken }),
			origin: input.origin,
			csrfToken: input.csrfToken ?? read.payload.csrfToken,
			bffOrigin: input.bffOrigin,
			auth: { bearerToken: read.payload.accessToken },
		};
		await proxyToSureApi(request, {
			fetchImpl: resolved.fetchImpl,
			upstreamOrigin: resolved.upstreamOrigin,
		});
	} catch {
		// Best-effort revocation: the session is already destroyed, so
		// the tokens are unreachable regardless of this outcome.
	}
	return { ok: true, cookies: clearSessionCookies() };
}

export interface BffAuthedProxyInput {
	readonly method: string;
	readonly path: string;
	readonly query?: string | undefined;
	readonly headers?: Headers | undefined;
	readonly body?: BffBodyInit | null | undefined;
	readonly origin?: string | null | undefined;
	readonly csrfToken?: string | null | undefined;
	readonly bffOrigin: string;
	readonly cookieHeader: string | null | undefined;
	readonly timeoutMs?: number | undefined;
	readonly signal?: AbortSignal | undefined;
}

/** Narrow caller-supplied method strings without type assertions. */
function asBffMethod(value: string): BffMethod | undefined {
	switch (value) {
		case "GET":
		case "POST":
		case "PUT":
		case "PATCH":
		case "DELETE":
			return value;
		default:
			return undefined;
	}
}

export type BffAuthedProxyResult =
	| { readonly ok: true; readonly result: BffProxyResult }
	| BffAuthFailure;

/**
 * Session-authenticated proxy with the refresh retry-once rule
 * (REQ-AUTH-05): attach the session bearer; on 401, refresh once
 * (single-flight) and retry the request exactly once — the 401 proves the
 * first attempt did not execute, so the single retry cannot double-apply
 * a mutation; a second 401 destroys the session and forces logout.
 */
export async function proxyBffWithSession(
	input: BffAuthedProxyInput,
	deps?: BffAuthDeps,
): Promise<BffAuthedProxyResult> {
	const resolved = resolveDeps(deps);
	const read = readBffSession(input.cookieHeader, resolved);
	if (!read.ok) {
		return fail("session-expired", "Your session has expired. Sign in again.");
	}
	const { sessionId } = read;
	let payload = read.payload;

	const method = asBffMethod(input.method);
	if (method === undefined) {
		return fail("unavailable", "The service is unavailable. Try again later.");
	}

	const guard = checkBffMutationGuards({
		method,
		origin: input.origin,
		csrfToken: input.csrfToken,
		bffOrigin: input.bffOrigin,
		expectedCsrfToken: payload.csrfToken,
	});
	if (!guard.ok) {
		return fail(guard.code, guard.message);
	}

	// Preemptive refresh when the access token is known-expired.
	if (
		payload.accessExpiresAt !== 0 &&
		resolved.now() >= payload.accessExpiresAt - BFF_SESSION_CLOCK_SKEW_MS
	) {
		const refreshed = await refreshBffSession(sessionId, {
			...resolved,
			bffOrigin: input.bffOrigin,
			now: resolved.now,
		});
		if (!refreshed.ok) {
			return mapRefreshFailureToProxyError(refreshed);
		}
		payload = refreshed.payload;
	}

	const attempt = (bearer: string): Promise<BffProxyResult> =>
		proxyToSureApi(
			{
				method: input.method,
				path: input.path,
				query: input.query,
				headers: input.headers,
				body: input.body,
				origin: input.origin,
				csrfToken: input.csrfToken,
				bffOrigin: input.bffOrigin,
				timeoutMs: input.timeoutMs,
				signal: input.signal,
				auth: { bearerToken: bearer },
			},
			{ fetchImpl: resolved.fetchImpl, upstreamOrigin: resolved.upstreamOrigin },
		);

	try {
		return { ok: true, result: await attempt(payload.accessToken) };
	} catch (error) {
		if (!(error instanceof BffError)) {
			throw error;
		}
		if (error.code === "contract") {
			// Deployment API incompatibility: keep the server session, tell
			// the browser to clear local state (handled client-side).
			return fail("api-mismatch", "The service is being updated. Try again later.");
		}
		if (!(error.code === "upstream" && error.status === 401)) {
			// Non-401 failures (4xx/429/5xx/network/timeout) propagate as
			// transport errors without touching the session.
			throw error;
		}
		if (isDeactivatedFailure(error.message)) {
			resolved.store.delete(sessionId);
			return fail("deactivated", "This account has been deactivated.");
		}
		// Rotation race (REQ-AUTH-04): a concurrent request may have rotated
		// the pair while this attempt was in flight. When the stored refresh
		// token no longer matches the one this caller read, retry once with
		// the winner's access token instead of spending a second refresh —
		// the old refresh token is already single-use-dead upstream.
		const reread = readBffSession(input.cookieHeader, resolved);
		if (reread.ok && reread.payload.refreshToken !== payload.refreshToken) {
			try {
				return { ok: true, result: await attempt(reread.payload.accessToken) };
			} catch (retryError) {
				if (
					retryError instanceof BffError &&
					retryError.code === "upstream" &&
					retryError.status === 401
				) {
					resolved.store.delete(sessionId);
					return fail("logged-out", "Your session has expired. Sign in again.");
				}
				throw retryError;
			}
		}
		const refreshed = await refreshBffSession(sessionId, {
			...resolved,
			bffOrigin: input.bffOrigin,
			now: resolved.now,
		});
		if (!refreshed.ok) {
			return mapRefreshFailureToProxyError(refreshed);
		}
		try {
			return { ok: true, result: await attempt(refreshed.payload.accessToken) };
		} catch (retryError) {
			if (
				retryError instanceof BffError &&
				retryError.code === "upstream" &&
				retryError.status === 401
			) {
				resolved.store.delete(sessionId);
				return fail("logged-out", "Your session has expired. Sign in again.");
			}
			throw retryError;
		}
	}
}

function mapRefreshFailureToProxyError(
	outcome: Extract<BffRefreshOutcome, { ok: false }>,
): BffAuthFailure {
	switch (outcome.reason) {
		case "invalid-refresh":
			return fail("logged-out", "Your session has expired. Sign in again.");
		case "deactivated":
			return fail("deactivated", "This account has been deactivated.");
		case "throttled":
			return fail("throttled", "Too many requests. Retry later.", outcome.retryAfterMs);
		case "api-mismatch":
			return fail("api-mismatch", "The service is being updated. Try again later.");
		case "unavailable":
			return fail("unavailable", "The service is unavailable. Try again later.");
		default: {
			const exhaustive: never = outcome;
			throw new Error(`Unhandled refresh failure: ${JSON.stringify(exhaustive)}`);
		}
	}
}

/** SHA-256 fingerprint for key-id derivation in diagnostics (never a secret). */
export function fingerprintSessionKey(key: Buffer): string {
	return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/** Whether an upstream 401 message signals deactivation (test seam). */
export function isUpstreamDeactivatedMessage(message: string): boolean {
	return isDeactivatedFailure(message);
}

/** Whether an upstream 401 message signals MFA gating (test seam). */
export function isUpstreamMfaMessage(message: string): boolean {
	return isMfaFailure(message);
}
