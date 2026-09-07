/**
 * GENERATED — do not edit by hand. Operation contract for PATCH /api/v1/auth/enable_ai.
 *
 * Source: docs/api/openapi.yaml (sha256: d9a13d3511d7165bf6b97a776e4e0e6f520b014e54bf49e2bd14387f42140f7b)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { z } from "zod";
import { apiPatch } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { ErrorResponse } from "../zod-schemas";
const success200 = z.object({
		user: z.object({
		id: z.string().optional(),
		email: z.string().optional(),
		first_name: z.string().nullable().optional(),
		last_name: z.string().nullable().optional(),
		ui_layout: z.enum(["dashboard", "intro"]).optional(),
		ai_enabled: z.boolean().optional(),
	}).optional(),
	});
const error401 = ErrorResponse;
const error403 = ErrorResponse;
export const PatchApiV1AuthEnableAiContract: OperationContract = {
	operation: "PATCH /api/v1/auth/enable_ai",
	method: "PATCH",
	path: "/api/v1/auth/enable_ai",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: { 401: error401, 403: error403 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated PATCH /api/v1/auth/enable_ai: success payloads are parsed through the operation contract before they reach callers. */
export function patchApiV1AuthEnableAi(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/auth/enable_ai"]["patch"]>
): Promise<ApiSuccess<ApiData<"patch", "/api/v1/auth/enable_ai">>> {
	const [init] = args;
	return apiPatch(client, "/api/v1/auth/enable_ai", { ...init, contract: PatchApiV1AuthEnableAiContract });
}
