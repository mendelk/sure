/**
 * BFF session layer tests (t_alt_fnd_007, ADR-0001 CTL-SEC-02).
 *
 * Security matrix: login, refresh rotation, concurrent expiry (exactly one
 * upstream refresh), retry-once after expiry, second-401 logout,
 * revocation/logout, stale cookies, deactivation, CSRF binding, throttles,
 * and token non-disclosure. The mock upstream emulates the Rails auth
 * endpoints (single-use refresh, revocation, deactivation 401s) so every
 * rotation/concurrency rule is exercised against realistic behavior.
 */
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { BFF_CSRF_COOKIE_NAME, BFF_SESSION_COOKIE_NAME } from "./bff-session";
import type { BffSetCookie } from "./bff-session-cookie";
import {
	createBffSessionStore,
	getBffSessionStatus,
	loginToBffSession,
	logoutOfBffSession,
	proxyBffWithSession,
	refreshBffSession,
} from "./sure-auth-session.server";
import type { BffAuthDeps, BffSessionSecrets } from "./sure-auth-session.server";

const UPSTREAM = "http://sure-api.test";
const BFF_ORIGIN = "https://bff.test";
const UUID = "123e4567-e89b-12d3-a456-426614174000";

const USER = {
	id: UUID,
	email: "user@example.com",
	first_name: "Ada",
	last_name: "Lovelace",
	ui_layout: "dashboard",
	ai_enabled: false,
};

const COLLECTION = {
	accounts: [],
	pagination: { page: 1, per_page: 25, total_count: 0, total_pages: 1 },
};

const ACCOUNT = {
	id: UUID,
	name: "Cash",
	balance: "100.00",
	balance_cents: 10000,
	cash_balance: "100.00",
	cash_balance_cents: 10000,
	currency: "USD",
	classification: "asset",
	account_type: "depository",
	status: "active",
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-01T00:00:00Z",
};

const ACCOUNT_PATH = `/api/v1/accounts/${UUID}`;

interface MockUser {
	password: string;
	mfa: boolean;
	active: boolean;
}

interface MockTokenFamily {
	access: string;
	refresh: string;
	refreshUsed: boolean;
	deactivated: boolean;
}

interface MockUpstream {
	users: Map<string, MockUser>;
	families: Map<string, MockTokenFamily>;
	accessIndex: Map<string, MockTokenFamily>;
	refreshCalls: number;
	logoutCalls: number;
	loginCalls: number;
	metadataCalls: number;
	accountCalls: string[];
	logoutFail: boolean;
	refreshDelayMs: number;
	tokenCounter: number;
	/** When true, every bearer is rejected (retry-after-refresh also 401s). */
	rejectAllAccess: boolean;
	/** When true, the login response carries null names (Rails omits unset names). */
	nullUserNames: boolean;
	/** Compatibility probe behaviour for `GET /api/v1/metadata`. */
	metadataVersion: string;
	metadataCapabilities: string[];
	metadataStatus: number;
	metadataNetworkFailure: boolean;
}

function createMockUpstream(): MockUpstream {
	return {
		users: new Map([
			["user@example.com", { password: "CorrectHorse1!", mfa: false, active: true }],
		]),
		families: new Map(),
		accessIndex: new Map(),
		refreshCalls: 0,
		logoutCalls: 0,
		loginCalls: 0,
		metadataCalls: 0,
		accountCalls: [],
		logoutFail: false,
		refreshDelayMs: 0,
		tokenCounter: 0,
		rejectAllAccess: false,
		nullUserNames: false,
		metadataVersion: "1.0.0",
		metadataCapabilities: ["auth.login", "auth.refresh", "auth.logout"],
		metadataStatus: 200,
		metadataNetworkFailure: false,
	};
}

