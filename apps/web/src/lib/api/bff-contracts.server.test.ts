import { describe, expect, it } from "vitest";
import { ApiError, isApiError } from "./client";
import {
	getOperationContract,
	validateBffRequest,
	validateUpstreamResponse,
} from "./bff-contracts.server";

/**
 * Server-only proof that the BFF transport can validate outgoing requests
 * and upstream Rails responses through the generated contracts — without
 * importing credentials or server-only configuration (this module's
 * imports are isomorphic and secret-free, enforced by the lint boundary).
 */
function catchThrown(fn: () => unknown): unknown {
	try {
		fn();
	} catch (error) {
		return error;
	}
	throw new Error("Expected the function to throw.");
}

function expectContractError(caught: unknown, requestId: string): ApiError {
	expect(isApiError(caught)).toBe(true);
	if (!isApiError(caught)) {
		throw new Error("Expected the function to throw an ApiError.");
	}
	expect(caught.kind).toBe("contract");
	expect(caught.requestId).toBe(requestId);
	return caught;
}
describe("BFF contract validation", () => {
	it("looks up contracts without server-only configuration", () => {
		const contract = getOperationContract("GET", "/api/v1/accounts");
		expect(contract?.operation).toBe("GET /api/v1/accounts");
		expect(getOperationContract("GET", "/api/v1/nope")).toBeUndefined();
	});

	it("validates outgoing requests", () => {
		const data = validateBffRequest(
			"GET",
			"/api/v1/accounts",
			{ query: { page: 2, per_page: 10 } },
			undefined,
			"req-bff-1",
		);
		expect(data).toEqual({ query: { page: 2, per_page: 10 } });
	});

	it("rejects malformed outgoing requests with redacted errors", () => {
		const caught = catchThrown(() =>
			validateBffRequest(
				"GET",
				"/api/v1/accounts",
				{ query: { page: "two" } },
				undefined,
				"req-bff-2",
			),
		);
		expectContractError(caught, "req-bff-2");
		expect(JSON.stringify(caught)).not.toContain("two");
	});

	it("selects the multipart parser for multipart uploads", () => {
		const file = new Blob(["a,b"], { type: "text/csv" });
		const data = validateBffRequest(
			"POST",
			"/api/v1/import_sessions/{id}/chunks",
			{ pathParams: { id: "session-1" }, body: { sequence: 1, file } },
			"multipart/form-data; boundary=xyz",
			"req-bff-3",
		);
		expect(data).toEqual({ pathParams: { id: "session-1" }, body: { sequence: 1, file } });
	});

	it("validates upstream responses", () => {
		const data = validateUpstreamResponse(
			"GET",
			"/api/v1/accounts",
			200,
			{
				accounts: [],
				pagination: { page: 1, per_page: 25, total_count: 0, total_pages: 1 },
			},
			"req-bff-4",
		);
		expect(data).toEqual({
			accounts: [],
			pagination: { page: 1, per_page: 25, total_count: 0, total_pages: 1 },
		});
	});

	it("fails closed on a malformed upstream response", () => {
		const caught = catchThrown(() =>
			validateUpstreamResponse("GET", "/api/v1/accounts", 200, { accounts: [] }, "req-bff-5"),
		);
		expect(caught).toBeInstanceOf(ApiError);
		expectContractError(caught, "req-bff-5");
	});

	it("fails closed on an undocumented upstream status", () => {
		const caught = catchThrown(() =>
			validateUpstreamResponse("GET", "/api/v1/accounts", 203, { future: true }, "req-bff-6"),
		);
		expect(caught).toBeInstanceOf(ApiError);
		expectContractError(caught, "req-bff-6");
	});

	it("fails closed for undocumented operations", () => {
		const caught = catchThrown(() =>
			validateUpstreamResponse("GET", "/api/v1/nope", 200, {}, "req-bff-7"),
		);
		expect(isApiError(caught)).toBe(true);
	});
});
