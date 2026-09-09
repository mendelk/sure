import { describe, expect, it } from "vitest";
import {
	getOperationContract,
	parseOperationRequest,
	parseOperationResponse,
} from "./operation-contracts";
import { DeleteApiV1TagsId204Response } from "./zod/endpoints/tags/tags.zod";
import { GetApiV1FamilyExportsIdDownload302Response } from "./zod/endpoints/family-exports/family-exports.zod";
import { PostApiV1AuthLoginBody } from "./zod/endpoints/auth/auth.zod";
import { PostApiV1AuthSsoLink401Response } from "./zod/endpoints/auth/auth.zod";
import { PostApiV1MerchantsImportBody } from "./zod/endpoints/merchants/merchants.zod";
import { AccountDetail } from "./zod/models/accountDetail.zod";
import { ErrorResponse } from "./zod/models/errorResponse.zod";
import { Merchant } from "./zod/models/merchant.zod";
import { RuleCondition } from "./zod/models/ruleCondition.zod";
import { RuleResponse } from "./zod/models/ruleResponse.zod";
import { ToolCall } from "./zod/models/toolCall.zod";

/**
 * Runtime behavior of the Orval-generated parsers, imported per operation
 * (the tree-shakeable access pattern route code must use).
 */
const UUID_A = "123e4567-e89b-12d3-a456-426614174000";
const UUID_B = "123e4567-e89b-12d3-a456-426614174001";
const TIMESTAMP = "2026-09-07T12:00:00.000Z";

function validAccountDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: UUID_A,
		name: "Cash",
		balance: "100.00",
		balance_cents: 10000,
		cash_balance: "100.00",
		cash_balance_cents: 10000,
		currency: "USD",
		classification: "asset",
		account_type: "depository",
		status: "active",
		manual: true,
		linked: false,
		capabilities: ["read", "update", "archive", "delete"],
		created_at: TIMESTAMP,
		updated_at: TIMESTAMP,
		...overrides,
	};
}

describe("component parsers", () => {
	it("accepts representative valid payloads", () => {
		expect(AccountDetail.safeParse(validAccountDetail()).success).toBe(true);
		expect(ErrorResponse.safeParse({ error: "not_found" }).success).toBe(true);
		expect(
			ErrorResponse.safeParse({ error: "unprocessable_entity", details: ["Name can't be blank"] })
				.success,
		).toBe(true);
	});

	it("rejects malformed nested fields with paths", () => {
		const parsed = AccountDetail.safeParse(validAccountDetail({ balance_cents: "10000" }));
		expect(parsed.success).toBe(false);
		if (parsed.success) {
			throw new Error("Expected the malformed payload to fail validation.");
		}
		expect(parsed.error.issues[0]?.path).toEqual(["balance_cents"]);
	});

	it("honours nullable vs required fields", () => {
		expect(AccountDetail.safeParse(validAccountDetail({ subtype: null })).success).toBe(true);
		expect(AccountDetail.safeParse(validAccountDetail({ subtype: undefined })).success).toBe(true);
		const { name: _dropped, ...missing } = validAccountDetail();
		expect(AccountDetail.safeParse(missing).success).toBe(false);
	});

	it("rejects unknown enum values", () => {
		expect(AccountDetail.safeParse(validAccountDetail({ status: "frozen" })).success).toBe(false);
	});

	it("parses manual account capabilities and rejects unknown capabilities", () => {
		expect(AccountDetail.safeParse(validAccountDetail({ capabilities: ["read"] })).success).toBe(
			true,
		);
		expect(AccountDetail.safeParse(validAccountDetail({ capabilities: ["launch"] })).success).toBe(
			false,
		);
	});

	it("parses union error details (array or object) and rejects the rest", () => {
		expect(ErrorResponse.safeParse({ error: "x", details: { field: "bad" } }).success).toBe(true);
		expect(ErrorResponse.safeParse({ error: "x", details: 42 }).success).toBe(false);
	});

	it("parses the sso-link error union (ErrorResponse or MFA challenge)", () => {
		expect(PostApiV1AuthSsoLink401Response.safeParse({ error: "unauthorized" }).success).toBe(true);
		expect(
			PostApiV1AuthSsoLink401Response.safeParse({ error: "mfa_required", mfa_required: true })
				.success,
		).toBe(true);
		expect(PostApiV1AuthSsoLink401Response.safeParse({ nope: true }).success).toBe(false);
	});

	it("parses records and additional properties", () => {
		expect(
			ToolCall.safeParse({
				id: UUID_A,
				function_name: "categorize",
				function_arguments: { transaction_id: UUID_B, nested: { deep: [1, 2] } },
				created_at: TIMESTAMP,
			}).success,
		).toBe(true);
		expect(
			ToolCall.safeParse({
				id: UUID_A,
				function_name: "categorize",
				created_at: TIMESTAMP,
			}).success,
		).toBe(false);
	});

	it("validates recursive rule conditions to arbitrary depth", () => {
		const leaf = {
			id: UUID_A,
			condition_type: "category",
			operator: "equals",
			value: null,
			sub_conditions: [],
			created_at: TIMESTAMP,
			updated_at: TIMESTAMP,
		};
		const depth2 = { ...leaf, id: UUID_B, sub_conditions: [leaf] };
		const depth3 = { ...leaf, sub_conditions: [depth2] };
		expect(RuleCondition.safeParse(depth3).success).toBe(true);
		const badDeep = {
			...leaf,
			sub_conditions: [{ ...leaf, sub_conditions: [{ ...leaf, operator: 42 }] }],
		};
		expect(RuleCondition.safeParse(badDeep).success).toBe(false);
		expect(
			RuleResponse.safeParse({
				data: {
					id: UUID_A,
					resource_type: "transaction",
					active: true,
					conditions: [depth3],
					actions: [],
					created_at: TIMESTAMP,
					updated_at: TIMESTAMP,
				},
			}).success,
		).toBe(true);
	});
});

