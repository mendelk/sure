/**
 * GENERATED — do not edit by hand. Operation contract for DELETE /api/v1/transactions/{id}.
 *
 * Source: docs/api/openapi.yaml (sha256: d9a13d3511d7165bf6b97a776e4e0e6f520b014e54bf49e2bd14387f42140f7b)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { z } from "zod";
import { apiDelete } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { DeleteResponse, ErrorResponse } from "../zod-schemas";
export const pathParams = z.object({
	id: z.string(),
});
const success200 = DeleteResponse;
const error404 = ErrorResponse;
export const DeleteApiV1TransactionsByIdContract: OperationContract = {
	operation: "DELETE /api/v1/transactions/{id}",
	method: "DELETE",
	path: "/api/v1/transactions/{id}",
	pathParams: pathParams,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 404: error404 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated DELETE /api/v1/transactions/{id}: success payloads are parsed through the operation contract before they reach callers. */
export function deleteApiV1TransactionsById(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/transactions/{id}"]["delete"]>
): Promise<ApiSuccess<ApiData<"delete", "/api/v1/transactions/{id}">>> {
	const [init] = args;
	return apiDelete(client, "/api/v1/transactions/{id}", { ...init, contract: DeleteApiV1TransactionsByIdContract });
}
