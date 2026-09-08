#!/usr/bin/env node
// Orchestrated e2e run: isolated Rails + web services, seeded data, smoke
// suite, live BFF suite, then reliable cleanup (apps/web).
//
// Flow:
//  1. `bin/rails db:prepare` (RAILS_ENV=test) + `db/e2e_seed.rb` —
//     deterministic users ("member"/"viewer") and finance data.
//  2. Boot Rails (`-b 127.0.0.1 -p SURE_E2E_RAILS_PORT`) and wait for `/up`.
//  3. `pnpm build` + `vite preview` the TanStack app with
//     `SURE_API_ORIGIN` pinned to the Rails origin, wait for the root.
//  4. Run the Playwright smoke suite (`./e2e-smoke.mjs`), then the live
//     BFF → Rails → database vitest file with `SURE_E2E_LIVE=1`.
//  5. ALWAYS: stop every spawned process (SIGTERM, escalate to SIGKILL)
//     and delete the seeded rows (`E2E_CLEANUP=1`), even on failure or
//     Ctrl-C. Masked screenshots + server logs stay in the artifacts dir.
//
// Isolation notes: PostgreSQL/Redis are ambient (GitHub service containers
// in CI, local services for developers — see apps/web/README.md). The seed
// is namespaced to the "E2E Harness Family" and removed afterwards, so
// repeated runs are repeatable without touching other rows.
//
// Usage: `pnpm test:e2e:ci` (from apps/web), or `node scripts/e2e-services.mjs`.
import { spawn, spawnSync } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import net from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveE2EConfig } from "./e2e-config.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(webRoot, "..", "..");
const config = resolveE2EConfig(process.env, webRoot);

const RAILS_ENV = { RAILS_ENV: "test" };
const children = new Set();

function log(message) {
	console.log(`[e2e-services] ${message}`);
}

function fail(message) {
	console.error(`[e2e-services] ${message}`);
	process.exit(1);
}

function portInUse(port) {
	return new Promise((done) => {
		const socket = net.connect(port, config.host);
		socket.once("connect", () => {
			socket.destroy();
			done(true);
		});
		socket.once("error", () => done(false));
	});
}

async function waitForUrl(url, timeoutMs, label) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
			if (response.ok) {
				return;
			}
		} catch {
			// Not up yet — keep polling until the deadline.
		}
		if (Date.now() > deadline) {
			throw new Error(`${label} never became ready at ${url} (timeout ${timeoutMs}ms).`);
		}
		await new Promise((wake) => setTimeout(wake, 1000));
	}
}

/** Run a short command synchronously; throws with the failing argv. */
function runForeground(argv, options = {}) {
	const result = spawnSync(argv[0], argv.slice(1), {
		cwd: repoRoot,
		stdio: "inherit",
		env: { ...process.env, ...RAILS_ENV, ...options.env },
	});
	if (result.status !== 0) {
		throw new Error(`command failed (${result.status}): ${argv.join(" ")}${options.hint ?? ""}`);
	}
}

async function spawnServer(argv, options, logName) {
	const handle = await open(join(config.artifactsDir, logName), "a");
	const child = spawn(argv[0], argv.slice(1), {
		cwd: options.cwd,
		stdio: ["ignore", handle.fd, handle.fd],
		env: { ...process.env, ...options.env },
	});
	children.add(child);
	child.once("exit", () => {
		children.delete(child);
		handle.close().catch(() => undefined);
	});
	// Give the process one tick to fail fast (bad argv, missing binary).
	await new Promise((wake) => setTimeout(wake, 500));
	if (child.exitCode !== null && child.exitCode !== 0) {
		throw new Error(`server exited immediately (${child.exitCode}): ${argv.join(" ")}`);
	}
	return child;
}

