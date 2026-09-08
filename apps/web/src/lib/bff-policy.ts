/**
 * Pure BFF request policy for the Sure API transport.
 *
 * Client-safe (no Node imports, no `process.env`): both the TanStack Start
 * server executor (`sure-api-bff.server.ts`) and unit tests import from here.
 *
 * ADR-0001 traceability (docs/adr/0001-browser-auth-bff-threat-model.md):
 * - REQ-TRAN-01 — mutations require anti-CSRF token + same-origin checks.
 * - REQ-TRAN-03 — SSRF allow-list: relative `/api/v1/*` paths only; absolute
 *   URLs, escapes, and forwarded-header overrides rejected.
 * - REQ-TRAN-05 — authenticated responses are `private, no-store`.
 * - REQ-OPS-01 — structured, redacted errors only; no credentials in logs.
 *
 * The allow-list below mirrors the operations documented in
 * `docs/api/openapi.yaml` (73 paths). When the contract gains an endpoint,
 * add its path + methods here and in the server executor tests; the typed
 * browser client (`api/client.ts`) stays compile-time checked by
 * `openapi-typescript`, while this list is the runtime SSRF gate.
 */

export const BFF_API_PREFIX = "/api/v1/";

export const BFF_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** HTTP methods the BFF accepts (per-path allow-list decides per route). */
export type BffMethod = (typeof BFF_METHODS)[number];

/** Request content types the BFF forwards (observed in `docs/api/openapi.yaml`). */
export const BFF_ALLOWED_REQUEST_CONTENT_TYPES = [
	"application/json",
	"multipart/form-data",
] as const;

/** Request headers forwarded upstream (everything else is stripped). */
export const BFF_FORWARDED_REQUEST_HEADERS = [
	"accept",
	"accept-language",
	"content-type",
	"x-request-id",
] as const;

/**
 * Headers that must never influence the upstream request. The edge reverse
 * proxy re-sets forwarding headers; inbound values are attacker-controlled
 * (ADR-0001 B3/D6, REQ-TRAN-03).
 */
export const BFF_STRIPPED_REQUEST_HEADERS = [
	"host",
	"x-forwarded-host",
	"x-forwarded-proto",
	"x-forwarded-for",
	"x-forwarded-port",
	"x-forwarded-prefix",
	"x-real-ip",
	"forwarded",
	"cookie",
	"authorization",
	"x-api-key",
	"connection",
	"transfer-encoding",
	"keep-alive",
	"upgrade",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
] as const;

/** Response headers propagated from upstream to the browser. */
export const BFF_FORWARDED_RESPONSE_HEADERS = [
	"content-type",
	"content-disposition",
	"content-length",
	"retry-after",
	"x-request-id",
	"ratelimit-limit",
	"ratelimit-remaining",
	"ratelimit-reset",
	"etag",
] as const;

/** Header carrying the per-request correlation id (matches `api/client.ts`). */
export const BFF_REQUEST_ID_HEADER = "X-Request-Id";

/** Anti-CSRF token header required for mutations (REQ-TRAN-01). */
export const BFF_CSRF_HEADER = "x-csrf-token";

export const BFF_DEFAULT_TIMEOUT_MS = 15_000;
export const BFF_MAX_REQUEST_BYTES = 10 * 1024 * 1024;
export const BFF_MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
export const BFF_MAX_QUERY_CHARS = 4096;
export const BFF_MAX_PATH_CHARS = 2048;

/**
 * Conservative multipart framing allowances for pre-flight sizing: per-part
 * headers (`Content-Disposition`, filenames, `Content-Type` lines, CRLFs)
 * plus a boundary share. Deliberately overestimates — the estimate is a
 * fail-closed gate, never a wire format.
 */
export const BFF_MULTIPART_PART_OVERHEAD_BYTES = 512;
export const BFF_MULTIPART_TOTAL_OVERHEAD_BYTES = 1024;

