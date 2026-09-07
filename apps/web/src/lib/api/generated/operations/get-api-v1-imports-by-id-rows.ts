/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/imports/{id}/rows.
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
import { ErrorResponse, ImportRowDiagnosticCollection } from "../zod-schemas";
export const pathParams = z.object({
	id: z.string(),
});
export const queryParams = z.object({
	page: z.number().int().optional(),
	per_page: z.number().int().optional(),
});
const success200 = ImportRowDiagnosticCollection;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error404 = ErrorResponse;
const error500 = ErrorResponse;
export const GetApiV1ImportsByIdRowsContract: OperationContract = {
	operation: "GET /api/v1/imports/{id}/rows",
	method: "GET",
	path: "/api/v1/imports/{id}/rows",
	pathParams: pathParams,
	queryParams: queryParams,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 401: error401, 403: error403, 404: error404, 500: error500 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated GET /api/v1/imports/{id}/rows: success payloads are parsed through the operation contract before they reach callers. */
export function getApiV1ImportsByIdRows(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/imports/{id}/rows"]["get"]>
): Promise<ApiSuccess<ApiData<"get", "/api/v1/imports/{id}/rows">>> {
	const [init] = args;
	return apiGet(client, "/api/v1/imports/{id}/rows", { ...init, contract: GetApiV1ImportsByIdRowsContract });
}
