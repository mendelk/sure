/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/tags.
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
import { ErrorResponse, TagDetail } from "../zod-schemas";
export const requestBody = z.object({
		tag: z.object({
		name: z.string(),
		color: z.string().optional(),
	}),
	});
const success201 = TagDetail;
const error422 = ErrorResponse;
export const PostApiV1TagsContract: OperationContract = {
	operation: "POST /api/v1/tags",
	method: "POST",
	path: "/api/v1/tags",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 201: success201 },
	errorResponses: { 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/tags: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1Tags(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/tags"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/tags">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/tags", { ...init, contract: PostApiV1TagsContract });
}
