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
// Seam (t_alt_fnd_007 → t_alt_fnd_020): the login/logout UI exists
// (`src/routes/login.tsx`, `src/routes/logout.tsx`), so the smoke suite
// drives the real browser cookie handoff end to end: UI login → session
// cookie → authed page render → UI logout → revocation. `loginAs` returns
// tokens to the *harness* (never logged, never written to artifacts);
// browser flows below reuse it only for the complementary API leg.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { SENSITIVE_MASK_SELECTORS, roleCredentials } from "./e2e-config.mjs";

/**
 * BFF cookie names (mirrors `src/lib/bff-session.ts`: the `HttpOnly`
 * session id plus the readable anti-CSRF token). Pinned here so the
 * smoke suite can assert the browser cookie handoff directly.
 */
export const BFF_SESSION_COOKIE_NAME = "__Host-sure-bff-session";
export const BFF_CSRF_COOKIE_NAME = "__Host-sure-bff-csrf";

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

/** Assert the SSR starter route rendered with a supported, origin-free API contract. */
export async function expectSsrHome(page, config) {
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
	// Inspect the complete SSR/hydration document, not only visible text:
	// a server-function payload can leak through serialized page data even
	// when no component renders it. Neither the configured origin nor its
	// internal hostname may enter browser-delivered HTML.
	const html = await page.content();
	const internalHost = new URL(config.railsOrigin).hostname;
	if (html.includes(config.railsOrigin) || html.includes(internalHost)) {
		throw new Error("[e2e] browser-delivered HTML exposed the configured Sure API origin.");
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

/**
 * Fill the real `/login` form and submit. Ends on the post-login target
 * (the app's `next` handling decides where); callers assert the landing
 * page. Matches the app-shell suite's flow so both suites drive the same
 * UI (see scripts/e2e-app-shell.mjs).
 */
export async function loginThroughUi(page, config, role, next) {
	const { email, password } = roleCredentials(config, role);
	await page.goto(`${config.webOrigin}/login${next === undefined ? "" : `?next=${next}`}`, {
		waitUntil: "load",
	});
	await page.getByLabel(/email/i).fill(email);
	await page.getByLabel(/password/i).fill(password);
	await page.getByRole("button", { name: /log in/i }).click();
	await page.getByTestId("page-title").waitFor({ state: "visible", timeout: 15_000 });
}

/** Read a named cookie value from the browser context (undefined when absent). */
export async function browserCookieValue(context, name) {
	const cookies = await context.cookies();
	return cookies.find((cookie) => cookie.name === name)?.value;
}

/**
 * Probe the Rails-side state of the token pair the BFF minted for one
 * browser session. The BFF registers a per-session device
 * (`bff-<sessionId>`, see `BFF_DEVICE_*` in
 * `src/lib/sure-auth-session.server.ts`); this runs `bin/rails runner`
 * (RAILS_ENV=test) and reports whether that device still holds an active
 * token pair: `"active"` or `"revoked"`.
 *
 * Secret-free: the session id travels via environment (like
 * `SURE_E2E_PASSWORD`), never enters logs or artifacts, and the runner
 * prints only the one-word verdict. Throws (redacted: exit status only)
 * when Rails cannot answer, so a broken probe never passes silently.
 */
export function railsDeviceTokenState(webRoot, { email, sessionId }) {
	const repoRoot = resolve(webRoot, "..", "..");
	const script = [
		'user = User.find_by!(email: ENV.fetch("E2E_DEVICE_EMAIL"))',
		'device = user.mobile_devices.find_by(device_id: "bff-#{ENV.fetch("E2E_BFF_SESSION_ID")}")',
		'puts(device&.active_tokens&.exists? ? "active" : "revoked")',
	].join("; ");
	const result = spawnSync("bin/rails", ["runner", "-e", "test", script], {
		cwd: repoRoot,
		env: {
			...process.env,
			RAILS_ENV: "test",
			E2E_DEVICE_EMAIL: email,
			E2E_BFF_SESSION_ID: sessionId,
		},
		encoding: "utf8",
	});
	const verdict = (result.stdout ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.at(-1);
	if (result.status !== 0 || (verdict !== "active" && verdict !== "revoked")) {
		throw new Error(`[e2e] Rails device-token probe failed (status ${String(result.status)}).`);
	}
	return verdict;
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
