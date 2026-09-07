/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/valuations/{id}.
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
import { ErrorResponse, Valuation } from "../zod-schemas";
export const pathParams = z.object({
	id: z.string(),
});
const success200 = Valuation;
const error404 = ErrorResponse;
export const GetApiV1ValuationsByIdContract: OperationContract = {
	operation: "GET /api/v1/valuations/{id}",
	method: "GET",
	path: "/api/v1/valuations/{id}",
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
/** Validated GET /api/v1/valuations/{id}: success payloads are parsed through the operation contract before they reach callers. */
export function getApiV1ValuationsById(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/valuations/{id}"]["get"]>
): Promise<ApiSuccess<ApiData<"get", "/api/v1/valuations/{id}">>> {
	const [init] = args;
	return apiGet(client, "/api/v1/valuations/{id}", { ...init, contract: GetApiV1ValuationsByIdContract });
}
