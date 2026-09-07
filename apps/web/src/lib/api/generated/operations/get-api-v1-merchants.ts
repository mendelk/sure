/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/merchants.
 *
 * Source: docs/api/openapi.yaml (sha256: d9a13d3511d7165bf6b97a776e4e0e6f520b014e54bf49e2bd14387f42140f7b)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { z } from "zod";
import { apiGet } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { MerchantDetail } from "../zod-schemas";
const success200 = z.array(MerchantDetail);
export const GetApiV1MerchantsContract: OperationContract = {
	operation: "GET /api/v1/merchants",
	method: "GET",
	path: "/api/v1/merchants",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: {  },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated GET /api/v1/merchants: success payloads are parsed through the operation contract before they reach callers. */
export function getApiV1Merchants(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/merchants"]["get"]>
): Promise<ApiSuccess<ApiData<"get", "/api/v1/merchants">>> {
	const [init] = args;
	return apiGet(client, "/api/v1/merchants", { ...init, contract: GetApiV1MerchantsContract });
}