function mintFamily(mock: MockUpstream): MockTokenFamily {
	mock.tokenCounter += 1;
	const family: MockTokenFamily = {
		access: `at-${mock.tokenCounter}-token`,
		refresh: `rt-${mock.tokenCounter}-token`,
		refreshUsed: false,
		deactivated: false,
	};
	mock.families.set(family.refresh, family);
	mock.accessIndex.set(family.access, family);
	return family;
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function errorResponse(status: number, error: string, message?: string): Response {
	return jsonResponse(status, message === undefined ? { error } : { error, message });
}

function readJsonBody(init: RequestInit): unknown {
	const raw = init.body;
	if (typeof raw !== "string") {
		return {};
	}
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

/** String field reader for mock JSON bodies (never Object-stringifies). */
function stringField(body: unknown, key: string): string {
	if (typeof body !== "object" || body === null) {
		return "";
	}
	for (const [entryKey, entryValue] of Object.entries(body)) {
		if (entryKey === key) {
			return typeof entryValue === "string" ? entryValue : "";
		}
	}
	return "";
}

function mockFetch(mock: MockUpstream): typeof fetch {
	return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		const path = new URL(url).pathname;
		const method = (init?.method ?? "GET").toUpperCase();
		const headers = new Headers(init?.headers);
		const requestInit: RequestInit = { ...init, method };

		if (method === "GET" && path === "/api/v1/metadata") {
			mock.metadataCalls += 1;
			if (mock.metadataNetworkFailure) {
				throw new TypeError("fetch failed");
			}
			if (mock.metadataStatus !== 200) {
				return errorResponse(mock.metadataStatus, "metadata_error");
			}
			return jsonResponse(200, {
				api_version: mock.metadataVersion,
				capabilities: mock.metadataCapabilities,
			});
		}

		if (method === "POST" && path === "/api/v1/auth/login") {
			mock.loginCalls += 1;
			const body = readJsonBody(requestInit);
			const account = mock.users.get(stringField(body, "email"));
			if (account === undefined || stringField(body, "password") !== account.password) {
				return errorResponse(401, "Invalid email or password");
			}
			if (!account.active) {
				return errorResponse(401, "Invalid email or password");
			}
			if (account.mfa) {
				return jsonResponse(401, {
					error: "Two-factor authentication required",
					mfa_required: true,
				});
			}
			const family = mintFamily(mock);
			return jsonResponse(200, {
				access_token: family.access,
				refresh_token: family.refresh,
				token_type: "Bearer",
				expires_in: 2592000,
				created_at: Math.floor(Date.now() / 1000),
				user: mock.nullUserNames ? { ...USER, first_name: null, last_name: null } : USER,
			});
		}

		if (method === "POST" && path === "/api/v1/auth/refresh") {
			mock.refreshCalls += 1;
			if (mock.refreshDelayMs > 0) {
				await new Promise((resolve) => setTimeout(resolve, mock.refreshDelayMs));
			}
			const body = readJsonBody(requestInit);
			const family = mock.families.get(stringField(body, "refresh_token"));
			if (family === undefined || family.refreshUsed) {
				return errorResponse(401, "Invalid refresh token");
			}
			if (family.deactivated) {
				return errorResponse(401, "Invalid refresh token");
			}
			family.refreshUsed = true;
			const next = mintFamily(mock);
			return jsonResponse(200, {
				access_token: next.access,
				refresh_token: next.refresh,
				token_type: "Bearer",
				expires_in: 2592000,
				created_at: Math.floor(Date.now() / 1000),
			});
		}

		if (method === "POST" && path === "/api/v1/auth/logout") {
			mock.logoutCalls += 1;
			if (mock.logoutFail) {
				return errorResponse(500, "server_error");
			}
			// Mirrors Rails `POST /api/v1/auth/logout` after t_alt_fnd_019:
			// a valid bearer revokes first; otherwise a presented
			// refresh_token revokes by family (possession proves authority,
			// so an expired bearer cannot block revocation); unknown
			// identifiers stay idempotent (`revoked: true`, no oracle);
			// no credential at all still 401s.
			const auth = headers.get("Authorization") ?? "";
			const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
			const byBearer = bearer === "" ? undefined : mock.accessIndex.get(bearer);
			if (byBearer !== undefined) {
				byBearer.refreshUsed = true;
				return jsonResponse(200, { revoked: true });
			}
			const refresh = stringField(readJsonBody(requestInit), "refresh_token");
			if (refresh !== "") {
				const byRefresh = mock.families.get(refresh);
				if (byRefresh !== undefined && !byRefresh.refreshUsed) {
					byRefresh.refreshUsed = true;
				}
				return jsonResponse(200, { revoked: true });
			}
			return errorResponse(401, "unauthorized", "Access token or API key is invalid, expired, or missing");
		}

		if (method === "GET" && path === "/api/v1/accounts") {
			const auth = headers.get("Authorization") ?? "";
			const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
			mock.accountCalls.push(bearer);
			const family = mock.accessIndex.get(bearer);
			if (mock.rejectAllAccess || family === undefined) {
				return errorResponse(401, "unauthorized", "Access token is invalid, expired, or missing");
			}
			if (family.deactivated) {
				return errorResponse(401, "unauthorized", "Account has been deactivated");
			}
			return jsonResponse(200, COLLECTION);
		}

		if (method === "GET" && path === `/api/v1/accounts/${UUID}`) {
			const auth = headers.get("Authorization") ?? "";
			const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
			mock.accountCalls.push(bearer);
			const family = mock.accessIndex.get(bearer);
			if (mock.rejectAllAccess || family === undefined) {
				return errorResponse(401, "unauthorized", "Access token is invalid, expired, or missing");
			}
			if (family.deactivated) {
				return errorResponse(401, "unauthorized", "Account has been deactivated");
			}
			return jsonResponse(200, ACCOUNT);
		}

		if (method === "PATCH" && path === "/api/v1/auth/enable_ai") {
			return jsonResponse(200, { user: USER });
		}

		return errorResponse(404, "record_not_found");
	};
}

function testSecrets(): BffSessionSecrets {
	return { current: { kid: "test-v1", key: randomBytes(32) } };
}

/** Mark a mock refresh token spent (simulates prior rotation client-side). */
function spendRefreshToken(mock: MockUpstream, refresh: string): void {
	const family = mock.families.get(refresh);
	if (family === undefined) {
		throw new Error(`mock has no refresh token ${refresh}`);
	}
	family.refreshUsed = true;
}

let nowMs = 1_700_000_000_000;

function testDeps(mock: MockUpstream, secrets?: BffSessionSecrets): BffAuthDeps {
	return {
		fetchImpl: mockFetch(mock),
		upstreamOrigin: UPSTREAM,
		secrets: secrets ?? testSecrets(),
		store: createBffSessionStore(),
		pendingRefreshes: new Map(),
		throttleBuckets: new Map(),
		now: () => nowMs,
	};
}

function cookieHeaderFor(cookies: readonly BffSetCookie[]): string {
	return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function loginOk(
	_mock: MockUpstream,
	deps: BffAuthDeps,
): Promise<{
	cookies: readonly BffSetCookie[];
	csrfToken: string;
	cookieHeader: string;
}> {
	const result = await loginToBffSession(
		{
			email: "user@example.com",
			password: "CorrectHorse1!",
			origin: BFF_ORIGIN,
			bffOrigin: BFF_ORIGIN,
			cookieHeader: undefined,
			clientKey: "127.0.0.1",
		},
		deps,
	);
	if (!result.ok) {
		throw new Error(`expected login to succeed, got ${result.error.code}`);
	}
	return {
		cookies: result.cookies,
		csrfToken: result.csrfToken,
		cookieHeader: cookieHeaderFor(result.cookies),
	};
}

beforeEach(() => {
	nowMs = 1_700_000_000_000;
});

describe("login (REQ-AUTH-01/07)", () => {
	it("creates an opaque session and returns display data only", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const result = await loginToBffSession(
			{
				email: "user@example.com",
				password: "CorrectHorse1!",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "127.0.0.1",
			},
			deps,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.user).toEqual({
			id: UUID,
			email: "user@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			uiLayout: "dashboard",
			aiEnabled: false,
		});
		const sessionCookie = result.cookies.find((cookie) => cookie.name === BFF_SESSION_COOKIE_NAME);
		const csrfCookie = result.cookies.find((cookie) => cookie.name === BFF_CSRF_COOKIE_NAME);
		expect(sessionCookie?.httpOnly).toBe(true);
		expect(sessionCookie?.secure).toBe(true);
		expect(sessionCookie?.sameSite).toBe("lax");
		expect(csrfCookie?.httpOnly).toBe(false);
		expect(result.csrfToken).toBe(csrfCookie?.value);
		// Fresh ≥128-bit ids: 16 random bytes base64url-encoded.
		expect(sessionCookie?.value.length).toBeGreaterThanOrEqual(22);
	});

	it("accepts null names (Rails omits unset names) as empty strings", async () => {
		const mock = createMockUpstream();
		mock.nullUserNames = true;
		const deps = testDeps(mock);
		const result = await loginToBffSession(
			{
				email: "user@example.com",
				password: "CorrectHorse1!",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "127.0.0.1",
			},
			deps,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.user).toEqual({
			id: UUID,
			email: "user@example.com",
			firstName: "",
			lastName: "",
			uiLayout: "dashboard",
			aiEnabled: false,
		});
	});

	it("rejects invalid credentials without creating a session", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const result = await loginToBffSession(
			{
				email: "user@example.com",
				password: "wrong-password",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "127.0.0.1",
			},
			deps,
		);
		expect(result).toEqual({
			ok: false,
			error: {
				code: "invalid-credentials",
				message: "Invalid email or password.",
				retryAfterMs: undefined,
			},
		});
		expect(getBffSessionStatus(undefined, deps)).toEqual({
			ok: true,
			authenticated: false,
			reason: "missing",
		});
	});

	it("surfaces MFA-gated accounts as unsupported, never bypassed", async () => {
		const mock = createMockUpstream();
		mock.users.set("user@example.com", { password: "CorrectHorse1!", mfa: true, active: true });
		const deps = testDeps(mock);
		const result = await loginToBffSession(
			{
				email: "user@example.com",
				password: "CorrectHorse1!",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "127.0.0.1",
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("mfa-unsupported");
	});

	it("maps upstream outages to unavailable", async () => {
		const mock = createMockUpstream();
		const deps: BffAuthDeps = {
			...testDeps(mock),
			fetchImpl: () => {
				throw new TypeError("connection refused");
			},
		};
		const result = await loginToBffSession(
			{
				email: "user@example.com",
				password: "CorrectHorse1!",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "127.0.0.1",
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("unavailable");
	});

	it("destroys the pre-login id and mints a fresh one (fixation, REQ-SESS-04)", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const first = await loginOk(mock, deps);
		const firstSessionId = first.cookies.find(
			(cookie) => cookie.name === BFF_SESSION_COOKIE_NAME,
		)?.value;
		expect(firstSessionId).toBeDefined();

		const second = await loginToBffSession(
			{
				email: "user@example.com",
				password: "CorrectHorse1!",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: first.cookieHeader,
				clientKey: "127.0.0.1",
			},
			deps,
		);
		expect(second.ok).toBe(true);
		if (!second.ok) {
			return;
		}
		const secondSessionId = second.cookies.find(
			(cookie) => cookie.name === BFF_SESSION_COOKIE_NAME,
		)?.value;
		expect(secondSessionId).not.toBe(firstSessionId);
		// The pre-login id no longer opens a session.
		expect(getBffSessionStatus(first.cookieHeader, deps)).toEqual({
			ok: true,
			authenticated: false,
			reason: "stale",
		});
	});
});

describe("refresh rotation + single-flight (REQ-AUTH-03/04)", () => {
	it("rotates the pair and rejects replay of the old refresh token", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const { cookieHeader } = await loginOk(mock, deps);
		const sessionId = cookieHeader.split(";")[0]?.split("=")[1]?.trim();
		expect(sessionId).toBeDefined();
		if (sessionId === undefined) {
			return;
		}
		const first = await refreshBffSession(sessionId, { ...deps, bffOrigin: BFF_ORIGIN });
		expect(first.ok).toBe(true);
		if (!first.ok) {
			return;
		}
		expect(mock.refreshCalls).toBe(1);
		// The old refresh token is single-use upstream: presenting the
		// pre-rotation pair again must fail (reuse detection, REQ-AUTH-03).
		const replay = await mockFetch(mock)(`${UPSTREAM}/api/v1/auth/refresh`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ refresh_token: "rt-1-token", device: { device_id: "bff-x" } }),
		});
		expect(replay.status).toBe(401);
	});

	it("converges N-way concurrent expiry on exactly one upstream refresh", async () => {
		const mock = createMockUpstream();
		mock.refreshDelayMs = 20;
		const deps = testDeps(mock);
		const { cookieHeader, csrfToken } = await loginOk(mock, deps);
		// Expire the access token upstream (stored refresh stays valid) so
		// every concurrent caller observes expiry and must converge.
		mock.accessIndex.delete("at-1-token");

		const calls = Array.from({ length: 8 }, () =>
			proxyBffWithSession(
				{
					method: "GET",
					path: ACCOUNT_PATH,
					bffOrigin: BFF_ORIGIN,
					cookieHeader,
					origin: BFF_ORIGIN,
					csrfToken,
				},
				deps,
			),
		);
		const results = await Promise.all(calls);
		for (const result of results) {
			expect(result.ok).toBe(true);
		}
		expect(mock.refreshCalls).toBe(1);
	});

	it("retries the request once with the rotated bearer after expiry", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const { cookieHeader, csrfToken } = await loginOk(mock, deps);
		// Invalidate the access token upstream while the stored refresh
		// stays valid: first attempt 401s, refresh + single retry wins.
		const family = mock.accessIndex.get("at-1-token");
		if (family !== undefined) {
			mock.accessIndex.delete("at-1-token");
			mock.accessIndex.set("expired-at-1", family);
		}
		const result = await proxyBffWithSession(
			{
				method: "GET",
				path: ACCOUNT_PATH,
				bffOrigin: BFF_ORIGIN,
				cookieHeader,
				origin: BFF_ORIGIN,
				csrfToken,
			},
			deps,
		);
		expect(result.ok).toBe(true);
		expect(mock.refreshCalls).toBe(1);
		expect(mock.accountCalls).toEqual(["at-1-token", "at-2-token"]);
	});

	it("forces logout when refresh itself is rejected — never a retry loop (REQ-AUTH-05)", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const { cookieHeader, csrfToken } = await loginOk(mock, deps);
		// Both tokens dead: access rejected, refresh rejected.
		mock.accessIndex.delete("at-1-token");
		spendRefreshToken(mock, "rt-1-token");

		const result = await proxyBffWithSession(
			{
				method: "GET",
				path: ACCOUNT_PATH,
				bffOrigin: BFF_ORIGIN,
				cookieHeader,
				origin: BFF_ORIGIN,
				csrfToken,
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("logged-out");
		expect(mock.refreshCalls).toBe(1);
		// No retry without a fresh bearer: exactly one upstream attempt.
		expect(mock.accountCalls).toEqual(["at-1-token"]);
		// Session destroyed: the stale cookie now fails closed.
		expect(getBffSessionStatus(cookieHeader, deps)).toEqual({
			ok: true,
			authenticated: false,
			reason: "stale",
		});
	});

	it("forces logout when the retry after refresh also 401s (REQ-AUTH-05)", async () => {
		const mock = createMockUpstream();
		mock.rejectAllAccess = true;
		const deps = testDeps(mock);
		const { cookieHeader, csrfToken } = await loginOk(mock, deps);

		const result = await proxyBffWithSession(
			{
				method: "GET",
				path: ACCOUNT_PATH,
				bffOrigin: BFF_ORIGIN,
				cookieHeader,
				origin: BFF_ORIGIN,
				csrfToken,
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("logged-out");
		// Exactly one refresh and one retry — no loop.
		expect(mock.refreshCalls).toBe(1);
		expect(mock.accountCalls).toEqual(["at-1-token", "at-2-token"]);
		expect(getBffSessionStatus(cookieHeader, deps)).toEqual({
			ok: true,
			authenticated: false,
			reason: "stale",
		});
	});
});

describe("logout / revocation (REQ-API-01)", () => {
	it("destroys the session, revokes upstream, and clears cookies", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const { cookieHeader, csrfToken } = await loginOk(mock, deps);

		const result = await logoutOfBffSession(
			{ cookieHeader, origin: BFF_ORIGIN, csrfToken, bffOrigin: BFF_ORIGIN },
			deps,
		);
		expect(result.ok).toBe(true);
		expect(mock.logoutCalls).toBe(1);
		for (const cookie of result.cookies) {
			expect(cookie.value).toBe("");
			expect(cookie.maxAge).toBe(0);
		}
		expect(getBffSessionStatus(cookieHeader, deps)).toEqual({
			ok: true,
			authenticated: false,
			reason: "stale",
		});
	});

	it("revokes upstream exactly once when the stored access token is expired (t_alt_fnd_019)", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const { cookieHeader, csrfToken } = await loginOk(mock, deps);

		// Idle timeout: the access token dies upstream while the refresh
		// family lives on. The BFF must still revoke the pair server-side.
		mock.accessIndex.clear();

		const result = await logoutOfBffSession(
			{ cookieHeader, origin: BFF_ORIGIN, csrfToken, bffOrigin: BFF_ORIGIN },
			deps,
		);
		expect(result.ok).toBe(true);
		expect(mock.logoutCalls).toBe(1);
		for (const family of mock.families.values()) {
			expect(family.refreshUsed).toBe(true);
		}
		for (const cookie of result.cookies) {
			expect(cookie.value).toBe("");
			expect(cookie.maxAge).toBe(0);
		}
		expect(getBffSessionStatus(cookieHeader, deps)).toEqual({
			ok: true,
			authenticated: false,
			reason: "stale",
		});
	});

	it("still succeeds when upstream revocation fails (best-effort)", async () => {
		const mock = createMockUpstream();
		mock.logoutFail = true;
		const deps = testDeps(mock);
		const { cookieHeader, csrfToken } = await loginOk(mock, deps);

		const result = await logoutOfBffSession(
			{ cookieHeader, origin: BFF_ORIGIN, csrfToken, bffOrigin: BFF_ORIGIN },
			deps,
		);
		expect(result.ok).toBe(true);
		expect(getBffSessionStatus(cookieHeader, deps).authenticated).toBe(false);
	});

	it("is a no-op success for stale cookies", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const result = await logoutOfBffSession(
			{
				cookieHeader: `${BFF_SESSION_COOKIE_NAME}=AbcDef0123456789_-Ab12`,
				origin: BFF_ORIGIN,
				csrfToken: "x",
				bffOrigin: BFF_ORIGIN,
			},
			deps,
		);
		expect(result.ok).toBe(true);
		expect(mock.logoutCalls).toBe(0);
	});
});

