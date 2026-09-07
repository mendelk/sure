import { describe, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { GetApiV1Accounts200Response } from "./zod/endpoints/accounts/accounts.zod";
import { AccountDetail } from "./zod/models/accountDetail.zod";
import { ErrorResponse } from "./zod/models/errorResponse.zod";
import { Pagination } from "./zod/models/pagination.zod";
import { RuleCondition } from "./zod/models/ruleCondition.zod";
import { SuccessMessage } from "./zod/models/successMessage.zod";
import type { components, paths } from "./openapi";

type StaticAccountCollection =
	paths["/api/v1/accounts"]["get"]["responses"]["200"]["content"]["application/json"];
type StaticAccountDetail = components["schemas"]["AccountDetail"];
type StaticErrorResponse = components["schemas"]["ErrorResponse"];
type StaticRuleCondition = components["schemas"]["RuleCondition"];

/**
 * Compile-time compatibility between the Orval Zod parsers and the
 * openapi-typescript static types, derived from the same
 * `docs/api/openapi.yaml`.
 *
 * Fully-required schemas match exactly. Schemas with optional/nullable
 * fields are checked at key level (same contract shape) plus exact
 * required-leaf types: the two generators legitimately differ on
 * nullability spelling (Zod `.nullish()` admits `undefined`;
 * openapi-typescript uses exact-optional `?: T | null`; free-form
 * records are `Record<string, unknown>` vs `Record<string, never>`),
 * so whole-object subtyping in either direction cannot hold. Value-level
 * agreement for those fields is proven by the runtime tests in
 * `./zod-contracts.test.ts` instead.
 */
describe("static/runtime contract compatibility", () => {
	it("matches exactly for fully-required schemas", () => {
		expectTypeOf<z.infer<typeof SuccessMessage>>().toEqualTypeOf<{
			message: string;
		}>();
		expectTypeOf<z.infer<typeof Pagination>>().toEqualTypeOf<{
			page: number;
			per_page: number;
			total_count: number;
			total_pages: number;
		}>();
	});

	it("covers the same fields with the same required-leaf types", () => {
		expectTypeOf<keyof z.infer<typeof ErrorResponse>>().toEqualTypeOf<keyof StaticErrorResponse>();
		expectTypeOf<z.infer<typeof ErrorResponse>["error"]>().toEqualTypeOf<
			StaticErrorResponse["error"]
		>();
		expectTypeOf<keyof z.infer<typeof AccountDetail>>().toEqualTypeOf<keyof StaticAccountDetail>();
		expectTypeOf<z.infer<typeof AccountDetail>["balance_cents"]>().toEqualTypeOf<
			StaticAccountDetail["balance_cents"]
		>();
		expectTypeOf<z.infer<typeof AccountDetail>["status"]>().toEqualTypeOf<
			StaticAccountDetail["status"]
		>();
	});

	it("keeps the recursive schema aligned with its static type", () => {
		expectTypeOf<keyof z.infer<typeof RuleCondition>>().toEqualTypeOf<keyof StaticRuleCondition>();
		expectTypeOf<z.infer<typeof RuleCondition>["operator"]>().toEqualTypeOf<
			StaticRuleCondition["operator"]
		>();
	});

	it("keeps operation response parsers aligned with endpoint static types", () => {
		expectTypeOf<keyof z.infer<typeof GetApiV1Accounts200Response>>().toEqualTypeOf<
			keyof StaticAccountCollection
		>();
	});
});
