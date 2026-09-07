/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/trades.
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
import { ErrorResponse, TransactionResponse } from "../zod-schemas";
export const requestBody = z.object({
		trade: z.object({
		account_id: z.string(),
		date: z.string(),
		qty: z.number().optional(),
		price: z.number().optional(),
		amount: z.number().optional(),
		type: z.enum(["buy", "sell", "dividend", "deposit", "withdrawal", "interest"]),
		security_id: z.string().optional(),
		ticker: z.string().optional(),
		manual_ticker: z.string().optional(),
		currency: z.string().optional(),
		investment_activity_label: z.string().optional(),
		category_id: z.string().optional(),
		transfer_account_id: z.string().optional(),
	}),
	});
const success201 = TransactionResponse;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error404 = ErrorResponse;
const error422 = ErrorResponse;
export const PostApiV1TradesContract: OperationContract = {
	operation: "POST /api/v1/trades",
	method: "POST",
	path: "/api/v1/trades",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 201: success201 },
	errorResponses: { 401: error401, 403: error403, 404: error404, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/trades: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1Trades(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/trades"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/trades">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/trades", { ...init, contract: PostApiV1TradesContract });
}
