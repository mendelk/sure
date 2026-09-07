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
	if (start < 0) {
		throw new Error(`missing ${marker} in generated StyleX output`);
	}
	const open = STYLEX_SOURCE.indexOf("{", start);
	const end = STYLEX_SOURCE.indexOf("\n});", open);
	if (end <= open) {
		throw new Error(`unterminated ${marker} in generated StyleX output`);
	}
	return STYLEX_SOURCE.slice(open, end);
}

function entriesOf(block: string): Map<string, string> {
	const entries = new Map<string, string>();
	for (const match of block.matchAll(/^\t([A-Za-z_$][A-Za-z0-9_$]*): ("(?:[^"\\]|\\.)*"),$/gm)) {
		const name = match[1];
		const raw = match[2];
		if (name === undefined || raw === undefined) {
			throw new Error("unreachable: regex groups always participate");
		}
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "string") {
			throw new Error(`expected a string value for ${name} in generated StyleX output`);
		}
		entries.set(name, parsed);
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
		const emitted = [...STYLEX_SOURCE.matchAll(/^\t[A-Za-z_$][A-Za-z0-9_$]*: (".*"),$/gm)].map(
			(match) => {
				const value = match[1];
				if (value === undefined) {
					throw new Error("unreachable: regex group always participates");
				}
				return value;
			},
		);
		// No emitted value may still contain an unresolved DTCG reference.
		expect(emitted.filter((value) => value.includes("{"))).toEqual([]);
	});

	it("keeps defineVars, light theme, and dark theme in sync with plain values", () => {
		const vars = entriesOf(blockAfter("stylex.defineVars"));
		const light = entriesOf(blockAfter("sureLightTheme = stylex.createTheme"));
		const dark = entriesOf(blockAfter("sureDarkTheme = stylex.createTheme"));

		expect(Object.keys(lightValues).length).toBeGreaterThan(60);
		// Whole-object comparison pins keys and values at once; a mismatch
		// diff names the drifting token (vars/light/dark blocks).
		expect(Object.fromEntries(vars)).toEqual(lightValues);
		expect(Object.fromEntries(light)).toEqual(lightValues);
		expect(Object.fromEntries(dark)).toEqual(darkValues);
	});

	it("emits no raw palette ladders as variables", () => {
		for (const ladder of ["gray25", "red500", "green500", "blue600", "yellow400"]) {
			expect(STYLEX_SOURCE).not.toContain(`${ladder}:`);
		}
	});
});
