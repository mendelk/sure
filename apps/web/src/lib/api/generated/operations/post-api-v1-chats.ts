/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/chats.
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
import { ChatDetail, ErrorResponse } from "../zod-schemas";
export const requestBody = z.object({
		title: z.string(),
		message: z.string().optional(),
		model: z.string().optional(),
	});
const success201 = ChatDetail;
const error422 = ErrorResponse;
export const PostApiV1ChatsContract: OperationContract = {
	operation: "POST /api/v1/chats",
	method: "POST",
	path: "/api/v1/chats",
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
/** Validated POST /api/v1/chats: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1Chats(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/chats"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/chats">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/chats", { ...init, contract: PostApiV1ChatsContract });
}
