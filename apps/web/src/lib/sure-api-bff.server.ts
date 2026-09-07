/**
 * Server-only Sure API BFF transport (TanStack Start server executor).
 *
 * The browser's only path to the Sure Rails API runs through here, invoked
 * from `createServerFn` handlers / route loaders — never from client render
 * paths (see `apps/web/CONVENTIONS.md`). The upstream origin and credentials
 * are fixed deployment configuration; per-request input can only select an
 * allow-listed relative path, method, content type, and query string.
 *
 * ADR-0001 traceability (docs/adr/0001-browser-auth-bff-threat-model.md):
 * - B2 / REQ-TRAN-03 — fixed upstream origin, SSRF allow-list, unsafe
 *   forwarded-header stripping, timeouts + body caps on outbound fetch.
 * - REQ-TRAN-01 — CSRF + same-origin enforcement for mutations.
 * - REQ-TRAN-05 — every BFF response carries `private, no-store`.
 * - REQ-OPS-01 — redacted structured errors; credentials never logged.
 * - D1 / REQ-SESS-01 — Sure tokens / API keys never enter browser traffic:
 *   server credentials attach here and `Set-Cookie` never propagates back.
 *
 * Safe-retry rule: idempotent methods (GET/PUT/DELETE) retry exactly once
 * on network failure, timeout, or 502/503/504. POST/PATCH never auto-retry,
 * and 4xx/429 are propagated (with `Retry-After`) rather than retried. The
 * auth refresh retry-once rule (REQ-AUTH-05) lives with the session work in
 * `t_alt_fnd_007`, not here.
 *
 * Generated-contract validation (`t_alt_fnd_018`, Orval/Zod from
 * `docs/api/openapi.yaml` via `./api/bff-contracts.server`): every
 * allow-listed operation validates outgoing path/query/body data before
 * dispatch and upstream success/error data before forwarding. Contracts are
 * gates, never transforms — forwarding stays byte-identical — and every
 * violation fails closed with a redacted `BffError` (`code: "contract"`).
 * No hand-written schemas exist here; the only hand-owned shape is the
 * SSRF route/method allow-list in `./bff-policy`, which a coverage test
 * pins to the generated registry.
 */
import { getSureApiOrigin } from "./sure-api.server";
import {
	getOperationContract,
	validateBffRequest,
	validateUpstreamResponse,
} from "./api/bff-contracts.server";
import { isApiError } from "./api/client";
import {
	BFF_DEFAULT_TIMEOUT_MS,
	BFF_MAX_ATTEMPTS,
	BFF_MAX_REQUEST_BYTES,
	BFF_MAX_RESPONSE_BYTES,
	BFF_REQUEST_ID_HEADER,
	BffError,
	checkBffMutationGuards,
	coerceBffPrimitiveStrings,
	decodeBffQueryObject,
	filterBffRequestHeaders,
	filterBffResponseHeaders,
	isIdempotentMethod,
	isRetryableUpstreamStatus,
	parseBffRetryAfterMs,
	resolveBffRequestId,
	safeUpstreamMessage,
	bffNoStoreHeaders,
	validateBffContentType,
	validateBffMethod,
	validateBffPath,
	validateBffQuery,
} from "./bff-policy";
import type { BffMethod } from "./bff-policy";

/** Header values accepted from the inbound browser request. */
export type BffHeadersInit = Headers | Record<string, string> | [string, string][];

/** Upstream body shapes the transport forwards (sized when measurable). */
export type BffBodyInit =
	| string
	| ArrayBuffer
	| Uint8Array
	| Blob
	| FormData
	| ReadableStream<Uint8Array>;

/** Server-side credentials attached to the upstream request (never logged). */
export interface BffUpstreamAuth {
	/** Per-session Sure OAuth access token (session work, `t_alt_fnd_007`). */
	readonly bearerToken?: string | undefined;
	/** Deployment BFF-to-Rails API key (from `getSureApiKey()`). */
	readonly apiKey?: string | undefined;
}