/**
 * Conservatively estimate an upload's wire size without buffering content:
 * encoded field names, string bytes, Blob/File payload sizes, file
 * metadata (filenames, MIME types — both serialize into the framing, so a
 * zero-byte File with a long name is mostly headers), plus framing
 * overhead. Sized `Blob`/`File` parts keep `FormData` forwarding
 * stream-friendly — only sizes and metadata strings are read here, never
 * bytes — which makes bounded multipart Blob/File the supported streaming
 * upload path (raw `ReadableStream` bodies stay fail-closed: they cannot be
 * contract-validated).
 *
 * The estimate must never undershoot the serialized bytes: per-part framing
 * (generated boundary lines, `Content-Disposition`, `Content-Type`,
 * CRLFs) is covered by `BFF_MULTIPART_PART_OVERHEAD_BYTES` on top of the
 * explicitly counted names, filenames, types, and payloads.
 */
export function estimateFormDataSize(form: FormData): number {
	const encoder = new TextEncoder();
	let total = BFF_MULTIPART_TOTAL_OVERHEAD_BYTES;
	form.forEach((value, key) => {
		total += encoder.encode(key).length + BFF_MULTIPART_PART_OVERHEAD_BYTES;
		if (typeof value === "string") {
			total += encoder.encode(value).length;
		} else {
			total += value.size;
			total += encoder.encode(value.type).length;
			if (value instanceof File) {
				total += encoder.encode(value.name).length;
			}
		}
	});
	return total;
}

/** Idempotent methods eligible for one safe retry (never POST/PATCH). */
export function isIdempotentMethod(method: BffMethod): boolean {
	return method === "GET" || method === "PUT" || method === "DELETE";
}

/** State-changing methods guarded by CSRF + same-origin checks (REQ-TRAN-01). */
export function isMutationMethod(method: BffMethod): boolean {
	return method !== "GET";
}

/** Upstream statuses eligible for one retry of an idempotent request. */
export function isRetryableUpstreamStatus(status: number): boolean {
	return status === 502 || status === 503 || status === 504;
}

/** Maximum upstream attempts: the initial try plus exactly one retry. */
export const BFF_MAX_ATTEMPTS = 2;

interface AllowEntry {
	readonly source: string;
	readonly methods: ReadonlySet<BffMethod>;
	readonly exact: boolean;
	readonly pattern?: RegExp | undefined;
	readonly segments: readonly string[];
}

function entry(source: string, methods: readonly BffMethod[]): AllowEntry {
	const segments = source.split("/");
	if (!source.includes("{")) {
		return { source, methods: new Set(methods), exact: true, segments };
	}
	const patternSource = `^${segments
		.map((segment) =>
			segment.startsWith("{") && segment.endsWith("}")
				? "[^/]+"
				: segment.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"),
		)
		.join("/")}$`;
	return {
		source,
		methods: new Set(methods),
		exact: false,
		pattern: new RegExp(patternSource),
		segments,
	};
}

/**
 * Allow-listed Sure API routes with their documented methods, derived from
 * `docs/api/openapi.yaml` (REQ-TRAN-03). Exact literals win over parameter
 * patterns during matching (e.g. `/syncs/latest` before `/syncs/{id}`).
 */
