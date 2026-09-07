// CSP enforcement backstop (ADR-0001 REQ-TRAN-02): the enforced Content
// Security Policy allows no inline scripts, so the web app must contain no
// `dangerouslySetInnerHTML` usage, no inline theme script, and no raw
// `<script>` elements in TSX. The theme resolves on hydration instead; see
// styles/README.md. Fails the suite if any of these reappear in `src/`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN: readonly { pattern: RegExp; reason: string }[] = [
	{
		pattern: /dangerouslySetInnerHTML/,
		reason: "no dangerouslySetInnerHTML (inline HTML/scripts)",
	},
	{
		pattern: /sureThemeInlineScript/,
		reason: "no inline theme script (use hydration in __root.tsx)",
	},
	{ pattern: /<script[\s>]/, reason: "no <script> elements in TSX" },
];

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			out.push(...sourceFiles(full));
			// Test files name the forbidden patterns to forbid them; they do
			// not ship, so they are out of scope for this scan.
		} else if (/\.(ts|tsx)$/.test(entry) && !/[.-]test\.[jt]sx?$/.test(entry)) {
			out.push(full);
		}
	}
	return out;
}

describe("CSP: no inline scripts", () => {
	it("finds no inline-script vectors in shipped src/ code", () => {
		const offenders: string[] = [];
		for (const file of sourceFiles(SRC)) {
			const content = readFileSync(file, "utf8");
			for (const { pattern, reason } of FORBIDDEN) {
				if (pattern.test(content)) {
					offenders.push(`${file.replace(`${SRC}/`, "")}: ${reason}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
