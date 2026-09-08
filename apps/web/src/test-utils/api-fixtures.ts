// Typed API fixtures for vitest suites (apps/web).
//
// Every fixture is typed against the generated OpenAPI surface
// (`../lib/api/openapi`, from `docs/api/openapi.yaml`), so a contract
// regeneration that changes a shape fails the typecheck here instead of
// silently drifting. Timestamps anchor to `TIME_FIXTURE_ISO` (see
// `./time`) so date assertions stay deterministic under the pinned UTC
// timezone. Values are obviously fake (`example.com`,
// `e2e.sure.invalid`) and carry no real user data.
import type { components, paths } from "~/lib/api/openapi";
import { TIME_FIXTURE_ISO } from "./time";

export type LoginRequestBody =
	paths["/api/v1/auth/login"]["post"]["requestBody"]["content"]["application/json"];

export type LoginSuccessBody =
	paths["/api/v1/auth/login"]["post"]["responses"][200]["content"]["application/json"];

export type AccountDetail = components["schemas"]["AccountDetail"];
export type AccountCollection = components["schemas"]["AccountCollection"];
export type ApiErrorBody = components["schemas"]["ErrorResponse"];

/**Deterministic device payload every auth fixture reuses. */
export function fixtureDevice(): LoginRequestBody["device"] {
	return {
		device_id: "test-device-001",
		device_name: "Vitest runner",
		device_type: "test",
		os_version: "test-os 1.0",
		app_version: "0.0.0-test",
	};
}

/** Valid login request body for the seeded e2e test users. */
export function fixtureLoginRequest(
	email = "member@e2e.sure.invalid",
	password = "E2e-supersecret-1!",
): LoginRequestBody {
	return { email, password, device: fixtureDevice() };
}

/** Successful login response; tokens are opaque test strings. */
export function fixtureLoginSuccess(email = "member@e2e.sure.invalid"): LoginSuccessBody {
	return {
		access_token: "test-access-token",
		refresh_token: "test-refresh-token",
		token_type: "Bearer",
		expires_in: 7200,
		created_at: Math.floor(Date.parse(TIME_FIXTURE_ISO) / 1000),
		user: {
			id: "11111111-1111-4111-8111-111111111111",
			email,
			first_name: "E2E",
			last_name: "Member",
			ui_layout: "dashboard",
			ai_enabled: false,
		},
	};
}

/** One deterministic depository account mirroring the e2e Rails seed. */
export function fixtureAccountDetail(overrides: Partial<AccountDetail> = {}): AccountDetail {
	return {
		id: "22222222-2222-4222-8222-222222222222",
		name: "E2E Checking",
		balance: "5000.00",
		balance_cents: 500000,
		cash_balance: "5000.00",
		cash_balance_cents: 500000,
		currency: "USD",
		classification: "asset",
		account_type: "depository",
		status: "active",
		created_at: TIME_FIXTURE_ISO,
		updated_at: TIME_FIXTURE_ISO,
		...overrides,
	};
}

/** Paginated accounts collection wrapping the given accounts. */
export function fixtureAccountCollection(
	accounts: readonly AccountDetail[] = [fixtureAccountDetail()],
): AccountCollection {
	return {
		accounts: [...accounts],
		pagination: {
			page: 1,
			per_page: 25,
			total_count: accounts.length,
			total_pages: 1,
		},
	};
}

/** Standard API error envelope (matches `ErrorResponse`). */
export function fixtureApiError(
	message = "Something went wrong",
	details: ApiErrorBody["details"] = null,
): ApiErrorBody {
	return { error: "test_error", message, details };
}