const ALLOW_ENTRIES: readonly AllowEntry[] = [
	entry("/api/v1/accounts", ["GET", "POST"]),
	entry("/api/v1/accounts/{id}", ["GET"]),
	entry("/api/v1/auth/signup", ["POST"]),
	entry("/api/v1/auth/login", ["POST"]),
	entry("/api/v1/auth/logout", ["POST"]),
	entry("/api/v1/auth/sso_exchange", ["POST"]),
	entry("/api/v1/auth/refresh", ["POST"]),
	entry("/api/v1/auth/sso_link", ["POST"]),
	entry("/api/v1/auth/sso_create_account", ["POST"]),
	entry("/api/v1/auth/enable_ai", ["PATCH"]),
	entry("/api/v1/balance_sheet", ["GET"]),
	entry("/api/v1/balances", ["GET"]),
	entry("/api/v1/balances/{id}", ["GET"]),
	entry("/api/v1/budget_categories", ["GET"]),
	entry("/api/v1/budget_categories/{id}", ["GET"]),
	entry("/api/v1/budgets", ["GET"]),
	entry("/api/v1/budgets/{id}", ["GET"]),
	entry("/api/v1/categories", ["GET", "POST"]),
	entry("/api/v1/categories/{id}", ["GET"]),
	entry("/api/v1/chats", ["GET", "POST"]),
	entry("/api/v1/chats/{id}", ["GET", "PATCH", "DELETE"]),
	entry("/api/v1/chats/{chat_id}/messages", ["POST"]),
	entry("/api/v1/chats/{chat_id}/messages/retry", ["POST"]),
	entry("/api/v1/family_exports", ["GET", "POST"]),
	entry("/api/v1/family_exports/{id}", ["GET"]),
	entry("/api/v1/family_exports/{id}/download", ["GET"]),
	entry("/api/v1/family_settings", ["GET"]),
	entry("/api/v1/holdings", ["GET"]),
	entry("/api/v1/holdings/{id}", ["GET"]),
	entry("/api/v1/import_sessions", ["POST"]),
	entry("/api/v1/import_sessions/{id}", ["GET"]),
	entry("/api/v1/import_sessions/{id}/chunks", ["POST"]),
	entry("/api/v1/import_sessions/{id}/publish", ["POST"]),
	entry("/api/v1/imports", ["GET", "POST"]),
	entry("/api/v1/imports/{id}", ["GET"]),
	entry("/api/v1/imports/{id}/rows", ["GET"]),
	entry("/api/v1/imports/preflight", ["POST"]),
	entry("/api/v1/insights", ["GET"]),
	entry("/api/v1/merchants", ["GET", "POST"]),
	entry("/api/v1/merchants/import", ["POST"]),
	entry("/api/v1/merchants/{id}", ["GET", "PATCH", "DELETE"]),
	entry("/api/v1/provider_connections", ["GET"]),
	entry("/api/v1/push_subscriptions", ["POST"]),
	entry("/api/v1/push_subscriptions/{id}", ["DELETE"]),
	entry("/api/v1/recurring_transactions", ["GET", "POST"]),
	entry("/api/v1/recurring_transactions/{id}", ["GET", "PATCH", "DELETE"]),
	entry("/api/v1/rejected_transfers", ["GET"]),
	entry("/api/v1/rejected_transfers/{id}", ["GET"]),
	entry("/api/v1/rule_runs", ["GET"]),
	entry("/api/v1/rule_runs/{id}", ["GET"]),
	entry("/api/v1/rules", ["GET"]),
	entry("/api/v1/rules/{id}", ["GET"]),
	entry("/api/v1/securities", ["GET"]),
	entry("/api/v1/securities/{id}", ["GET"]),
	entry("/api/v1/security_prices", ["GET"]),
	entry("/api/v1/security_prices/{id}", ["GET"]),
	entry("/api/v1/syncs", ["GET"]),
	entry("/api/v1/syncs/latest", ["GET"]),
	entry("/api/v1/syncs/{id}", ["GET"]),
	entry("/api/v1/tags", ["GET", "POST"]),
	entry("/api/v1/tags/{id}", ["GET", "PATCH", "DELETE"]),
	entry("/api/v1/trades", ["GET", "POST"]),
	entry("/api/v1/trades/{id}", ["GET", "PATCH", "DELETE"]),
	entry("/api/v1/transactions/{transaction_id}/split", ["POST"]),
	entry("/api/v1/transactions", ["GET", "POST"]),
	entry("/api/v1/transactions/{id}", ["GET", "PATCH", "DELETE"]),
	entry("/api/v1/transfers", ["GET"]),
	entry("/api/v1/transfers/{id}", ["GET"]),
	entry("/api/v1/users/reset", ["DELETE"]),
	entry("/api/v1/users/reset/status", ["GET"]),
	entry("/api/v1/users/me", ["DELETE"]),
	entry("/api/v1/valuations", ["GET", "POST"]),
	entry("/api/v1/valuations/{id}", ["GET", "PATCH"]),
];

