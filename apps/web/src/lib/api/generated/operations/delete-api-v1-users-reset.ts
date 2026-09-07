/**
 * GENERATED — do not edit by hand. Operation contract for DELETE /api/v1/users/reset.
 *
 * Source: docs/api/openapi.yaml (sha256: fb4401a6f8bec7280f908403d66dfa23cf2d8d9fa9fe287771d97e859b32657f)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { apiDelete } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { ErrorResponse, ResetInitiatedResponse } from "../zod-schemas";
const success200 = ResetInitiatedResponse;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error500 = ErrorResponse;
export const DeleteApiV1UsersResetContract: OperationContract = {
	operation: "DELETE /api/v1/users/reset",
	method: "DELETE",
	path: "/api/v1/users/reset",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 401: error401, 403: error403, 500: error500 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated DELETE /api/v1/users/reset: success payloads are parsed through the operation contract before they reach callers. */
export function deleteApiV1UsersReset(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/users/reset"]["delete"]>
): Promise<ApiSuccess<ApiData<"delete", "/api/v1/users/reset">>> {
	const [init] = args;
	return apiDelete(client, "/api/v1/users/reset", { ...init, contract: DeleteApiV1UsersResetContract });
}
