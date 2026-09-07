/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/chats/{chat_id}/messages/retry.
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
import { ErrorResponse, RetryResponse } from "../zod-schemas";
export const pathParams = z.object({
	chat_id: z.string(),
});
const success202 = RetryResponse;
const error404 = ErrorResponse;
const error422 = ErrorResponse;
export const PostApiV1ChatsByChatIdMessagesRetryContract: OperationContract = {
	operation: "POST /api/v1/chats/{chat_id}/messages/retry",
	method: "POST",
	path: "/api/v1/chats/{chat_id}/messages/retry",
	pathParams: pathParams,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 202: success202 },
	errorResponses: { 404: error404, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/chats/{chat_id}/messages/retry: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1ChatsByChatIdMessagesRetry(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/chats/{chat_id}/messages/retry"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/chats/{chat_id}/messages/retry">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/chats/{chat_id}/messages/retry", { ...init, contract: PostApiV1ChatsByChatIdMessagesRetryContract });
}