async function stopAll() {
	const stopping = [...children];
	children.clear();
	for (const child of stopping) {
		child.kill("SIGTERM");
	}
	const deadline = Date.now() + 15_000;
	for (const child of stopping) {
		while (child.exitCode === null && Date.now() < deadline) {
			await new Promise((wake) => setTimeout(wake, 250));
		}
		if (child.exitCode === null) {
			child.kill("SIGKILL");
		}
	}
}

async function cleanupData() {
	try {
		runForeground(["bin/rails", "runner", "db/e2e_seed.rb"], {
			env: { E2E_CLEANUP: "1", SURE_E2E_PASSWORD: config.password },
		});
		log("seeded e2e data removed.");
	} catch (error) {
		console.error(
			`[e2e-services] WARNING: data cleanup failed: ${String(error?.message ?? error)}`,
		);
	}
}

let failed = false;
process.on("SIGINT", () => {
	void (async () => {
		await stopAll();
		await cleanupData();
		process.exit(130);
	})();
});
process.on("SIGTERM", () => {
	void (async () => {
		await stopAll();
		await cleanupData();
		process.exit(143);
	})();
});

await mkdir(config.artifactsDir, { recursive: true });

try {
	if (await portInUse(config.railsPort)) {
		fail(`port ${config.railsPort} is already in use — stop the other Rails server first.`);
	}
	if (await portInUse(config.webPort)) {
		fail(`port ${config.webPort} is already in use — stop the other web server first.`);
	}

	log("preparing Rails test database…");
	runForeground(["bin/rails", "db:prepare"], {
		hint: " (needs PostgreSQL/Redis reachable via DATABASE_URL/REDIS_URL or DB_HOST/DB_PORT/POSTGRES_*)",
	});
	log("seeding deterministic e2e data…");
	runForeground(["bin/rails", "runner", "db/e2e_seed.rb"], {
		env: { SURE_E2E_PASSWORD: config.password },
	});

	log(`booting Rails on ${config.railsOrigin}…`);
	await spawnServer(
		["bin/rails", "server", "-b", config.host, "-p", String(config.railsPort), "-e", "test"],
		{ cwd: repoRoot, env: RAILS_ENV },
		"rails.log",
	);
	await waitForUrl(`${config.railsOrigin}/up`, config.railsStartupTimeoutMs, "Rails");

	log("building the web app…");
	runForeground(["pnpm", "--filter", "@sure/web", "build"], { env: {} });
	log(`previewing the web app on ${config.webOrigin}…`);
	await spawnServer(
		[
			"pnpm",
			"--filter",
			"@sure/web",
			"exec",
			"vite",
			"preview",
			"--port",
			String(config.webPort),
			"--strictPort",
			"--host",
			config.host,
		],
		{ cwd: repoRoot, env: { SURE_API_ORIGIN: config.railsOrigin } },
		"web.log",
	);
	await waitForUrl(config.webOrigin, config.webStartupTimeoutMs, "web preview");

	log("running the Playwright smoke suite…");
	runForeground(["node", "scripts/e2e-smoke.mjs"], { env: {} });

	log("running the Playwright app-shell suite…");
	runForeground(["node", "scripts/e2e-app-shell.mjs"], { env: {} });

	log("running the live BFF → Rails → database suite…");
	runForeground(
		["pnpm", "--filter", "@sure/web", "exec", "vitest", "run", "src/lib/api/bff-live.test.ts"],
		{
			env: {
				SURE_E2E_LIVE: "1",
				SURE_E2E_RAILS_ORIGIN: config.railsOrigin,
				SURE_E2E_BFF_ORIGIN: config.bffOrigin,
				SURE_E2E_EMAIL: config.email,
				SURE_E2E_PASSWORD: config.password,
			},
		},
	);
} catch (error) {
	failed = true;
	console.error(`[e2e-services] ${String(error?.message ?? error).slice(0, 2000)}`);
} finally {
	await stopAll();
	await cleanupData();
}

log(
	failed
		? "FAILED — processes stopped, seeded data removed."
		: "done — processes stopped, seeded data removed.",
);
process.exit(failed ? 1 : 0);
