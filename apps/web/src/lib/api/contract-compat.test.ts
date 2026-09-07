import { describe, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { components } from "./openapi";
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

/**
 * Compile-time proof that generated runtime parsers and generated static
 * types cannot silently diverge: both derive from `docs/api/openapi.yaml`
 * (openapi-typescript for `./openapi`, the in-repo generator for
 * `./generated`), and these assertions fail the test boundary's typecheck
 * as soon as one side drifts.
 *
 * Direction notes (`exactOptionalPropertyTypes`): schemas without
 * nullable-optionals are exactly equal both ways; schemas with
 * nullable-optional fields infer an extra `| undefined` in the value
 * position, so the static type is asserted assignable to the inferred
 * parser type (the parser accepts everything the static type allows).
 */
describe("static/runtime contract compatibility", () => {
	it("matches exactly for fully-required schemas", () => {
		expectTypeOf<z.infer<typeof Pagination>>().toEqualTypeOf<components["schemas"]["Pagination"]>();
		expectTypeOf<components["schemas"]["Pagination"]>().toEqualTypeOf<z.infer<typeof Pagination>>();
	});

	it("keeps static types assignable to parser output for nullable schemas", () => {
		expectTypeOf<components["schemas"]["AccountDetail"]>().toMatchTypeOf<
			z.infer<typeof AccountDetail>
		>();
		expectTypeOf<components["schemas"]["FamilyExport"]>().toMatchTypeOf<
			z.infer<typeof FamilyExport>
		>();
		expectTypeOf<components["schemas"]["MerchantDetail"]>().toMatchTypeOf<
			z.infer<typeof MerchantDetail>
		>();
		expectTypeOf<components["schemas"]["ImportSessionChunk"]>().toMatchTypeOf<
			z.infer<typeof ImportSessionChunk>
		>();
		expectTypeOf<components["schemas"]["ErrorResponse"]>().toMatchTypeOf<
			z.infer<typeof ErrorResponse>
		>();
		expectTypeOf<components["schemas"]["ChatDetail"]>().toMatchTypeOf<z.infer<typeof ChatDetail>>();
		expectTypeOf<components["schemas"]["AccountCollection"]>().toMatchTypeOf<
			z.infer<typeof AccountCollection>
		>();
	});

	it("aliases the static type for the recursive schema", () => {
		expectTypeOf<RuleCondition>().toEqualTypeOf<components["schemas"]["RuleCondition"]>();
	});
});
