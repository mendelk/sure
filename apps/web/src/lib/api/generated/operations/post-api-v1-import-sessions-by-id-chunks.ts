/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/import_sessions/{id}/chunks.
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
export const requestBody = z.object({
		sequence: z.number().int().min(1),
		client_chunk_id: z.string().nullable().optional(),
		raw_file_content: z.string(),
	});
export const requestMultipartBody = z.object({
		sequence: z.number().int().min(1),
		client_chunk_id: z.string().nullable().optional(),
		file: z.instanceof(Blob),
	});
const success201 = ImportSessionResponse;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error404 = ErrorResponse;
const error409 = ErrorResponse;
const error422 = ErrorResponse;
export const PostApiV1ImportSessionsByIdChunksContract: OperationContract = {
	operation: "POST /api/v1/import_sessions/{id}/chunks",
	method: "POST",
	path: "/api/v1/import_sessions/{id}/chunks",
	pathParams: pathParams,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: requestMultipartBody,
	requestBodyRequired: true,
	isMultipart: true,
	successResponses: { 201: success201 },
	errorResponses: { 401: error401, 403: error403, 404: error404, 409: error409, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/import_sessions/{id}/chunks: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1ImportSessionsByIdChunks(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/import_sessions/{id}/chunks"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/import_sessions/{id}/chunks">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/import_sessions/{id}/chunks", { ...init, contract: PostApiV1ImportSessionsByIdChunksContract });
}
