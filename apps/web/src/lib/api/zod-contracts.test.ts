import { describe, expect, it } from "vitest";
import {
	AccountCollection,
	AccountDetail,
	ChatDetail,
	ErrorResponse,
	FamilyExport,
	ImportSessionChunk,
	MerchantDetail,
	Pagination,
	RuleCondition,
} from "./generated/zod-schemas";
import { GetApiV1FamilyExportsByIdDownloadContract } from "./generated/operations/get-api-v1-family-exports-by-id-download";
import { DeleteApiV1TagsByIdContract } from "./generated/operations/delete-api-v1-tags-by-id";
import { PostApiV1ImportSessionsByIdChunksContract } from "./generated/operations/post-api-v1-import-sessions-by-id-chunks";
import { parseOperationResponse } from "./generated/operation-contracts";

/**
 * Runtime proof for the generated Zod boundary. Every schema below is
 * imported from the generated contract — nothing is hand-copied — so these
 * tests break on generator drift even before `contracts:check` runs.
 */

const CREATED_AT = "2026-09-07T12:00:00.000Z";
const UPDATED_AT = "2026-09-07T13:30:00.000Z";

function validAccount(): Record<string, unknown> {
	return {
		id: "123e4567-e89b-12d3-a456-426614174000",
		name: "Cash",
		balance: "100.00",
		balance_cents: 10000,
		cash_balance: "100.00",
		cash_balance_cents: 10000,
		currency: "USD",
		classification: "asset",
		account_type: "depository",
		status: "active",
		created_at: CREATED_AT,
		updated_at: UPDATED_AT,
	};
}

function validFamilyExport(): Record<string, unknown> {
	return {
		id: "123e4567-e89b-12d3-a456-426614174001",
		status: "completed",
		filename: "export.zip",
		downloadable: true,
		file: { attached: true, byte_size: 1024, content_type: "application/zip" },
		created_at: CREATED_AT,
		updated_at: UPDATED_AT,
	};
}

