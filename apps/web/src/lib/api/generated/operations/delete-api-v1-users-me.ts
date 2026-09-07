/**
 * GENERATED — do not edit by hand. Operation contract for DELETE /api/v1/users/me.
 *
 * Source: docs/api/openapi.yaml (sha256: fb4401a6f8bec7280f908403d66dfa23cf2d8d9fa9fe287771d97e859b32657f)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { apiDelete } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { ErrorResponse, SuccessMessage } from "../zod-schemas";
const success200 = SuccessMessage;
const error422 = ErrorResponse;
export const DeleteApiV1UsersMeContract: OperationContract = {
	operation: "DELETE /api/v1/users/me",
	method: "DELETE",
	path: "/api/v1/users/me",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [401, 403],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated DELETE /api/v1/users/me: success payloads are parsed through the operation contract before they reach callers. */
export function deleteApiV1UsersMe(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/users/me"]["delete"]>
): Promise<ApiSuccess<ApiData<"delete", "/api/v1/users/me">>> {
	const [init] = args;
	return apiDelete(client, "/api/v1/users/me", { ...init, contract: DeleteApiV1UsersMeContract });
}
