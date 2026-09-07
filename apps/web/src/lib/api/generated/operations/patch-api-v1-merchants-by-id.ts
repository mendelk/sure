/**
 * GENERATED — do not edit by hand. Operation contract for PATCH /api/v1/merchants/{id}.
 *
 * Source: docs/api/openapi.yaml (sha256: fb4401a6f8bec7280f908403d66dfa23cf2d8d9fa9fe287771d97e859b32657f)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { z } from "zod";
import { apiPatch } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { ErrorResponse, MerchantDetail, MerchantRequest } from "../zod-schemas";
export const pathParams = z.object({
	id: z.string(),
});
export const requestBody = MerchantRequest;
const success200 = MerchantDetail;
const error404 = ErrorResponse;
export const PatchApiV1MerchantsByIdContract: OperationContract = {
	operation: "PATCH /api/v1/merchants/{id}",
	method: "PATCH",
	path: "/api/v1/merchants/{id}",
	pathParams: pathParams,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 404: error404 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated PATCH /api/v1/merchants/{id}: success payloads are parsed through the operation contract before they reach callers. */
export function patchApiV1MerchantsById(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/merchants/{id}"]["patch"]>
): Promise<ApiSuccess<ApiData<"patch", "/api/v1/merchants/{id}">>> {
	const [init] = args;
	return apiPatch(client, "/api/v1/merchants/{id}", { ...init, contract: PatchApiV1MerchantsByIdContract });
}
