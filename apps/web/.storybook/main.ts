// Storybook configuration for the Sure alternate frontend (apps/web).
//
// Static component catalog for the accessible UI primitives
// (src/components/ui). Runs in Node (tooling config) — browser-safe rules
// do not apply here, see the .oxlintrc.json override for **/.storybook/main.*.
import { fileURLToPath } from "node:url";
import stylex from "@stylexjs/unplugin";
import type { UserOptions as StylexUserOptions } from "@stylexjs/unplugin";
import type { StorybookConfig } from "@storybook/react-vite";
import type { PluginOption } from "vite";

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

function isAliasEntry(value: unknown): value is { find: string | RegExp; replacement: string } {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	if (!("find" in value) || !("replacement" in value)) {
		return false;
	}
	const find: unknown = value.find;
	const replacement: unknown = value.replacement;
	return (typeof find === "string" || find instanceof RegExp) && typeof replacement === "string";
}

const config: StorybookConfig = {
	stories: ["../src/components/ui/*.stories.tsx"],
	addons: ["@storybook/addon-viewport", "@storybook/addon-a11y"],
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	async viteFinal(base) {
		const src = fileURLToPath(new URL("../src", import.meta.url));
		// AliasOptions is a union (array or record) and storybook's own
		// types are loose (`any`), so normalize explicitly instead of
		// spreading. The record form can only be this file's own `~` (the
		// minimal STORYBOOK vite config returns no other aliases), which is
		// re-added below — only array entries need preserving.
		const alias: Array<{ find: string | RegExp; replacement: string }> = [
			{ find: "~", replacement: src },
		];
		const baseAlias: unknown = base.resolve?.alias;
		if (Array.isArray(baseAlias)) {
			for (const entry of baseAlias) {
				if (isAliasEntry(entry)) {
					alias.push({ find: entry.find, replacement: entry.replacement });
				}
			}
		}
		return {
			...base,
			resolve: {
				...base.resolve,
				alias,
				dedupe: [...(base.resolve?.dedupe ?? []), "react", "react-dom"],
			},
			plugins: [
				...(base.plugins ?? []),
				// `aliases` teaches the StyleX babel resolver the `~/*` path
				// alias — without it, stylex.create() files importing the
				// generated theme via `~` fail with "Could not resolve the
				// path to the imported file". Shape follows the plugin
				// contract: glob key with an array of replacement globs.
				stylexVitePlugin({
					useCSSLayers: true,
					devMode: "full",
					aliases: { "~/*": [`${src}/*`] },
				}),
			],
		};
	},
};

export default config;
