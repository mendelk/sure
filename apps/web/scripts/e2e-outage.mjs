#!/usr/bin/env node
// Playwright Rails-outage suite: BFF reachable, Rails stopped (apps/web).
//
// The smoke suite's route-abort leg only proves the browser→BFF
// transport path fails closed. This suite proves the real upstream
// outage: the browser POSTs valid credentials to the BFF while the
// Rails test API is down, the BFF classifies it `unavailable` (never a
// hang, never a raw upstream error), the `/login` form renders that
// state accessibly, and no session is minted.
//
// Orchestration (`./e2e-services.mjs`) stops Rails before this script
// and reboots it afterwards for the remaining suites — the precondition
// below fails fast when Rails is still answering, so a misordered run
// can never pass vacuously. Writes only redacted artifacts (no
// screenshot: the typed email would land unmasked) plus a secret-free
// summary JSON. Exit non-zero on any failure.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { resolveE2EConfig } from "./e2e-config.mjs";
import {
	assertLoginNextPath,
	BFF_SESSION_COOKIE_NAME,
	browserCookieValue,
} from "./e2e-helpers.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const webRoot = join(here, "..");
const config = resolveE2EConfig(process.env, webRoot);

await mkdir(config.artifactsDir, { recursive: true });

/** @typedef {{ name: string, ok: boolean, error: string | null }} OutageResult */
/** @type {OutageResult[]} */
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
	console.error(`[e2e-outage] ${message}`);
	process.exit(1);
}

async function railsUp() {
	try {
		const response = await fetch(`${config.railsOrigin}/up`, {
			signal: AbortSignal.timeout(5000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

async function webUp() {
	try {
		const response = await fetch(config.webOrigin, { signal: AbortSignal.timeout(5000) });
		return response.ok;
	} catch {
		return false;
	}
}

if (!(await webUp())) {
	fail(
		`web server not reachable at ${config.webOrigin} — run \`pnpm test:e2e:ci\` (orchestrated) or boot the web service first.`,
	);
}
if (await railsUp()) {
	fail(
		`Rails is still answering at ${config.railsOrigin}/up — the outage leg requires Rails stopped (orchestrated by ./e2e-services.mjs).`,
	);
}

const browser = await chromium.launch();
try {
	await check("valid login POST reaches the BFF while Rails is down", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/login`, { waitUntil: "load" });
			// Valid seeded credentials: the failure must come from the
			// unreachable upstream, not from the form.
			await page.getByLabel(/email/i).fill(config.email);
			await page.getByLabel(/password/i).fill(config.password);
			await page.getByRole("button", { name: /log in/i }).click();
			// Non-destructive failures announce politely via role="status".
			await page
				.getByRole("status")
				.filter({ hasText: "Service unavailable" })
				.waitFor({ state: "visible", timeout: 20_000 });
			if (new URL(page.url()).pathname !== "/login") {
				throw new Error(`outage login left /login (saw ${page.url()}).`);
			}
			// No session minted for the failed login.
			if (await browserCookieValue(context, BFF_SESSION_COOKIE_NAME)) {
				throw new Error("outage login minted a BFF session cookie.");
			}
		} finally {
			await context.close();
		}
	});

	await check("guarded routes still fail closed with no session", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/dashboard`, { waitUntil: "load" });
			await page.getByRole("heading", { name: "Log in to Sure" }).waitFor({ timeout: 15_000 });
			assertLoginNextPath(page.url(), "/dashboard");
		} finally {
			await context.close();
		}
	});
} finally {
	await browser.close();
}

const passed = results.filter((result) => result.ok).length;
const failed = results.filter((entry) => !entry.ok).length;
// Secret-free summary: names + redacted errors only (the typed email and
// any failure detail never enter artifacts beyond the check message).
await writeFile(
	join(config.artifactsDir, "outage-summary.json"),
	JSON.stringify({ passed, failed, results }, null, 2),
);
console.log(`[e2e-outage] ${passed} passed, ${failed} failed. Artifacts: ${config.artifactsDir}`);
if (failed > 0) {
	for (const entry of results) {
		if (entry.ok) {
			continue;
		}
		console.error(`\n--- ${entry.name}\n${entry.error ?? "(no detail)"}`);
	}
	process.exit(1);
}
