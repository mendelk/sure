/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/valuations.
 *
 * Source: docs/api/openapi.yaml (sha256: fb4401a6f8bec7280f908403d66dfa23cf2d8d9fa9fe287771d97e859b32657f)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { z } from "zod";
import { apiGet } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { ErrorResponse, ValuationCollection } from "../zod-schemas";
export const queryParams = z.object({
	account_id: z.string().optional(),
	end_date: z.string().optional(),
	page: z.number().int().optional(),
	per_page: z.number().int().optional(),
	start_date: z.string().optional(),
});
const success200 = ValuationCollection;
const error401 = ErrorResponse;
const error422 = ErrorResponse;
export const GetApiV1ValuationsContract: OperationContract = {
	operation: "GET /api/v1/valuations",
	method: "GET",
	path: "/api/v1/valuations",
	pathParams: undefined,
	queryParams: queryParams,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 401: error401, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated GET /api/v1/valuations: success payloads are parsed through the operation contract before they reach callers. */
export function getApiV1Valuations(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/valuations"]["get"]>
): Promise<ApiSuccess<ApiData<"get", "/api/v1/valuations">>> {
	const [init] = args;
	return apiGet(client, "/api/v1/valuations", { ...init, contract: GetApiV1ValuationsContract });
}
