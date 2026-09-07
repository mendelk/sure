import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import stylex from "@stylexjs/unplugin";
import { defineConfig, loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";
import { assertSureApiOrigin } from "./src/lib/sure-api-origin.ts";

// Fail `vite dev` / `vite preview` startup fast when the deployment-level
// Sure API origin is missing or invalid, instead of serving a broken app.
// Production builds intentionally skip this check so CI can build without
// deployment secrets; the SSR loader re-validates on every server render.
function ensureSureApiOriginForServe(command: string, rawValue: unknown) {
	if (command !== "serve") {
		return;
	}

	const result = assertSureApiOrigin(
		typeof rawValue === "string" ? rawValue : undefined,
	);
	if (!result.ok) {
		throw new Error(
			`[sure-web] ${result.error} ` +
				`Copy apps/web/.env.example to apps/web/.env and set SURE_API_ORIGIN ` +
				`(e.g. SURE_API_ORIGIN=http://localhost:3000).`,
		);
	}
}

export default defineConfig(({ command, mode }) => {
	// NB: vite loads `.env` files after the config module, so read them here
	// explicitly; shell-provided variables still take precedence via loadEnv
	// ordering below.
	const env = loadEnv(mode, process.cwd(), "");
	ensureSureApiOriginForServe(
		command,
		process.env.SURE_API_ORIGIN ?? env.SURE_API_ORIGIN,
	);

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
			stylex.vite({ useCSSLayers: true }),
			// react's vite plugin must come after start's vite plugin
			viteReact(),
		],
	};
});