describe("stale cookies + expiry (REQ-SESS-02)", () => {
	it("rejects unknown ids without consulting upstream", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const result = await proxyBffWithSession(
			{
				method: "GET",
				path: ACCOUNT_PATH,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: `${BFF_SESSION_COOKIE_NAME}=AbcDef0123456789_-Ab12`,
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("session-expired");
		expect(mock.loginCalls).toBe(0);
		expect(mock.accountCalls).toEqual([]);
	});

	it("rejects tampered blobs and destroys them", async () => {
		const mock = createMockUpstream();
		const secrets = testSecrets();
		const deps = testDeps(mock, secrets);
		const { cookieHeader } = await loginOk(mock, deps);
		const sessionId = cookieHeader.split(";")[0]?.split("=")[1]?.trim();
		if (sessionId === undefined) {
			throw new Error("missing session id");
		}
		deps.store?.set(sessionId, "tampered-blob");
		expect(getBffSessionStatus(cookieHeader, deps)).toEqual({
			ok: true,
			authenticated: false,
			reason: "stale",
		});
	});

	it("rejects blobs sealed under an unknown key id", async () => {
		const mock = createMockUpstream();
		const oldSecrets = testSecrets();
		const deps = testDeps(mock, oldSecrets);
		const { cookieHeader } = await loginOk(mock, deps);
		const rotatedDeps: BffAuthDeps = { ...deps, secrets: testSecrets() };
		expect(getBffSessionStatus(cookieHeader, rotatedDeps)).toEqual({
			ok: true,
			authenticated: false,
			reason: "stale",
		});
	});

	it("honors the previous key during the dual-accept window", async () => {
		const mock = createMockUpstream();
		const oldSecrets = testSecrets();
		const deps = testDeps(mock, oldSecrets);
		const { cookieHeader } = await loginOk(mock, deps);
		const rotated: BffAuthDeps = {
			...deps,
			secrets: { current: { kid: "test-v2", key: randomBytes(32) }, previous: oldSecrets.current },
		};
		const status = getBffSessionStatus(cookieHeader, rotated);
		expect(status.authenticated).toBe(true);
		if (!status.authenticated) {
			throw new Error("expected the dual-accept session to stay valid");
		}
		expect(status.user.email).toBe("user@example.com");
		expect(typeof status.csrfToken).toBe("string");
	});

	it("expires idle sessions and destroys them", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const { cookieHeader } = await loginOk(mock, deps);
		nowMs += 24 * 60 * 60 * 1000 + 61_000;
		expect(getBffSessionStatus(cookieHeader, deps)).toEqual({
			ok: true,
			authenticated: false,
			reason: "expired",
		});
		// Destroyed: a second read reports stale, never consults upstream.
		expect(getBffSessionStatus(cookieHeader, deps).authenticated).toBe(false);
		expect(mock.accountCalls).toEqual([]);
	});

	it("enforces the absolute lifetime even for active sessions", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const { cookieHeader } = await loginOk(mock, deps);
		// Stay active (reads renew idle) then jump past the absolute cap.
		for (let day = 0; day < 28; day += 1) {
			nowMs += 24 * 60 * 60 * 1000;
			expect(getBffSessionStatus(cookieHeader, deps).authenticated).toBe(true);
		}
		nowMs += 2 * 24 * 60 * 60 * 1000;
		expect(getBffSessionStatus(cookieHeader, deps)).toEqual({
			ok: true,
			authenticated: false,
			reason: "expired",
		});
	});
});

