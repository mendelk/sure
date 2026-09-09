#!/usr/bin/env node
// Playwright smoke suite: browser → web → Rails → database (apps/web).
//
// Proves the integrated chain against seeded services (booted by
// ./e2e-services.mjs in CI, or by hand locally):
//  1. Browser leg — every viewport × theme combo loads the SSR home route,
//     asserts the readiness compatibility badge reports `ready` (the page
//     never renders the Rails origin: t_alt_fnd_015 origin hygiene),
//     and captures a *masked* screenshot (privacy mode: raw screenshots
//     are never taken; see captureMasked in ./e2e-helpers.mjs).
//  2. Rails → database leg — the seeded member and viewer log in through
//     the real Rails test API, a bearer-authenticated accounts read returns
//     the seeded "E2E Checking" finance row, and an expired token maps to a
//     safe 401 envelope (session-expiry helper proof).
//  3. Auth UI leg (t_alt_fnd_020) — the real browser → BFF → Rails
//     login/logout flow: a seeded member signs in through the `/login`
//     form, the test asserts the post-login redirect plus the
//     authenticated chrome (seeded identity, admin nav, session + CSRF
//     cookies), reloads to prove the cookie-carried BFF session, then
//     signs out through the `/logout` UI and proves the Rails token pair
//     for that exact browser session is revoked (via a `bin/rails
//     runner` device probe that prints only `active`/`revoked`).
//  4. Failure leg — the API-failure helper aborts Rails traffic in-browser
//     and the abort surfaces as a network error (no hang, no unhandled
//     rejection); wrong credentials and an aborted login mutation render
//     the accessible invalid/unavailable form states on `/login`. The
//     aborted mutation only proves the browser→BFF transport path — the
//     real unreachable-Rails outage runs as a dedicated script
//     (`./e2e-outage.mjs`, orchestrated while Rails is stopped).
//
// Expects SURE_E2E_* env (see ./e2e-config.mjs). Writes only redacted
// artifacts: masked PNGs plus a secret-free summary JSON. Exit non-zero on
// any failure.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, request } from "playwright";
import { E2E_THEMES, E2E_VIEWPORTS, resolveE2EConfig } from "./e2e-config.mjs";
import {
	apiGetJson,
	assertBffCookieAttributes,
	assertLoginNextPath,
	assertNoTokenDisclosure,
	assertSessionExpired,
	BFF_CSRF_COOKIE_NAME,
	BFF_SESSION_COOKIE_NAME,
	browserCookie,
	browserCookieValue,
	captureMasked,
	clearBrowserSession,
	expectSsrHome,
	loginAs,
	loginThroughUi,
	newThemedPage,
	railsDeviceTokenState,
	simulateApiFailure,
} from "./e2e-helpers.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const webRoot = join(here, "..");
const config = resolveE2EConfig(process.env, webRoot);

await mkdir(config.artifactsDir, { recursive: true });

/** @typedef {{ name: string, ok: boolean, error: string | null }} SmokeResult */
/** @type {SmokeResult[]} */
const results = [];
async function check(name, fn) {
	try {
		await fn();
		results.push({ name, ok: true, error: null });
		console.log(`  PASS ${name}`);
	} catch (error) {
		const message = String(error?.message ?? error).slice(0, 2000);
		results.push({ name, ok: false, error: message });
		console.log(`  FAIL ${name}: ${message.split("\n")[0]}`);
	}
}

function fail(message) {
	console.error(`[e2e-smoke] ${message}`);
	process.exit(1);
}

async function reachable(url) {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
		return response.ok;
	} catch {
		return false;
	}
}

if (!(await reachable(config.webOrigin))) {
	fail(
		`web server not reachable at ${config.webOrigin} — run \`pnpm test:e2e:ci\` (orchestrated) or boot the web + Rails services first.`,
	);
}
if (!(await reachable(`${config.railsOrigin}/up`))) {
	fail(`Rails not reachable at ${config.railsOrigin}/up — seed and boot the test API first.`);
}

