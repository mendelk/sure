/**
 * Thin typed fetch layer for the Sure Rails API.
 *
 * Tooling choice (documented decision): [`openapi-typescript`] generates the
 * `paths`/`components` types in `./openapi.d.ts` directly from
 * `docs/api/openapi.yaml`, and [`openapi-fetch`] provides the runtime — a
 * type-safe `fetch` wrapper with no store, cache, or component model. There
 * is deliberately no second state-management abstraction: TanStack Query
 * remains the only async-state layer, and every helper below accepts a
 * standard `AbortSignal` so it can be used directly as a Query `queryFn`.
 *
 * Regenerate the types with a single command (from `apps/web`):
 *
 * ```sh
 * pnpm api:generate
 * ```
 *
 * Browser authentication (ADR-0001 D1/REQ-SESS-01): production browser calls
 * target the same-origin BFF and authenticate with its `HttpOnly` session
 * cookie only. This module defines no API-key/bearer-token surface at all —
 * no getters, no constants, no injection middleware — so no Sure credential
 * is ever readable from page JavaScript.
 *
 * [`openapi-typescript`]: https://github.com/openapi-ts/openapi-typescript
 * [`openapi-fetch`]: https://github.com/openapi-ts/openapi-fetch
 */
import createClient, {
	type Client,
	type ClientPathsWithMethod,
	type FetchOptions,
	type HeadersOptions,
	type MethodResponse,
} from "openapi-fetch";
import type { OperationContract, RedactedIssue } from "./contract";
import { describeContractViolation, redactZodIssues } from "./contract";
import type { components, paths } from "./openapi";

/** Re-export the generated schema so consumers never hand-copy models. */
export type { components, paths };

/** Re-export the operation-contract type for validated call sites. */
export type { OperationContract, RedactedIssue };

/** All documented API paths, e.g. `"/api/v1/accounts"`. */
export type ApiPaths = keyof paths;

/**
 * The underlying type-safe client. Authentication is the BFF's `HttpOnly`
 * session cookie only (`credentials: "same-origin"`): no API-key/bearer
 * middleware is applied, per ADR-0001 D1/REQ-SESS-01.
 */
export type SureClient = Client<paths>;

/** Header carrying the per-request correlation id. */
export const REQUEST_ID_HEADER = "X-Request-Id";

export type ApiErrorKind =
	| "validation"
	| "unauthorized"
	| "forbidden"
	| "notFound"
	| "conflict"
	| "rateLimited"
	| "http"
	| "parse"
	| "contract"
	| "aborted"
	| "network";

export interface ApiErrorInit {
	kind: ApiErrorKind;
	message: string;
	status?: number | undefined;
	details?: unknown;
	retryAfterMs?: number | undefined;
	requestId?: string | undefined;
	cause?: unknown;
}

/**
 * Single application-level error for every API failure mode: validation
 * (400/422 with an `ErrorResponse` body), authorization (401/403),
 * missing resources (404), conflicts such as "export not ready" (409),
 * rate limiting (429, with `retryAfterMs` parsed from `Retry-After`),
 * contract violations (documented success payloads that fail their
 * generated Zod parser, with redacted diagnostics), other HTTP failures,
 * unparseable success bodies, aborted requests, and network failures.
 * Narrow on `kind`, or use `retryable` for Query retries.
 */
export class ApiError extends Error {
	readonly kind: ApiErrorKind;
	readonly status?: number | undefined;
	readonly details?: unknown;
	readonly retryAfterMs?: number | undefined;
	readonly requestId?: string | undefined;

	constructor(init: ApiErrorInit) {
		super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
		this.name = "ApiError";
		this.kind = init.kind;
		this.status = init.status;
		this.details = init.details;
		this.retryAfterMs = init.retryAfterMs;
		this.requestId = init.requestId;
	}

	/**
	 * Whether retrying later could succeed. Suitable for TanStack Query:
	 * `retry: (count, error) => isApiError(error) && error.retryable && count < 3`.
	 */
	get retryable(): boolean {
		if (this.kind === "rateLimited" || this.kind === "network") {
			return true;
		}
		if (this.kind === "http" && this.status !== undefined) {
			return this.status >= 500 || this.status === 409;
		}
		if (this.kind === "conflict") {
			return true;
		}
		return false;
	}
}

/** Type guard for errors produced by this module. */
export function isApiError(error: unknown): error is ApiError {
	return error instanceof ApiError;
}

