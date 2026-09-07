/**
 * GENERATED — do not edit by hand. Operation contract for DELETE /api/v1/merchants/{id}.
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
export const pathParams = z.object({
	id: z.string(),
});
const success204 = z.void();
export const DeleteApiV1MerchantsByIdContract: OperationContract = {
	operation: "DELETE /api/v1/merchants/{id}",
	method: "DELETE",
	path: "/api/v1/merchants/{id}",
	pathParams: pathParams,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 204: success204 },
	errorResponses: {  },
	emptyResponseStatuses: [204],
	emptyErrorStatuses: [404],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated DELETE /api/v1/merchants/{id}: success payloads are parsed through the operation contract before they reach callers. */
export function deleteApiV1MerchantsById(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/merchants/{id}"]["delete"]>
): Promise<ApiSuccess<ApiData<"delete", "/api/v1/merchants/{id}">>> {
	const [init] = args;
	return apiDelete(client, "/api/v1/merchants/{id}", { ...init, contract: DeleteApiV1MerchantsByIdContract });
}
