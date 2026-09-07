// Static theme-shell coverage: the generated sure-theme.css must carry the
// color-scheme defaults, the reduced-motion guard, and forced-colors
// fallbacks. Fails if a regeneration drops any of them.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME_CSS = readFileSync(resolve(HERE, "sure-theme.css"), "utf8");

describe("theme shell CSS", () => {
	it("declares color-scheme with explicit and system-default paths", () => {
		expect(THEME_CSS).toContain("color-scheme: light dark;");
		expect(THEME_CSS).toContain(':root[data-theme="light"]');
		expect(THEME_CSS).toContain(':root[data-theme="dark"]');
		expect(THEME_CSS).toContain("@media (prefers-color-scheme: dark)");
		expect(THEME_CSS).toContain(":root:not([data-theme])");
	});

	it("collapses motion when the user prefers reduced motion", () => {
		expect(THEME_CSS).toContain("@media (prefers-reduced-motion: reduce)");
		expect(THEME_CSS).toContain("animation-duration: 0.01ms !important;");
		expect(THEME_CSS).toContain("transition-duration: 0.01ms !important;");
	});

	it("keeps content legible under forced colors", () => {
		expect(THEME_CSS).toContain("@media (forced-colors: active)");
		expect(THEME_CSS).toContain("box-shadow: none !important;");
		expect(THEME_CSS).toContain("outline: 2px solid CanvasText;");
	});
});
