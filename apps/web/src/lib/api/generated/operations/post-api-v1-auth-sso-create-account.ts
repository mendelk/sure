/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/auth/sso_create_account.
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
import { ErrorResponse } from "../zod-schemas";
export const requestBody = z.object({
		linking_code: z.string(),
		first_name: z.string().optional(),
		last_name: z.string().optional(),
	});
const success200 = z.object({
		access_token: z.string().optional(),
		refresh_token: z.string().optional(),
		token_type: z.string().optional(),
		expires_in: z.number().int().optional(),
		created_at: z.number().int().optional(),
		user: z.object({
		id: z.string().optional(),
		email: z.string().optional(),
		first_name: z.string().optional(),
		last_name: z.string().optional(),
		ui_layout: z.enum(["dashboard", "intro"]).optional(),
		ai_enabled: z.boolean().optional(),
	}).optional(),
	});
const error400 = ErrorResponse;
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error422 = z.object({
		errors: z.array(z.string()).optional(),
	});
export const PostApiV1AuthSsoCreateAccountContract: OperationContract = {
	operation: "POST /api/v1/auth/sso_create_account",
	method: "POST",
	path: "/api/v1/auth/sso_create_account",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 400: error400, 401: error401, 403: error403, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/auth/sso_create_account: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1AuthSsoCreateAccount(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/auth/sso_create_account"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/auth/sso_create_account">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/auth/sso_create_account", { ...init, contract: PostApiV1AuthSsoCreateAccountContract });
}
