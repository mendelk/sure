/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/chats/{chat_id}/messages.
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
import { ErrorResponse, MessageResponse } from "../zod-schemas";
export const pathParams = z.object({
	chat_id: z.string(),
});
export const requestBody = z.object({
		content: z.string(),
		model: z.string().optional(),
	});
const success201 = MessageResponse;
const error404 = ErrorResponse;
const error422 = ErrorResponse;
export const PostApiV1ChatsByChatIdMessagesContract: OperationContract = {
	operation: "POST /api/v1/chats/{chat_id}/messages",
	method: "POST",
	path: "/api/v1/chats/{chat_id}/messages",
	pathParams: pathParams,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 201: success201 },
	errorResponses: { 404: error404, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/chats/{chat_id}/messages: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1ChatsByChatIdMessages(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/chats/{chat_id}/messages"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/chats/{chat_id}/messages">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/chats/{chat_id}/messages", { ...init, contract: PostApiV1ChatsByChatIdMessagesContract });
}
