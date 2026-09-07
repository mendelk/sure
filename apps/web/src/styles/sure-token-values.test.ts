// Focused value tests for the generated semantic theme.
// These pin the DTCG reference + sure.dark resolution for representative
// tokens in every group (color, typography, radius, shadow, motion, chart)
// so a bad regeneration fails loudly instead of shipping wrong colors.
import { describe, expect, it } from "vitest";
import { darkValues, lightValues, tokenMeta } from "./sure-token-values";

describe("semantic token values", () => {
	it("exposes the same sorted keys for light and dark (deterministic)", () => {
		const lightKeys = Object.keys(lightValues);
		const darkKeys = Object.keys(darkValues);
		expect(darkKeys).toEqual(lightKeys);
		expect(lightKeys.length).toBeGreaterThan(60);
		// Keys must be emitted in sorted order (deterministic generator output).
		const inversions = lightKeys.filter(
			(key, index) => index > 0 && String(lightKeys[index - 1]) >= key,
		);
		expect(inversions).toEqual([]);
	});

	it("leaves no unresolved DTCG references in any value", () => {
		for (const values of [lightValues, darkValues]) {
			const clean = Object.fromEntries(
				Object.entries(values).map(([name, value]) => [
					name,
					{
						hasOpenBrace: value.includes("{"),
						hasCloseBrace: value.includes("}"),
						length: value.length,
					},
				]),
			);
			for (const flags of Object.values(clean)) {
				expect(flags.hasOpenBrace).toBe(false);
				expect(flags.hasCloseBrace).toBe(false);
				expect(flags.length).toBeGreaterThan(0);
			}
		}
	});

	it("resolves representative light colors from the canonical JSON", () => {
		expect(lightValues.success).toBe("#078C52"); // color.green.700
		expect(lightValues.warning).toBe("#DC6803"); // color.yellow.600
		expect(lightValues.destructive).toBe("#F13636"); // color.red.500
		expect(lightValues.info).toBe("#1570EF"); // color.blue.600
		expect(lightValues.surface).toBe("#F7F7F7"); // color.gray.50
		expect(lightValues.container).toBe("#ffffff");
		expect(lightValues.textPrimary).toBe("#171717"); // color.gray.900
		expect(lightValues.buttonBgPrimary).toBe("#171717");
		expect(lightValues.buttonBgDestructive).toBe("#EC2222"); // color.red.600
	});

	it("resolves representative dark colors from sure.dark extensions", () => {
		expect(darkValues.success).toBe("#32D583"); // color.green.400
		expect(darkValues.warning).toBe("#FDB022"); // color.yellow.400
		expect(darkValues.destructive).toBe("#ED4E4E"); // color.red.400
		expect(darkValues.info).toBe("#2E90FA"); // color.blue.500
		expect(darkValues.surface).toBe("#0B0B0B"); // color.black
		expect(darkValues.container).toBe("#171717"); // color.gray.900
		expect(darkValues.textPrimary).toBe("#ffffff");
		expect(darkValues.buttonBgGhostHover).toBe("#242424"); // first class of multi-class dark
	});

	it("renders alpha refs as standard color-mix()", () => {
		expect(lightValues.focusRing).toBe("color-mix(in srgb, #0B0B0B 50%, transparent)");
		expect(darkValues.focusRing).toBe("color-mix(in srgb, #ffffff 50%, transparent)");
		expect(lightValues.borderDivider).toBe("color-mix(in srgb, #0B0B0B 8%, transparent)");
	});

	it("covers typography tokens", () => {
		expect(lightValues.fontSans).toContain("Geist");
		expect(lightValues.fontMono).toContain("Geist Mono");
		expect(lightValues.fontWeightMedium).toBe("500");
		expect(lightValues.fontWeightSemibold).toBe("600");
		expect(darkValues.fontSans).toBe(lightValues.fontSans);
	});

	it("covers radius, shadow, and motion tokens", () => {
		expect(lightValues.radiusMd).toBe("8px");
		expect(lightValues.radiusLg).toBe("10px");
		expect(lightValues.shadowXs).toBe(
			"0px 1px 2px 0px color-mix(in srgb, #0B0B0B 6%, transparent)",
		);
		expect(darkValues.shadowXs).toBe("0px 1px 2px 0px color-mix(in srgb, #ffffff 8%, transparent)");
		expect(lightValues.shadowBorderXs).toContain("0px 0px 0px 1px");
		expect(lightValues.motionStrokeFill).toBe("stroke-fill 3s 300ms forwards");
		expect(darkValues.motionStrokeFill).toBe(lightValues.motionStrokeFill);
	});

	it("covers chart tokens (budget fills + status accents)", () => {
		expect(lightValues.chartUnusedFill).toBe("#E7E7E7");
		expect(lightValues.chartUnallocatedFill).toBe("#F7F7F7");
		expect(darkValues.chartUnusedFill).toBe("#737373");
		expect(darkValues.chartUnallocatedFill).toBe("#363636");
	});

	it("keeps every token mapped to its canonical source and group", () => {
		expect(Object.keys(tokenMeta)).toEqual(Object.keys(lightValues));
		expect(tokenMeta.success).toEqual({ source: "color.success", group: "color" });
		expect(tokenMeta.textPrimary).toEqual({
			source: "utility.text-primary",
			group: "utility",
		});
		expect(tokenMeta.chartUnusedFill).toEqual({
			source: "budget.unused-fill",
			group: "chart",
		});
		expect(tokenMeta.fontSans).toEqual({ source: "font.sans", group: "typography" });
		expect(tokenMeta.radiusMd).toEqual({
			source: "border.radius.md",
			group: "radius",
		});
		expect(tokenMeta.shadowXs).toEqual({ source: "shadow.xs", group: "shadow" });
		expect(tokenMeta.motionStrokeFill).toEqual({
			source: "animate.stroke-fill",
			group: "motion",
		});
		const groups = new Set(Object.values(tokenMeta).map((m) => m.group));
		expect(groups).toEqual(
			new Set(["color", "utility", "chart", "typography", "radius", "shadow", "motion"]),
		);
	});
});
