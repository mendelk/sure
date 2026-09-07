/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/securities.
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
import { ErrorResponse, SecurityCollection } from "../zod-schemas";
export const queryParams = z.object({
	exchange_operating_mic: z.string().optional(),
	kind: z.enum(["standard", "cash"]).optional(),
	offline: z.boolean().optional(),
	page: z.number().int().optional(),
	per_page: z.number().int().optional(),
	ticker: z.string().optional(),
});
const success200 = SecurityCollection;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error422 = ErrorResponse;
export const GetApiV1SecuritiesContract: OperationContract = {
	operation: "GET /api/v1/securities",
	method: "GET",
	path: "/api/v1/securities",
	pathParams: undefined,
	queryParams: queryParams,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 401: error401, 403: error403, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated GET /api/v1/securities: success payloads are parsed through the operation contract before they reach callers. */
export function getApiV1Securities(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/securities"]["get"]>
): Promise<ApiSuccess<ApiData<"get", "/api/v1/securities">>> {
	const [init] = args;
	return apiGet(client, "/api/v1/securities", { ...init, contract: GetApiV1SecuritiesContract });
}
