/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/imports.
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
import { ErrorResponse, ErrorResponseWithImportId, ImportResponse } from "../zod-schemas";
export const requestBody = z.object({
		raw_file_content: z.string().optional(),
		type: z.enum(["TransactionImport", "TradeImport", "AccountImport", "MintImport", "ActualImport", "YnabImport", "CategoryImport", "RuleImport", "MerchantImport", "PdfImport", "QifImport", "SureImport"]).optional(),
		account_id: z.string().optional(),
		publish: z.string().optional(),
		date_col_label: z.string().optional(),
		amount_col_label: z.string().optional(),
		name_col_label: z.string().optional(),
		category_col_label: z.string().optional(),
		tags_col_label: z.string().optional(),
		notes_col_label: z.string().optional(),
		account_col_label: z.string().optional(),
		qty_col_label: z.string().optional(),
		ticker_col_label: z.string().optional(),
		price_col_label: z.string().optional(),
		entity_type_col_label: z.string().optional(),
		currency_col_label: z.string().optional(),
		exchange_operating_mic_col_label: z.string().optional(),
		date_format: z.string().optional(),
		number_format: z.enum(["1,234.56", "1.234,56", "1 234,56", "1,234"]).optional(),
		signage_convention: z.enum(["inflows_positive", "inflows_negative"]).optional(),
		col_sep: z.enum([",", ";"]).optional(),
		amount_type_strategy: z.enum(["signed_amount", "custom_column"]).optional(),
		amount_type_inflow_value: z.string().optional(),
	});
export const requestMultipartBody = z.object({
		raw_file_content: z.string().optional(),
		type: z.enum(["TransactionImport", "TradeImport", "AccountImport", "MintImport", "ActualImport", "YnabImport", "CategoryImport", "RuleImport", "MerchantImport", "PdfImport", "QifImport", "SureImport"]).optional(),
		account_id: z.string().optional(),
		publish: z.string().optional(),
		date_col_label: z.string().optional(),
		amount_col_label: z.string().optional(),
		name_col_label: z.string().optional(),
		category_col_label: z.string().optional(),
		tags_col_label: z.string().optional(),
		notes_col_label: z.string().optional(),
		account_col_label: z.string().optional(),
		qty_col_label: z.string().optional(),
		ticker_col_label: z.string().optional(),
		price_col_label: z.string().optional(),
		entity_type_col_label: z.string().optional(),
		currency_col_label: z.string().optional(),
		exchange_operating_mic_col_label: z.string().optional(),
		date_format: z.string().optional(),
		number_format: z.enum(["1,234.56", "1.234,56", "1 234,56", "1,234"]).optional(),
		signage_convention: z.enum(["inflows_positive", "inflows_negative"]).optional(),
		col_sep: z.enum([",", ";"]).optional(),
		amount_type_strategy: z.enum(["signed_amount", "custom_column"]).optional(),
		amount_type_inflow_value: z.string().optional(),
	});
const success201 = ImportResponse;
const error422 = z.union([ErrorResponse, ErrorResponseWithImportId]);
const error500 = ErrorResponseWithImportId;
export const PostApiV1ImportsContract: OperationContract = {
	operation: "POST /api/v1/imports",
	method: "POST",
	path: "/api/v1/imports",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: requestMultipartBody,
	requestBodyRequired: false,
	isMultipart: true,
	successResponses: { 201: success201 },
	errorResponses: { 422: error422, 500: error500 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/imports: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1Imports(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/imports"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/imports">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/imports", { ...init, contract: PostApiV1ImportsContract });
}