export interface CreateApiClientOptions {
	/**
	 * API base URL.
	 *
	 * Browser calls MUST target the same-origin BFF (ADR-0001 D1/REQ-SESS-01:
	 * the browser holds only the BFF's `HttpOnly` session cookie, never a
	 * Sure token or API key). In the browser that means a same-origin base
	 * such as `""` (relative URLs) or `window.location.origin` — never the
	 * Rails origin directly. Absolute Rails origins are for server-side use
	 * only (SSR, tests, the BFF's own upstream configuration).
	 */
	baseUrl: string;
	/** Override `fetch` (tests, SSR runtimes). Defaults to `globalThis.fetch`. */
	fetchImpl?: (input: Request) => Promise<Response>;
}

function defaultGenerateRequestId(): string {
	const cryptoRef = globalThis.crypto;
	if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
		return cryptoRef.randomUUID();
	}
	return `req-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

/**
 * Create the shared API client.
 *
 * Authentication is the BFF's `HttpOnly` session cookie and nothing else
 * (ADR-0001 D1/REQ-SESS-01): this module never reads, stores, or injects
 * API keys, bearer tokens, or `Authorization` headers from JavaScript, so a
 * successful XSS finds no Sure credential to steal. Every request is sent
 * with `credentials: "same-origin"` so the cookie goes to the BFF origin
 * only, never cross-origin. Prefer the `apiGet`/`apiPost`/… wrappers over
 * calling verbs directly so outcomes are normalized to `ApiError` and the
 * correlation id is returned to the caller.
 */
export function createApiClient(options: CreateApiClientOptions): SureClient {
	return createClient<paths>({
		baseUrl: options.baseUrl,
		...(options.fetchImpl === undefined ? {} : { fetch: options.fetchImpl }),
		headers: {},
		credentials: "same-origin",
	});
}

/** Success envelope: typed data plus transport metadata for Query layers. */
export interface ApiSuccess<T> {
	data: T;
	response: Response;
	requestId: string;
}

type GetPaths = ClientPathsWithMethod<SureClient, "get">;
type PostPaths = ClientPathsWithMethod<SureClient, "post">;
type PutPaths = ClientPathsWithMethod<SureClient, "put">;
type PatchPaths = ClientPathsWithMethod<SureClient, "patch">;
type DeletePaths = ClientPathsWithMethod<SureClient, "delete">;

export type ApiData<
	Method extends "get" | "post" | "put" | "patch" | "delete",
	Path extends ClientPathsWithMethod<SureClient, Method>,
> = MethodResponse<SureClient, Method, Path>;

/** Extra per-request options accepted by every wrapper. */
export interface ApiRequestExtras {
	/**
	 * Correlation id sent as `X-Request-Id` and echoed on success/error.
	 * An explicit header already present in `headers` wins; otherwise this
	 * value wins; otherwise a fresh id is generated. Pass a fixed value in
	 * tests for deterministic assertions.
	 */
	requestId?: string;
	/**
	 * Generated operation contract (see `./generated/operations/*` and the
	 * per-operation fetch wrappers). When present, documented success
	 * payloads are parsed through the contract before they reach callers:
	 * violations throw `{ kind: "contract" }` with redacted diagnostics,
	 * so malformed upstream data can never enter application state.
	 * Error payloads are validated leniently (a malformed error body never
	 * masks the original status-mapped error). Undocumented success
	 * statuses pass through so additive API changes stay resilient.
	 */
	contract?: OperationContract | undefined;
}

/** Redacted contract-violation details carried on `{ kind: "contract" }` errors. */
export interface ContractErrorDetails {
	readonly operation: string;
	readonly status: number;
	readonly issues: readonly RedactedIssue[];
}

/**
 * Mirrors openapi-fetch's own init optionality: `init` is optional exactly
 * when the operation requires neither params nor a body, so required
 * bodies/path params stay compile-time errors instead of runtime 422s.
 */
export type ApiInit<Operation> =
	{} extends FetchOptions<Operation>
		? [init?: FetchOptions<Operation> & ApiRequestExtras]
		: [init: FetchOptions<Operation> & ApiRequestExtras];

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function appendHeaders(target: Headers, source: HeadersOptions | undefined): void {
	if (source === undefined || source === null) {
		return;
	}
	if (source instanceof Headers) {
		source.forEach((value, key) => {
			target.set(key, value);
		});
		return;
	}
	if (Array.isArray(source)) {
		for (const [name, value] of source) {
			target.set(name, value);
		}
		return;
	}
	for (const [name, value] of Object.entries(source)) {
		if (value !== undefined && value !== null) {
			target.set(name, String(value));
		}
	}
}

