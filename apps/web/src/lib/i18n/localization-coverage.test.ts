// Localization coverage backstop (t_alt_fnd_011).
//
// Production TSX must not reintroduce literal accessibility labels,
// placeholders, document-title values, or the route fallback copy moved
// into `messages.ts`. Dynamic/user/API values remain props or data; static
// presentation copy resolves through `formatMessage`/`useLocale().t`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const FORBIDDEN: readonly { pattern: RegExp; reason: string }[] = [
	{ pattern: /aria-label="[A-Za-z]/, reason: "literal aria-label" },
	{ pattern: /placeholder="[A-Za-z]/, reason: "literal placeholder" },
	{
		pattern:
			/title:\s*"(?:Sure Web|Dashboard · Sure Web|Settings · Sure Web|Admin · Sure Web|Account settings · Sure Web|Not authorized · Sure Web)"/,
		reason: "literal document title",
	},
	{
		pattern:
			/:\s*"(?:Something went wrong\.|The page could not be loaded\.|The dashboard could not be loaded\.|Settings could not be loaded\.|Administration could not be loaded\.)"/,
		reason: "literal route fallback",
	},
	{
		pattern: /(?:label|placeholder)\s*=\s*"(?:Loading|Select an option|Search or select)"/,
		reason: "literal primitive default",
	},
	{
		pattern:
			/"(?:Connected|Cannot reach the Sure API|API credentials rejected|Sure server is too old|App update required|Server is missing required features)"/,
		reason: "literal API compatibility status",
	},
];

function shippedTypeScriptFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			out.push(...shippedTypeScriptFiles(full));
		} else if (
			/\.tsx?$/.test(entry) &&
			!entry.includes(".test.") &&
			!entry.includes(".stories.") &&
			full !== join(SRC, "lib/i18n/messages.ts")
		) {
			out.push(full);
		}
	}
	return out;
}

describe("localization coverage", () => {
	it("keeps static production labels and fallbacks behind message keys", () => {
		const offenders: string[] = [];
		for (const file of shippedTypeScriptFiles(SRC)) {
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
