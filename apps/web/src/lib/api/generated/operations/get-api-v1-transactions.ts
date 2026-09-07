/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/transactions.
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
import { TransactionCollection } from "../zod-schemas";
export const queryParams = z.object({
	account_id: z.string().optional(),
	account_ids: z.array(z.string()).optional(),
	category_id: z.string().optional(),
	category_ids: z.array(z.string()).optional(),
	end_date: z.string().optional(),
	max_amount: z.number().optional(),
	merchant_id: z.string().optional(),
	merchant_ids: z.array(z.string()).optional(),
	min_amount: z.number().optional(),
	page: z.number().int().optional(),
	per_page: z.number().int().optional(),
	search: z.string().optional(),
	start_date: z.string().optional(),
	tag_ids: z.array(z.string()).optional(),
	type: z.enum(["income", "expense"]).optional(),
});
const success200 = TransactionCollection;
export const GetApiV1TransactionsContract: OperationContract = {
	operation: "GET /api/v1/transactions",
	method: "GET",
	path: "/api/v1/transactions",
	pathParams: undefined,
	queryParams: queryParams,
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
/** Validated GET /api/v1/transactions: success payloads are parsed through the operation contract before they reach callers. */
export function getApiV1Transactions(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/transactions"]["get"]>
): Promise<ApiSuccess<ApiData<"get", "/api/v1/transactions">>> {
	const [init] = args;
	return apiGet(client, "/api/v1/transactions", { ...init, contract: GetApiV1TransactionsContract });
}
