#!/usr/bin/env node
// Automated browser validation for Sure UI Storybook stories (apps/web).
//
// Serves the static Storybook build, loads every story in real Chromium
// (light + dark Sure themes), runs targeted keyboard/pointer interactions,
// then runs the full axe-core rule set — including `color-contrast`, which
// the jsdom suites (`*.test.tsx`) cannot cover. Any interaction failure or
// axe violation fails the run with a per-story summary.
//
// Usage: `pnpm build-storybook && pnpm test:browser`
// (from apps/web; `test:browser` is the `node scripts/...` wrapper).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { resolveStaticPath } from "./static-path.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const webRoot = resolve(here, "..");
const staticDir = join(webRoot, "storybook-static");
const indexPath = join(staticDir, "index.json");

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".cjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
};

function fail(message) {
	console.error(`[storybook-browser-check] ${message}`);
	process.exit(1);
}

if (!existsSync(indexPath)) {
	fail(
		`storybook-static/index.json not found — run \`pnpm build-storybook\` first (cwd: ${webRoot}).`,
	);
}

const index = JSON.parse(readFileSync(indexPath, "utf8"));
const stories = Object.entries(index.entries ?? {})
	.filter(([, entry]) => entry?.type === "story")
	.map(([id, entry]) => ({ id, title: entry.title }))
	.toSorted((a, b) => a.id.localeCompare(b.id));

if (stories.length === 0) {
	fail("no stories found in storybook-static/index.json.");
}

const axeSource = readFileSync(join(webRoot, "node_modules", "axe-core", "axe.min.js"), "utf8");

function serveStatic(dir) {
	const handle = async (req, res) => {
		// Containment is enforced by resolveStaticPath (relative-based, so
		// `..`, decoded traversals, and sibling-prefix paths resolve null).
		const url = new URL(req.url ?? "/", "http://localhost");
		const file = resolveStaticPath(dir, url.pathname);
		if (file === null) {
			res.writeHead(404).end("not found");
			return;
		}
		try {
			const body = await readFile(file);
			res
				.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" })
				.end(body);
		} catch {
			res.writeHead(404).end("not found");
		}
	};
	return createServer((req, res) => {
		void handle(req, res);
	});
}