export type BffResponseMode = "buffer" | "stream";

export interface BffProxyRequest {
	readonly method: string;
	readonly path: string;
	readonly query?: string | undefined;
	readonly headers?: BffHeadersInit | undefined;
	/** Body forwarded upstream; sized bodies are capped before sending. */
	readonly body?: BffBodyInit | null | undefined;
	/** Inbound `Origin` header value for mutation guards (REQ-TRAN-01). */
	readonly origin?: string | null | undefined;
	/** Inbound anti-CSRF token header value (REQ-TRAN-01). */
	readonly csrfToken?: string | null | undefined;
	/** The BFF's own origin for same-origin comparison. */
	readonly bffOrigin: string;
	/** `"buffer"` (default) or bounded `"stream"` download. */
	readonly response?: BffResponseMode | undefined;
	readonly timeoutMs?: number | undefined;
	readonly signal?: AbortSignal | undefined;
	readonly auth?: BffUpstreamAuth | undefined;
}

export interface BffProxyResult {
	readonly status: number;
	readonly headers: Headers;
	readonly requestId: string;
	readonly attempts: number;
	/** Buffered bytes, or a byte-capped stream in `"stream"` mode. */
	readonly body: ArrayBuffer | ReadableStream<Uint8Array>;
}

export interface BffProxyDeps {
	readonly fetchImpl?: typeof fetch | undefined;
	/** Fixed upstream origin override (tests); defaults to `getSureApiOrigin()`. */
	readonly upstreamOrigin?: string | undefined;
}

const ERROR_BODY_CAP = 64 * 1024;

/**
 * Server-only accessor for the optional deployment BFF-to-Rails API key.
 * Empty/missing means "no deployment key" (per-session bearer auth only).
 * Never import (transitively) from client components.
 */
export function getSureApiKey(): string | undefined {
	const raw = process.env["SURE_API_KEY"];
	if (raw === undefined || raw.trim() === "") {
		return undefined;
	}
	return raw.trim();
}

function bodyByteLength(body: BffBodyInit | null | undefined): number | undefined {
	if (body === undefined || body === null) {
		return 0;
	}
	if (typeof body === "string") {
		return new TextEncoder().encode(body).length;
	}
	if (body instanceof Uint8Array) {
		return body.byteLength;
	}
	if (body instanceof ArrayBuffer) {
		return body.byteLength;
	}
	if (typeof Blob !== "undefined" && body instanceof Blob) {
		return body.size;
	}
	return undefined;
}

function toUpstreamBody(body: BffBodyInit | null | undefined): BffBodyInit | null | undefined {
	if (body === undefined) {
		return undefined;
	}
	return body;
}