describe("deactivation (REQ-AUTH-06)", () => {
	it("destroys the session on 401-deactivated at the next upstream call", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const { cookieHeader, csrfToken } = await loginOk(mock, deps);
		const family = mock.accessIndex.get("at-1-token");
		if (family !== undefined) {
			family.deactivated = true;
		}
		const result = await proxyBffWithSession(
			{
				method: "GET",
				path: ACCOUNT_PATH,
				bffOrigin: BFF_ORIGIN,
				cookieHeader,
				origin: BFF_ORIGIN,
				csrfToken,
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("deactivated");
		expect(mock.refreshCalls).toBe(0);
		expect(getBffSessionStatus(cookieHeader, deps).authenticated).toBe(false);
	});
});

describe("mutation guards + throttles (REQ-TRAN-01/06)", () => {
	it("rejects mutations bound to another session's CSRF token", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const { cookieHeader } = await loginOk(mock, deps);
		const result = await proxyBffWithSession(
			{
				method: "PATCH",
				path: "/api/v1/auth/enable_ai",
				bffOrigin: BFF_ORIGIN,
				cookieHeader,
				origin: BFF_ORIGIN,
				csrfToken: "attacker-token",
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("csrf");
		expect(mock.loginCalls).toBe(1);
	});

	it("rejects cross-origin mutations", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const { cookieHeader, csrfToken } = await loginOk(mock, deps);
		const result = await proxyBffWithSession(
			{
				method: "PATCH",
				path: "/api/v1/auth/enable_ai",
				bffOrigin: BFF_ORIGIN,
				cookieHeader,
				origin: "https://evil.test",
				csrfToken,
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("origin");
	});

	it("throttles login independently of upstream", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const result = await loginToBffSession(
				{
					email: "user@example.com",
					password: "wrong",
					origin: BFF_ORIGIN,
					bffOrigin: BFF_ORIGIN,
					cookieHeader: undefined,
					clientKey: "10.0.0.9",
				},
				deps,
			);
			expect(result).toEqual({
				ok: false,
				error: {
					code: "invalid-credentials",
					message: "Invalid email or password.",
					retryAfterMs: undefined,
				},
			});
		}
		const limited = await loginToBffSession(
			{
				email: "user@example.com",
				password: "wrong",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "10.0.0.9",
			},
			deps,
		);
		expect(limited.ok).toBe(false);
		if (limited.ok) {
			return;
		}
		expect(limited.error.code).toBe("throttled");
		expect(limited.error.retryAfterMs).toBeGreaterThan(0);
		// Other clients are unaffected.
		const other = await loginToBffSession(
			{
				email: "user@example.com",
				password: "wrong",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "10.0.0.10",
			},
			deps,
		);
		expect(other).toEqual({
			ok: false,
			error: {
				code: "invalid-credentials",
				message: "Invalid email or password.",
				retryAfterMs: undefined,
			},
		});
	});
});

describe("token non-disclosure (REQ-SESS-01 / CTL-SEC-01)", () => {
	it("never leaks Sure tokens into browser artifacts", async () => {
		const mock = createMockUpstream();
		const deps = testDeps(mock);
		const login = await loginToBffSession(
			{
				email: "user@example.com",
				password: "CorrectHorse1!",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "127.0.0.1",
			},
			deps,
		);
		expect(login.ok).toBe(true);
		if (!login.ok) {
			return;
		}
		const { cookieHeader, csrfToken } = {
			cookieHeader: cookieHeaderFor(login.cookies),
			csrfToken: login.csrfToken,
		};
		const status = getBffSessionStatus(cookieHeader, deps);
		const proxied = await proxyBffWithSession(
			{
				method: "GET",
				path: ACCOUNT_PATH,
				bffOrigin: BFF_ORIGIN,
				cookieHeader,
				origin: BFF_ORIGIN,
				csrfToken,
			},
			deps,
		);
		expect(proxied.ok).toBe(true);

		// Everything the browser could observe: login/status payloads,
		// cookie headers, and the CSRF token.
		const browserVisible = JSON.stringify({ login, status, csrfToken });
		for (const secret of ["at-1-token", "rt-1-token", "Bearer"]) {
			expect(browserVisible).not.toContain(secret);
		}
		const cookieHeaderValue = cookieHeaderFor(login.cookies);
		expect(cookieHeaderValue).not.toContain("at-1-token");
		expect(cookieHeaderValue).not.toContain("rt-1-token");
	});
});

describe("deployment API incompatibility", () => {
	it("maps contract violations to api-mismatch without killing the session", async () => {
		const mock = createMockUpstream();
		const brokenFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			if (new URL(url).pathname === "/api/v1/auth/login") {
				// Passes transport validation (all fields optional) but
				// carries no usable token pair: the browser must clear local
				// state, the server session is never created.
				return Promise.resolve(jsonResponse(200, { user: USER }));
			}
			const impl = mockFetch(mock);
			return impl(url, init);
		};
		const deps: BffAuthDeps = { ...testDeps(mock), fetchImpl: brokenFetch };
		const result = await loginToBffSession(
			{
				email: "user@example.com",
				password: "CorrectHorse1!",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "127.0.0.1",
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("api-mismatch");
	});

	it("blocks login on a too-old server without dispatching credentials", async () => {
		const mock = createMockUpstream();
		mock.metadataVersion = "0.9.0";
		const deps = testDeps(mock);
		const result = await loginToBffSession(
			{
				email: "user@example.com",
				password: "CorrectHorse1!",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "127.0.0.1",
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("api-too-old");
		expect(result.error.message).toMatch(/upgrade the Sure server/i);
		expect(result.error.message).not.toContain(UPSTREAM);
		expect(mock.metadataCalls).toBe(1);
		expect(mock.loginCalls).toBe(0);
	});

	it("blocks login on a too-new server without dispatching credentials", async () => {
		const mock = createMockUpstream();
		mock.metadataVersion = "2.0.0";
		const deps = testDeps(mock);
		const result = await loginToBffSession(
			{
				email: "user@example.com",
				password: "CorrectHorse1!",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "127.0.0.1",
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("api-too-new");
		expect(result.error.message).toMatch(/update the web app/i);
		expect(mock.loginCalls).toBe(0);
	});

	it("blocks login when the server predates metadata (404) as too-old", async () => {
		const mock = createMockUpstream();
		mock.metadataStatus = 404;
		const deps = testDeps(mock);
		const result = await loginToBffSession(
			{
				email: "user@example.com",
				password: "CorrectHorse1!",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "127.0.0.1",
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("api-too-old");
		expect(mock.loginCalls).toBe(0);
	});

	it("blocks login on missing capabilities with the absent tokens", async () => {
		const mock = createMockUpstream();
		mock.metadataCapabilities = ["auth.login"];
		const deps = testDeps(mock);
		const result = await loginToBffSession(
			{
				email: "user@example.com",
				password: "CorrectHorse1!",
				origin: BFF_ORIGIN,
				bffOrigin: BFF_ORIGIN,
				cookieHeader: undefined,
				clientKey: "127.0.0.1",
			},
			deps,
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("api-missing-capability");
		expect(result.error.message).toMatch(/auth\.logout/);
		expect(mock.loginCalls).toBe(0);
	});

	it("maps unreachable and rejected-credential probes to unavailable", async () => {
		for (const setup of [
			(mock: MockUpstream) => {
				mock.metadataNetworkFailure = true;
			},
			(mock: MockUpstream) => {
				mock.metadataStatus = 500;
			},
			(mock: MockUpstream) => {
				mock.metadataStatus = 401;
			},
		]) {
			const mock = createMockUpstream();
			setup(mock);
			const deps = testDeps(mock);
			const result = await loginToBffSession(
				{
					email: "user@example.com",
					password: "CorrectHorse1!",
					origin: BFF_ORIGIN,
					bffOrigin: BFF_ORIGIN,
					cookieHeader: undefined,
					clientKey: "127.0.0.1",
				},
				deps,
			);
			expect(result.ok).toBe(false);
			if (result.ok) {
				return;
			}
			expect(result.error.code).toBe("unavailable");
			expect(mock.loginCalls).toBe(0);
		}
	});
});
