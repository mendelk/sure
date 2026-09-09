#!/usr/bin/env node
// Playwright app-shell suite (t_alt_fnd_010): responsive shell + route guards.
//
// Expects seeded services (booted by ./e2e-services.mjs in CI, or by hand
// locally): the web preview with SURE_API_ORIGIN pinned to the Rails test
// origin, and the deterministic member (admin role) / viewer (member role)
// users. Exercises the real BFF login UI through both roles, so guards,
// deep links, and navigation run against server-validated sessions —
// never mocks.
//
// Covers: login redirects with full deep-link `next` preservation
// (pathname + typed search), role guards (member `/admin` access via the
// server-provided login `role`, viewer `/admin` → `/unauthorized`),
// typed search survival through deep links/reload/back-forward,
// responsive sidebar/bottom navigation, skip-link + heading focus
// management (fresh loads start at the skip links; client navigations
// move focus to the heading), and route-level not-found / unauthorized
// states. Writes only redacted artifacts (no tokens).
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { E2E_VIEWPORTS, resolveE2EConfig, roleCredentials } from "./e2e-config.mjs";
import { assertLoginNextPath, captureMasked } from "./e2e-helpers.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const webRoot = join(here, "..");
const config = resolveE2EConfig(process.env, webRoot);

await mkdir(config.artifactsDir, { recursive: true });

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
	console.error(`[e2e-app-shell] ${message}`);
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

/** Log in through the real BFF login UI; ends on the post-login target. */
async function loginThroughUi(page, role) {
	const { email, password } = roleCredentials(config, role);
	await page.getByLabel(/email/i).fill(email);
	await page.getByLabel(/password/i).fill(password);
	await page.getByRole("button", { name: /log in/i }).click();
	await page.getByTestId("page-title").waitFor({ state: "visible", timeout: 15_000 });
}