async function readWithCap(response: Response, cap: number): Promise<ArrayBuffer> {
	const contentLength = response.headers.get("Content-Length");
	if (contentLength !== null && Number(contentLength) > cap) {
		void response.body?.cancel().catch(() => undefined);
		throw new Error("response_too_large");
	}
	if (response.body === null) {
		return new ArrayBuffer(0);
	}
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			total += value.byteLength;
			if (total > cap) {
				throw new Error("response_too_large");
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return merged.buffer;
}

function capStream(
	stream: ReadableStream<Uint8Array>,
	cap: number,
	onExhausted: () => void,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	let total = 0;
	return new ReadableStream<Uint8Array>({
		async pull(controller): Promise<void> {
			const { done, value } = await reader.read();
			if (done) {
				controller.close();
				reader.releaseLock();
				return;
			}
			total += value.byteLength;
			if (total > cap) {
				onExhausted();
				controller.error(new Error("response_too_large"));
				void reader.cancel().catch(() => undefined);
				reader.releaseLock();
				return;
			}
			controller.enqueue(value);
		},
		async cancel(): Promise<void> {
			await reader.cancel().catch(() => undefined);
			reader.releaseLock();
		},
	});
}

function buildBrowserHeaders(upstream: Headers, requestId: string): Headers {
	const headers = filterBffResponseHeaders(upstream);
	const noStore = bffNoStoreHeaders();
	for (const [name, value] of Object.entries(noStore)) {
		headers.set(name, value);
	}
	headers.set(BFF_REQUEST_ID_HEADER, requestId);
	return headers;
}

/** Caller-abort check behind a function boundary (defeats narrowing). */
function isCallerAborted(signal: AbortSignal | undefined): boolean {
	return signal?.aborted === true;
}

function throwForCallerAbort(requestId: string): never {
	throw new BffError({
		code: "aborted",
		status: 499,
		message: "Request was aborted.",
		requestId,
	});
}

function throwForTimeout(requestId: string): never {
	throw new BffError({
		code: "timeout",
		status: 504,
		message: "Upstream request timed out.",
		requestId,
	});
}

function isJsonContentType(contentType: string | null): boolean {
	if (contentType === null) {
		return false;
	}
	return contentType.split(";")[0]?.trim().toLowerCase() === "application/json";
}

/** Map a generated-contract `ApiError` to the transport's redacted `BffError`. */
function toContractError(requestId: string, status: number, message: string): BffError {
	return new BffError({ code: "contract", status, message, requestId });
}

type DecodedBody =
	| { readonly ok: true; readonly present: false }
	| { readonly ok: true; readonly present: true; readonly data: unknown }
	| { readonly ok: false; readonly message: string };

/**
 * Decode the outbound body into contract input. JSON travels as text in
 * string/bytes/Blob shapes; multipart travels as `FormData` fields (file
 * parts stay `Blob`s for `instanceof(Blob)` parsers). Streams cannot be
 * validated and fail closed.
 */
async function decodeContractBody(
	body: BffBodyInit | null | undefined,
	contentType: string | undefined,
): Promise<DecodedBody> {
	if (body === undefined || body === null) {
		return { ok: true, present: false };
	}
	if (typeof contentType === "string" && contentType.toLowerCase().startsWith("multipart/")) {
		if (body instanceof FormData) {
			const fields: Record<string, unknown> = {};
			body.forEach((value, key) => {
				fields[key] = value;
			});
			return { ok: true, present: true, data: fields };
		}
		return { ok: false, message: "Multipart bodies must be FormData." };
	}
	if (body instanceof FormData || body instanceof ReadableStream) {
		return { ok: false, message: "Request body shape cannot be contract-validated." };
	}
	let text: string;
	if (typeof body === "string") {
		text = body;
	} else if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
		text = new TextDecoder().decode(body);
	} else {
		try {
			text = await body.text();
		} catch {
			return { ok: false, message: "Request body could not be read." };
		}
	}
	try {
		return { ok: true, present: true, data: JSON.parse(text) };
	} catch {
		return { ok: false, message: "Request body is not valid JSON." };
	}
}

/**
 * Validate outgoing path/query/body data against the generated operation
 * contract (`t_alt_fnd_018`). Runs the raw wire-decoded values first, then
 * a JSON-primitive-coerced fallback (query strings and multipart fields are
 * stringly-typed on the wire); the generated parser is the authority in
 * both passes. Header validation is the forwarding allow-list
 * (`filterBffRequestHeaders`) — no operation documents header parsers.
 */
