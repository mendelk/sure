/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/recurring_transactions.
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
import { ErrorResponse, RecurringTransaction } from "../zod-schemas";
export const requestBody = z.object({
		recurring_transaction: (z.object({
		account_id: z.string().nullable().optional(),
		merchant_id: z.string().nullable().optional(),
		name: z.string().nullable().optional(),
		amount: z.number(),
		currency: z.string(),
		expected_day_of_month: z.number().int().min(1).max(31),
		last_occurrence_date: z.string(),
		next_expected_date: z.string(),
		status: z.enum(["active", "inactive"]).optional(),
		occurrence_count: z.number().int().min(0).optional(),
		manual: z.boolean().optional(),
		expected_amount_min: z.number().nullable().optional(),
		expected_amount_max: z.number().nullable().optional(),
		expected_amount_avg: z.number().nullable().optional(),
	})).and(z.union([z.object({name: z.unknown()}), z.object({merchant_id: z.unknown()})])),
	});
const success201 = RecurringTransaction;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error404 = ErrorResponse;
const error422 = ErrorResponse;
export const PostApiV1RecurringTransactionsContract: OperationContract = {
	operation: "POST /api/v1/recurring_transactions",
	method: "POST",
	path: "/api/v1/recurring_transactions",
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
/** Validated POST /api/v1/recurring_transactions: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1RecurringTransactions(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/recurring_transactions"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/recurring_transactions">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/recurring_transactions", { ...init, contract: PostApiV1RecurringTransactionsContract });
}
