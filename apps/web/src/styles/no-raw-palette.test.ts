// Semantic-only enforcement: product code must consume the generated
// semantic theme, never raw palette literals. Scans every source file outside
// `src/styles/` (and outside tests, which legitimately pin expected values)
// for hex color literals. Palette ladders are not exported at all, so there
// is no import to grep for — the hex scan is the backstop.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/g;

// Machine-generated sources carry upstream literals verbatim (OpenAPI
// contract examples, router codegen) and are pinned byte-identical by
// their own generators (`api:check`, `api:zod:check`, `tsr generate`), so
// the hex backstop only applies to hand-written product code.
const GENERATED_BASENAMES = new Set(["openapi.d.ts", "routeTree.gen.ts"]);
// The Orval Zod tree is entirely generated (see above); hex literals in it
// are OpenAPI example strings, not palette usage.
const GENERATED_DIRS = new Set(["lib/api/zod"]);

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			if (entry === "styles") continue;
			if (GENERATED_DIRS.has(full.replace(`${SRC}/`, ""))) continue;
			out.push(...sourceFiles(full));
		} else if (/\.(ts|tsx)$/.test(entry) && !/[.-]test\.[jt]sx?$/.test(entry)) {
			if (!GENERATED_BASENAMES.has(entry)) {
				out.push(full);
			}
		}
	}
	return out;
}

describe("no raw palette literals in product code", () => {
	it("finds no hex color literals outside src/styles/ and tests", () => {
		const offenders: string[] = [];
		for (const file of sourceFiles(SRC)) {
			const hits = readFileSync(file, "utf8").match(HEX_LITERAL);
			if (hits) {
				offenders.push(`${file.replace(`${SRC}/`, "")}: ${hits.join(", ")}`);
			}
		}
		// Non-empty offenders means product code uses raw palette literals
		// instead of semantic vars from sure-tokens.stylex.ts.
		expect(offenders).toEqual([]);
	});
});
