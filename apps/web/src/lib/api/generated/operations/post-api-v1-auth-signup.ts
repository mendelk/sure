/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/auth/signup.
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
import { ErrorResponse } from "../zod-schemas";
export const requestBody = z.object({
		user: z.object({
		email: z.string(),
		password: z.string(),
		first_name: z.string().optional(),
		last_name: z.string().optional(),
	}),
		device: z.object({
		device_id: z.string(),
		device_name: z.string(),
		device_type: z.string(),
		os_version: z.string(),
		app_version: z.string(),
	}),
		invite_code: z.string().nullable().optional(),
	});
const success201 = z.object({
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
const error403 = ErrorResponse;
const error422 = ErrorResponse;
export const PostApiV1AuthSignupContract: OperationContract = {
	operation: "POST /api/v1/auth/signup",
	method: "POST",
	path: "/api/v1/auth/signup",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 201: success201 },
	errorResponses: { 403: error403, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/auth/signup: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1AuthSignup(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/auth/signup"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/auth/signup">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/auth/signup", { ...init, contract: PostApiV1AuthSignupContract });
}
