/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/accounts.
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
import { AccountCollection } from "../zod-schemas";
export const queryParams = z.object({
	include_disabled: z.boolean().optional(),
	page: z.number().int().optional(),
	per_page: z.number().int().optional(),
});
const success200 = AccountCollection;
export const GetApiV1AccountsContract: OperationContract = {
	operation: "GET /api/v1/accounts",
	method: "GET",
	path: "/api/v1/accounts",
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
/** Validated GET /api/v1/accounts: success payloads are parsed through the operation contract before they reach callers. */
export function getApiV1Accounts(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/accounts"]["get"]>
): Promise<ApiSuccess<ApiData<"get", "/api/v1/accounts">>> {
	const [init] = args;
	return apiGet(client, "/api/v1/accounts", { ...init, contract: GetApiV1AccountsContract });
}