async function validateOutgoingRequest(args: {
	readonly method: BffMethod;
	readonly template: string;
	readonly pathParams: Record<string, string>;
	readonly query: string;
	readonly contentType: string | undefined;
	readonly body: BffBodyInit | null | undefined;
	readonly requestId: string;
}): Promise<void> {
	if (getOperationContract(args.method, args.template) === undefined) {
		throw toContractError(args.requestId, 500, "Upstream contract unavailable.");
	}
	const decoded = await decodeContractBody(args.body, args.contentType);
	if (!decoded.ok) {
		throw toContractError(args.requestId, 400, decoded.message);
	}
	const queryObject = decodeBffQueryObject(args.query);
	const rawInput = {
		pathParams: args.pathParams,
		query: queryObject,
		...(decoded.present ? { body: decoded.data } : {}),
	};
	try {
		validateBffRequest(args.method, args.template, rawInput, args.requestId);
		return;
	} catch (error) {
		if (!isApiError(error) || error.kind !== "contract") {
			throw error;
		}
	}
	const coercedInput = {
		pathParams: coerceBffPrimitiveStrings(args.pathParams),
		query: coerceBffPrimitiveStrings(queryObject),
		...(decoded.present ? { body: coerceBffPrimitiveStrings(decoded.data) } : {}),
	};
	try {
		validateBffRequest(args.method, args.template, coercedInput, args.requestId);
	} catch (error) {
		if (isApiError(error) && error.kind === "contract") {
			throw toContractError(args.requestId, 400, error.message);
		}
		throw error;
	}
}

