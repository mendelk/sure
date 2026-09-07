/**
 * GENERATED — do not edit by hand. Operation contract for PATCH /api/v1/transactions/{id}.
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
import { ErrorResponse, Transaction } from "../zod-schemas";
export const pathParams = z.object({
	id: z.string(),
});
export const requestBody = z.object({
		transaction: z.object({
		date: z.string().optional(),
		amount: z.number().optional(),
		name: z.string().optional(),
		description: z.string().optional(),
		notes: z.string().optional(),
		currency: z.string().optional(),
		category_id: z.string().optional(),
		merchant_id: z.string().optional(),
		nature: z.enum(["income", "expense", "inflow", "outflow"]).optional(),
		tag_ids: z.array(z.string()).optional(),
	}).optional(),
	});
const success200 = Transaction;
const error404 = ErrorResponse;
export const PatchApiV1TransactionsByIdContract: OperationContract = {
	operation: "PATCH /api/v1/transactions/{id}",
	method: "PATCH",
	path: "/api/v1/transactions/{id}",
	pathParams: pathParams,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 404: error404 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated PATCH /api/v1/transactions/{id}: success payloads are parsed through the operation contract before they reach callers. */
export function patchApiV1TransactionsById(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/transactions/{id}"]["patch"]>
): Promise<ApiSuccess<ApiData<"patch", "/api/v1/transactions/{id}">>> {
	const [init] = args;
	return apiPatch(client, "/api/v1/transactions/{id}", { ...init, contract: PatchApiV1TransactionsByIdContract });
}
