import { QueryClient } from "@tanstack/react-query";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
	REQUEST_ID_HEADER,
	type ApiData,
	ApiError,
	apiDelete,
	apiDownload,
	apiGet,
	apiPost,
	createApiClient,
	getPagination,
	hasNextPage,
	isApiError,
	pageQuery,
	type SureClient,
} from "./client";
import type { components } from "./openapi";

/**
 * All model shapes below are referenced from the generated OpenAPI types —
 * never hand-copied — so these tests break on drift even before `api:check`.
 */
type AccountCollection = components["schemas"]["AccountCollection"];
type AccountCreateRequest = components["schemas"]["AccountCreateRequest"];
type ErrorResponse = components["schemas"]["ErrorResponse"];

type FetchImpl = (input: Request) => Promise<Response>;

function mockFetch(handler: (request: Request) => Response | Promise<Response>): {
	fetchImpl: FetchImpl;
	requests: Request[];
} {
	const requests: Request[] = [];
	const fetchImpl: FetchImpl = async (input: Request) => {
		requests.push(input);
		if (input.signal.aborted) {
			throw new DOMException("This operation was aborted.", "AbortError");
		}
		return handler(input);
	};
	return { fetchImpl, requests };
}

function jsonResponse(
	payload: unknown,
	status = 200,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	});
}

function errorBody(overrides: Partial<ErrorResponse> = {}): ErrorResponse {
	return { error: "unprocessable_entity", ...overrides };
}

function collectionBody(overrides: Partial<AccountCollection> = {}): AccountCollection {
	return {
		accounts: [],
		pagination: { page: 1, per_page: 25, total_count: 0, total_pages: 1 },
		...overrides,
	};
}