interface AllowMatch {
	readonly entry: AllowEntry;
	readonly pathParams: Record<string, string>;
}

function matchAllowEntry(path: string): AllowMatch | undefined {
	for (const candidate of ALLOW_ENTRIES) {
		if (candidate.exact && candidate.source === path) {
			return { entry: candidate, pathParams: {} };
		}
	}
	for (const candidate of ALLOW_ENTRIES) {
		if (!candidate.exact && candidate.pattern?.test(path) === true) {
			return { entry: candidate, pathParams: extractPathParams(candidate.segments, path) };
		}
	}
	return undefined;
}

/**
 * Pair template segments (`{id}`) with concrete segments. The path passed
 * every SSRF gate already (no escapes, no encoded slashes), so per-segment
 * decoding cannot smuggle separators.
 */
function extractPathParams(
	templateSegments: readonly string[],
	concretePath: string,
): Record<string, string> {
	const params: Record<string, string> = {};
	const concreteSegments = concretePath.split("/");
	for (let index = 0; index < templateSegments.length; index += 1) {
		const template = templateSegments[index];
		if (template !== undefined && template.startsWith("{") && template.endsWith("}")) {
			const name = template.slice(1, -1);
			const raw = concreteSegments[index] ?? "";
			try {
				params[name] = decodeURIComponent(raw);
			} catch {
				params[name] = raw;
			}
		}
	}
	return params;
}

/**
 * Enumerate the allow-list for coverage checks (e.g. proving every entry
 * resolves to a generated operation contract). Templates, not concrete paths.
 */
export function listBffAllowList(): {
	readonly template: string;
	readonly methods: readonly BffMethod[];
}[] {
	return ALLOW_ENTRIES.map((candidate) => ({
		template: candidate.source,
		methods: [...candidate.methods],
	}));
}

export type BffPolicyErrorCode = "bad_path" | "bad_method" | "bad_content_type" | "bad_query";

export interface BffPathOk {
	readonly ok: true;
	/** Validated path, forwarded verbatim (percent-encoding preserved). */
	readonly path: string;
	readonly methods: readonly BffMethod[];
	/** OpenAPI path template (e.g. `/api/v1/tags/{id}`) for contract lookup. */
	readonly template: string;
	/** Decoded parameter segments keyed by template name. */
	readonly pathParams: Record<string, string>;
}

export interface BffPolicyFailure {
	readonly ok: false;
	readonly code: BffPolicyErrorCode;
	readonly message: string;
}

export type BffPathResult = BffPathOk | BffPolicyFailure;

const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const ENCODED_SLASH_PATTERN = /%2f|%5c/i;

/** Control-character check without a control-char regex (lint-clean). */
function hasControlChars(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code <= 0x1f || code === 0x7f) {
			return true;
		}
	}
	return false;
}

function fail(code: BffPolicyErrorCode, message: string): BffPolicyFailure {
	return { ok: false, code, message };
}

/**
 * Validate a browser-supplied BFF path (REQ-TRAN-03 / T-SSRF).
 *
 * Rejects: non-strings, absolute URLs (`https://…`, `//evil`), schemes,
 * backslashes, query/fragment smuggling (`?`, `#`), control characters,
 * encoded slashes (`%2F`, `%5C`), malformed percent-encoding, dot-segment or
 * empty-segment escapes, non-`/api/v1/` prefixes, and paths outside the
 * allow-list. Returns the allow-listed route's methods so the caller can
 * enforce the method gate without a second lookup.
 */
