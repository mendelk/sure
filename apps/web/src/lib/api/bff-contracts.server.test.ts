import { describe, expect, it } from "vitest";
import { ApiError, isApiError } from "./client";
import { validateBffRequest, validateUpstreamResponse } from "./bff-contracts.server";

const SECRET = "secret-token-xyz-789";

function contractErrorOf(value: unknown): ApiError {
	expect(isApiError(value)).toBe(true);
	if (!isApiError(value)) {
		throw new Error("Expected an ApiError.");
	}
	expect(value.kind).toBe("contract");
	return value;
}

describe("validateBffRequest", () => {
	it("accepts valid outgoing request parts", () => {
		const data = validateBffRequest(
			"GET",
			"/api/v1/accounts",
			{ query: { page: 1, per_page: 25 } },
			"req-bff-1",
		);
		expect(data).toEqual({ query: { page: 1, per_page: 25 } });
	});

	it("throws a redacted contract error for invalid request parts", () => {
		let caught: unknown;
		try {
			validateBffRequest("GET", "/api/v1/accounts", { query: { page: "one" } });
		} catch (error) {
			caught = error;
		}
		const apiError = contractErrorOf(caught);
		expect(apiError.requestId).toBeUndefined();
		expect(JSON.stringify(apiError.details)).not.toContain("one");
	});

	it("fails closed for operations without a contract", () => {
		let caught: unknown;
		try {
			validateBffRequest("GET", "/api/v1/nope", {});
		} catch (error) {
			caught = error;
		}
		const apiError = contractErrorOf(caught);
		expect(apiError.message).toContain("GET /api/v1/nope");
	});
});

describe("validateUpstreamResponse", () => {
	it("accepts valid upstream payloads", () => {
		const data = validateUpstreamResponse("GET", "/api/v1/accounts", 200, {
			accounts: [],
			pagination: { page: 1, per_page: 25, total_count: 0, total_pages: 1 },
		});
		expect(data).toEqual({
			accounts: [],
			pagination: { page: 1, per_page: 25, total_count: 0, total_pages: 1 },
		});
	});

	it("throws a redacted contract error without raw payload data", () => {
		let caught: unknown;
		try {
			validateUpstreamResponse("GET", "/api/v1/accounts", 200, {
				accounts: [{ id: 1, token: SECRET }],
				pagination: { page: 1, per_page: 25, total_count: 1, total_pages: 1 },
			});
		} catch (error) {
			caught = error;
		}
		const apiError = contractErrorOf(caught);
		const serialized = JSON.stringify({ message: apiError.message, details: apiError.details });
		expect(serialized).toContain("GET /api/v1/accounts");
		expect(serialized).not.toContain(SECRET);
	});

	it("fails closed on undocumented statuses", () => {
		let caught: unknown;
		try {
			validateUpstreamResponse("GET", "/api/v1/accounts", 418, { ok: true });
		} catch (error) {
			caught = error;
		}
		const apiError = contractErrorOf(caught);
		expect(apiError.status).toBe(418);
	});

	it("validates documented error payloads through their parsers", () => {
		const data = validateUpstreamResponse("POST", "/api/v1/accounts", 422, {
			error: "unprocessable_entity",
		});
		expect(data).toEqual({ error: "unprocessable_entity" });
	});
});
