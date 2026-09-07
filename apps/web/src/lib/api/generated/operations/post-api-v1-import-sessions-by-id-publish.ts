/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/import_sessions/{id}/publish.
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
import { ErrorResponse, ImportSessionResponse } from "../zod-schemas";
export const pathParams = z.object({
	id: z.string(),
});
const success202 = ImportSessionResponse;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error404 = ErrorResponse;
const error409 = ErrorResponse;
const error422 = ErrorResponse;
const error503 = ErrorResponse;
export const PostApiV1ImportSessionsByIdPublishContract: OperationContract = {
	operation: "POST /api/v1/import_sessions/{id}/publish",
	method: "POST",
	path: "/api/v1/import_sessions/{id}/publish",
	pathParams: pathParams,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 202: success202 },
	errorResponses: { 401: error401, 403: error403, 404: error404, 409: error409, 422: error422, 503: error503 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/import_sessions/{id}/publish: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1ImportSessionsByIdPublish(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/import_sessions/{id}/publish"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/import_sessions/{id}/publish">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/import_sessions/{id}/publish", { ...init, contract: PostApiV1ImportSessionsByIdPublishContract });
}
