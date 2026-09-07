/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/valuations.
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
import { ErrorResponse, Valuation } from "../zod-schemas";
export const requestBody = z.object({
		valuation: z.object({
		account_id: z.string(),
		amount: z.number(),
		date: z.string(),
		notes: z.string().optional(),
		upsert: z.boolean().optional(),
	}),
		upsert: z.boolean().optional(),
	});
const success200 = Valuation;
const success201 = Valuation;
const error404 = ErrorResponse;
const error422 = ErrorResponse;
export const PostApiV1ValuationsContract: OperationContract = {
	operation: "POST /api/v1/valuations",
	method: "POST",
	path: "/api/v1/valuations",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: undefined,
	requestBodyRequired: true,
	isMultipart: false,
	successResponses: { 200: success200, 201: success201 },
	errorResponses: { 404: error404, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/valuations: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1Valuations(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/valuations"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/valuations">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/valuations", { ...init, contract: PostApiV1ValuationsContract });
}
