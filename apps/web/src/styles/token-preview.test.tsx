// Representative rendering proof: the same semantic contract renders
// correctly for light and dark. TokenPreview consumes generated values (not
// literals), so these assertions fail if regeneration produces wrong output.
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TOKEN_PREVIEW_SWATCHES, TokenPreview } from "./TokenPreview";
import { darkValues, lightValues } from "./sure-token-values";

// React SSR escapes `'` as `&#x27;` inside attributes and styles.
const asRendered = (value: string): string => value.replace(/'/g, "&#x27;");

describe("TokenPreview rendering", () => {
	it("covers every token group with at least one swatch", () => {
		const names = TOKEN_PREVIEW_SWATCHES.map((s) => s.name);
		expect(names).toContain("success"); // color
		expect(names).toContain("textPrimary"); // utility
		expect(names).toContain("chartUnusedFill"); // chart
	});

	it("renders light values for the light theme", () => {
		const html = renderToString(<TokenPreview theme="light" />);
		expect(html).toContain('data-testid="token-preview-light"');
		expect(html).toContain(`data-value="${lightValues.success}"`);
		expect(html).toContain(`data-value="${lightValues.textPrimary}"`);
		expect(html).toContain(`data-value="${lightValues.chartUnusedFill}"`);
		expect(html).toContain(asRendered(lightValues.fontSans));
		expect(html).toContain(lightValues.motionStrokeFill);
	});

	it("renders dark values for the dark theme", () => {
		const html = renderToString(<TokenPreview theme="dark" />);
		expect(html).toContain('data-testid="token-preview-dark"');
		expect(html).toContain(`data-value="${darkValues.success}"`);
		expect(html).toContain(`data-value="${darkValues.textPrimary}"`);
		expect(html).toContain(`data-value="${darkValues.chartUnusedFill}"`);
	});

	it("renders visibly different output per theme", () => {
		const light = renderToString(<TokenPreview theme="light" />);
		const dark = renderToString(<TokenPreview theme="dark" />);
		expect(light).not.toBe(dark);
		// Spot-check the exact hexes that prove the sure.dark mapping.
		expect(light).toContain("#078C52");
		expect(dark).toContain("#32D583");
		expect(light).toContain("#171717");
		expect(dark).toContain("#ffffff");
	});
});
