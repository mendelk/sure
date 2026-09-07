/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/family_exports.
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
import { ErrorResponse, FamilyExportCollection } from "../zod-schemas";
export const queryParams = z.object({
	page: z.number().int().optional(),
	per_page: z.number().int().optional(),
});
const success200 = FamilyExportCollection;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
export const GetApiV1FamilyExportsContract: OperationContract = {
	operation: "GET /api/v1/family_exports",
	method: "GET",
	path: "/api/v1/family_exports",
	pathParams: undefined,
	queryParams: queryParams,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 401: error401, 403: error403 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated GET /api/v1/family_exports: success payloads are parsed through the operation contract before they reach callers. */
export function getApiV1FamilyExports(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/family_exports"]["get"]>
): Promise<ApiSuccess<ApiData<"get", "/api/v1/family_exports">>> {
	const [init] = args;
	return apiGet(client, "/api/v1/family_exports", { ...init, contract: GetApiV1FamilyExportsContract });
}
