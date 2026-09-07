/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/push_subscriptions.
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
import { ErrorResponse, PushSubscription } from "../zod-schemas";
export const requestBody = z.object({
		token: z.string(),
		environment: z.enum(["sandbox", "production"]),
		platform: z.enum(["ios"]),
	});
const success201 = PushSubscription;
const error422 = ErrorResponse;
export const PostApiV1PushSubscriptionsContract: OperationContract = {
	operation: "POST /api/v1/push_subscriptions",
	method: "POST",
	path: "/api/v1/push_subscriptions",
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
/** Validated POST /api/v1/push_subscriptions: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1PushSubscriptions(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/push_subscriptions"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/push_subscriptions">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/push_subscriptions", { ...init, contract: PostApiV1PushSubscriptionsContract });
}