const browser = await chromium.launch();
const apiRequest = await request.newContext();
try {
	for (const [viewportName, viewport] of Object.entries(E2E_VIEWPORTS)) {
		for (const theme of E2E_THEMES) {
			const label = `ssr-home [${viewportName} ${theme}]`;
			await check(label, async () => {
				const { context, page } = await newThemedPage(browser, config.webOrigin, {
					viewport,
					theme,
				});
				try {
					await expectSsrHome(page, config);
					await captureMasked(page, join(config.artifactsDir, `home-${viewportName}-${theme}.png`));
				} finally {
					await context.close();
				}
			});
		}
	}

	let memberToken = null;
	await check("login seeded member via Rails API", async () => {
		const session = await loginAs(apiRequest, config, "member");
		memberToken = session.accessToken;
	});

	await check("login seeded viewer via Rails API (roles)", async () => {
		await loginAs(apiRequest, config, "viewer");
	});

	await check("bearer accounts read returns seeded finance data", async () => {
		if (memberToken === null) {
			throw new Error("member login did not produce a token.");
		}
		const payload = await apiGetJson(apiRequest, config, memberToken, "/api/v1/accounts");
		const names = (payload?.accounts ?? []).map((account) => account?.name);
		if (!names.includes("E2E Checking")) {
			throw new Error('seeded account "E2E Checking" missing from Rails response.');
		}
	});

	await check("expired session maps to a safe 401", async () => {
		await assertSessionExpired(apiRequest, config);
	});

	await check("API failure surfaces in-browser without hanging", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(config.webOrigin, { waitUntil: "load" });
			const restore = await simulateApiFailure(page, config);
			try {
				const outcome = await page.evaluate(async (upUrl) => {
					try {
						await fetch(`${upUrl}/up`);
						return "unexpected-success";
					} catch {
						return "network-error";
					}
				}, config.railsOrigin);
				if (outcome !== "network-error") {
					throw new Error("aborted Rails traffic did not surface as a network error.");
				}
			} finally {
				await restore();
			}
		} finally {
			await context.close();
		}
	});

	await check("clearing browser session keeps the app renderable", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(config.webOrigin, { waitUntil: "load" });
			await clearBrowserSession(page);
			await page.getByTestId("hydration-status").waitFor({ state: "visible", timeout: 15_000 });
		} finally {
			await context.close();
		}
	});

	// Browser → BFF → Rails → database, through the real UI. One shared
	// context carries the BFF session cookie from the `/login` form to
	// the `/logout` confirmation, proving the cookie handoff end to end.
	let authContext = null;
	let authPage = null;
	let authSessionId = null;

	await check("login via the /login UI lands on the authed dashboard", async () => {
		authContext = await browser.newContext({ viewport: E2E_VIEWPORTS.desktop });
		authPage = await authContext.newPage();
		try {
			await loginThroughUi(authPage, config, "member", "/dashboard");
			const landed = new URL(authPage.url());
			if (landed.pathname !== "/dashboard") {
				throw new Error(`expected to land on /dashboard, saw ${authPage.url()}.`);
			}
			// Authenticated chrome: the header identity shows the seeded
			// member email (Rails → database, via the BFF session).
			const identity = (await authPage.getByTestId("shell-user").textContent()) ?? "";
			if (!identity.includes(config.email)) {
				throw new Error("authenticated chrome does not show the seeded member email.");
			}
			// Privacy mode: the PII identity region stays marked so masked
			// artifacts never leak it.
			const marked = await authPage.getByTestId("shell-user").getAttribute("data-sensitive");
			if (marked !== "true") {
				throw new Error("authenticated identity region is missing data-sensitive.");
			}
			// Role-derived chrome: the seeded member is a family admin.
			await authPage
				.getByRole("navigation", { name: "Primary" })
				.getByRole("link", { name: "Admin" })
				.waitFor({ state: "visible", timeout: 15_000 });
			// Cookie handoff: the opaque BFF session plus the readable
			// anti-CSRF token both reached the browser, hardened
			// (Secure/HttpOnly/host-only/Path=/, CSRF readable by design).
			authSessionId = await browserCookieValue(authContext, BFF_SESSION_COOKIE_NAME);
			if (typeof authSessionId !== "string" || authSessionId === "") {
				throw new Error("BFF session cookie missing after the UI login.");
			}
			const csrf = await browserCookieValue(authContext, BFF_CSRF_COOKIE_NAME);
			if (typeof csrf !== "string" || csrf === "") {
				throw new Error("BFF CSRF cookie missing after the UI login.");
			}
			assertBffCookieAttributes(
				await browserCookie(authContext, BFF_SESSION_COOKIE_NAME),
				await browserCookie(authContext, BFF_CSRF_COOKIE_NAME),
				new URL(config.webOrigin).hostname,
			);
			// Token non-disclosure: upstream tokens never reach browser
			// surfaces — only the opaque session id does, HttpOnly.
			await assertNoTokenDisclosure(authPage, authContext, authSessionId);
			await captureMasked(authPage, join(config.artifactsDir, "authed-dashboard.png"));
		} catch (error) {
			await authContext.close();
			authContext = null;
			authPage = null;
			authSessionId = null;
			throw error;
		}
	});

	await check("authed browser session persists across reload", async () => {
		if (authContext === null || authPage === null) {
			throw new Error("UI login did not establish a browser session.");
		}
		// Typed finance-adjacent state echoes under data-sensitive, and a
		// full reload keeps the session (cookie-carried BFF status).
		await authPage.goto(`${config.webOrigin}/dashboard?q=rent&filter=active`, {
			waitUntil: "load",
		});
		await authPage.getByTestId("dashboard-search-state").waitFor({ timeout: 15_000 });
		if (
			(await authPage
				.locator('[data-testid="dashboard-search-state"] q[data-sensitive]')
				.count()) === 0
		) {
			throw new Error("dashboard finance region lost its data-sensitive marking.");
		}
		await authPage.reload({ waitUntil: "load" });
		await authPage.getByTestId("page-title").waitFor({ timeout: 15_000 });
		const identity = (await authPage.getByTestId("shell-user").textContent()) ?? "";
		if (!identity.includes(config.email)) {
			throw new Error("browser session did not survive reload.");
		}
	});

	await check("Rails token pair for the browser session is active before logout", async () => {
		if (typeof authSessionId !== "string" || authSessionId === "") {
			throw new Error("UI login did not establish a browser session.");
		}
		const state = railsDeviceTokenState(webRoot, { email: config.email, sessionId: authSessionId });
		if (state !== "active") {
			throw new Error("browser session has no active Rails token pair.");
		}
	});

	await check("logout via the /logout UI lands signed-out and revokes the Rails pair", async () => {
		if (authContext === null || authPage === null || typeof authSessionId !== "string") {
			throw new Error("UI login did not establish a browser session.");
		}
		try {
			await authPage.goto(`${config.webOrigin}/logout`, { waitUntil: "load" });
			await authPage.getByRole("heading", { name: "Log out of Sure" }).waitFor({ timeout: 15_000 });
			await authPage.getByRole("button", { name: "Log out", exact: true }).click();
			await authPage.getByTestId("hydration-status").waitFor({ state: "visible", timeout: 15_000 });
			const landed = new URL(authPage.url());
			if (landed.pathname !== "/") {
				throw new Error(`expected to land signed-out on /, saw ${authPage.url()}.`);
			}
			// Session cleared: the BFF cookie is gone and the guarded
			// dashboard fails closed back to /login.
			if (await browserCookieValue(authContext, BFF_SESSION_COOKIE_NAME)) {
				throw new Error("BFF session cookie survived the UI logout.");
			}
			await authPage.goto(`${config.webOrigin}/dashboard`, { waitUntil: "load" });
			await authPage.getByRole("heading", { name: "Log in to Sure" }).waitFor({ timeout: 15_000 });
			// Exact pathname validation (query allowed): the dashboard
			// normalizes its default search into `next`, but a prefix
			// match would let `/dashboard-evil` pass.
			assertLoginNextPath(authPage.url(), "/dashboard");
			// Revocation: the Rails pair minted for this exact browser
			// session is dead (the BFF's three-step logout revokes it
			// upstream — unit-pinned — and this probes the database).
			const state = railsDeviceTokenState(webRoot, {
				email: config.email,
				sessionId: authSessionId,
			});
			if (state !== "revoked") {
				throw new Error("Rails token pair survived the UI logout.");
			}
			await captureMasked(authPage, join(config.artifactsDir, "logged-out.png"));
		} finally {
			await authContext.close();
			authContext = null;
			authPage = null;
			authSessionId = null;
		}
	});

	await check("invalid credentials render an accessible alert on /login", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/login`, { waitUntil: "load" });
			await page.getByLabel(/email/i).fill(config.email);
			await page.getByLabel(/password/i).fill("Wrong-password-0!");
			await page.getByRole("button", { name: /log in/i }).click();
			// Destructive failures announce via role="alert" (see
			// SureAlert); the page stays on /login with no session minted.
			// No screenshot here: the typed email would land unmasked in
			// the artifact.
			await page
				.getByRole("alert")
				.filter({ hasText: "Could not sign in" })
				.waitFor({ state: "visible", timeout: 15_000 });
			if (new URL(page.url()).pathname !== "/login") {
				throw new Error(`failed login left /login (saw ${page.url()}).`);
			}
			if (await browserCookieValue(context, BFF_SESSION_COOKIE_NAME)) {
				throw new Error("failed login minted a BFF session cookie.");
			}
		} finally {
			await context.close();
		}
	});

	await check(
		"unavailable server renders an accessible status (route-abort failure leg)",
		async () => {
			const context = await browser.newContext();
			const page = await context.newPage();
			try {
				await page.goto(`${config.webOrigin}/login`, { waitUntil: "load" });
				// Abort the login mutation in flight (the BFF login POST).
				// Transport failures fail closed to the `unavailable` form
				// state — surfaced as role="status", never a hang.
				await page.route("**/*", async (route) => {
					if (route.request().method() === "POST") {
						await route.abort();
					} else {
						await route.continue();
					}
				});
				try {
					await page.getByLabel(/email/i).fill(config.email);
					await page.getByLabel(/password/i).fill(config.password);
					await page.getByRole("button", { name: /log in/i }).click();
					await page
						.getByRole("status")
						.filter({ hasText: "Service unavailable" })
						.waitFor({ state: "visible", timeout: 15_000 });
					if (new URL(page.url()).pathname !== "/login") {
						throw new Error(`unavailable login left /login (saw ${page.url()}).`);
					}
				} finally {
					await page.unroute("**/*");
				}
			} finally {
				await context.close();
			}
		},
	);
} finally {
	await apiRequest.dispose();
	await browser.close();
}

const passed = results.filter((result) => result.ok).length;
const failed = results.filter((entry) => !entry.ok).length;
// Secret-free summary: names + redacted errors only (tokens never leave memory).
await writeFile(
	join(config.artifactsDir, "smoke-summary.json"),
	JSON.stringify({ passed, failed, results }, null, 2),
);
console.log(`[e2e-smoke] ${passed} passed, ${failed} failed. Artifacts: ${config.artifactsDir}`);
if (failed > 0) {
	for (const entry of results) {
		if (entry.ok) {
			continue;
		}
		console.error(`\n--- ${entry.name}\n${entry.error ?? "(no detail)"}`);
	}
	process.exit(1);
}
