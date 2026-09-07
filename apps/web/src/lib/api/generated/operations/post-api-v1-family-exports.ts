/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/family_exports.
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
import { ErrorResponse, FamilyExportResponse } from "../zod-schemas";
export const requestBody = z.object({}).strict();
const success202 = FamilyExportResponse;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error422 = ErrorResponse;
export const PostApiV1FamilyExportsContract: OperationContract = {
	operation: "POST /api/v1/family_exports",
	method: "POST",
	path: "/api/v1/family_exports",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 202: success202 },
	errorResponses: { 401: error401, 403: error403, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/family_exports: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1FamilyExports(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/family_exports"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/family_exports">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/family_exports", { ...init, contract: PostApiV1FamilyExportsContract });
}