export function validateBffPath(rawPath: unknown): BffPathResult {
	if (typeof rawPath !== "string" || rawPath === "") {
		return fail("bad_path", "Request path must be a non-empty string.");
	}
	if (rawPath.length > BFF_MAX_PATH_CHARS) {
		return fail("bad_path", "Request path is too long.");
	}
	if (
		rawPath.startsWith("//") ||
		rawPath.includes("://") ||
		SCHEME_PATTERN.test(rawPath) ||
		rawPath.includes("\\") ||
		rawPath.includes("?") ||
		rawPath.includes("#") ||
		hasControlChars(rawPath) ||
		/[ \t]/.test(rawPath)
	) {
		return fail("bad_path", "Request path must be a relative API path.");
	}
	if (ENCODED_SLASH_PATTERN.test(rawPath)) {
		return fail("bad_path", "Request path must not contain encoded slashes.");
	}
	let decoded: string;
	try {
		decoded = decodeURIComponent(rawPath);
	} catch {
		return fail("bad_path", "Request path has invalid percent-encoding.");
	}
	if (
		decoded.includes("\\") ||
		decoded.includes("?") ||
		decoded.includes("#") ||
		hasControlChars(decoded)
	) {
		return fail("bad_path", "Request path must be a relative API path.");
	}
	const segments = decoded.split("/");
	// Leading "" is the root slash; every other segment must be non-empty
	// (no `//`, no trailing `/`) and must not be a dot-segment escape.
	for (let index = 1; index < segments.length; index += 1) {
		const segment = segments[index];
		if (segment === undefined || segment === "" || segment === "." || segment === "..") {
			return fail("bad_path", "Request path must not contain escapes.");
		}
	}
	if (!decoded.startsWith(BFF_API_PREFIX)) {
		return fail("bad_path", "Request path must start with /api/v1/.");
	}
	const allowed = matchAllowEntry(decoded);
	if (allowed === undefined) {
		return fail("bad_path", "Request path is not allow-listed.");
	}
	return {
		ok: true,
		path: rawPath,
		methods: [...allowed.entry.methods],
		template: allowed.entry.source,
		pathParams: allowed.pathParams,
	};
}

/** Validate the HTTP method and its pairing with an allow-listed path. */
export function validateBffMethod(
	rawMethod: unknown,
	allowedMethods: readonly BffMethod[],
): { readonly ok: true; readonly method: BffMethod } | BffPolicyFailure {
	if (typeof rawMethod !== "string") {
		return fail("bad_method", "Request method is not allowed.");
	}
	const method = BFF_METHODS.find((candidate) => candidate === rawMethod);
	if (method === undefined) {
		return fail("bad_method", "Request method is not allowed.");
	}
	if (!allowedMethods.includes(method)) {
		return fail("bad_method", `Method ${method} is not allowed for this path.`);
	}
	return { ok: true, method };
}

/**
 * Validate the request content type (REQ-TRAN-03). Bodyless requests need no
 * content type; requests with a body must declare an allow-listed one.
 * Parameters (e.g. multipart `boundary`) are permitted after the `;`.
 */
export function validateBffContentType(
	rawContentType: unknown,
	hasBody: boolean,
): { readonly ok: true; readonly contentType: string | undefined } | BffPolicyFailure {
	const value = typeof rawContentType === "string" ? rawContentType.trim() : "";
	if (!hasBody) {
		return { ok: true, contentType: undefined };
	}
	if (value === "") {
		return fail("bad_content_type", "Requests with a body need a content type.");
	}
	const mediaType = value.split(";")[0]?.trim().toLowerCase() ?? "";
	if (!(BFF_ALLOWED_REQUEST_CONTENT_TYPES as readonly string[]).includes(mediaType)) {
		return fail("bad_content_type", `Content type ${mediaType || value} is not allowed.`);
	}
	return { ok: true, contentType: value };
}

/**
 * Validate the query string without interpreting it (opaque to the BFF).
 * Caps length and rejects control characters / CRLF smuggling.
 */
export function validateBffQuery(
	rawQuery: unknown,
): BffPolicyFailure | { readonly ok: true; readonly query: string } {
	if (rawQuery === undefined || rawQuery === null || rawQuery === "") {
		return { ok: true, query: "" };
	}
	if (typeof rawQuery !== "string") {
		return fail("bad_query", "Request query must be a string.");
	}
	const normalized = rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery;
	if (normalized.length > BFF_MAX_QUERY_CHARS) {
		return fail("bad_query", "Request query is too long.");
	}
	if (hasControlChars(normalized) || normalized.includes("#")) {
		return fail("bad_query", "Request query is invalid.");
	}
	return { ok: true, query: normalized === "" ? "" : `?${normalized}` };
}