function parseJsonSafely(text: string): unknown {
	if (text === "") {
		return "";
	}
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

/**
 * Validate a buffered upstream success payload before forwarding (gate, not
 * transform: the original bytes forward unchanged). Throws a generic
 * redacted `contract` error on violation — malformed upstream data never
 * reaches the browser.
 */
function validateUpstreamBytes(args: {
	readonly method: BffMethod;
	readonly template: string;
	readonly status: number;
	readonly bytes: ArrayBuffer;
	readonly contentType: string | null;
	readonly requestId: string;
}): void {
	const text = args.bytes.byteLength === 0 ? "" : new TextDecoder().decode(args.bytes);
	let data: unknown = text;
	if (text !== "") {
		if (!isJsonContentType(args.contentType)) {
			throw toContractError(args.requestId, 502, "Upstream response failed contract validation.");
		}
		try {
			data = JSON.parse(text);
		} catch {
			throw toContractError(args.requestId, 502, "Upstream response failed contract validation.");
		}
	}
	try {
		validateUpstreamResponse(args.method, args.template, args.status, data, args.requestId);
	} catch (error) {
		if (isApiError(error) && error.kind === "contract") {
			throw toContractError(args.requestId, 502, "Upstream response failed contract validation.");
		}
		throw error;
	}
}

function streamOfBytes(bytes: ArrayBuffer): ReadableStream<Uint8Array> {
	const view = new Uint8Array(bytes);
	return new ReadableStream<Uint8Array>({
		start(controller): void {
			controller.enqueue(view);
			controller.close();
		},
	});
}

/**
 * Proxy one browser request to the fixed Sure API origin.
 *
 * Throws `BffError` (safe for browser delivery via `toSafeBody()`) for every
 * policy rejection, timeout, abort, size violation, network failure, and
 * upstream error status. Upstream `2xx` resolves with status, filtered
 * headers (`private, no-store` always applied), and the body.
 */
export async function proxyToSureApi(
	request: BffProxyRequest,
	deps?: BffProxyDeps,
): Promise<BffProxyResult> {
	const fetchImpl: typeof fetch = deps?.fetchImpl ?? fetch;
	const upstreamOrigin = deps?.upstreamOrigin ?? getSureApiOrigin();
	const timeoutMs = request.timeoutMs ?? BFF_DEFAULT_TIMEOUT_MS;
	const responseMode: BffResponseMode = request.response ?? "buffer";

	const inboundHeaders = new Headers(request.headers);
	const requestId = resolveBffRequestId(inboundHeaders);

	const pathResult = validateBffPath(request.path);
	if (!pathResult.ok) {
		throw new BffError({
			code: pathResult.code,
			status: pathResult.code === "bad_method" ? 405 : 400,
			message: pathResult.message,
			requestId,
		});
	}
	const methodResult = validateBffMethod(request.method, pathResult.methods);
	if (!methodResult.ok) {
		throw new BffError({
			code: "bad_method",
			status: 405,
			message: methodResult.message,
			requestId,
		});
	}
	const method: BffMethod = methodResult.method;

	const queryResult = validateBffQuery(request.query);
	if (!queryResult.ok) {
		throw new BffError({
			code: queryResult.code,
			status: 400,
			message: queryResult.message,
			requestId,
		});
	}

	const hasBody = request.body !== undefined && request.body !== null;
	const contentTypeResult = validateBffContentType(inboundHeaders.get("Content-Type"), hasBody);
	if (!contentTypeResult.ok) {
		throw new BffError({
			code: contentTypeResult.code,
			status: 415,
			message: contentTypeResult.message,
			requestId,
		});
	}

	const guard = checkBffMutationGuards({
		method,
		origin: request.origin,
		csrfToken: request.csrfToken,
		bffOrigin: request.bffOrigin,
	});
	if (!guard.ok) {
		throw new BffError({
			code: guard.code,
			status: 403,
			message: guard.message,
			requestId,
		});
	}

	const knownSize = bodyByteLength(request.body);
	if (knownSize !== undefined && knownSize > BFF_MAX_REQUEST_BYTES) {
		throw new BffError({
			code: "payload_too_large",
			status: 413,
			message: "Request body is too large.",
			requestId,
		});
	}

	// Generated-contract gate on outgoing data (t_alt_fnd_018). GET/DELETE
	// never forward a body, so there is nothing to validate for them.
	await validateOutgoingRequest({
		method,
		template: pathResult.template,
		pathParams: pathResult.pathParams,
		query: queryResult.query,
		contentType: contentTypeResult.contentType,
		body: method === "GET" || method === "DELETE" ? undefined : request.body,
		requestId,
	});

	const isBinaryDownload =
		getOperationContract(method, pathResult.template)?.isBinaryDownload === true;

	const upstreamHeaders = filterBffRequestHeaders(inboundHeaders);
	upstreamHeaders.set(BFF_REQUEST_ID_HEADER, requestId);
	if (request.auth?.bearerToken !== undefined && request.auth.bearerToken !== "") {
		upstreamHeaders.set("Authorization", `Bearer ${request.auth.bearerToken}`);
	} else if (request.auth?.apiKey !== undefined && request.auth.apiKey !== "") {
		upstreamHeaders.set("X-Api-Key", request.auth.apiKey);
	}

	const url = `${upstreamOrigin}${pathResult.path}${queryResult.query}`;
	const idempotent = isIdempotentMethod(method);
	let attempts = 0;
	let lastNetworkError: unknown;

	while (attempts < BFF_MAX_ATTEMPTS) {
		attempts += 1;
		if (isCallerAborted(request.signal)) {
			throwForCallerAbort(requestId);
		}
		const timeoutSignal = AbortSignal.timeout(timeoutMs);
		const combinedSignal =
			request.signal === undefined
				? timeoutSignal
				: AbortSignal.any([request.signal, timeoutSignal]);

		let upstream: Response;
		try {
			const outbound: RequestInit = {
				method,
				headers: upstreamHeaders,
				signal: combinedSignal,
				redirect: "manual",
				credentials: "omit",
			};
			const outboundBody =
				method === "GET" || method === "DELETE" ? undefined : toUpstreamBody(request.body);
			if (outboundBody !== undefined) {
				// eslint-disable-next-line typescript/no-unsafe-type-assertion -- Narrowing boundary: BffBodyInit members (string, ArrayBuffer, TypedArray, Blob, FormData, stream) are all valid undici BodyInit shapes; the local alias exists because DOM lib types are unavailable in the server project.
				outbound.body = outboundBody as Exclude<RequestInit["body"], undefined>;
			}
			upstream = await fetchImpl(url, outbound);
		} catch (error) {
			if (isCallerAborted(request.signal)) {
				throwForCallerAbort(requestId);
			}
			const name =
				error !== null && typeof error === "object"
					? (error as { name?: unknown }).name
					: undefined;
			if (name === "TimeoutError" || timeoutSignal.aborted) {
				if (idempotent && attempts < BFF_MAX_ATTEMPTS) {
					lastNetworkError = error;
					continue;
				}
				throwForTimeout(requestId);
			}
			if (idempotent && attempts < BFF_MAX_ATTEMPTS) {
				lastNetworkError = error;
				continue;
			}
			throw new BffError({
				code: "network",
				status: 502,
				message: "Upstream request failed.",
				requestId,
			});
		}

		if (upstream.status === 429) {
			const retryAfterMs = parseBffRetryAfterMs(upstream.headers.get("Retry-After"));
			void upstream.body?.cancel().catch(() => undefined);
			throw new BffError({
				code: "rate_limited",
				status: 429,
				message: "Rate limit exceeded. Retry later.",
				requestId,
				retryAfterMs,
			});
		}

		if (upstream.ok) {
			const headers = buildBrowserHeaders(upstream.headers, requestId);
			if (responseMode === "stream" && isBinaryDownload) {
				const declared = upstream.headers.get("Content-Length");
				if (declared !== null && Number(declared) > BFF_MAX_RESPONSE_BYTES) {
					void upstream.body?.cancel().catch(() => undefined);
					throw new BffError({
						code: "payload_too_large",
						status: 502,
						message: "Upstream response is too large.",
						requestId,
					});
				}
				if (upstream.body === null) {
					return {
						status: upstream.status,
						headers,
						requestId,
						attempts,
						body: new ArrayBuffer(0),
					};
				}
				const stream = capStream(upstream.body, BFF_MAX_RESPONSE_BYTES, () => undefined);
				return { status: upstream.status, headers, requestId, attempts, body: stream };
			}
			let body: ArrayBuffer;
			try {
				body = await readWithCap(upstream, BFF_MAX_RESPONSE_BYTES);
			} catch {
				throw new BffError({
					code: "payload_too_large",
					status: 502,
					message: "Upstream response is too large.",
					requestId,
				});
			}
			// Contract gate on upstream data (binary downloads bypass JSON
			// validation for 2xx per the generated `isBinaryDownload` rule).
			// Stream mode over JSON re-streams the validated original bytes.
			if (!isBinaryDownload) {
				validateUpstreamBytes({
					method,
					template: pathResult.template,
					status: upstream.status,
					bytes: body,
					contentType: upstream.headers.get("Content-Type"),
					requestId,
				});
			}
			if (responseMode === "stream") {
				return { status: upstream.status, headers, requestId, attempts, body: streamOfBytes(body) };
			}
			return { status: upstream.status, headers, requestId, attempts, body };
		}

		if (idempotent && isRetryableUpstreamStatus(upstream.status) && attempts < BFF_MAX_ATTEMPTS) {
			void upstream.body?.cancel().catch(() => undefined);
			continue;
		}

		const errorText = await readUpstreamErrorText(upstream);
		try {
			validateUpstreamResponse(
				method,
				pathResult.template,
				upstream.status,
				parseJsonSafely(errorText),
				requestId,
			);
		} catch (error) {
			if (isApiError(error) && error.kind === "contract") {
				throw toContractError(requestId, 502, "Upstream error failed contract validation.");
			}
			throw error;
		}
		throw new BffError({
			code: "upstream",
			status: upstream.status,
			message: safeUpstreamMessage(upstream.status, errorText),
			requestId,
		});
	}

	if (lastNetworkError !== undefined) {
		throw new BffError({
			code: "network",
			status: 502,
			message: "Upstream request failed.",
			requestId,
		});
	}
	return throwForTimeout(requestId);
}

async function readUpstreamErrorText(upstream: Response): Promise<string> {
	try {
		const text = await upstream.text();
		return text.slice(0, ERROR_BODY_CAP);
	} catch {
		return "";
	}
}
