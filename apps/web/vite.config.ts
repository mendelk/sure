import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import stylex from "@stylexjs/unplugin";
import type { UserOptions as StylexUserOptions } from "@stylexjs/unplugin";
import { fileURLToPath } from "node:url";
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
	// Storybook (STORYBOOK env, set to "true" by the Storybook CLI itself)
	// renders primitives in isolation and never touches the Sure API —
	// exempt it like vitest below.
	if (command !== "serve" || process.env["VITEST"] || process.env["STORYBOOK"] != null) {
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

/**
 * Test-only plugin (active under `VITEST`): force the dependency optimizer
 * off after every other plugin's `config` hook has run.
 *
 * Why: vitest serves transformed test sources through Vite's web pipeline,
 * whose pre-bundler rewrites bare `react` imports to `deps/react.js` — a
 * second React copy next to the natively externalized one used by
 * react-dom/react-aria. Two copies means every hook call throws "Invalid
 * hook call". Neither static `optimizeDeps` config nor
 * `test.deps.optimizer` survives the Start plugin's later `config` hook
 * (verified: the merged `optimizeDeps.include` still lists React), so this
 * `configResolved` mutation — which runs after all `config` hooks but
 * before the optimizer starts — is the single effective switch. Scoped to
 * vitest: dev/build behavior is untouched.
 *
 * NB: `optimizeDeps.disabled` is deprecated (Vite warns and ignores it);
 * the supported off switch is `noDiscovery` with an empty `include`.
 */
function disableOptimizerUnderVitest(): PluginOption {
	return {
		name: "sure-web:disable-optimizer-under-vitest",
		configResolved(config) {
			config.optimizeDeps.noDiscovery = true;
			config.optimizeDeps.entries = [];
			config.optimizeDeps.include = [];
		},
	};
}

export default defineConfig(({ command, mode }) => {
	// NB: vite loads `.env` files after the config module, so read them here
	// explicitly; shell-provided variables still take precedence via loadEnv
	// ordering below.
	const env = loadEnv(mode, process.cwd(), "");
	ensureSureApiOriginForServe(command, process.env["SURE_API_ORIGIN"] ?? env["SURE_API_ORIGIN"]);

	// Storybook loads this config through @storybook/builder-vite and only
	// needs module resolution: the TanStack Start plugin (router, server
	// functions, multi-environment builder) breaks the Storybook build
	// ("multiple entries detected"), and the StyleX plugin is added by
	// .storybook/main.ts instead. Active whenever STORYBOOK is set — the
	// Storybook CLI sets STORYBOOK=true on startup, so the package.json
	// scripts set it too for local `vite` invocations outside Storybook.
	if (process.env["STORYBOOK"] != null) {
		return {
			resolve: {
				tsconfigPaths: true,
				alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
			},
		};
	}

	return {
		server: {
			port: 5173,
		},
		resolve: {
			tsconfigPaths: true,
			// Explicit `~/* → src/*` alias (CONVENTIONS.md). The TanStack
			// Start plugin resolves it in dev/build, but vitest needs it
			// spelled out so unit tests can import product modules.
			alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
			// Single React instance across symlinked pnpm copies (helps
			// dev/build too; the test pipeline additionally disables the
			// optimizer via disableOptimizerUnderVitest below).
			dedupe: ["react", "react-dom"],
		},
		plugins: [
			...(process.env["VITEST"] ? [disableOptimizerUnderVitest()] : []),
			tanstackStart(),
			// Compile the generated semantic theme (src/styles/sure-tokens.stylex.ts)
			// and any stylex.create() call sites. Keep before viteReact to preserve
			// Fast Refresh; useCSSLayers keeps StyleX output ordered in @layers.
			// `aliases` teaches the StyleX babel resolver the `~/* → src/*`
			// path alias (CONVENTIONS.md) — without it, any stylex.create()
			// file importing the theme via `~` fails the build once routes
			// start importing the UI primitives. Shape follows the plugin
			// contract: glob key with an array of replacement globs.
			// Unit tests assert on generated source text and plain values, never
			// on compiled CSS — and the plugin's serve-mode watchers keep the
			// vitest worker's Vite server from closing cleanly — so stay off
			// under vitest. Production builds (command "build") are unaffected.
			stylexVitePlugin({
				useCSSLayers: true,
				devMode: process.env["VITEST"] ? "off" : "full",
				aliases: { "~/*": [`${fileURLToPath(new URL("./src", import.meta.url))}/*`] },
			}),
			// react's vite plugin must come after start's vite plugin
			viteReact(),
		],
		test: {
			setupFiles: ["./src/test-setup.ts"],
			alias: [
				// Unit/interaction tests assert ARIA behavior, never compiled
				// CSS — and the StyleX compiler stays off under vitest (see
				// above). Route the runtime to the test shim so components
				// importing the generated theme render without the compiler.
				{
					find: /^@stylexjs\/stylex$/,
					replacement: fileURLToPath(
						new URL("./src/components/ui/stylex-test-shim.ts", import.meta.url),
					),
				},
			],
		},
	};
});