/**
 * Decode a validated query string into a plain object for contract input.
 * Repeated keys collect into arrays. All values arrive as strings (the HTTP
 * wire format); numeric/boolean literals stay strings here — the transport
 * offers a coerced fallback (see `coerceBffPrimitiveStrings`) before the
 * generated parser decides.
 */
export function decodeBffQueryObject(query: string): Record<string, string | string[]> {
	const normalized = query.startsWith("?") ? query.slice(1) : query;
	const params = new URLSearchParams(normalized);
	const output: Record<string, string | string[]> = {};
	params.forEach((value, key) => {
		const existing = output[key];
		if (existing === undefined) {
			output[key] = value;
		} else if (Array.isArray(existing)) {
			existing.push(value);
		} else {
			output[key] = [existing, value];
		}
	});
	return output;
}

const INT_PATTERN = /^[+-]?\d+$/;
const FLOAT_PATTERN = /^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/;

/**
 * Coerce JSON-primitive-looking strings (`"2"` → `2`, `"true"` → `true`)
 * one level deep. HTTP query strings and multipart fields are
 * stringly-typed on the wire while generated parsers declare ints/booleans;
 * this fallback decoding runs only when the raw strings already failed the
 * parser, so string-typed fields are never corrupted — the generated
 * parser remains the authority in both passes.
 */
export function coerceBffPrimitiveStrings(value: unknown): unknown {
	if (typeof value === "string") {
		if (value === "true") {
			return true;
		}
		if (value === "false") {
			return false;
		}
		if (value === "null") {
			return null;
		}
		if (INT_PATTERN.test(value)) {
			const parsed = Number(value);
			if (Number.isSafeInteger(parsed)) {
				return parsed;
			}
			return value;
		}
		if (FLOAT_PATTERN.test(value)) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => coerceBffPrimitiveStrings(item));
	}
	if (typeof value === "object" && value !== null && !(value instanceof Blob)) {
		const output: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			output[key] = coerceBffPrimitiveStrings(item);
		}
		return output;
	}
	return value;
}

function isForwardedRequestHeader(name: string): boolean {
	return (BFF_FORWARDED_REQUEST_HEADERS as readonly string[]).includes(name);
}

/**
 * Keep only allow-listed request headers (REQ-TRAN-03). In particular this
 * drops attacker-controlled forwarding headers (`X-Forwarded-Host`, …),
 * browser credentials (`Cookie`, `Authorization`), and hop-by-hop headers.
 */
export function filterBffRequestHeaders(input: Headers): Headers {
	const output = new Headers();
	input.forEach((value, name) => {
		if (isForwardedRequestHeader(name.toLowerCase())) {
			output.set(name, value);
		}
	});
	return output;
}

export interface BffMutationGuardInput {
	readonly method: BffMethod;
	/** Value of the inbound `Origin` header, if any. */
	readonly origin: string | null | undefined;
	/** Value of the inbound CSRF header, if any. */
	readonly csrfToken: string | null | undefined;
	/** The BFF's own origin (same-origin comparison target). */
	readonly bffOrigin: string;
	/**
	 * Session-bound CSRF token the presented `csrfToken` must equal
	 * (t_alt_fnd_007, REQ-TRAN-01). When omitted, only presence + origin
	 * are enforced (the transport floor for pre-session calls such as
	 * login); session-authenticated mutations MUST pass the stored token.
	 */
	readonly expectedCsrfToken?: string | null | undefined;
}

export type BffMutationGuardResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly code: "csrf" | "origin"; readonly message: string };

/**
 * Constant-time string equality for CSRF token binding. Runs over the
 * full length of both inputs so comparison time does not leak the shared
 * prefix (timing side-channel defense for the session-bound token).
 */
