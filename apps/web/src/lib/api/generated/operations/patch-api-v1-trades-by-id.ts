/**
 * GENERATED — do not edit by hand. Operation contract for PATCH /api/v1/trades/{id}.
 *
 * Source: docs/api/openapi.yaml (sha256: d9a13d3511d7165bf6b97a776e4e0e6f520b014e54bf49e2bd14387f42140f7b)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { z } from "zod";
import { apiPatch } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { ErrorResponse, Trade } from "../zod-schemas";
export const pathParams = z.object({
	id: z.string(),
});
export const requestBody = z.object({
		trade: z.object({
		date: z.string().optional(),
		qty: z.number().optional(),
		price: z.number().optional(),
		type: z.enum(["buy", "sell", "dividend", "deposit", "withdrawal", "interest"]).optional(),
		nature: z.enum(["inflow", "outflow"]).optional(),
		name: z.string().optional(),
		notes: z.string().optional(),
		currency: z.string().optional(),
		investment_activity_label: z.string().optional(),
		category_id: z.string().optional(),
	}).optional(),
	});
const success200 = Trade;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error404 = ErrorResponse;
export const PatchApiV1TradesByIdContract: OperationContract = {
	operation: "PATCH /api/v1/trades/{id}",
	method: "PATCH",
	path: "/api/v1/trades/{id}",
	pathParams: pathParams,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 401: error401, 403: error403, 404: error404 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated PATCH /api/v1/trades/{id}: success payloads are parsed through the operation contract before they reach callers. */
export function patchApiV1TradesById(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/trades/{id}"]["patch"]>
): Promise<ApiSuccess<ApiData<"patch", "/api/v1/trades/{id}">>> {
	const [init] = args;
	return apiPatch(client, "/api/v1/trades/{id}", { ...init, contract: PatchApiV1TradesByIdContract });
}
