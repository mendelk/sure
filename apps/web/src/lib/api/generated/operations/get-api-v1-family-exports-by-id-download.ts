/**
 * GENERATED — do not edit by hand. Operation contract for GET /api/v1/family_exports/{id}/download.
 *
 * Source: docs/api/openapi.yaml (sha256: fb4401a6f8bec7280f908403d66dfa23cf2d8d9fa9fe287771d97e859b32657f)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { z } from "zod";
import { apiDownload } from "../../client";
import type { ApiInit, DownloadedFile, SureClient } from "../../client";
import type { OperationContract } from "../../contract";
import type { paths } from "../../openapi";
import { ErrorResponse } from "../zod-schemas";
export const pathParams = z.object({
	id: z.string(),
});
const error401 = ErrorResponse;
const error403 = ErrorResponse;
const error404 = ErrorResponse;
const error409 = ErrorResponse;
export const binaryResponse = z.instanceof(Blob);
export const GetApiV1FamilyExportsByIdDownloadContract: OperationContract = {
	operation: "GET /api/v1/family_exports/{id}/download",
	method: "GET",
	path: "/api/v1/family_exports/{id}/download",
	pathParams: pathParams,
	queryParams: undefined,
	headerParams: undefined,
	requestBody: undefined,
	requestMultipartBody: undefined,
	requestBodyRequired: false,
	isMultipart: false,
	successResponses: {  },
	errorResponses: { 401: error401, 403: error403, 404: error404, 409: error409 },
	emptyResponseStatuses: [302],
	emptyErrorStatuses: [],
	isBinaryResponse: true,
	binaryResponse: binaryResponse,
};
/** Validated binary download for GET /api/v1/family_exports/{id}/download: parses the Blob through the operation contract. */
export function getApiV1FamilyExportsByIdDownload(
	client: SureClient,
	...args: ApiInit<paths["/api/v1/family_exports/{id}/download"]["get"]>
): Promise<DownloadedFile> {
	const [init] = args;
	return apiDownload(client, "/api/v1/family_exports/{id}/download", { ...init, contract: GetApiV1FamilyExportsByIdDownloadContract });
}
