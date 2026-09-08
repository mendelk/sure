// Contract-derived mocks stay honest: they serve validated shapes, fail
// closed on drift, and never touch the network (apps/web).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	fixtureAccountCollection,
	fixtureApiError,
	fixtureLoginRequest,
	fixtureLoginSuccess,
} from "./api-fixtures";
import { installMockFetch } from "./mock-handlers";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("installMockFetch", () => {
	it("serves a validated login response and records the request", async () => {
		const seen: unknown[] = [];
		const controller = installMockFetch([
			{
				operation: "POST /api/v1/auth/login",
				status: 200,
				body: fixtureLoginSuccess(),
				assertRequestBody: (body) => {
					seen.push(body);
				},
			},
		]);
		try {
			const response = await fetch("http://localhost/api/v1/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(fixtureLoginRequest()),
			});
			expect(response.status).toBe(200);
			const payload: unknown = await response.json();
			expect(payload).toMatchObject({ user: { email: "member@e2e.sure.invalid" } });
			expect(seen).toHaveLength(1);
			expect(controller.requests).toHaveLength(1);
			expect(controller.requests[0]?.method).toBe("POST");
		} finally {
			controller.restore();
		}
	});

	it("serves templated paths and validates collection responses", async () => {
		const controller = installMockFetch([
			{ operation: "GET /api/v1/accounts", status: 200, body: fixtureAccountCollection() },
		]);
		try {
			const response = await fetch("http://localhost/api/v1/accounts?page=1", { method: "GET" });
			expect(response.status).toBe(200);
		} finally {
			controller.restore();
		}
	});

	it("fails closed when the stubbed body violates the contract", async () => {
		const controller = installMockFetch([
			{
				operation: "POST /api/v1/auth/login",
				status: 200,
				// access_token must be a string; a number proves the gate bites.
				body: { ...fixtureLoginSuccess(), access_token: 42 },
			},
		]);
		try {
			const failure = await fetch("http://localhost/api/v1/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(fixtureLoginRequest()),
			}).then(
				() => null,
				(cause: unknown) => cause,
			);
			expect(String(failure)).toContain("POST /api/v1/auth/login");
			// Redaction: the offending value never appears in the message.
			expect(String(failure)).not.toContain("42");
		} finally {
			controller.restore();
		}
	});

	it("serves documented error statuses such as 401", async () => {
		const controller = installMockFetch([
			{
				operation: "POST /api/v1/auth/login",
				status: 401,
				body: fixtureApiError("Invalid credentials"),
			},
		]);
		try {
			const response = await fetch("http://localhost/api/v1/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(fixtureLoginRequest()),
			});
			expect(response.status).toBe(401);
		} finally {
			controller.restore();
		}
	});

	it("rejects unknown operations at install time", () => {
		expect(() => installMockFetch([{ operation: "GET /api/v1/nope", body: {} }])).toThrow(
			/unknown operation/,
		);
	});

	it("throws on unhandled requests instead of hitting the network", async () => {
		const controller = installMockFetch([]);
		try {
			await expect(fetch("http://localhost/api/v1/accounts")).rejects.toThrow(/unhandled GET/);
		} finally {
			controller.restore();
		}
	});
});
