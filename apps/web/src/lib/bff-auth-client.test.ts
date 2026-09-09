/**
 * Browser session-client tests (t_alt_fnd_007): error→form-state mapping,
 * CSRF cookie reading, and local-state clearing on every session-ending
 * outcome (logout, revocation, deactivation, invalid refresh, API
 * incompatibility).
 */
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
	BFF_SESSION_QUERY_KEY,
	clearLocalSessionState,
	clearSessionOnEndingCode,
	isSessionEndingCode,
	isSignedOutStatus,
	mapLoginErrorToFailure,
	readBffCsrfToken,
} from "./bff-auth-client";
import { BFF_CSRF_COOKIE_NAME } from "./bff-session";

describe("mapLoginErrorToFailure", () => {
	it("maps each known code to its form state", () => {
		expect(mapLoginErrorToFailure("invalid-credentials")).toBe("invalid-credentials");
		expect(mapLoginErrorToFailure("mfa-unsupported")).toBe("mfa-unsupported");
		expect(mapLoginErrorToFailure("throttled")).toBe("throttled");
		expect(mapLoginErrorToFailure("api-mismatch")).toBe("api-mismatch");
		expect(mapLoginErrorToFailure("api-too-old")).toBe("api-too-old");
		expect(mapLoginErrorToFailure("api-too-new")).toBe("api-too-new");
		expect(mapLoginErrorToFailure("api-missing-capability")).toBe("api-missing-capability");
		expect(mapLoginErrorToFailure("unavailable")).toBe("unavailable");
	});

	it("fails closed to unavailable for session/guard codes", () => {
		for (const code of [
			"session-expired",
			"logged-out",
			"deactivated",
			"invalid-refresh",
			"csrf",
			"origin",
		] as const) {
			expect(mapLoginErrorToFailure(code)).toBe("unavailable");
		}
	});
});

describe("readBffCsrfToken", () => {
	it("reads the CSRF cookie and ignores neighbors", () => {
		expect(readBffCsrfToken(`${BFF_CSRF_COOKIE_NAME}=tok-1; other=2`)).toBe("tok-1");
		expect(readBffCsrfToken("other=2")).toBeUndefined();
		expect(readBffCsrfToken("")).toBeUndefined();
		expect(readBffCsrfToken(undefined)).toBeUndefined();
		expect(readBffCsrfToken(`${BFF_CSRF_COOKIE_NAME}=`)).toBeUndefined();
	});
});

describe("clearLocalSessionState", () => {
	it("drops the cached session status", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(BFF_SESSION_QUERY_KEY, {
			authenticated: true,
			user: {
				id: "id",
				email: "user@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				uiLayout: "dashboard",
				aiEnabled: false,
			},
			csrfToken: "tok",
		});
		expect(queryClient.getQueryData(BFF_SESSION_QUERY_KEY)).toBeDefined();
		clearLocalSessionState(queryClient);
		expect(queryClient.getQueryData(BFF_SESSION_QUERY_KEY)).toBeUndefined();
	});
});

describe("isSessionEndingCode", () => {
	it("flags every session-ending failure code", () => {
		for (const code of ["api-mismatch", "logged-out", "deactivated", "session-expired"]) {
			expect(isSessionEndingCode(code)).toBe(true);
		}
	});

	it("keeps transport, throttle, and guard codes", () => {
		for (const code of [
			"unavailable",
			"throttled",
			"invalid-refresh",
			"csrf",
			"origin",
			"api-too-old",
			"invalid-credentials",
		]) {
			expect(isSessionEndingCode(code)).toBe(false);
		}
	});
});

function seededSessionClient(): QueryClient {
	const queryClient = new QueryClient();
	queryClient.setQueryData(BFF_SESSION_QUERY_KEY, { authenticated: false, reason: "stale" });
	return queryClient;
}

describe("clearSessionOnEndingCode", () => {
	it("clears the session entry per ending code", () => {
		for (const code of ["api-mismatch", "logged-out", "deactivated", "session-expired"]) {
			const queryClient = seededSessionClient();
			expect(clearSessionOnEndingCode(queryClient, code)).toBe(true);
			expect(queryClient.getQueryData(BFF_SESSION_QUERY_KEY)).toBeUndefined();
		}
	});

	it("leaves the session entry alone otherwise", () => {
		for (const code of ["unavailable", "throttled", "csrf", "origin", "invalid-refresh"]) {
			const queryClient = seededSessionClient();
			expect(clearSessionOnEndingCode(queryClient, code)).toBe(false);
			expect(queryClient.getQueryData(BFF_SESSION_QUERY_KEY)).toBeDefined();
		}
	});
});

describe("isSignedOutStatus", () => {
	it("distinguishes signed-in from signed-out", () => {
		expect(isSignedOutStatus({ authenticated: false, reason: "expired" })).toBe(true);
		expect(
			isSignedOutStatus({
				authenticated: true,
				user: {
					id: "id",
					email: "user@example.com",
					firstName: "Ada",
					lastName: "Lovelace",
					uiLayout: "dashboard",
					aiEnabled: false,
				},
				csrfToken: "tok",
			}),
		).toBe(false);
	});
});
