/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/merchants.
 *
 * Source: docs/api/openapi.yaml (sha256: fb4401a6f8bec7280f908403d66dfa23cf2d8d9fa9fe287771d97e859b32657f)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { apiPost } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { ErrorResponse, MerchantDetail, MerchantRequest } from "../zod-schemas";
export const requestBody = MerchantRequest;
const success201 = MerchantDetail;
const error401 = ErrorResponse;
const error422 = ErrorResponse;
export const PostApiV1MerchantsContract: OperationContract = {
	operation: "POST /api/v1/merchants",
	method: "POST",
	path: "/api/v1/merchants",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 201: success201 },
	errorResponses: { 401: error401, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/merchants: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1Merchants(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/merchants"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/merchants">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/merchants", { ...init, contract: PostApiV1MerchantsContract });
}