function isHeadersOptions(value: unknown): value is HeadersOptions {
	return value instanceof Headers || Array.isArray(value) || isRecord(value);
}

function resolveRequestHeaders(
	headers: unknown,
	explicitRequestId: unknown,
	generateRequestId: () => string,
): { headers: Headers; requestId: string } {
	const merged = new Headers();
	appendHeaders(merged, isHeadersOptions(headers) ? headers : undefined);
	const existing = merged.get(REQUEST_ID_HEADER);
	if (existing !== null && existing !== "") {
		return { headers: merged, requestId: existing };
	}
	const requestId =
		typeof explicitRequestId === "string" && explicitRequestId !== ""
			? explicitRequestId
			: generateRequestId();
	merged.set(REQUEST_ID_HEADER, requestId);
	return { headers: merged, requestId };
}

interface RawResult {
	data?: unknown;
	error?: unknown;
	response: Response;
}

type RawRequest = (
	method: string,
	url: string,
	init?: Record<string, unknown>,
) => Promise<RawResult>;

function parseRetryAfterMs(value: string | null): number | undefined {
	if (value === null || value.trim() === "") {
		return undefined;
	}
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.round(seconds * 1000);
	}
	const dateMs = Date.parse(value);
	if (!Number.isNaN(dateMs)) {
		return Math.max(0, dateMs - Date.now());
	}
	return undefined;
}

function errorMessage(payload: unknown, fallback: string): string {
	if (isRecord(payload)) {
		const message = payload["message"];
		if (typeof message === "string" && message !== "") {
			return message;
		}
		const error = payload["error"];
		if (typeof error === "string" && error !== "") {
			return error;
		}
	}
	return fallback;
}

function errorDetails(payload: unknown): unknown {
	if (isRecord(payload)) {
		if (payload["details"] !== undefined) {
			return payload["details"];
		}
		if (payload["errors"] !== undefined) {
			return payload["errors"];
		}
	}
	return payload === undefined ? undefined : payload;
}

function errorFromStatus(
	status: number,
	payload: unknown,
	response: Response,
	requestId: string,
): ApiError {
	const message = errorMessage(payload, `Request failed with status ${status}.`);
	const details = errorDetails(payload);
	switch (status) {
		case 400:
		case 422:
			return new ApiError({
				kind: "validation",
				message,
				status,
				details,
				requestId,
			});
		case 401:
			return new ApiError({
				kind: "unauthorized",
				message,
				status,
				details,
				requestId,
			});
		case 403:
			return new ApiError({
				kind: "forbidden",
				message,
				status,
				details,
				requestId,
			});
		case 404:
			return new ApiError({
				kind: "notFound",
				message,
				status,
				details,
				requestId,
			});
		case 409:
			return new ApiError({
				kind: "conflict",
				message,
				status,
				details,
				requestId,
			});
		case 429:
			return new ApiError({
				kind: "rateLimited",
				message,
				status,
				details,
				retryAfterMs: parseRetryAfterMs(response.headers.get("Retry-After")),
				requestId,
			});
		default:
			return new ApiError({
				kind: "http",
				message,
				status,
				details,
				requestId,
			});
	}
}

function errorFromThrown(
	error: unknown,
	signal: AbortSignal | null | undefined,
	requestId: string,
): unknown {
	if (isApiError(error)) {
		return error;
	}
	const name =
		error !== null && typeof error === "object" ? (error as { name?: unknown }).name : undefined;
	if (name === "AbortError" || signal?.aborted === true) {
		return new ApiError({
			kind: "aborted",
			message: "Request was aborted.",
			requestId,
			cause: error,
		});
	}
	if (error instanceof SyntaxError) {
		return new ApiError({
			kind: "parse",
			message: "Response body could not be parsed.",
			requestId,
			cause: error,
		});
	}
	if (error instanceof TypeError) {
		return new ApiError({
			kind: "network",
			message: "Network request failed.",
			requestId,
			cause: error,
		});
	}
	return error;
}

interface PerformArgs {
	client: SureClient;
	method: "get" | "post" | "put" | "patch" | "delete";
	path: string;
	init: Record<string, unknown> | undefined;
	headers: Headers;
	requestId: string;
	contract: OperationContract | undefined;
}

function contractError(
	contract: OperationContract,
	status: number,
	issues: readonly RedactedIssue[],
	totalIssues: number,
	requestId: string,
): ApiError {
	const details: ContractErrorDetails = {
		operation: contract.operation,
		status,
		issues,
	};
	return new ApiError({
		kind: "contract",
		message: describeContractViolation(contract.operation, status, issues, totalIssues),
		status,
		details,
		requestId,
	});
}

