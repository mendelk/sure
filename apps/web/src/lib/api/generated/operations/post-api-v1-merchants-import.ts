/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/merchants/import.
 *
 * Source: docs/api/openapi.yaml (sha256: d9a13d3511d7165bf6b97a776e4e0e6f520b014e54bf49e2bd14387f42140f7b)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { z } from "zod";
import { apiPost } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { ErrorResponse, MerchantImportResult } from "../zod-schemas";
export const requestMultipartBody = z.object({
		file: z.instanceof(Blob),
	});
const success201 = MerchantImportResult;
const error401 = ErrorResponse;
const error422 = ErrorResponse;
export const PostApiV1MerchantsImportContract: OperationContract = {
	operation: "POST /api/v1/merchants/import",
	method: "POST",
	path: "/api/v1/merchants/import",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: requestMultipartBody,
	requestBodyRequired: true,
	isMultipart: true,
	successResponses: { 201: success201 },
	errorResponses: { 401: error401, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/merchants/import: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1MerchantsImport(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/merchants/import"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/merchants/import">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/merchants/import", { ...init, contract: PostApiV1MerchantsImportContract });
}
