import { QueryClient } from "@tanstack/react-query";
import { describe, expect, expectTypeOf, it } from "vitest";
import { type ApiData, ApiError, apiGet, getPagination, isApiError } from "./client";
import { createApiClient, type SureClient } from "./client";
import {
	GetApiV1AccountsContract,
	getApiV1Accounts,
} from "./generated/operations/get-api-v1-accounts";
import { getApiV1FamilyExportsByIdDownload } from "./generated/operations/get-api-v1-family-exports-by-id-download";

/**
 * Typed-client proof: with an operation contract attached, malformed
 * upstream payloads throw redacted `{ kind: "contract" }` errors before
 * data reaches TanStack Query or application state — and those errors
 * never carry secrets or raw financial payloads.
 */

type FetchImpl = (input: Request) => Promise<Response>;

function mockFetch(handler: (request: Request) => Response | Promise<Response>): {
	fetchImpl: FetchImpl;
	requests: Request[];
} {
	const requests: Request[] = [];
	const fetchImpl: FetchImpl = async (input: Request) => {
		requests.push(input);
		return handler(input);
	};
	return { fetchImpl, requests };
}

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function testClient(fetchImpl: FetchImpl): SureClient {
	return createApiClient({ baseUrl: "http://localhost:3000", fetchImpl });
}

function validCollection(): Record<string, unknown> {
	return {
		accounts: [],
		pagination: { page: 1, per_page: 25, total_count: 0, total_pages: 1 },
	};
}

async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
	let threw = false;
	let caught: unknown;
	try {
		await promise;
	} catch (error) {
		threw = true;
		caught = error;
	}
	expect(threw).toBe(true);
	expect(isApiError(caught)).toBe(true);
	if (!isApiError(caught)) {
		throw new Error("Expected the request to throw an ApiError.");
	}
	return caught;
}

describe("contract-validated requests", () => {
	it("passes valid upstream payloads through with stripped unknown keys", async () => {
		const pagination = { page: 1, per_page: 25, total_count: 0, total_pages: 1 };
		const { fetchImpl } = mockFetch(() =>
			jsonResponse({
				accounts: [],
				pagination: { ...pagination, injected: 1 },
				injected: "drop-me",
			}),
		);
		const client = testClient(fetchImpl);

		const result = await apiGet(client, "/api/v1/accounts", {
			contract: GetApiV1AccountsContract,
			requestId: "req-valid-1",
		});

		expect(result.requestId).toBe("req-valid-1");
		expect(getPagination(result.data)?.page).toBe(1);
		expect(Object.keys(result.data)).not.toContain("injected");
	});

	it("throws a redacted contract error for malformed upstream payloads", async () => {
		const secret = "sk-live-SECRET-TOKEN-12345";
		const { fetchImpl } = mockFetch(() =>
			jsonResponse({
				accounts: [
					{
						id: "a-1",
						name: "Cash",
						balance_cents: "not-a-number",
						api_key: secret,
						password: "hunter2",
					},
				],
				pagination: { page: 1, per_page: 25, total_count: 1, total_pages: 1 },
			}),
		);
		const client = testClient(fetchImpl);

		const error = await expectApiError(
			apiGet(client, "/api/v1/accounts", {
				contract: GetApiV1AccountsContract,
				requestId: "req-contract-1",
			}),
		);

		expect(error.kind).toBe("contract");
		expect(error.status).toBe(200);
		expect(error.requestId).toBe("req-contract-1");
		expect(error.retryable).toBe(false);
		const serialized = JSON.stringify(error);
		expect(serialized).toContain("GET /api/v1/accounts");
		// Redaction: no raw values, tokens, or credentials leak into the error.
		for (const leaked of [secret, "hunter2", "not-a-number", "api_key", "password"]) {
			expect(serialized).not.toContain(leaked);
		}
	});

	it("keeps error responses lenient so malformed error bodies never mask status errors", async () => {
		const { fetchImpl } = mockFetch(() => new Response("upstream exploded", { status: 422 }));
		const client = testClient(fetchImpl);

		const error = await expectApiError(
			apiGet(client, "/api/v1/accounts", {
				contract: GetApiV1AccountsContract,
				requestId: "req-lenient-1",
			}),
		);

		expect(error.kind).toBe("validation");
		expect(error.status).toBe(422);
		expect(error.requestId).toBe("req-lenient-1");
	});

	it("passes undocumented success statuses through for forward compatibility", async () => {
		const { fetchImpl } = mockFetch(() => jsonResponse({ future: true }, 203));
		const client = testClient(fetchImpl);

		const result = await apiGet(client, "/api/v1/accounts", {
			contract: GetApiV1AccountsContract,
			requestId: "req-future-1",
		});

		expect(result.requestId).toBe("req-future-1");
	});
});

describe("generated operation wrappers", () => {
	it("validates through the typed wrapper and preserves static types", async () => {
		const { fetchImpl } = mockFetch(() => jsonResponse(validCollection()));
		const client = testClient(fetchImpl);

		const result = await getApiV1Accounts(client, { requestId: "req-wrap-1" });

		expectTypeOf(result.data).toEqualTypeOf<ApiData<"get", "/api/v1/accounts">>();
		expect(result.requestId).toBe("req-wrap-1");
	});

	it("rejects malformed payloads through the wrapper with correlation metadata", async () => {
		const { fetchImpl } = mockFetch(() => jsonResponse({ accounts: "nope", pagination: null }));
		const client = testClient(fetchImpl);

		const error = await expectApiError(getApiV1Accounts(client, { requestId: "req-wrap-2" }));

		expect(error.kind).toBe("contract");
		expect(error.requestId).toBe("req-wrap-2");
	});

	it("feeds validated data into TanStack Query", async () => {
		const { fetchImpl } = mockFetch(() => jsonResponse(validCollection()));
		const client = testClient(fetchImpl);
		const queryClient = new QueryClient();

		const data = await queryClient.fetchQuery({
			queryKey: ["accounts", "contracted"],
			queryFn: ({ signal }) => getApiV1Accounts(client, { signal }).then((result) => result.data),
		});

		expect(getPagination(data)?.total_pages).toBe(1);
	});

	it("keeps malformed payloads out of TanStack Query state", async () => {
		const { fetchImpl } = mockFetch(() =>
			jsonResponse({ accounts: [], pagination: { page: "one" } }),
		);
		const client = testClient(fetchImpl);
		const queryClient = new QueryClient();

		const error = await expectApiError(
			queryClient.fetchQuery({
				queryKey: ["accounts", "contracted-bad"],
				queryFn: ({ signal }) => getApiV1Accounts(client, { signal }).then((result) => result.data),
				retry: false,
			}),
		);

		expect(error.kind).toBe("contract");
	});

	it("downloads validated binary payloads through the wrapper", async () => {
		const bytes = new Uint8Array([9, 8, 7]);
		const { fetchImpl } = mockFetch(
			() =>
				new Response(bytes, {
					status: 200,
					headers: {
						"Content-Type": "application/zip",
						"Content-Disposition": 'attachment; filename="export.zip"',
					},
				}),
		);
		const client = testClient(fetchImpl);

		const file = await getApiV1FamilyExportsByIdDownload(client, {
			params: { path: { id: "export-1" } },
			requestId: "req-dl-contract-1",
		});

		expect(file.blob).toBeInstanceOf(Blob);
		expect(file.filename).toBe("export.zip");
		expect(file.requestId).toBe("req-dl-contract-1");
	});
});
