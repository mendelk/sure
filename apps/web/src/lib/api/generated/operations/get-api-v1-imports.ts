/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/imports.
 *
 * Source: docs/api/openapi.yaml (sha256: d9a13d3511d7165bf6b97a776e4e0e6f520b014e54bf49e2bd14387f42140f7b)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { z } from "zod";
import { apiGet } from "../../client";
import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { ImportCollection } from "../zod-schemas";
export const queryParams = z.object({
	page: z.number().int().optional(),
	per_page: z.number().int().optional(),
	status: z.enum(["pending", "complete", "importing", "reverting", "revert_failed", "failed"]).optional(),
	type: z.enum(["TransactionImport", "TradeImport", "AccountImport", "MintImport", "ActualImport", "YnabImport", "CategoryImport", "RuleImport", "MerchantImport", "PdfImport", "QifImport", "SureImport"]).optional(),
});
const success200 = ImportCollection;
export const GetApiV1ImportsContract: OperationContract = {
	operation: "GET /api/v1/imports",
	method: "GET",
	path: "/api/v1/imports",
	pathParams: undefined,
	queryParams: queryParams,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: { 200: success200 },
	errorResponses: {  },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated GET /api/v1/imports: success payloads are parsed through the operation contract before they reach callers. */
export function getApiV1Imports(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/imports"]["get"]>
): Promise<ApiSuccess<ApiData<"get", "/api/v1/imports">>> {
	const [init] = args;
	return apiGet(client, "/api/v1/imports", { ...init, contract: GetApiV1ImportsContract });
}
