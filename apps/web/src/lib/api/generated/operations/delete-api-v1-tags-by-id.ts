/**
 * GENERATED — do not edit by hand. Operation contract for DELETE /api/v1/tags/{id}.
 *
 * Source: docs/api/openapi.yaml (sha256: fb4401a6f8bec7280f908403d66dfa23cf2d8d9fa9fe287771d97e859b32657f)
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
export const DeleteApiV1TagsByIdContract: OperationContract = {
	operation: "DELETE /api/v1/tags/{id}",
	method: "DELETE",
	path: "/api/v1/tags/{id}",
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
/** Validated DELETE /api/v1/tags/{id}: success payloads are parsed through the operation contract before they reach callers. */
export function deleteApiV1TagsById(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/tags/{id}"]["delete"]>
): Promise<ApiSuccess<ApiData<"delete", "/api/v1/tags/{id}">>> {
	const [init] = args;
	return apiDelete(client, "/api/v1/tags/{id}", { ...init, contract: DeleteApiV1TagsByIdContract });
}