/** Run axe inside the story root in the story iframe. */
async function runAxe(page) {
	await page.addScriptTag({ content: axeSource });
	return page.evaluate(async () => {
		const root = document.querySelector("#storybook-root");
		const results = await window.axe.run(root ?? document, {
			resultTypes: ["violations"],
			// The iframe shell is Storybook chrome, not product UI: it has
			// no <main> landmark or h1, so document-structure rules cannot
			// pass here by construction. Landmark structure is covered by
			// the jsdom suites (renderInMain). Everything else — including
			// color-contrast, which jsdom cannot evaluate — runs in full.
			rules: {
				"landmark-one-main": { enabled: false },
				"page-has-heading-one": { enabled: false },
				region: { enabled: false },
			},
		});
		return results.violations.map((violation) => ({
			id: violation.id,
			help: violation.help,
			targets: violation.nodes.map((node) => node.target),
		}));
	});
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

async function interact(page, storyId) {
	const root = page.locator("#storybook-root");
	switch (storyId) {
		case "forms-toggles--checkboxes": {
			const box = root.getByRole("checkbox", { name: "Subscribe to the changelog" });
			// The native input is visually hidden; pointer users hit the label.
			await root.getByText("Subscribe to the changelog").click();
			await assertChecked(box, true, "checkbox toggles on with click");
			const selected = await box.evaluate((input) => {
				const visual = input.closest("label")?.querySelector(":scope > span[aria-hidden='true']");
				return visual?.getAttribute("data-selected");
			});
			assert(selected === "true", "checkbox visual carries data-selected when checked");
			await box.focus();
			await page.keyboard.press("Space");
			await assertChecked(box, false, "checkbox toggles off with Space");
			break;
		}
		case "forms-toggles--switches": {
			const toggle = root.getByRole("switch", { name: "Dark mode" });
			await root.getByText("Dark mode").click();
			await assertChecked(toggle, true, "switch toggles on with click");
			const selected = await toggle.evaluate((input) => {
				const track = input.closest("label")?.querySelector(":scope > span[aria-hidden='true']");
				return {
					track: track?.getAttribute("data-selected"),
					thumb: track
						?.querySelector(":scope > span[aria-hidden='true']")
						?.getAttribute("data-selected"),
				};
			});
			assert(selected.track === "true", "switch track carries data-selected when on");
			assert(selected.thumb === "true", "switch thumb carries data-selected when on");
			break;
		}
		case "feedback-toast--interactive": {
			await root.getByRole("button", { name: "success", exact: true }).click();
			const toast = page.getByRole("alertdialog");
			await toast.waitFor({ state: "visible", timeout: 5000 });
			assert(
				(await toast.getByRole("alert").textContent())?.includes("success notification."),
				"toast announces its message",
			);
			await page.getByRole("button", { name: /Dismiss notification/ }).click();
			await toast.waitFor({ state: "detached", timeout: 5000 });
			break;
		}
		case "overlays-dialog--with-footer": {
			await root.getByRole("button", { name: "Delete", exact: true }).click();
			const dialog = page.getByRole("dialog", { name: "Delete account" });
			await dialog.waitFor({ state: "visible", timeout: 5000 });
			await page.keyboard.press("Escape");
			await dialog.waitFor({ state: "detached", timeout: 5000 });
			break;
		}
		case "overlays-menu--default": {
			await root.getByRole("button", { name: "Actions", exact: true }).click();
			const menu = page.getByRole("menu");
			await menu.waitFor({ state: "visible", timeout: 5000 });
			await page.keyboard.press("ArrowDown");
			await page.keyboard.press("Escape");
			await menu.waitFor({ state: "detached", timeout: 5000 });
			break;
		}
		case "forms-select--select": {
			await root.locator("button").first().click();
			const listbox = page.getByRole("listbox");
			await listbox.waitFor({ state: "visible", timeout: 5000 });
			await page.keyboard.press("Escape");
			await listbox.waitFor({ state: "detached", timeout: 5000 });
			break;
		}
		case "forms-select--combobox": {
			const combo = root.getByRole("combobox").first();
			await combo.fill("Ger");
			await page
				.getByRole("option", { name: "Germany" })
				.waitFor({ state: "visible", timeout: 5000 });
			await page.keyboard.press("ArrowDown");
			await page.keyboard.press("Enter");
			// Selection commits asynchronously — poll the committed value.
			await page
				.waitForFunction((input) => input.value === "Germany", await combo.elementHandle(), {
					timeout: 5000,
				})
				.catch(() => {
					throw new Error("combobox selects the filtered option");
				});
			break;
		}
		case "navigation-tabs--default": {
			await root.getByRole("tab", { name: "Activity" }).click();
			const tab = root.getByRole("tab", { name: "Activity" });
			assert((await tab.getAttribute("aria-selected")) === "true", "clicked tab becomes selected");
			assert(
				((await root.getByRole("tabpanel").textContent()) ?? "").includes("Latest transactions"),
				"tab panel follows selection",
			);
			break;
		}
		case "forms-textfield--default": {
			const email = root.getByRole("textbox", { name: "Email" });
			await email.fill("a@example.com");
			assert((await email.inputValue()) === "a@example.com", "text field accepts typed input");
			break;
		}
		default:
			break;
	}
}

async function assertChecked(locator, expected, message) {
	const handle = await locator.elementHandle();
	assert(handle !== null, `element for ${message} is attached`);
	try {
		// Both the element and the expectation travel as the single serializable
		// arg (page functions cannot close over Node-side variables).
		await locator.page().waitForFunction(
			({ element, want }) => {
				const state = element.getAttribute("aria-checked") ?? (element.checked ? "true" : "false");
				return state === String(want);
			},
			{ element: handle, want: expected },
			{ timeout: 5000 },
		);
	} catch {
		throw new Error(`expected ${message} (checked=${expected})`);
	} finally {
		await handle.dispose();
	}
}

const THEMES = ["light", "dark"];
const failures = [];
let checked = 0;

const server = serveStatic(staticDir);
await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
const port = server.address().port;
console.log(
	`[storybook-browser-check] serving ${staticDir} on :${port}; ${stories.length} stories × ${THEMES.length} themes`,
);

const browser = await chromium.launch();
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	page.setDefaultTimeout(30000);
	for (const { id, title } of stories) {
		for (const theme of THEMES) {
			const label = `${id} [${theme}]`;
			try {
				await page.goto(
					`http://127.0.0.1:${port}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=theme:${theme}`,
					{ waitUntil: "load" },
				);
				await page.waitForSelector("#storybook-root > *", { state: "attached", timeout: 15000 });
				await page.waitForTimeout(400);
				const applied = await page.evaluate(() =>
					document.querySelector("[data-theme]")?.getAttribute("data-theme"),
				);
				assert(applied === theme, `expected data-theme="${theme}", saw "${applied}"`);
				if (theme === "light") {
					await interact(page, id);
				}
				const violations = await runAxe(page);
				assert(violations.length === 0, `axe violations: ${JSON.stringify(violations)}`);
				checked += 1;
				console.log(`  PASS ${label} (${title})`);
			} catch (error) {
				failures.push({ label, title, error: String(error?.message ?? error).slice(0, 2000) });
				console.log(
					`  FAIL ${label} (${title}): ${String(error?.message ?? error).split("\n")[0]}`,
				);
			}
		}
	}
} finally {
	await browser.close();
	server.close();
}

console.log(`[storybook-browser-check] ${checked} passed, ${failures.length} failed.`);
if (failures.length > 0) {
	for (const { label, error } of failures) {
		console.error(`\n--- ${label}\n${error}`);
	}
	process.exit(1);
}
