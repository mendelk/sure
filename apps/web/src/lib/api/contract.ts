/**
 * Shared runtime-contract primitives for the Sure OpenAPI Zod boundary.
 *
 * This module is isomorphic and client-safe: it imports no server-only
 * configuration, no credentials, and no Node APIs, so both the browser
 * fetch layer (`./client`) and the server-only BFF transport
 * (`./bff-contracts.server`) can build on it without leaking secrets
 * across the browser/server boundary.
 *
 * `OperationContract` values themselves are generated from the canonical
 * `docs/api/openapi.yaml` by
 * `apps/web/scripts/generate-zod-contracts.mjs` — never hand-written —
 * so static types (`./openapi`, via openapi-typescript) and these runtime
 * parsers always derive from the same source.
 */
import type { z } from "zod";

/**
 * Runtime parsers for a single OpenAPI operation, keyed upstream by
 * `"METHOD /path"` (see `./generated/operation-contracts`).
 *
 * Every schema below is a Zod parser: objects strip unknown keys (additive
 * API changes stay forward-compatible), `nullable`/`optional` mirror the
 * spec, empty responses parse as `void`, and binary downloads parse as
 * `Blob`. Operations import only their own contract module, so a route
 * never pays for the whole API surface in its browser bundle.
 */
export interface OperationContract {
	readonly operation: string;
	readonly method: string;
	readonly path: string;
	readonly pathParams?: z.ZodType | undefined;
	readonly queryParams?: z.ZodType | undefined;
	readonly headerParams?: z.ZodType | undefined;
	readonly requestBody?: z.ZodType | undefined;
	readonly requestMultipartBody?: z.ZodType | undefined;
	readonly requestBodyRequired: boolean;
	/** True when the operation accepts `multipart/form-data` uploads. */
	readonly isMultipart: boolean;
	/** Documented JSON success responses, keyed by status code. */
	readonly successResponses: Record<string, z.ZodType>;
	/** Documented JSON error responses, keyed by status code. */
	readonly errorResponses: Record<string, z.ZodType>;
	/** Success statuses documented without content (204/302): parse as void. */
	readonly emptyResponseStatuses: readonly number[];
	/** Error statuses documented without content: no error parser exists. */
	readonly emptyErrorStatuses: readonly number[];
	/** True for redirect-to-binary download endpoints (Blob bodies). */
	readonly isBinaryResponse: boolean;
	readonly binaryResponse?: z.ZodType | undefined;
}

/** A single redacted contract issue: schema paths and type names only. */
export interface RedactedIssue {
	readonly path: string;
	readonly expected: string;
	readonly received: string;
}

/** Request/response part validated by the strict BFF parse helpers. */
export type OperationParsePart =
	| "pathParams"
	| "query"
	| "headers"
	| "body"
	| "response"
	| "status";

/** Structured outcome of validating one request/response part. */
export type OperationParseResult =
	| { readonly ok: true; readonly data: unknown }
	| {
			readonly ok: false;
			readonly part: OperationParsePart;
			readonly issues: readonly RedactedIssue[];
	  };

interface ZodIssueLike {
	readonly code: string;
	readonly path: readonly (string | number | symbol)[];
	readonly expected?: unknown;
	readonly received?: unknown;
}

interface ZodErrorLike {
	readonly issues: readonly ZodIssueLike[];
}

const MAX_ISSUES = 10;
const MAX_PATH_LENGTH = 160;

/**
 * Coarse-grain a received value to its JSON kind. Raw values (which may
 * carry account names, balances, tokens, or file bytes) never leave this
 * function — only short kind tokens do.
 */
function coarseReceived(value: unknown): string {
	if (value === null) {
		return "null";
	}
	if (value === undefined) {
		return "missing";
	}
	if (Array.isArray(value)) {
		return "array";
	}
	const kind = typeof value;
	if (kind === "string" || kind === "number" || kind === "boolean" || kind === "bigint") {
		return kind;
	}
	return "object";
}

function describeExpected(issue: ZodIssueLike): string {
	if (typeof issue.expected === "string" && issue.expected !== "" && issue.expected.length <= 64) {
		return issue.expected;
	}
	return issue.code;
}

function describeReceived(issue: ZodIssueLike): string {
	if (typeof issue.received === "string" && issue.received !== "" && issue.received.length <= 32) {
		return issue.received;
	}
	return coarseReceived(issue.received);
}

function formatPath(path: readonly (string | number | symbol)[]): string {
	let out = "$";
	for (const segment of path) {
		if (typeof segment === "number") {
			out += `[${segment}]`;
		} else if (typeof segment === "string" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
			out += `.${segment}`;
		} else {
			out += `[${JSON.stringify(String(segment))}]`;
		}
		if (out.length > MAX_PATH_LENGTH) {
			return `${out.slice(0, MAX_PATH_LENGTH)}…`;
		}
	}
	return out;
}

/**
 * Reduce a Zod validation failure to redacted diagnostics. The result
 * contains schema paths, expected type tokens, and coarse received kinds —
 * never raw payload values, headers, tokens, or file bytes — so it is safe
 * to surface in `ApiError.details`, logs, and debug UIs.
 */
export function redactZodIssues(error: ZodErrorLike): RedactedIssue[] {
	return error.issues.slice(0, MAX_ISSUES).map((issue) => ({
		path: formatPath(issue.path),
		expected: describeExpected(issue),
		received: describeReceived(issue),
	}));
}

/**
 * One-line, value-free summary for a contract rejection. Lists up to three
 * issues; the full redacted list belongs in `details`, not the message.
 */
export function describeContractViolation(
	operation: string,
	status: number,
	issues: readonly RedactedIssue[],
	totalIssues: number,
): string {
	const shown = issues
		.slice(0, 3)
		.map((issue) => `${issue.path} expected ${issue.expected}`)
		.join("; ");
	const suffix = totalIssues > issues.length ? ` (+${totalIssues - issues.length} more)` : "";
	return `Response contract violation for ${operation} (status ${status}): ${totalIssues} field(s) rejected: ${shown}${suffix}`;
}
