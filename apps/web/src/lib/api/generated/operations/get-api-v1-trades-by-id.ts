/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/trades/{id}.
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
import { ErrorResponse, Trade } from "../zod-schemas";
export const pathParams = z.object({
	id: z.string(),
});
const success200 = Trade;
const error401 = ErrorResponse;
const error404 = ErrorResponse;
export const GetApiV1TradesByIdContract: OperationContract = {
	operation: "GET /api/v1/trades/{id}",
	method: "GET",
	path: "/api/v1/trades/{id}",
	pathParams: pathParams,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 401: error401, 404: error404 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated GET /api/v1/trades/{id}: success payloads are parsed through the operation contract before they reach callers. */
export function getApiV1TradesById(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/trades/{id}"]["get"]>
): Promise<ApiSuccess<ApiData<"get", "/api/v1/trades/{id}">>> {
	const [init] = args;
	return apiGet(client, "/api/v1/trades/{id}", { ...init, contract: GetApiV1TradesByIdContract });
}
