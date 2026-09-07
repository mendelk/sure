/**
 * GENERATED — do not edit by hand. Operation contract for PATCH /api/v1/recurring_transactions/{id}.
 *
 * Source: docs/api/openapi.yaml (sha256: fb4401a6f8bec7280f908403d66dfa23cf2d8d9fa9fe287771d97e859b32657f)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { z } from "zod";
import { apiPatch } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { ErrorResponse, RecurringTransaction } from "../zod-schemas";
export const pathParams = z.object({
	id: z.string(),
});
export const requestBody = z.object({
		recurring_transaction: z.object({
		status: z.enum(["active", "inactive"]).optional(),
		expected_day_of_month: z.number().int().min(1).max(31).optional(),
		next_expected_date: z.string().optional(),
	}).optional(),
	});
const success200 = RecurringTransaction;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error404 = ErrorResponse;
const error422 = ErrorResponse;
export const PatchApiV1RecurringTransactionsByIdContract: OperationContract = {
	operation: "PATCH /api/v1/recurring_transactions/{id}",
	method: "PATCH",
	path: "/api/v1/recurring_transactions/{id}",
	pathParams: pathParams,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 401: error401, 403: error403, 404: error404, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated PATCH /api/v1/recurring_transactions/{id}: success payloads are parsed through the operation contract before they reach callers. */
export function patchApiV1RecurringTransactionsById(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/recurring_transactions/{id}"]["patch"]>
): Promise<ApiSuccess<ApiData<"patch", "/api/v1/recurring_transactions/{id}">>> {
	const [init] = args;
	return apiPatch(client, "/api/v1/recurring_transactions/{id}", { ...init, contract: PatchApiV1RecurringTransactionsByIdContract });
}