export function constantTimeEqual(a: string, b: string): boolean {
	const aLength = a.length;
	const bLength = b.length;
	const longest = Math.max(aLength, bLength);
	let diff = aLength === bLength ? 0 : 1;
	for (let index = 0; index < longest; index += 1) {
		const aCode = index < aLength ? a.charCodeAt(index) : 0;
		const bCode = index < bLength ? b.charCodeAt(index) : 0;
		diff |= aCode ^ bCode;
	}
	return diff === 0;
}

/**
 * Enforce CSRF + same-origin protection for mutations (REQ-TRAN-01 / T-CSRF).
 * Safe `GET`s pass untouched; every other method requires an `Origin`
 * header exactly matching the BFF origin plus a non-empty anti-CSRF token.
 * When `expectedCsrfToken` is provided (session-authenticated mutations),
 * the presented token must constant-time-equal the session's stored token —
 * a stolen or guessed token for another session is rejected.
 */
export function checkBffMutationGuards(input: BffMutationGuardInput): BffMutationGuardResult {
	if (!isMutationMethod(input.method)) {
		return { ok: true };
	}
	if (input.origin !== input.bffOrigin) {
		return {
			ok: false,
			code: "origin",
			message: "Mutations require a same-origin request.",
		};
	}
	if (typeof input.csrfToken !== "string" || input.csrfToken.trim() === "") {
		return { ok: false, code: "csrf", message: "Missing anti-CSRF token." };
	}
	if (input.expectedCsrfToken !== undefined && input.expectedCsrfToken !== null) {
		if (!constantTimeEqual(input.csrfToken, input.expectedCsrfToken)) {
			return { ok: false, code: "csrf", message: "Invalid anti-CSRF token." };
		}
	}
	return { ok: true };
}

/**
 * Response headers every BFF response carries (REQ-TRAN-05 / T-CACHE):
 * personalized financial data must never sit in a shared cache.
 */
export function bffNoStoreHeaders(): Record<string, string> {
	return {
		"Cache-Control": "private, no-store",
		Vary: "Cookie, Authorization",
	};
}

/**
 * Propagate only safe upstream response headers. `Set-Cookie` is always
 * dropped — upstream cookies (session/token material) must never reach the
 * browser (ADR-0001 D1/REQ-SESS-01) — as are server internals.
 */
export function filterBffResponseHeaders(upstream: Headers): Headers {
	const output = new Headers();
	upstream.forEach((value, name) => {
		if ((BFF_FORWARDED_RESPONSE_HEADERS as readonly string[]).includes(name.toLowerCase())) {
			output.append(name, value);
		}
	});
	return output;
}

