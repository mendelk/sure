/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/transactions.
 *
 * Source: docs/api/openapi.yaml (sha256: fb4401a6f8bec7280f908403d66dfa23cf2d8d9fa9fe287771d97e859b32657f)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { z } from "zod";
import { apiPost } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { ErrorResponse, Transaction } from "../zod-schemas";
export const requestBody = z.object({
		transaction: z.object({
		account_id: z.string(),
		date: z.string(),
		amount: z.number(),
		name: z.string(),
		description: z.string().optional(),
		notes: z.string().optional(),
		currency: z.string().optional(),
		category_id: z.string().optional(),
		merchant_id: z.string().optional(),
		nature: z.enum(["income", "expense", "inflow", "outflow"]).optional(),
		external_id: z.string().optional(),
		source: z.string().optional(),
		user_modified: z.boolean().optional(),
		tag_ids: z.array(z.string()).optional(),
	}),
	});
const success200 = Transaction;
const success201 = Transaction;
const error422 = ErrorResponse;
export const PostApiV1TransactionsContract: OperationContract = {
	operation: "POST /api/v1/transactions",
	method: "POST",
	path: "/api/v1/transactions",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 200: success200, 201: success201 },
	errorResponses: { 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/transactions: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1Transactions(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/transactions"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/transactions">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/transactions", { ...init, contract: PostApiV1TransactionsContract });
}
