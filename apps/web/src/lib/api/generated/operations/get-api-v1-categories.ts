/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/categories.
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
import { CategoryCollection } from "../zod-schemas";
export const queryParams = z.object({
	page: z.number().int().optional(),
	parent_id: z.string().optional(),
	per_page: z.number().int().optional(),
	roots_only: z.boolean().optional(),
});
const success200 = CategoryCollection;
export const GetApiV1CategoriesContract: OperationContract = {
	operation: "GET /api/v1/categories",
	method: "GET",
	path: "/api/v1/categories",
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
/** Validated GET /api/v1/categories: success payloads are parsed through the operation contract before they reach callers. */
export function getApiV1Categories(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/categories"]["get"]>
): Promise<ApiSuccess<ApiData<"get", "/api/v1/categories">>> {
	const [init] = args;
	return apiGet(client, "/api/v1/categories", { ...init, contract: GetApiV1CategoriesContract });
}
