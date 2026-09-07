/**
 * GENERATED — do not edit by hand. Operation contract for POST /api/v1/imports/preflight.
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
import { ErrorResponse, ImportPreflightResponse } from "../zod-schemas";
export const requestBody = z.object({
		raw_file_content: z.string().optional(),
		file: z.instanceof(Blob).optional(),
		type: z.enum(["TransactionImport", "TradeImport", "AccountImport", "MintImport", "ActualImport", "YnabImport", "CategoryImport", "RuleImport", "MerchantImport", "PdfImport", "QifImport", "SureImport"]).optional(),
		account_id: z.string().optional(),
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
		rows_to_skip: z.number().int().min(0).optional(),
		amount_type_strategy: z.enum(["signed_amount", "custom_column"]).optional(),
		amount_type_inflow_value: z.string().optional(),
	});
export const requestMultipartBody = z.object({
		raw_file_content: z.string().optional(),
		file: z.instanceof(Blob).optional(),
		type: z.enum(["TransactionImport", "TradeImport", "AccountImport", "MintImport", "ActualImport", "YnabImport", "CategoryImport", "RuleImport", "MerchantImport", "PdfImport", "QifImport", "SureImport"]).optional(),
		account_id: z.string().optional(),
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
		rows_to_skip: z.number().int().min(0).optional(),
		amount_type_strategy: z.enum(["signed_amount", "custom_column"]).optional(),
		amount_type_inflow_value: z.string().optional(),
	});
const success200 = ImportPreflightResponse;
const error401 = ErrorResponse;
const error404 = ErrorResponse;
const error422 = ErrorResponse;
export const PostApiV1ImportsPreflightContract: OperationContract = {
	operation: "POST /api/v1/imports/preflight",
	method: "POST",
	path: "/api/v1/imports/preflight",
	pathParams: undefined,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: requestBody,
	requestMultipartBody: requestMultipartBody,
	requestBodyRequired: false,
	isMultipart: true,
	successResponses: { 200: success200 },
	errorResponses: { 401: error401, 404: error404, 422: error422 },
	emptyResponseStatuses: [],
	emptyErrorStatuses: [],
	isBinaryResponse: false,
	binaryResponse: undefined,
};
/** Validated POST /api/v1/imports/preflight: success payloads are parsed through the operation contract before they reach callers. */
export function postApiV1ImportsPreflight(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/imports/preflight"]["post"]>
): Promise<ApiSuccess<ApiData<"post", "/api/v1/imports/preflight">>> {
	const [init] = args;
	return apiPost(client, "/api/v1/imports/preflight", { ...init, contract: PostApiV1ImportsPreflightContract });
}