function validateSuccessData(
	contract: OperationContract | undefined,
	status: number,
	data: unknown,
	requestId: string,
): unknown {
	if (contract === undefined) {
		return data;
	}
	const parser = contract.successResponses[String(status)];
	if (parser === undefined) {
		return data;
	}
	const parsed = parser.safeParse(data);
	if (!parsed.success) {
		throw contractError(
			contract,
			status,
			redactZodIssues(parsed.error),
			parsed.error.issues.length,
			requestId,
		);
	}
	return parsed.data;
}

function validateErrorPayload(
	contract: OperationContract | undefined,
	status: number,
	payload: unknown,
): unknown {
	if (contract === undefined) {
		return payload;
	}
	const parser = contract.errorResponses[String(status)];
	if (parser === undefined) {
		return payload;
	}
	const parsed = parser.safeParse(payload);
	return parsed.success ? parsed.data : payload;
}

async function perform<T>(args: PerformArgs): Promise<ApiSuccess<T>> {
	const { client, method, path, init, headers, requestId, contract } = args;
	// eslint-disable-next-line typescript/no-unsafe-type-assertion -- Type-erased shared core: the public per-verb wrappers keep full static types, so this boundary reuses one implementation for every method/path without duplicating request logic.
	const rawRequest = client.request as unknown as RawRequest;
	let result: RawResult;
	try {
		// Pin same-origin credentials per request (in addition to the client
		// default) so caller-supplied init can never downgrade cookie
		// handling to "omit" or widen it to cross-origin "include".
		result = await rawRequest(method, path, {
			...init,
			headers,
			credentials: "same-origin",
		});
	} catch (error) {
		throw errorFromThrown(error, readSignal(init), requestId);
	}
	if (result.error !== undefined || !result.response.ok) {
		const payload = validateErrorPayload(contract, result.response.status, result.error);
		throw errorFromStatus(result.response.status, payload, result.response, requestId);
	}
	const data = validateSuccessData(contract, result.response.status, result.data, requestId);
	// eslint-disable-next-line typescript/no-unsafe-type-assertion -- Success data is typed per endpoint at the public wrappers; the shared core only forwards the already-normalized payload.
	return { data: data as T, response: result.response, requestId };
}

function readSignal(init: Record<string, unknown> | undefined): AbortSignal | null | undefined {
	const signal = init?.["signal"];
	return signal instanceof AbortSignal ? signal : undefined;
}

function prepare(
	client: SureClient,
	method: "get" | "post" | "put" | "patch" | "delete",
	path: string,
	init:
		| {
				headers?: HeadersOptions;
				requestId?: string | undefined;
				contract?: OperationContract | undefined;
		  }
		| undefined,
): PerformArgs {
	const { headers, requestId } = resolveRequestHeaders(
		init?.headers,
		init?.requestId,
		defaultGenerateRequestId,
	);
	// eslint-disable-next-line typescript/no-unsafe-type-assertion -- Single erasure point: public per-verb wrappers pass fully-typed init, so the shared core can operate on plain records without duplicating request logic per method.
	const raw = (init ?? {}) as Record<string, unknown>;
	const { requestId: _droppedRequestId, contract: _droppedContract, ...rest } = raw;
	const contract = init?.contract;
	return { client, method, path, init: rest, headers, requestId, contract };
}

/**
 * Typed GET. `signal` (e.g. from a TanStack Query `queryFn`) cancels the
 * request and surfaces as `{ kind: "aborted" }`:
 *
 * ```ts
 * queryFn: ({ signal }) =>
 *   apiGet(client, "/api/v1/accounts", {
 *     params: { query: { page: 1, per_page: 25 } },
 *     signal,
 *   }).then((result) => result.data),
 * ```
 */
export function apiGet<Path extends GetPaths>(
	client: SureClient,
	path: Path,
	...args: ApiInit<paths[Path]["get"]>
): Promise<ApiSuccess<ApiData<"get", Path>>> {
	const [init] = args;
	return perform<ApiData<"get", Path>>(prepare(client, "get", path, init));
}

/** Typed POST with a JSON body (`body` is required exactly where the spec requires it). */
export function apiPost<Path extends PostPaths>(
	client: SureClient,
	path: Path,
	...args: ApiInit<paths[Path]["post"]>
): Promise<ApiSuccess<ApiData<"post", Path>>> {
	const [init] = args;
	return perform<ApiData<"post", Path>>(prepare(client, "post", path, init));
}

