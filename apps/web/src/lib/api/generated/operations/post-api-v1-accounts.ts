/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/accounts.
 *
 * Source: docs/api/openapi.yaml (sha256: d9a13d3511d7165bf6b97a776e4e0e6f520b014e54bf49e2bd14387f42140f7b)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { apiPost } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { AccountCreateRequest, AccountDetail, ErrorResponse } from "../zod-schemas";
export const requestBody = AccountCreateRequest;
const success201 = AccountDetail;
const error403 = ErrorResponse;
const error422 = ErrorResponse;
export const PostApiV1AccountsContract: OperationContract = {
	operation: "POST /api/v1/accounts",
	method: "POST",
	path: "/api/v1/accounts",
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
/** Validated POST /api/v1/accounts: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1Accounts(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/accounts"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/accounts">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/accounts", { ...init, contract: PostApiV1AccountsContract });
}
