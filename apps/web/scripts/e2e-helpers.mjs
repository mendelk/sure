// Shared Playwright helpers for the Sure alt-frontend e2e harness.
//
// Covers the ticket's helper surface: login, session expiry, roles, API
// failures, mobile viewports, theme, and privacy mode.
//
// Two layers, matching what the app supports today:
// - Browser layer (`Page`): SSR/hydration assertions with accessible
//   queries, theme + viewport matrix setup, API-failure injection via
//   route abort, and masked artifact capture. Screenshots go through
//   `captureMasked` ONLY, so sensitive fixture regions are masked before
//   any artifact hits disk (see SENSITIVE_MASK_SELECTORS).
// - API layer (`APIRequestContext`): `loginAs` authenticates the seeded
//   e2e users against the real Rails test API (proving Rails → database),
//   `apiGetJson` reads finance data back with the bearer token, and
//   `assertSessionExpired` proves unknown tokens map to a safe 401.
//
// Seam (t_alt_fnd_007): the app has no login/session UI yet, so there is no
// browser cookie handoff to assert. `loginAs` returns tokens to the
// *harness* (never logged, never written to artifacts); the browser-side
// session assertion lands with the auth UI and reuses `loginAs` +
// `clearBrowserSession` from here.
import { SENSITIVE_MASK_SELECTORS, roleCredentials } from "./e2e-config.mjs";

export function devicePayload() {
	return {
		device_id: "e2e-playwright-device",
		device_name: "Playwright smoke runner",
		// Rails only accepts ios/android/web (MobileDevice validation).
		device_type: "web",
		os_version: "test-os 1.0",
		app_version: "0.0.0-e2e",
	};
}

/**
 * Open a page with a pinned viewport, color scheme, and stored Sure theme.
 * The stored choice (`localStorage "sure-theme"`) resolves post-hydration
 * (see src/routes/__root.tsx), so seed it before load and assert
 * `data-theme` after hydration settles.
 */
export async function newThemedPage(browser, webOrigin, { viewport, theme }) {
	const context = await browser.newContext({
		viewport,
		colorScheme: theme,
	});
	await context.addInitScript((stored) => {
		window.localStorage.setItem("sure-theme", stored);
	}, theme);
	const page = await context.newPage();
	page.setDefaultTimeout(30_000);
	await page.goto(webOrigin, { waitUntil: "load" });
	await page.getByTestId("hydration-status").waitFor({ state: "visible", timeout: 15_000 });
	const applied = await page.evaluate(() =>
		document.querySelector("[data-theme]")?.getAttribute("data-theme"),
	);
	if (applied !== theme) {
		throw new Error(`[e2e] expected data-theme="${theme}", saw "${applied}".`);
	}
	return { context, page };
}

/** Assert the SSR starter route rendered with a supported API contract. */
export async function expectSsrHome(page) {
	const status = page.getByTestId("ssr-status");
	await status.waitFor({ state: "visible" });
	// Origin hygiene (t_alt_fnd_015): the page never renders the Rails
	// origin, so readiness is asserted through the compatibility badge
	// instead — it must report `ready` against the seeded Rails service.
	const compatibility = page.getByTestId("api-compatibility");
	await compatibility.waitFor({ state: "visible" });
	const state = await compatibility.getAttribute("data-state");
	if (state !== "ready") {
		throw new Error(`[e2e] API compatibility state is "${state}", expected "ready".`);
	}
	await page.getByRole("heading", { name: "Sure Web starter route" }).waitFor({ state: "visible" });
}

/**
 * Log a seeded e2e user in through the real Rails API. Returns the bearer
 * token and email; failures are redacted (status only — tokens and
 * passwords never enter messages, logs, or artifacts).
 */
export async function loginAs(apiRequest, config, role) {
	const { email, password } = roleCredentials(config, role);
	const response = await apiRequest.post(`${config.railsOrigin}/api/v1/auth/login`, {
		data: { email, password, device: devicePayload() },
		timeout: config.stepTimeoutMs,
	});
	if (!response.ok()) {
		throw new Error(`[e2e] login failed for role "${role}" (status ${response.status()}).`);
	}
	const payload = await response.json();
	const accessToken = payload?.access_token;
	const userEmail = payload?.user?.email;
	if (typeof accessToken !== "string" || userEmail !== email) {
		throw new Error(`[e2e] login for role "${role}" returned an unexpected payload shape.`);
	}
	return { accessToken, email: userEmail };
}

/** Bearer-authenticated GET against Rails; asserts 200 and returns JSON. */
export async function apiGetJson(apiRequest, config, accessToken, path) {
	const response = await apiRequest.get(`${config.railsOrigin}${path}`, {
		headers: { Authorization: `Bearer ${accessToken}` },
		timeout: config.stepTimeoutMs,
	});
	if (!response.ok()) {
		throw new Error(`[e2e] GET ${path} failed (status ${response.status()}).`);
	}
	return response.json();
}

/** Unknown/expired tokens must map to a safe 401 error envelope. */
export async function assertSessionExpired(apiRequest, config) {
	const response = await apiRequest.get(`${config.railsOrigin}/api/v1/accounts`, {
		headers: { Authorization: "Bearer e2e-expired-token" },
		timeout: config.stepTimeoutMs,
	});
	if (response.status() !== 401) {
		throw new Error(`[e2e] expected 401 for an expired session, saw ${response.status()}.`);
	}
	const payload = await response.json();
	if (typeof payload?.error !== "string") {
		throw new Error("[e2e] expired-session response is not a safe error envelope.");
	}
}

/** Drop all browser session state (cookies + storage) and reload. */
export async function clearBrowserSession(page) {
	await page.context().clearCookies();
	await page.evaluate(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
	});
	await page.reload({ waitUntil: "load" });
}

/**
 * Abort every request to the Rails origin (API-failure injection).
 * Returns a restore function; callers must restore in `finally`.
 */
export async function simulateApiFailure(page, config) {
	const pattern = `${config.railsOrigin}/**`;
	await page.route(pattern, (route) => route.abort());
	return async () => {
		await page.unroute(pattern);
	};
}

/**
 * The ONLY screenshot path in the harness: every configured sensitive
 * selector is masked before the PNG hits disk. Throws when the artifact
 * directory write fails so missing artifacts never pass silently.
 */
export async function captureMasked(page, filePath) {
	const mask = SENSITIVE_MASK_SELECTORS.map((selector) => page.locator(selector).first());
	await page.screenshot({ path: filePath, mask });
}