/** Typed PUT with a JSON body. */
export function apiPut<Path extends PutPaths>(
	client: SureClient,
	path: Path,
	...args: ApiInit<paths[Path]["put"]>
): Promise<ApiSuccess<ApiData<"put", Path>>> {
	const [init] = args;
	return perform<ApiData<"put", Path>>(prepare(client, "put", path, init));
}

/** Typed PATCH with a JSON body. */
export function apiPatch<Path extends PatchPaths>(
	client: SureClient,
	path: Path,
	...args: ApiInit<paths[Path]["patch"]>
): Promise<ApiSuccess<ApiData<"patch", Path>>> {
	const [init] = args;
	return perform<ApiData<"patch", Path>>(prepare(client, "patch", path, init));
}

/** Typed DELETE. */
export function apiDelete<Path extends DeletePaths>(
	client: SureClient,
	path: Path,
	...args: ApiInit<paths[Path]["delete"]>
): Promise<ApiSuccess<ApiData<"delete", Path>>> {
	const [init] = args;
	return perform<ApiData<"delete", Path>>(prepare(client, "delete", path, init));
}

/** Downloaded file envelope for binary endpoints (exports, attachments). */
export interface DownloadedFile {
	blob: Blob;
	filename: string | undefined;
	contentType: string | undefined;
	response: Response;
	requestId: string;
}

function parseFilename(contentDisposition: string | null): string | undefined {
	if (contentDisposition === null) {
		return undefined;
	}
	const utf8Match = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(contentDisposition);
	if (utf8Match?.[1]) {
		try {
			return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ""));
		} catch {
			return utf8Match[1].trim();
		}
	}
	const quotedMatch = /filename\s*=\s*"([^"]+)"/i.exec(contentDisposition);
	if (quotedMatch?.[1]) {
		return quotedMatch[1];
	}
	const bareMatch = /filename\s*=\s*([^;]+)/i.exec(contentDisposition);
	return bareMatch?.[1]?.trim().replace(/^"|"$/g, "") || undefined;
}

/**
 * Download a binary response (e.g. `GET /api/v1/family_exports/{id}/download`)
 * as a `Blob`, honouring cancellation via `signal`. Throws `ApiError` for
 * non-2xx outcomes (including 409 "export not ready") just like the JSON
 * wrappers. When the operation contract marks a binary response, the Blob
 * is validated through the contract before it reaches callers.
 */
export function apiDownload<Path extends GetPaths>(
	client: SureClient,
	path: Path,
	...args: ApiInit<paths[Path]["get"]>
): Promise<DownloadedFile> {
	const [init] = args;
	const prepared = prepare(client, "get", path, init);
	return (async () => {
		const result = await perform<Blob>({
			...prepared,
			init: { ...prepared.init, parseAs: "blob" },
		});
		const binaryParser =
			prepared.contract?.isBinaryResponse === true ? prepared.contract.binaryResponse : undefined;
		let blob: Blob = result.data;
		if (binaryParser !== undefined && prepared.contract !== undefined) {
			const parsed = binaryParser.safeParse(blob);
			if (!parsed.success) {
				throw contractError(
					prepared.contract,
					result.response.status,
					redactZodIssues(parsed.error),
					parsed.error.issues.length,
					result.requestId,
				);
			}
			if (parsed.data instanceof Blob) {
				blob = parsed.data;
			}
		}
		const contentType = result.response.headers.get("Content-Type") ?? undefined;
		return {
			blob,
			filename: parseFilename(result.response.headers.get("Content-Disposition")),
			contentType: contentType ?? undefined,
			response: result.response,
			requestId: result.requestId,
		};
	})();
}

/** Query params for paginated list endpoints (`page`/`per_page`). */
export interface PageQuery {
	page?: number;
	per_page?: number;
}

/** Build `{ page, per_page }` query params, omitting unset values. */
export function pageQuery(page?: number, perPage?: number): PageQuery {
	return {
		...(page === undefined ? {} : { page }),
		...(perPage === undefined ? {} : { per_page: perPage }),
	};
}

/** Pagination envelope shared by list endpoints (from the generated schema). */
export type Pagination = components["schemas"]["Pagination"];

/** Extract the `pagination` envelope from a list response body, if present. */
export function getPagination(
	body: { pagination?: Pagination } | null | undefined,
): Pagination | undefined {
	return body?.pagination;
}

/** Whether another page follows (`page < total_pages`). */
export function hasNextPage(pagination: Pagination | undefined): boolean {
	if (pagination === undefined) {
		return false;
	}
	return pagination.page < pagination.total_pages;
}