function defaultGenerateRequestId(): string {
	const cryptoRef = globalThis.crypto;
	if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
		return cryptoRef.randomUUID();
	}
	return `req-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

/** Resolve the correlation id: inbound header wins, else generate (REQ-OPS-01). */
export function resolveBffRequestId(headers: Headers | undefined): string {
	const inbound = headers?.get(BFF_REQUEST_ID_HEADER);
	if (inbound !== undefined && inbound !== null && inbound.trim() !== "") {
		return inbound.trim().slice(0, 128);
	}
	return defaultGenerateRequestId();
}

/** Parse `Retry-After` (seconds or HTTP date) into milliseconds. */
export function parseBffRetryAfterMs(value: string | null): number | undefined {
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

const SECRET_PATTERNS: readonly RegExp[] = [
	/\bBearer\s+[A-Za-z0-9\-._~+/=]+/gi,
	/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=>]\s*[^\s,;"']+/gi,
	/\b(?:password|passwd|otp|secret)\s*[:=>]\s*[^\s,;"']+/gi,
];

/**
 * Scrub credential-shaped material from text destined for errors/logs
 * (REQ-OPS-01 / T-LOG). Conservative: over-redacts rather than leaks.
 */
export function scrubBffSecrets(text: string): string {
	let output = text;
	for (const pattern of SECRET_PATTERNS) {
		pattern.lastIndex = 0;
		output = output.replace(pattern, "[redacted]");
	}
	return output;
}

export type BffErrorCode =
	| "bad_path"
	| "bad_method"
	| "bad_content_type"
	| "bad_query"
	| "csrf"
	| "origin"
	| "payload_too_large"
	| "timeout"
	| "aborted"
	| "network"
	| "upstream"
	| "rate_limited"
	| "contract";

export interface BffErrorInit {
	readonly code: BffErrorCode;
	readonly status: number;
	readonly message: string;
	readonly requestId?: string | undefined;
	readonly retryAfterMs?: number | undefined;
}

/**
 * Single redacted BFF failure (REQ-OPS-01). `message` is always safe for
 * browser delivery: upstream 5xx bodies are replaced with a generic note,
 * 4xx messages are truncated + scrubbed, and nothing carries headers,
 * tokens, or stack traces. Serialize with `toSafeBody()`.
 */
export class BffError extends Error {
	readonly code: BffErrorCode;
	readonly status: number;
	readonly requestId: string | undefined;
	readonly retryAfterMs: number | undefined;

	constructor(init: BffErrorInit) {
		super(init.message);
		this.name = "BffError";
		this.code = init.code;
		this.status = init.status;
		this.requestId = init.requestId;
		this.retryAfterMs = init.retryAfterMs;
	}

	toSafeBody(): {
		error: BffErrorCode;
		message: string;
		requestId?: string | undefined;
		retryAfterMs?: number | undefined;
	} {
		const body: {
			error: BffErrorCode;
			message: string;
			requestId?: string | undefined;
			retryAfterMs?: number | undefined;
		} = {
			error: this.code,
			message: this.message,
		};
		if (this.requestId !== undefined) {
			body.requestId = this.requestId;
		}
		if (this.retryAfterMs !== undefined) {
			body.retryAfterMs = this.retryAfterMs;
		}
		return body;
	}
}

/**
 * Response-header adapter for `BffError`s so retry metadata reaches the
 * browser even when the outcome is an error, not an upstream response:
 * `Retry-After` (whole seconds) only when the error carries it,
 * correlation id when present, and the same `private, no-store` cache
 * posture as every BFF response (REQ-TRAN-05).
 */
export function bffErrorResponseHeaders(error: BffError): Headers {
	const headers = new Headers(bffNoStoreHeaders());
	if (error.requestId !== undefined) {
		headers.set(BFF_REQUEST_ID_HEADER, error.requestId);
	}
	if (error.retryAfterMs !== undefined) {
		headers.set("Retry-After", String(Math.max(0, Math.ceil(error.retryAfterMs / 1000))));
	}
	return headers;
}

/**
 * Extract the actionable hint from an upstream error body. Rails renders
 * `ErrorResponse` JSON (`{ error, message, … }`); prefer its `message`
 * (falling back to `error`) over raw JSON so browser errors stay readable.
 * Anything else passes through verbatim for scrubbing downstream.
 */
export function extractUpstreamMessage(bodyText: string): string {
	const trimmed = bodyText.trim();
	if (!trimmed.startsWith("{")) {
		return trimmed;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return trimmed;
	}
	if (typeof parsed === "object" && parsed !== null) {
		if ("message" in parsed && typeof parsed.message === "string" && parsed.message !== "") {
			return parsed.message;
		}
		if ("error" in parsed && typeof parsed.error === "string" && parsed.error !== "") {
			return parsed.error;
		}
	}
	return trimmed;
}

/**
 * Build the browser-safe message for an upstream failure: client errors keep
 * a truncated, scrubbed hint; server errors become generic (T-LOG).
 */
export function safeUpstreamMessage(status: number, bodyText: string): string {
	if (status >= 500) {
		return `Upstream request failed with status ${status}.`;
	}
	const scrubbed = scrubBffSecrets(extractUpstreamMessage(bodyText));
	if (scrubbed === "") {
		return `Request failed with status ${status}.`;
	}
	return scrubbed.slice(0, 2000);
}