function testClient(fetchImpl: FetchImpl): SureClient {
	// NB: absolute base URL here is test-only. Production browser calls use a
	// same-origin BFF base (see client.ts); the Rails origin is server-side.
	return createApiClient({
		baseUrl: "http://localhost:3000",
		fetchImpl,
	});
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

function firstRequest(requests: Request[]): Request {
	return requestAt(requests, 0);
}

function requestAt(requests: Request[], index: number): Request {
	const request = requests[index];
	if (request === undefined) {
		throw new Error(`Expected request ${index} to have been sent.`);
	}
	return request;
}

const malformedJsonFetch: FetchImpl = async () =>
	new Response("definitely-not-json{{{", {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});

describe("apiGet", () => {
	it("sends pagination query params with correlation headers", async () => {
		const { fetchImpl, requests } = mockFetch(() => jsonResponse(collectionBody()));
		const client = testClient(fetchImpl);

		const result = await apiGet(client, "/api/v1/accounts", {
			params: { query: { page: 2, per_page: 10 } },
		});

		expect(requests).toHaveLength(1);
		const request = firstRequest(requests);
		expect(request.method).toBe("GET");
		expect(request.url).toBe("http://localhost:3000/api/v1/accounts?page=2&per_page=10");
		const sentId = request.headers.get(REQUEST_ID_HEADER);
		expect(sentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
		expect(result.requestId).toBe(sentId);
		expect(result.data.pagination.page).toBe(1);
	});

	it("injects no Authorization or X-Api-Key credential header", async () => {
		const { fetchImpl, requests } = mockFetch((request) => {
			if (request.method === "DELETE") {
				return new Response(null, { status: 204 });
			}
			if (request.method === "POST") {
				return jsonResponse(
					{
						id: "123e4567-e89b-12d3-a456-426614174002",
						name: "Cash",
						balance: "0.00",
						balance_cents: 0,
						cash_balance: "0.00",
						cash_balance_cents: 0,
						currency: "USD",
						classification: "asset",
						account_type: "depository",
						status: "active",
						manual: true,
						linked: false,
						capabilities: ["read", "update", "archive", "delete"],
						created_at: "2026-09-07T12:00:00.000Z",
						updated_at: "2026-09-07T12:00:00.000Z",
					},
					201,
				);
			}
			return jsonResponse(collectionBody());
		});
		const client = testClient(fetchImpl);

		await apiGet(client, "/api/v1/accounts", { requestId: "req-sec-1" });
		await apiPost(client, "/api/v1/accounts", {
			body: {
				account: { name: "Cash", balance: 0, account_type: "depository" },
			},
			requestId: "req-sec-2",
		});
		await apiDelete(client, "/api/v1/tags/{id}", {
			params: { path: { id: "tag-1" } },
			requestId: "req-sec-3",
		});

		expect(requests.length).toBeGreaterThan(0);
		for (const request of requests) {
			expect(request.headers.has("Authorization")).toBe(false);
			expect(request.headers.has("X-Api-Key")).toBe(false);
		}
	});

	it("sends requests with same-origin credentials only", async () => {
		const { fetchImpl, requests } = mockFetch(() => jsonResponse(collectionBody()));
		const client = testClient(fetchImpl);

		await apiGet(client, "/api/v1/accounts", { requestId: "req-cred-1" });
		expect(firstRequest(requests).credentials).toBe("same-origin");

		// A caller-supplied weaker/wider mode must not win: the session
		// cookie goes to the BFF origin only, never cross-origin.
		await apiGet(client, "/api/v1/accounts", {
			requestId: "req-cred-2",
			credentials: "omit",
		});
		expect(requestAt(requests, 1).credentials).toBe("same-origin");
	});

	it("honours an explicit requestId and a pre-set correlation header", async () => {
		const { fetchImpl, requests } = mockFetch(() => jsonResponse(collectionBody()));
		const client = testClient(fetchImpl);

		const explicit = await apiGet(client, "/api/v1/accounts", {
			requestId: "req-explicit-1",
		});
		expect(explicit.requestId).toBe("req-explicit-1");
		expect(firstRequest(requests).headers.get(REQUEST_ID_HEADER)).toBe("req-explicit-1");

		const preset = await apiGet(client, "/api/v1/accounts", {
			headers: { [REQUEST_ID_HEADER]: "req-preset-1" },
			requestId: "req-explicit-2",
		});
		expect(preset.requestId).toBe("req-preset-1");
		expect(requestAt(requests, 1).headers.get(REQUEST_ID_HEADER)).toBe("req-preset-1");
	});

	it("sends path params", async () => {
		const { fetchImpl, requests } = mockFetch(() =>
			jsonResponse({
				id: "123e4567-e89b-12d3-a456-426614174000",
				date: "2026-09-07",
				currency: "USD",
				flows_factor: 1,
				balance: "100.00",
				balance_cents: 10000,
				start_balance: "100.00",
				start_balance_cents: 10000,
				end_balance: "100.00",
				end_balance_cents: 10000,
				account: {
					id: "123e4567-e89b-12d3-a456-426614174001",
					name: "Cash",
					account_type: "depository",
				},
				created_at: "2026-09-07T12:00:00.000Z",
				updated_at: "2026-09-07T12:00:00.000Z",
			}),
		);
		const client = testClient(fetchImpl);

		await apiGet(client, "/api/v1/balances/{id}", {
			params: { path: { id: "balance-1" } },
		});

		expect(new URL(firstRequest(requests).url).pathname).toBe("/api/v1/balances/balance-1");
	});
});

describe("apiPost", () => {
	it("sends a typed JSON body", async () => {
		const seen: unknown[] = [];
		const { fetchImpl } = mockFetch(async (request) => {
			seen.push(await request.json());
			return jsonResponse(
				{
					id: "123e4567-e89b-12d3-a456-426614174002",
					name: "Cash",
					balance: "100.00",
					balance_cents: 10000,
					cash_balance: "100.00",
					cash_balance_cents: 10000,
					currency: "USD",
					classification: "asset",
					account_type: "depository",
					status: "active",
					manual: true,
					linked: false,
					capabilities: ["read", "update", "archive", "delete"],
					created_at: "2026-09-07T12:00:00.000Z",
					updated_at: "2026-09-07T12:00:00.000Z",
				},
				201,
			);
		});
		const client = testClient(fetchImpl);

		const body: AccountCreateRequest = {
			account: { name: "Cash", balance: 100, account_type: "depository" },
		};
		await apiPost(client, "/api/v1/accounts", {
			body,
			requestId: "req-post-1",
		});

		expect(seen[0]).toEqual(body);
	});
});

describe("apiDelete", () => {
	it("resolves empty data for 204 delete endpoints", async () => {
		const { fetchImpl, requests } = mockFetch(() => new Response(null, { status: 204 }));
		const client = testClient(fetchImpl);

		const result = await apiDelete(client, "/api/v1/tags/{id}", {
			params: { path: { id: "tag-1" } },
			requestId: "req-delete-1",
		});

		expect(firstRequest(requests).method).toBe("DELETE");
		expect(result.requestId).toBe("req-delete-1");
	});
});

describe("ApiError normalization", () => {
	it("maps 422 to validation with details and message", async () => {
		const { fetchImpl } = mockFetch(() =>
			jsonResponse(
				errorBody({
					error: "unprocessable_entity",
					message: "Name can't be blank",
					details: ["Name can't be blank"],
				}),
				422,
			),
		);
		const client = testClient(fetchImpl);

		const error = await expectApiError(
			apiPost(client, "/api/v1/accounts", {
				body: {
					account: { name: "", balance: 0, account_type: "depository" },
				},
				requestId: "req-validation-1",
			}),
		);

		expect(error.kind).toBe("validation");
		expect(error.status).toBe(422);
		expect(error.message).toBe("Name can't be blank");
		expect(error.details).toEqual(["Name can't be blank"]);
		expect(error.requestId).toBe("req-validation-1");
		expect(error.retryable).toBe(false);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("ApiError");
	});

	it.each([
		{ status: 401, kind: "unauthorized" },
		{ status: 403, kind: "forbidden" },
		{ status: 404, kind: "notFound" },
		{ status: 409, kind: "conflict" },
		{ status: 500, kind: "http" },
	])("maps $status to $kind", async ({ status, kind }) => {
		const { fetchImpl } = mockFetch(() => jsonResponse(errorBody({ error: "failure" }), status));
		const client = testClient(fetchImpl);

		const error = await expectApiError(
			apiGet(client, "/api/v1/accounts", { requestId: `req-${status}` }),
		);

		expect(error.kind).toBe(kind);
		expect(error.status).toBe(status);
		expect(error.requestId).toBe(`req-${status}`);
	});

	it("maps 429 to rateLimited with retryAfterMs from Retry-After", async () => {
		const { fetchImpl } = mockFetch(() =>
			jsonResponse(errorBody({ error: "rate_limited" }), 429, {
				"Retry-After": "120",
			}),
		);
		const client = testClient(fetchImpl);

		const error = await expectApiError(apiGet(client, "/api/v1/accounts"));

		expect(error.kind).toBe("rateLimited");
		expect(error.retryAfterMs).toBe(120_000);
		expect(error.retryable).toBe(true);
	});

	it("maps fetch failures to network with the original cause", async () => {
		const cause = new TypeError("fetch failed");
		const fetchImpl: FetchImpl = async () => {
			throw cause;
		};
		const client = testClient(fetchImpl);

		const error = await expectApiError(
			apiGet(client, "/api/v1/accounts", { requestId: "req-network-1" }),
		);

		expect(error.kind).toBe("network");
		expect(error.status).toBeUndefined();
		expect(error.requestId).toBe("req-network-1");
		expect(error.cause).toBe(cause);
		expect(error.retryable).toBe(true);
	});

	it("maps aborts to aborted", async () => {
		const { fetchImpl } = mockFetch(() => jsonResponse(collectionBody()));
		const client = testClient(fetchImpl);
		const controller = new AbortController();
		controller.abort();

		const error = await expectApiError(
			apiGet(client, "/api/v1/accounts", {
				signal: controller.signal,
				requestId: "req-abort-1",
			}),
		);

		expect(error.kind).toBe("aborted");
		expect(error.requestId).toBe("req-abort-1");
		expect(error.retryable).toBe(false);
	});

	it("maps unparseable success bodies to parse", async () => {
		const client = testClient(malformedJsonFetch);

		const error = await expectApiError(
			apiGet(client, "/api/v1/accounts", { requestId: "req-parse-1" }),
		);

		expect(error.kind).toBe("parse");
		expect(error.requestId).toBe("req-parse-1");
		expect(error.cause).toBeInstanceOf(SyntaxError);
	});
});

describe("apiDownload", () => {
	it("returns the blob with filename, content type, and correlation id", async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const { fetchImpl, requests } = mockFetch(
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

		const file = await apiDownload(client, "/api/v1/family_exports/{id}/download", {
			params: { path: { id: "export-1" } },
			requestId: "req-dl-1",
		});

		expect(requests).toHaveLength(1);
		expect(file.blob).toBeInstanceOf(Blob);
		expect(file.blob.size).toBe(3);
		expect(file.filename).toBe("export.zip");
		expect(file.contentType).toBe("application/zip");
		expect(file.requestId).toBe("req-dl-1");
	});

	it("throws conflict when the export is not ready", async () => {
		const { fetchImpl } = mockFetch(() =>
			jsonResponse(errorBody({ error: "export_not_ready" }), 409),
		);
		const client = testClient(fetchImpl);

		const error = await expectApiError(
			apiDownload(client, "/api/v1/family_exports/{id}/download", {
				params: { path: { id: "export-1" } },
			}),
		);

		expect(error.kind).toBe("conflict");
		expect(error.retryable).toBe(true);
	});
});

describe("pagination helpers", () => {
	it("builds page query params and omits unset values", () => {
		expect(pageQuery(2, 50)).toEqual({ page: 2, per_page: 50 });
		expect(pageQuery()).toEqual({});
	});

	it("extracts pagination from generated collection types", () => {
		const body: AccountCollection = collectionBody({
			pagination: { page: 2, per_page: 25, total_count: 60, total_pages: 3 },
		});
		expect(getPagination(body)).toEqual(body.pagination);
		expect(getPagination(null)).toBeUndefined();
		expect(hasNextPage(getPagination(body))).toBe(true);
		expect(
			hasNextPage(
				getPagination(
					collectionBody({
						pagination: { page: 3, per_page: 25, total_count: 60, total_pages: 3 },
					}),
				),
			),
		).toBe(false);
		expect(hasNextPage(undefined)).toBe(false);
	});
});

describe("TanStack Query interop", () => {
	it("works as a queryFn with cancellation signal", async () => {
		const { fetchImpl, requests } = mockFetch((request) => {
			expect(request.signal).toBeInstanceOf(AbortSignal);
			return jsonResponse(collectionBody());
		});
		const client = testClient(fetchImpl);
		const queryClient = new QueryClient();

		const data = await queryClient.fetchQuery({
			queryKey: ["accounts", { page: 1 }],
			queryFn: ({ signal }) =>
				apiGet(client, "/api/v1/accounts", {
					params: { query: pageQuery(1, 25) },
					signal,
				}).then((result) => result.data),
		});

		expect(data.pagination.total_pages).toBe(1);
		expect(requests).toHaveLength(1);
	});
});

describe("compile-time types", () => {
	it("derives response data from the generated schema", async () => {
		const { fetchImpl } = mockFetch(() => jsonResponse(collectionBody()));
		const client = testClient(fetchImpl);

		const result = await apiGet(client, "/api/v1/accounts");

		expectTypeOf(result.data).toEqualTypeOf<ApiData<"get", "/api/v1/accounts">>();
		expectTypeOf(result.data.accounts).toEqualTypeOf<components["schemas"]["AccountDetail"][]>();
		expectTypeOf(result.data.pagination).toEqualTypeOf<components["schemas"]["Pagination"]>();
		expectTypeOf(result.requestId).toEqualTypeOf<string>();
	});

	it("rejects unknown paths, mistyped params, and missing bodies", () => {
		const client = testClient(async () => jsonResponse(collectionBody()));

		expectTypeOf(apiGet).toBeFunction();
		// Runtime calls below are compile-time assertions only: contract
		// validation may reject their responses, so rejections are tolerated.
		// @ts-expect-error - path is not in the OpenAPI document
		void apiGet(client, "/api/v1/nope").catch(() => undefined);
		void apiGet(client, "/api/v1/accounts", {
			// @ts-expect-error - page must be a number
			params: { query: { page: "one" } },
		}).catch(() => undefined);
		// @ts-expect-error - POST /accounts requires a JSON body
		void apiPost(client, "/api/v1/accounts").catch(() => undefined);
		// @ts-expect-error - path params are required
		void apiGet(client, "/api/v1/balances/{id}").catch(() => undefined);
	});
});