describe("format enforcement (generator-provided, never weakened)", () => {
	it("enforces uuid, email, url, date, and date-time formats", () => {
		const device = {
			device_id: "device-1",
			device_name: "Test",
			device_type: "ios",
			os_version: "18.0",
			app_version: "1.0.0",
		};
		expect(AccountDetail.safeParse(validAccountDetail({ id: "not-a-uuid" })).success).toBe(false);
		expect(
			PostApiV1AuthLoginBody.safeParse({ email: "not-an-email", password: "x", device }).success,
		).toBe(false);
		expect(
			PostApiV1AuthLoginBody.safeParse({ email: "user@example.com", password: "x", device })
				.success,
		).toBe(true);
		expect(Merchant.safeParse({ id: UUID_A, name: "Acme", website_url: "not a url" }).success).toBe(
			false,
		);
		expect(
			Merchant.safeParse({ id: UUID_A, name: "Acme", website_url: "https://acme.example" }).success,
		).toBe(true);
		expect(AccountDetail.safeParse(validAccountDetail({ created_at: "2026-09-07" })).success).toBe(
			false,
		);
		expect(AccountDetail.safeParse(validAccountDetail({ created_at: TIMESTAMP })).success).toBe(
			true,
		);
	});
});

describe("empty, binary, and multipart parsers", () => {
	it("accepts empty responses as void (undefined and empty-string forms)", () => {
		expect(DeleteApiV1TagsId204Response.safeParse(undefined).success).toBe(true);
		expect(DeleteApiV1TagsId204Response.safeParse({}).success).toBe(false);
	});

	it("parses binary download responses as unknown (Blob handled by transport)", () => {
		expect(GetApiV1FamilyExportsIdDownload302Response.safeParse(undefined).success).toBe(true);
	});

	it("validates multipart metadata with binary file parts", () => {
		const file = new File(["row"], "merchants.csv", { type: "text/csv" });
		expect(PostApiV1MerchantsImportBody.safeParse({ file }).success).toBe(true);
		expect(PostApiV1MerchantsImportBody.safeParse({ file: "not-a-file" }).success).toBe(false);
		expect(PostApiV1MerchantsImportBody.safeParse({}).success).toBe(false);
	});
});

describe("operation parse helpers", () => {
	it("fails closed on undocumented statuses", () => {
		const contract = getOperationContract("POST", "/api/v1/accounts");
		expect(contract).toBeDefined();
		if (contract === undefined) {
			return;
		}
		const parsed = parseOperationResponse(contract, 299, { ok: true });
		expect(parsed.ok).toBe(false);
		if (parsed.ok) {
			throw new Error("Expected the undocumented status to fail closed.");
		}
		expect(parsed.part).toBe("status");
	});

	it("validates request parts for the BFF transport", () => {
		const contract = getOperationContract("GET", "/api/v1/accounts");
		expect(contract).toBeDefined();
		if (contract === undefined) {
			return;
		}
		expect(parseOperationRequest(contract, { query: { page: 2 } }).ok).toBe(true);
		const bad = parseOperationRequest(contract, { query: { page: "two" } });
		expect(bad.ok).toBe(false);
		if (bad.ok) {
			throw new Error("Expected the invalid query to fail validation.");
		}
		expect(bad.part).toBe("query");
		expect(parseOperationRequest(contract, { query: { page: 2, typo: true } }).ok).toBe(false);
		const undocumentedBody = parseOperationRequest(contract, { body: { page: 2 } });
		expect(undocumentedBody).toMatchObject({ ok: false, part: "body" });
	});
});
