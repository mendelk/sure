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
//  3. Failure leg — the API-failure helper aborts Rails traffic in-browser
//     and the abort surfaces as a network error (no hang, no unhandled
//     rejection).
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
	assertSessionExpired,
	captureMasked,
	clearBrowserSession,
	expectSsrHome,
	loginAs,
	newThemedPage,
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
					await expectSsrHome(page);
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
