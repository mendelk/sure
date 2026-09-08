// Fixtures agree with the generated runtime contracts (apps/web).
//
// Typing a fixture against `openapi.d.ts` is necessary but not sufficient:
// the BFF and the mock handlers validate with the Orval-generated Zod
// parsers. This suite parses every response fixture through the same
// `parseOperationResponse` entrypoint so a contract change that the types
// miss still fails loudly here.
import { describe, expect, it } from "vitest";
import { getOperationContract, parseOperationResponse } from "~/lib/api/operation-contracts";
import { fixtureAccountCollection, fixtureApiError, fixtureLoginSuccess } from "./api-fixtures";

function expectResponseOk(method: string, path: string, status: number, data: unknown): void {
	const contract = getOperationContract(method, path);
	expect(contract, `${method} ${path} is a known operation`).toBeDefined();
	if (contract === undefined) {
		return;
	}
	const result = parseOperationResponse(contract, status, data);
	expect(result).toEqual({ ok: true, data });
}

describe("typed API fixtures", () => {
	it("login success parses as POST /api/v1/auth/login 200", () => {
		expectResponseOk("POST", "/api/v1/auth/login", 200, fixtureLoginSuccess());
	});

	it("account collection parses as GET /api/v1/accounts 200", () => {
		expectResponseOk("GET", "/api/v1/accounts", 200, fixtureAccountCollection());
	});

	it("error envelope parses as POST /api/v1/auth/login 401", () => {
		expectResponseOk("POST", "/api/v1/auth/login", 401, fixtureApiError());
	});
});
