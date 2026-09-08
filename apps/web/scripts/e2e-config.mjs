// Pure e2e configuration for the Sure alt-frontend harness (apps/web).
//
// `resolveE2EConfig` maps environment variables to service URLs with safe,
// CI-friendly defaults. Hosts are pinned to loopback: the harness must
// never bind or target `0.0.0.0`/remote hosts by accident (containment, same
// spirit as `resolveStaticPath` in ./static-path.mjs).
//
// Sensitive fixture regions (emails, balances, tokens) are masked in every
// artifact via SENSITIVE_MASK_SELECTORS — screenshots go through
// `captureMasked` (./e2e-helpers.mjs) only, never raw. Pages mark PII and
// finance regions with `data-sensitive`; the selector list also covers
// password inputs by construction.
import { join } from "node:path";

export const E2E_DEFAULTS = {
	host: "127.0.0.1",
	railsPort: 3101,
	webPort: 4173,
	email: "member@e2e.sure.invalid",
	viewerEmail: "viewer@e2e.sure.invalid",
	password: "E2e-supersecret-1!",
	stepTimeoutMs: 30_000,
	railsStartupTimeoutMs: 180_000,
	webStartupTimeoutMs: 120_000,
};

/** Selectors masked in every screenshot/trace artifact. */
export const SENSITIVE_MASK_SELECTORS = ["[data-sensitive]", 'input[type="password"]'];

function parsePort(value, fallback) {
	if (value === undefined || value === "") {
		return fallback;
	}
	const port = Number(value);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`[e2e-config] invalid port "${value}" (expected 1-65535).`);
	}
	return port;
}

/**
 * Resolve the harness configuration from `env` (defaults to
 * `process.env`). Throws on invalid ports or non-loopback overrides.
 */
export function resolveE2EConfig(env = process.env, webRoot = process.cwd()) {
	const railsPort = parsePort(env["SURE_E2E_RAILS_PORT"], E2E_DEFAULTS.railsPort);
	const webPort = parsePort(env["SURE_E2E_WEB_PORT"], E2E_DEFAULTS.webPort);
	const railsOrigin = env["SURE_E2E_RAILS_ORIGIN"] ?? `http://${E2E_DEFAULTS.host}:${railsPort}`;
	const webOrigin = env["SURE_E2E_WEB_ORIGIN"] ?? `http://${E2E_DEFAULTS.host}:${webPort}`;
	for (const [name, origin] of [
		["SURE_E2E_RAILS_ORIGIN", railsOrigin],
		["SURE_E2E_WEB_ORIGIN", webOrigin],
	]) {
		const host = new URL(origin).hostname;
		if (host !== E2E_DEFAULTS.host && host !== "localhost") {
			throw new Error(`[e2e-config] ${name} must stay on loopback (saw "${origin}").`);
		}
	}
	const artifactsDir = env["E2E_ARTIFACTS_DIR"] ?? join(webRoot, "test-results", "e2e");
	return {
		host: E2E_DEFAULTS.host,
		railsPort,
		webPort,
		railsOrigin,
		webOrigin,
		bffOrigin: webOrigin,
		email: env["SURE_E2E_EMAIL"] ?? E2E_DEFAULTS.email,
		viewerEmail: env["SURE_E2E_VIEWER_EMAIL"] ?? E2E_DEFAULTS.viewerEmail,
		password: env["SURE_E2E_PASSWORD"] ?? E2E_DEFAULTS.password,
		csrfToken: "e2e-csrf-token",
		artifactsDir,
		stepTimeoutMs: E2E_DEFAULTS.stepTimeoutMs,
		railsStartupTimeoutMs: E2E_DEFAULTS.railsStartupTimeoutMs,
		webStartupTimeoutMs: E2E_DEFAULTS.webStartupTimeoutMs,
	};
}

/** Credentials for a harness role (`member` = family admin, `viewer`). */
export function roleCredentials(config, role) {
	if (role === "member") {
		return { email: config.email, password: config.password };
	}
	if (role === "viewer") {
		return { email: config.viewerEmail, password: config.password };
	}
	throw new Error(`[e2e-config] unknown role "${role}" (expected "member" or "viewer").`);
}

/** Viewport matrix: desktop plus a mobile small-screen profile. */
export const E2E_VIEWPORTS = {
	desktop: { width: 1280, height: 800 },
	mobile: { width: 390, height: 844 },
};

/** Theme matrix: stored Sure theme resolved post-hydration. */
export const E2E_THEMES = ["light", "dark"];