describe("component schemas", () => {
	it("accepts representative valid payloads", () => {
		expect(
			AccountCollection.safeParse({
				accounts: [validAccount()],
				pagination: { page: 1, per_page: 25, total_count: 1, total_pages: 1 },
			}).success,
		).toBe(true);
		expect(AccountDetail.safeParse(validAccount()).success).toBe(true);
		expect(FamilyExport.safeParse(validFamilyExport()).success).toBe(true);
		expect(
			Pagination.safeParse({ page: 2, per_page: 25, total_count: 60, total_pages: 3 }).success,
		).toBe(true);
	});

	it("rejects malformed nested fields", () => {
		const account = validAccount();
		const badNested = { ...account, balance_cents: "10000" };
		const result = AccountDetail.safeParse(badNested);
		expect(result.success).toBe(false);

		const badCollection = {
			accounts: [validAccount()],
			pagination: { page: 0, per_page: 25, total_count: 1, total_pages: 1 },
		};
		expect(AccountCollection.safeParse(badCollection).success).toBe(false);
	});

	it("honours nullable vs required fields", () => {
		const account = validAccount();
		// Nullable + optional: explicit null passes.
		expect(AccountDetail.safeParse({ ...account, subtype: null }).success).toBe(true);
		// Nullable but required: null passes, absence fails.
		expect(AccountDetail.safeParse({ ...account, account_type: null }).success).toBe(true);
		const { account_type: _dropped, ...withoutRequired } = account;
		expect(AccountDetail.safeParse(withoutRequired).success).toBe(false);
		// Non-nullable: null is rejected.
		expect(AccountDetail.safeParse({ ...account, name: null }).success).toBe(false);
	});

	it("rejects malformed date-time strings but keeps dates lenient", () => {
		const account = validAccount();
		expect(AccountDetail.safeParse({ ...account, created_at: "not-a-date" }).success).toBe(false);
		expect(AccountDetail.safeParse({ ...account, created_at: "2026-09-07" }).success).toBe(false);
	});

	it("rejects unknown enum values", () => {
		expect(FamilyExport.safeParse({ ...validFamilyExport(), status: "emailed" }).success).toBe(
			false,
		);
		expect(
			MerchantDetail.safeParse({
				id: "m-1",
				name: "Acme",
				type: "UnknownMerchant",
				created_at: CREATED_AT,
				updated_at: UPDATED_AT,
			}).success,
		).toBe(false);
	});

	it("parses union error details (array or object) and rejects the rest", () => {
		expect(ErrorResponse.safeParse({ error: "unprocessable_entity" }).success).toBe(true);
		expect(ErrorResponse.safeParse({ error: "x", details: ["Name can't be blank"] }).success).toBe(
			true,
		);
		expect(
			ErrorResponse.safeParse({ error: "x", details: { name: ["can't be blank"] } }).success,
		).toBe(true);
		expect(ErrorResponse.safeParse({ error: "x", details: 42 }).success).toBe(false);
		expect(ErrorResponse.safeParse({}).success).toBe(false);
	});

	it("parses allOf compositions", () => {
		const chat = {
			id: "123e4567-e89b-12d3-a456-426614174002",
			title: "Budget help",
			created_at: CREATED_AT,
			updated_at: UPDATED_AT,
			messages: [
				{
					id: "m-1",
					type: "user_message",
					role: "user",
					content: "Hello",
					created_at: CREATED_AT,
					updated_at: UPDATED_AT,
				},
			],
		};
		expect(ChatDetail.safeParse(chat).success).toBe(true);
		expect(ChatDetail.safeParse({ ...chat, messages: [{ id: "m-1" }] }).success).toBe(false);
	});

	it("parses records and additional properties", () => {
		const chunk = {
			id: "123e4567-e89b-12d3-a456-426614174003",
			sequence: 1,
			status: "complete",
			rows_count: 10,
			summary: { transactions: { created: 8, updated: 2 } },
			created_at: CREATED_AT,
			updated_at: UPDATED_AT,
		};
		expect(ImportSessionChunk.safeParse(chunk).success).toBe(true);
		expect(
			ImportSessionChunk.safeParse({ ...chunk, summary: { transactions: { created: "eight" } } })
				.success,
		).toBe(false);
	});

	it("validates recursive schemas to arbitrary depth", () => {
		const leaf = {
			id: "leaf",
			condition_type: "account",
			operator: "equals",
			sub_conditions: [],
			created_at: CREATED_AT,
			updated_at: UPDATED_AT,
		};
		const root = { ...leaf, id: "root", sub_conditions: [leaf] };
		expect(RuleCondition.safeParse(root).success).toBe(true);
		const badNested = { ...leaf, id: "root", sub_conditions: [{ ...leaf, operator: 42 }] };
		expect(RuleCondition.safeParse(badNested).success).toBe(false);
	});
});

describe("operation response parsers", () => {
	it("accepts empty responses as void and rejects bodies", () => {
		const parser = DeleteApiV1TagsByIdContract.successResponses["204"];
		expect(parser).toBeDefined();
		expect(parser?.safeParse(undefined).success).toBe(true);
		expect(parser?.safeParse({}).success).toBe(false);
		expect(DeleteApiV1TagsByIdContract.emptyResponseStatuses).toContain(204);
	});

	it("validates binary responses as Blob", () => {
		expect(GetApiV1FamilyExportsByIdDownloadContract.isBinaryResponse).toBe(true);
		const parser = GetApiV1FamilyExportsByIdDownloadContract.binaryResponse;
		expect(parser?.safeParse(new Blob(["bytes"])).success).toBe(true);
		expect(parser?.safeParse("bytes").success).toBe(false);
		expect(parser?.safeParse(undefined).success).toBe(false);
	});

	it("validates multipart metadata with binary file parts", () => {
		expect(PostApiV1ImportSessionsByIdChunksContract.isMultipart).toBe(true);
		const multipart = PostApiV1ImportSessionsByIdChunksContract.requestMultipartBody;
		expect(multipart?.safeParse({ sequence: 1, file: new Blob(["a,b"]) }).success).toBe(true);
		expect(multipart?.safeParse({ sequence: 1 }).success).toBe(false);
		expect(multipart?.safeParse({ sequence: 0, file: new Blob([]) }).success).toBe(false);
		expect(multipart?.safeParse({ sequence: 1, file: "a,b" }).success).toBe(false);
	});

	it("fails closed on undocumented statuses via the strict helper", () => {
		const contract = DeleteApiV1TagsByIdContract;
		const ok = parseOperationResponse(contract, 204, undefined);
		expect(ok.ok).toBe(true);
		const unknown = parseOperationResponse(contract, 200, {});
		expect(unknown.ok).toBe(false);
	});
});
