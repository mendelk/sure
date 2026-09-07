/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/transfers.
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
import { ErrorResponse, TransferDecisionCollection } from "../zod-schemas";
export const queryParams = z.object({
	account_id: z.string().optional(),
	end_date: z.string().optional(),
	page: z.number().int().optional(),
	per_page: z.number().int().optional(),
	start_date: z.string().optional(),
	status: z.enum(["pending", "confirmed"]).optional(),
});
const success200 = TransferDecisionCollection;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error422 = ErrorResponse;
export const GetApiV1TransfersContract: OperationContract = {
	operation: "GET /api/v1/transfers",
	method: "GET",
	path: "/api/v1/transfers",
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
/** Validated GET /api/v1/transfers: success payloads are parsed through the operation contract before they reach callers. */
export function getApiV1Transfers(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/transfers"]["get"]>
): Promise<ApiSuccess<ApiData<"get", "/api/v1/transfers">>> {
	const [init] = args;
	return apiGet(client, "/api/v1/transfers", { ...init, contract: GetApiV1TransfersContract });
}
