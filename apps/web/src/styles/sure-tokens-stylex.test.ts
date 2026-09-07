// Drift test: the compiled StyleX theme must carry exactly the same keys and
// values as the plain-data twin. Reads the generated `.stylex.ts` as text so
// the test never depends on the StyleX compiler runtime.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { darkValues, lightValues } from "./sure-token-values";

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLEX_SOURCE = readFileSync(resolve(HERE, "sure-tokens.stylex.ts"), "utf8");

function blockAfter(marker: string): string {
	const start = STYLEX_SOURCE.indexOf(marker);
	expect(start, `missing ${marker}`).toBeGreaterThanOrEqual(0);
	const open = STYLEX_SOURCE.indexOf("{", start);
	const end = STYLEX_SOURCE.indexOf("\n});", open);
	expect(end, `unterminated ${marker}`).toBeGreaterThan(open);
	return STYLEX_SOURCE.slice(open, end);
}

function entriesOf(block: string): Map<string, string> {
	const entries = new Map<string, string>();
	for (const match of block.matchAll(/^\s{2}([A-Za-z_$][A-Za-z0-9_$]*): ("(?:[^"\\]|\\.)*"),$/gm)) {
		entries.set(match[1], JSON.parse(match[2]) as string);
	}
	return entries;
}

describe("StyleX theme drift", () => {
	it("defines vars and both themes with the typed token name", () => {
		expect(STYLEX_SOURCE).toContain("stylex.defineVars({");
		expect(STYLEX_SOURCE).toContain("export const sureLightTheme = stylex.createTheme(vars, {");
		expect(STYLEX_SOURCE).toContain("export const sureDarkTheme = stylex.createTheme(vars, {");
		expect(STYLEX_SOURCE).toContain("export type SureTokenName =");
		// Explicit string union: keyof typeof vars would leak StyleX's symbol
		// members into Record<SureTokenName, …>.
		expect(STYLEX_SOURCE).not.toContain("keyof typeof vars");
		for (const name of Object.keys(lightValues)) {
			expect(STYLEX_SOURCE).toContain(`"${name}"`);
		}
		for (const match of STYLEX_SOURCE.matchAll(/^\s{2}[A-Za-z_$][A-Za-z0-9_$]*: (".*"),$/gm)) {
			expect(match[1], "unresolved DTCG reference in StyleX output").not.toContain("{");
		}
	});

	it("keeps defineVars, light theme, and dark theme in sync with plain values", () => {
		const vars = entriesOf(blockAfter("stylex.defineVars"));
		const light = entriesOf(blockAfter("sureLightTheme = stylex.createTheme"));
		const dark = entriesOf(blockAfter("sureDarkTheme = stylex.createTheme"));

		expect(Object.keys(lightValues).length).toBeGreaterThan(60);
		for (const [name, value] of Object.entries(lightValues)) {
			expect(vars.get(name), `vars.${name}`).toBe(value);
			expect(light.get(name), `light.${name}`).toBe(value);
		}
		for (const [name, value] of Object.entries(darkValues)) {
			expect(dark.get(name), `dark.${name}`).toBe(value);
		}
		expect(vars.size).toBe(Object.keys(lightValues).length);
		expect(light.size).toBe(Object.keys(lightValues).length);
		expect(dark.size).toBe(Object.keys(darkValues).length);
	});

	it("emits no raw palette ladders as variables", () => {
		for (const ladder of ["gray25", "red500", "green500", "blue600", "yellow400"]) {
			expect(STYLEX_SOURCE).not.toContain(`${ladder}:`);
		}
	});
});
