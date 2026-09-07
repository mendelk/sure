/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/auth/login.
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
		email: z.string(),
		password: z.string(),
		otp_code: z.string().nullable().optional(),
		device: z.object({
		device_id: z.string(),
		device_name: z.string(),
		device_type: z.string(),
		os_version: z.string(),
		app_version: z.string(),
	}),
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
const error401 = ErrorResponse;
export const PostApiV1AuthLoginContract: OperationContract = {
	operation: "POST /api/v1/auth/login",
	method: "POST",
	path: "/api/v1/auth/login",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 401: error401 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/auth/login: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1AuthLogin(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/auth/login"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/auth/login">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/auth/login", { ...init, contract: PostApiV1AuthLoginContract });
}
