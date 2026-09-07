/**
 * Server-only entrypoint for OpenAPI contract validation in the BFF layer.
 *
 * The BFF transport validates outgoing requests and upstream Rails
 * responses against the same generated Zod contracts the browser uses,
 * without exposing credentials or server-only configuration to browser
 * bundles: this module (and everything it imports) is isomorphic and
 * secret-free, so it is safe to import from `*.server.*` modules and
 * `createServerFn` handlers. Browser routes that need full-surface lookup
 * can import `./generated/operation-contracts` directly; routes that only
 * call one operation should import that operation's module for a smaller
 * bundle.
 */
import { ApiError } from "./client";
import type { OperationParseResult } from "./contract";
import { describeContractViolation } from "./contract";
import type { OperationContract } from "./operation-contracts";
import {
	getOperationContract,
	parseOperationRequest,
	parseOperationResponse,
} from "./operation-contracts";

export { getOperationContract, parseOperationRequest, parseOperationResponse };
export type { OperationContract, OperationParseResult };

export interface BffValidationInput {
	readonly pathParams?: unknown;
	readonly query?: unknown;
	readonly headers?: unknown;
	readonly body?: unknown;
}

function toContractError(
	operation: string,
	status: number | undefined,
	result: OperationParseResult & { readonly ok: false },
	requestId: string | undefined,
): ApiError {
	return new ApiError({
		kind: "contract",
		message: describeContractViolation(operation, status ?? 0, result.issues, result.issues.length),
		status,
		details: {
			operation,
			status: status ?? "unknown",
			part: result.part,
			issues: result.issues,
		},
		requestId,
	});
}

/**
 * Validate an outgoing BFF request before it leaves the server. Throws a
 * redacted `{ kind: "contract" }` ApiError on the first failing part.
 * Multipart uploads validate through the same generated body parser
 * (file parts arrive as `File`/`Blob`, per the OpenAPI `format: binary`
 * field).
 */
export function validateBffRequest(
	method: string,
	path: string,
	input: BffValidationInput,
	requestId?: string,
): unknown {
	const contract = getOperationContract(method, path);
	if (contract === undefined) {
		throw new ApiError({
			kind: "contract",
			message: `No API contract for ${method.toUpperCase()} ${path}.`,
			requestId,
		});
	}
	const result = parseOperationRequest(contract, input);
	if (!result.ok) {
		throw toContractError(contract.operation, undefined, result, requestId);
	}
	return result.data;
}

/**
 * Validate an upstream Rails response before it enters BFF/server state.
 * Throws a redacted `{ kind: "contract" }` ApiError on mismatch; unknown
 * statuses fail closed so undocumented upstream behavior cannot slip
 * through silently.
 */
export function validateUpstreamResponse(
	method: string,
	path: string,
	status: number,
	data: unknown,
	requestId?: string,
): unknown {
	const contract = getOperationContract(method, path);
	if (contract === undefined) {
		throw new ApiError({
			kind: "contract",
			message: `No API contract for ${method.toUpperCase()} ${path}.`,
			status,
			requestId,
		});
	}
	const result = parseOperationResponse(contract, status, data);
	if (!result.ok) {
		throw toContractError(contract.operation, status, result, requestId);
	}
	return result.data;
}
