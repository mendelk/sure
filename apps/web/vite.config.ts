import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import stylex from "@stylexjs/unplugin";
import type { UserOptions as StylexUserOptions } from "@stylexjs/unplugin";
import { defineConfig, loadEnv } from "vite";
import type { PluginOption } from "vite";
import viteReact from "@vitejs/plugin-react";
import { assertSureApiOrigin } from "./src/lib/sure-api-origin.ts";

// Fail `vite dev` / `vite preview` startup fast when the deployment-level
// Sure API origin is missing or invalid, instead of serving a broken app.
// Production builds intentionally skip this check so CI can build without
// deployment secrets; the SSR loader re-validates on every server render.
// Vitest runs (`vitest run`) also skip it: unit tests must stay hermetic and
// runnable from a clean checkout without deployment env vars.
function ensureSureApiOriginForServe(command: string, rawValue: unknown) {
	if (command !== "serve" || process.env["VITEST"]) {
		return;
	}

	const result = assertSureApiOrigin(typeof rawValue === "string" ? rawValue : undefined);
	if (!result.ok) {
		throw new Error(
			`[sure-web] ${result.error} ` +
				`Copy apps/web/.env.example to apps/web/.env and set SURE_API_ORIGIN ` +
				`(e.g. SURE_API_ORIGIN=http://localhost:3000).`,
		);
	}
}

/**
 * Typed adapter around `stylex.vite()`. @stylexjs/unplugin declares every
 * bundler entry as returning `any`, which would poison the inferred
 * `plugins` array type and trip typescript(no-unsafe-assignment). Narrow
 * once at the third-party boundary: `any` flows into `unknown` (always
 * safe), then a shape check narrows to Vite's `PluginOption` — no broad
 * `any`, no rule disables.
 */
function isPluginOption(value: unknown): value is PluginOption {
	return typeof value === "object" && value !== null;
}

function stylexVitePlugin(options: Partial<StylexUserOptions>): PluginOption {
	const plugin: unknown = stylex.vite(options);
	if (!isPluginOption(plugin)) {
		throw new Error("[sure-web] StyleX Vite plugin did not return a plugin object.");
	}
	return plugin;
}

export default defineConfig(({ command, mode }) => {
	// NB: vite loads `.env` files after the config module, so read them here
	// explicitly; shell-provided variables still take precedence via loadEnv
	// ordering below.
	const env = loadEnv(mode, process.cwd(), "");
	ensureSureApiOriginForServe(command, process.env["SURE_API_ORIGIN"] ?? env["SURE_API_ORIGIN"]);

	return {
		server: {
			port: 5173,
		},
		resolve: {
			tsconfigPaths: true,
		},
		plugins: [
			tanstackStart(),
			// Compile the generated semantic theme (src/styles/sure-tokens.stylex.ts)
			// and any stylex.create() call sites. Keep before viteReact to preserve
			// Fast Refresh; useCSSLayers keeps StyleX output ordered in @layers.
			// Unit tests assert on generated source text and plain values, never
			// on compiled CSS — and the plugin's serve-mode watchers keep the
			// vitest worker's Vite server from closing cleanly — so stay off
			// under vitest. Production builds (command "build") are unaffected.
			stylexVitePlugin({
				useCSSLayers: true,
				devMode: process.env["VITEST"] ? "off" : "full",
			}),
			// react's vite plugin must come after start's vite plugin
			viteReact(),
		],
	};
});