const browser = await chromium.launch();
try {
	await check("unauthenticated /dashboard redirects to /login?next=", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/dashboard`, { waitUntil: "load" });
			await page.getByRole("heading", { name: "Log in to Sure" }).waitFor({ timeout: 15_000 });
			// Exact pathname validation (query allowed): the dashboard
			// normalizes its default search into `next`, but a prefix
			// match would let `/dashboard-evil` pass.
			assertLoginNextPath(page.url(), "/dashboard");
		} finally {
			await context.close();
		}
	});

	await check("unauthenticated /admin fails closed to login", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/admin`, { waitUntil: "load" });
			await page.getByRole("heading", { name: "Log in to Sure" }).waitFor({ timeout: 15_000 });
		} finally {
			await context.close();
		}
	});

	await check("login via UI preserves the deep-link next target", async () => {
		const context = await browser.newContext({ viewport: E2E_VIEWPORTS.desktop });
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/dashboard?q=rent&filter=active`, {
				waitUntil: "load",
			});
			await page.getByRole("heading", { name: "Log in to Sure" }).waitFor({ timeout: 15_000 });
			const loginUrl = new URL(page.url());
			if (
				loginUrl.pathname !== "/login" ||
				loginUrl.searchParams.get("next") !== "/dashboard?q=rent&filter=active"
			) {
				throw new Error(`expected login to keep the full deep link, saw ${page.url()}.`);
			}
			await loginThroughUi(page, "viewer");
			const landed = new URL(page.url());
			if (landed.pathname !== "/dashboard" || landed.searchParams.get("q") !== "rent") {
				throw new Error(`expected to land on the filtered dashboard, saw ${page.url()}.`);
			}
			const state = (await page.getByTestId("dashboard-search-state").textContent()) ?? "";
			if (!state.includes("rent") || !state.includes("active")) {
				throw new Error(`typed search state lost through login: "${state}".`);
			}
			// Capability-derived nav: viewer (member) sees Dashboard +
			// Settings, never Admin.
			const nav = page.getByRole("navigation", { name: "Primary" });
			await nav.getByRole("link", { name: "Dashboard" }).waitFor();
			await nav.getByRole("link", { name: "Settings" }).waitFor();
			if ((await nav.getByRole("link", { name: "Admin" }).count()) !== 0) {
				throw new Error("Admin link visible for a non-admin session.");
			}
			await captureMasked(page, join(config.artifactsDir, "shell-dashboard-desktop.png"));
		} finally {
			await context.close();
		}
	});

	await check("admin sessions unlock the admin capability", async () => {
		const context = await browser.newContext({ viewport: E2E_VIEWPORTS.desktop });
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/login`, { waitUntil: "load" });
			await loginThroughUi(page, "member");
			// The seeded member carries the admin family role through the
			// server-validated BFF session (Rails login payload `role`).
			const nav = page.getByRole("navigation", { name: "Primary" });
			await nav.getByRole("link", { name: "Admin" }).waitFor({ timeout: 15_000 });
			await page.goto(`${config.webOrigin}/admin`, { waitUntil: "load" });
			await page.getByTestId("admin-marker").waitFor({ timeout: 15_000 });
			if (page.url().includes("/unauthorized")) {
				throw new Error("admin session was sent to the unauthorized state.");
			}
		} finally {
			await context.close();
		}
	});

	await check("typed search survives deep links and reload", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/login`, { waitUntil: "load" });
			await loginThroughUi(page, "viewer");
			await page.goto(`${config.webOrigin}/dashboard?q=rent&filter=active`, {
				waitUntil: "load",
			});
			await page.getByTestId("dashboard-search-state").waitFor({ timeout: 15_000 });
			const first = (await page.getByTestId("dashboard-search-state").textContent()) ?? "";
			if (!first.includes("rent") || !first.includes("active")) {
				throw new Error(`deep-link search state missing: "${first}".`);
			}
			await page.reload({ waitUntil: "load" });
			const after = (await page.getByTestId("dashboard-search-state").textContent()) ?? "";
			if (!after.includes("rent") || !after.includes("active")) {
				throw new Error(`search state lost on reload: "${after}".`);
			}
			const deepHref = await page.getByTestId("dashboard-deep-link").getAttribute("href");
			if (deepHref === null || !deepHref.includes("q=rent")) {
				throw new Error(`deep-link href does not carry search: "${deepHref}".`);
			}
		} finally {
			await context.close();
		}
	});

	await check("browser back/forward restores typed search", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/login`, { waitUntil: "load" });
			await loginThroughUi(page, "viewer");
			await page.goto(`${config.webOrigin}/dashboard?q=alpha`, { waitUntil: "load" });
			await page.goto(`${config.webOrigin}/dashboard?q=beta`, { waitUntil: "load" });
			await page.goBack({ waitUntil: "load" });
			const back = (await page.getByTestId("dashboard-search-state").textContent()) ?? "";
			if (!back.includes("alpha")) {
				throw new Error(`back did not restore q=alpha: "${back}".`);
			}
			await page.goForward({ waitUntil: "load" });
			const forward = (await page.getByTestId("dashboard-search-state").textContent()) ?? "";
			if (!forward.includes("beta")) {
				throw new Error(`forward did not restore q=beta: "${forward}".`);
			}
		} finally {
			await context.close();
		}
	});

	await check("non-admin /admin lands on the unauthorized state", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/login`, { waitUntil: "load" });
			await loginThroughUi(page, "viewer");
			await page.goto(`${config.webOrigin}/admin`, { waitUntil: "load" });
			await page.getByRole("heading", { name: "Not authorized" }).waitFor({ timeout: 15_000 });
			const url = new URL(page.url());
			if (url.pathname !== "/unauthorized" || url.searchParams.get("from") !== "/admin") {
				throw new Error(`expected /unauthorized?from=/admin, saw ${url.pathname}${url.search}.`);
			}
		} finally {
			await context.close();
		}
	});

	await check("responsive navigation adapts sidebar to bottom bar", async () => {
		for (const [name, viewport] of Object.entries(E2E_VIEWPORTS)) {
			const context = await browser.newContext({ viewport });
			const page = await context.newPage();
			try {
				await page.goto(`${config.webOrigin}/login`, { waitUntil: "load" });
				await loginThroughUi(page, "viewer");
				const position = await page.evaluate(() => {
					const nav = document.querySelector('[data-testid="primary-nav"]');
					return nav === null ? null : getComputedStyle(nav).position;
				});
				if (name === "desktop" && position !== "static") {
					throw new Error(`desktop nav should be static sidebar, saw "${position}".`);
				}
				if (name === "mobile" && position !== "fixed") {
					throw new Error(`mobile nav should be fixed bottom bar, saw "${position}".`);
				}
				if (name === "mobile") {
					await captureMasked(page, join(config.artifactsDir, "shell-dashboard-mobile.png"));
				}
			} finally {
				await context.close();
			}
		}
	});

	await check("theme control applies and persists the document theme", async () => {
		const context = await browser.newContext({
			viewport: E2E_VIEWPORTS.desktop,
			colorScheme: "light",
		});
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/login`, { waitUntil: "load" });
			await loginThroughUi(page, "viewer");
			const theme = page.getByRole("button", { name: /Theme/ });
			await theme.click();
			await page.getByRole("option", { name: "Dark" }).click();
			await page.waitForFunction(
				() => document.documentElement.getAttribute("data-theme") === "dark",
				undefined,
				{ timeout: 5000 },
			);
			const stored = await page.evaluate(() => localStorage.getItem("sure-theme"));
			if (stored !== "dark") {
				throw new Error(`expected persisted dark theme, saw "${stored}".`);
			}
			await page.reload({ waitUntil: "load" });
			await page.waitForFunction(
				() => document.documentElement.getAttribute("data-theme") === "dark",
				undefined,
				{ timeout: 5000 },
			);
		} finally {
			await context.close();
		}
	});

	await check("skip link and heading focus management (keyboard)", async () => {
		const context = await browser.newContext({ viewport: E2E_VIEWPORTS.desktop });
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/login`, { waitUntil: "load" });
			await loginThroughUi(page, "viewer");
			// Heading owns focus after the post-login client-side navigation.
			const focused = await page.evaluate(() => document.activeElement?.dataset?.testid ?? null);
			if (focused !== "page-title") {
				throw new Error(`expected focus on page-title after navigation, saw "${focused}".`);
			}
			// Fresh loads leave focus at the top of the document (the BFF
			// cookie session survives reload), so the first tab stop is the
			// skip link — the heading must not steal it on mount.
			await page.reload({ waitUntil: "load" });
			await page.getByTestId("page-title").waitFor({ timeout: 15_000 });
			const fresh = await page.evaluate(() =>
				document.activeElement === document.body ? "body" : "elsewhere",
			);
			if (fresh !== "body") {
				throw new Error(`fresh load stole focus (active: "${fresh}").`);
			}
			await page.keyboard.press("Tab");
			const skipFocused = await page.evaluate(() => document.activeElement?.textContent ?? "");
			if (!skipFocused.includes("Skip to main content")) {
				throw new Error(`first tab did not reach the skip link: "${skipFocused}".`);
			}
			await page.keyboard.press("Enter");
			const mainFocused = await page.evaluate(
				() => document.activeElement?.getAttribute("data-testid") ?? "",
			);
			if (mainFocused !== "main-content") {
				throw new Error(`skip link did not move focus to main: "${mainFocused}".`);
			}
			// Client-side navigation moves focus to the new page heading.
			await page
				.getByRole("navigation", { name: "Primary" })
				.getByRole("link", { name: "Settings" })
				.click();
			await page.getByRole("heading", { name: "Settings" }).first().waitFor({ timeout: 15_000 });
			const afterNav = await page.evaluate(() => document.activeElement?.dataset?.testid ?? null);
			if (afterNav !== "page-title") {
				throw new Error(`expected focus on page-title after navigation, saw "${afterNav}".`);
			}
		} finally {
			await context.close();
		}
	});

	await check("unknown routes render the not-found state", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(`${config.webOrigin}/definitely-missing-xyz`, { waitUntil: "load" });
			await page.getByText("Page not found").first().waitFor({ timeout: 15_000 });
		} finally {
			await context.close();
		}
	});
} finally {
	await browser.close();
}

const passed = results.filter((result) => result.ok).length;
const failed = results.filter((entry) => !entry.ok).length;
await writeFile(
	join(config.artifactsDir, "app-shell-summary.json"),
	JSON.stringify({ passed, failed, results }, null, 2),
);
console.log(
	`[e2e-app-shell] ${passed} passed, ${failed} failed. Artifacts: ${config.artifactsDir}`,
);
if (failed > 0) {
	for (const entry of results) {
		if (entry.ok) {
			continue;
		}
		console.error(`\n--- ${entry.name}\n${entry.error ?? "(no detail)"}`);
	}
	process.exit(1);
}
