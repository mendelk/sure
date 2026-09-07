/**
 * GENERATED — do not edit by hand. Operation contract for DELETE /api/v1/users/me.
 *
 * Source: docs/api/openapi.yaml (sha256: d9a13d3511d7165bf6b97a776e4e0e6f520b014e54bf49e2bd14387f42140f7b)
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
